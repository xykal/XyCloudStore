#include "util.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winsock2.h>

#include <cctype>
#include <chrono>
#include <cstdio>
#include <mutex>
#include <thread>

namespace xy {

std::string trim(const std::string& s) {
  size_t a = 0, b = s.size();
  while (a < b && (s[a] == ' ' || s[a] == '\t' || s[a] == '\r' || s[a] == '\n')) a++;
  while (b > a && (s[b - 1] == ' ' || s[b - 1] == '\t' || s[b - 1] == '\r' || s[b - 1] == '\n')) b--;
  return s.substr(a, b - a);
}

std::string ke_kecil(std::string s) {
  for (char& c : s) c = (char)tolower((unsigned char)c);
  return s;
}

bool diawali(const std::string& s, const std::string& prefix) {
  return s.size() >= prefix.size() && s.compare(0, prefix.size(), prefix) == 0;
}

std::string base64_encode(const uint8_t* data, size_t len) {
  static const char ABJAD[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((len + 2) / 3 * 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t n = (uint32_t)data[i] << 16;
    size_t sisa = len - i;
    if (sisa > 1) n |= (uint32_t)data[i + 1] << 8;
    if (sisa > 2) n |= (uint32_t)data[i + 2];
    out.push_back(ABJAD[(n >> 18) & 63]);
    out.push_back(ABJAD[(n >> 12) & 63]);
    out.push_back(sisa > 1 ? ABJAD[(n >> 6) & 63] : '=');
    out.push_back(sisa > 2 ? ABJAD[n & 63] : '=');
  }
  return out;
}

static uint32_t putar_kiri(uint32_t v, unsigned n) { return (v << n) | (v >> (32 - n)); }

std::array<uint8_t, 20> sha1(const uint8_t* data, size_t len) {
  uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
  std::vector<uint8_t> msg(data, data + len);
  uint64_t bit = (uint64_t)len * 8;
  msg.push_back(0x80);
  while (msg.size() % 64 != 56) msg.push_back(0);
  for (int i = 7; i >= 0; i--) msg.push_back((uint8_t)((bit >> (8 * i)) & 0xFF));
  for (size_t off = 0; off < msg.size(); off += 64) {
    uint32_t w[80];
    for (int i = 0; i < 16; i++) {
      w[i] = ((uint32_t)msg[off + 4 * i] << 24) | ((uint32_t)msg[off + 4 * i + 1] << 16) |
             ((uint32_t)msg[off + 4 * i + 2] << 8) | (uint32_t)msg[off + 4 * i + 3];
    }
    for (int i = 16; i < 80; i++) w[i] = putar_kiri(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (int i = 0; i < 80; i++) {
      uint32_t f, k;
      if (i <= 19) {
        f = (b & c) | ((~b) & d);
        k = 0x5A827999;
      } else if (i <= 39) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (i <= 59) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      uint32_t tmp = putar_kiri(a, 5) + f + e + k + w[i];
      e = d;
      d = c;
      c = putar_kiri(b, 30);
      b = a;
      a = tmp;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
  }
  std::array<uint8_t, 20> out;
  for (int i = 0; i < 5; i++) {
    out[4 * i] = (uint8_t)((h[i] >> 24) & 0xFF);
    out[4 * i + 1] = (uint8_t)((h[i] >> 16) & 0xFF);
    out[4 * i + 2] = (uint8_t)((h[i] >> 8) & 0xFF);
    out[4 * i + 3] = (uint8_t)(h[i] & 0xFF);
  }
  return out;
}

static uint64_t detik_epoch() {
  FILETIME ft;
  GetSystemTimeAsFileTime(&ft);
  ULARGE_INTEGER u;
  u.LowPart = ft.dwLowDateTime;
  u.HighPart = ft.dwHighDateTime;
  // 100-ns sejak 1601-01-01 → detik sejak 1970-01-01.
  return u.QuadPart / 10000000ULL - 11644473600ULL;
}

std::string iso_utc_now() {
  uint64_t d = detik_epoch();
  // civil_from_days (Howard Hinnant).
  int64_t days = (int64_t)(d / 86400);
  uint32_t rem = (uint32_t)(d % 86400);
  uint32_t hh = rem / 3600, mm = (rem % 3600) / 60, ss = rem % 60;
  int64_t z = days + 719468;
  int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  uint64_t doe = (uint64_t)(z - era * 146097);
  uint64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int64_t y = (int64_t)yoe + era * 400;
  uint64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  uint64_t mp = (5 * doy + 2) / 153;
  uint64_t tgl = doy - (153 * mp + 2) / 5 + 1;
  uint64_t bulan = mp < 10 ? mp + 3 : mp - 9;
  if (bulan <= 2) y += 1;
  char buf[32];
  snprintf(buf, sizeof(buf), "%04lld-%02llu-%02lluT%02u:%02u:%02uZ", (long long)y,
           (unsigned long long)bulan, (unsigned long long)tgl, hh, mm, ss);
  return std::string(buf);
}

std::string jam_wib() {
  uint64_t lokal = (detik_epoch() + 7 * 3600) % 86400;
  char buf[16];
  snprintf(buf, sizeof(buf), "%02u:%02u:%02u", (unsigned)(lokal / 3600),
           (unsigned)((lokal % 3600) / 60), (unsigned)(lokal % 60));
  return std::string(buf);
}

std::wstring utf8_ke_wide(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
  if (n <= 0) return L"";
  std::wstring w;
  w.resize((size_t)n);
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
  return w;
}

std::string wide_ke_utf8(const std::wstring& s) {
  if (s.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  if (n <= 0) return "";
  std::string out;
  out.resize((size_t)n);
  WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n, nullptr, nullptr);
  return out;
}

std::string konsol_ke_utf8(const std::string& bytes) {
  if (bytes.empty()) return "";
  // Coba UTF-8 dulu, jatuh ke halaman kode sistem (ANSI).
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes.c_str(), (int)bytes.size(),
                              nullptr, 0);
  UINT cp = (n > 0) ? CP_UTF8 : CP_ACP;
  n = MultiByteToWideChar(cp, 0, bytes.c_str(), (int)bytes.size(), nullptr, 0);
  if (n <= 0) return bytes;
  std::wstring w;
  w.resize((size_t)n);
  MultiByteToWideChar(cp, 0, bytes.c_str(), (int)bytes.size(), &w[0], n);
  return wide_ke_utf8(w);
}

std::string env_ambil(const char* nama) {
  std::wstring wn = utf8_ke_wide(nama);
  DWORD n = GetEnvironmentVariableW(wn.c_str(), nullptr, 0);
  if (n == 0) return "";
  std::wstring w;
  w.resize(n);
  DWORD m = GetEnvironmentVariableW(wn.c_str(), &w[0], n);
  if (m == 0 || m >= n) return "";
  w.resize(m);
  return wide_ke_utf8(w);
}

std::string dir_temp() {
  wchar_t buf[MAX_PATH];
  DWORD n = GetTempPathW(MAX_PATH, buf);
  if (n == 0 || n >= MAX_PATH) return "C:\\Windows\\Temp";
  std::wstring w(buf, n);
  while (w.size() > 3 && (w.back() == L'\\' || w.back() == L'/')) w.pop_back();
  return wide_ke_utf8(w);
}

// Kutip satu argumen sesuai aturan CommandLineToArgvW.
static std::wstring kutip_arg(const std::string& a) {
  std::wstring w = utf8_ke_wide(a);
  bool perlu = w.empty();
  for (wchar_t c : w) {
    if (c == L' ' || c == L'\t' || c == L'"' || c == L'\n') {
      perlu = true;
      break;
    }
  }
  if (!perlu) return w;
  std::wstring out = L"\"";
  size_t i = 0;
  while (i < w.size()) {
    size_t bs = 0;
    while (i < w.size() && w[i] == L'\\') {
      i++;
      bs++;
    }
    if (i >= w.size()) {
      out.append(bs * 2, L'\\');
      break;
    } else if (w[i] == L'"') {
      out.append(bs * 2 + 1, L'\\');
      out.push_back(L'"');
      i++;
    } else {
      out.append(bs, L'\\');
      out.push_back(w[i]);
      i++;
    }
  }
  out.push_back(L'"');
  return out;
}

HasilProses jalankan(const std::string& program, const std::vector<std::string>& args,
                     unsigned detik) {
  HasilProses h;
  std::wstring cmd = kutip_arg(program);
  for (const auto& a : args) {
    cmd.push_back(L' ');
    cmd += kutip_arg(a);
  }

  SECURITY_ATTRIBUTES sa{};
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = TRUE;
  HANDLE baca = nullptr, tulis = nullptr;
  if (!CreatePipe(&baca, &tulis, &sa, 0)) {
    h.galat = "gagal buat pipe";
    return h;
  }
  SetHandleInformation(baca, HANDLE_FLAG_INHERIT, 0);

  STARTUPINFOW si{};
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  si.hStdOutput = tulis;
  si.hStdError = tulis;
  si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  PROCESS_INFORMATION pi{};
  // CreateProcessW butuh buffer baris-perintah yang bisa ditulis.
  std::vector<wchar_t> cmdbuf(cmd.begin(), cmd.end());
  cmdbuf.push_back(L'\0');
  BOOL ok = CreateProcessW(nullptr, cmdbuf.data(), nullptr, nullptr, TRUE,
                           CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi);
  CloseHandle(tulis);
  if (!ok) {
    CloseHandle(baca);
    char buf[64];
    snprintf(buf, sizeof(buf), "gagal spawn (GLE=%lu)", GetLastError());
    h.galat = buf;
    return h;
  }
  CloseHandle(pi.hThread);

  // Baca keluaran di thread terpisah agar pipe penuh tak menggantung proses.
  std::string terkumpul;
  std::thread pembaca([baca, &terkumpul]() {
    char buf[8192];
    DWORD n = 0;
    for (;;) {
      BOOL r = ReadFile(baca, buf, sizeof(buf), &n, nullptr);
      if (!r || n == 0) break;
      terkumpul.append(buf, n);
    }
  });

  bool timeout = false;
  uint64_t batas = detik * 1000ULL;
  uint64_t lewat = 0;
  for (;;) {
    DWORD w = WaitForSingleObject(pi.hProcess, 400);
    if (w == WAIT_OBJECT_0) break;
    lewat += 400;
    if (lewat >= batas) {
      timeout = true;
      TerminateProcess(pi.hProcess, 1);
      WaitForSingleObject(pi.hProcess, 5000);
      break;
    }
  }
  pembaca.join();
  CloseHandle(baca);
  DWORD kode = 1;
  GetExitCodeProcess(pi.hProcess, &kode);
  CloseHandle(pi.hProcess);

  h.keluar = konsol_ke_utf8(terkumpul);
  if (timeout) {
    char buf[96];
    snprintf(buf, sizeof(buf), "timeout setelah %us — dibatalkan", detik);
    h.galat = buf;
    h.ok = false;
    h.kode = -1;
  } else {
    h.ok = true;
    h.kode = (int)kode;
  }
  return h;
}

bool jalankan_lepas(const std::string& program, const std::vector<std::string>& args) {
  std::wstring cmd = kutip_arg(program);
  for (const auto& a : args) {
    cmd.push_back(L' ');
    cmd += kutip_arg(a);
  }
  STARTUPINFOW si{};
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi{};
  std::vector<wchar_t> cmdbuf(cmd.begin(), cmd.end());
  cmdbuf.push_back(L'\0');
  BOOL ok = CreateProcessW(nullptr, cmdbuf.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                           nullptr, nullptr, &si, &pi);
  if (!ok) return false;
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return true;
}

bool tulis_berkas(const std::string& path, const std::string& isi) {
  std::wstring w = utf8_ke_wide(path);
  HANDLE f = CreateFileW(w.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                         FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return false;
  DWORD tulis = 0;
  BOOL ok = WriteFile(f, isi.data(), (DWORD)isi.size(), &tulis, nullptr);
  CloseHandle(f);
  return ok && tulis == isi.size();
}

bool baca_berkas(const std::string& path, std::string& isi) {
  std::wstring w = utf8_ke_wide(path);
  HANDLE f = CreateFileW(w.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
                         FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return false;
  LARGE_INTEGER sz{};
  isi.clear();
  if (GetFileSizeEx(f, &sz) && sz.QuadPart > 0 && sz.QuadPart < (LONGLONG)64 * 1024 * 1024) {
    isi.resize((size_t)sz.QuadPart);
    DWORD baca = 0;
    BOOL ok = ReadFile(f, &isi[0], (DWORD)isi.size(), &baca, nullptr);
    CloseHandle(f);
    if (!ok) {
      isi.clear();
      return false;
    }
    isi.resize(baca);
    return true;
  }
  CloseHandle(f);
  return false;
}

bool buat_dir_rekursif(const std::string& path) {
  std::wstring w = utf8_ke_wide(path);
  // Buat tiap tingkat (SHCreateDirectoryEx butuh shell32; manual lebih ringan).
  for (size_t i = 0; i < w.size(); i++) {
    if (w[i] == L'\\' || w[i] == L'/') {
      if (i > 2) {
        std::wstring sub = w.substr(0, i);
        CreateDirectoryW(sub.c_str(), nullptr);
      }
    }
  }
  return CreateDirectoryW(w.c_str(), nullptr) || GetLastError() == ERROR_ALREADY_EXISTS;
}

bool berkas_ada(const std::string& path) {
  DWORD a = GetFileAttributesW(utf8_ke_wide(path).c_str());
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

uint64_t ukuran_berkas(const std::string& path) {
  WIN32_FILE_ATTRIBUTE_DATA d{};
  if (!GetFileAttributesExW(utf8_ke_wide(path).c_str(), GetFileExInfoStandard, &d)) return 0;
  return ((uint64_t)d.nFileSizeHigh << 32) | d.nFileSizeLow;
}

bool pindah_berkas(const std::string& dari, const std::string& ke) {
  return MoveFileExW(utf8_ke_wide(dari).c_str(), utf8_ke_wide(ke).c_str(),
                     MOVEFILE_REPLACE_EXISTING) != 0;
}

void pastikan_winsock() {
  static std::once_flag sekali;
  std::call_once(sekali, []() {
    WSADATA d{};
    WSAStartup(MAKEWORD(2, 2), &d);
  });
}

void tidur_ms(unsigned ms) { Sleep(ms ? ms : 1); }

}  // namespace xy
