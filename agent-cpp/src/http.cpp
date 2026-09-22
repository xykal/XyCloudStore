#include "http.h"

#include "util.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winhttp.h>

#include <cstdio>
#include <vector>

namespace xy {

struct UrlUrai {
  bool ok = false;
  bool https = false;
  std::wstring host;
  int port = 0;
  std::wstring path;
};

static UrlUrai urai_url(const std::string& url) {
  UrlUrai u;
  std::wstring w = utf8_ke_wide(url);
  std::vector<wchar_t> buf(w.begin(), w.end());
  buf.push_back(L'\0');
  URL_COMPONENTSW c{};
  c.dwStructSize = sizeof(c);
  wchar_t host[256], path[4096];
  c.lpszHostName = host;
  c.dwHostNameLength = 256;
  c.lpszUrlPath = path;
  c.dwUrlPathLength = 4096;
  if (!WinHttpCrackUrl(buf.data(), 0, 0, &c)) return u;
  if (c.nScheme != INTERNET_SCHEME_HTTP && c.nScheme != INTERNET_SCHEME_HTTPS) return u;
  u.ok = true;
  u.https = (c.nScheme == INTERNET_SCHEME_HTTPS);
  u.host.assign(host);
  u.port = (int)c.nPort;
  u.path.assign(path);
  if (u.path.empty()) u.path = L"/";
  return u;
}

static std::string gle(const char* apa) {
  char buf[96];
  snprintf(buf, sizeof(buf), "%s (GLE=%lu)", apa, GetLastError());
  return std::string(buf);
}

static bool host_lokal(const std::wstring& host) {
  std::string h = ke_kecil(wide_ke_utf8(host));
  return h == "127.0.0.1" || h == "localhost" || h == "::1" || h == "[::1]";
}

static HttpResp minta_sekali(const std::string& metode, const UrlUrai& u, const std::string& isi,
                             bool ada_isi,
                             const std::vector<std::pair<std::string, std::string>>& header,
                             const std::string& agen, unsigned detik, std::string& lokasi) {
  HttpResp r;
  HINTERNET sesi = WinHttpOpen(utf8_ke_wide(agen).c_str(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                               WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!sesi) {
    r.galat = gle("winhttp buka sesi");
    return r;
  }
  HINTERNET kon = WinHttpConnect(sesi, u.host.c_str(), (INTERNET_PORT)u.port, 0);
  if (!kon) {
    r.galat = gle("winhttp sambung");
    WinHttpCloseHandle(sesi);
    return r;
  }
  DWORD bendera = u.https ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET req = WinHttpOpenRequest(kon, utf8_ke_wide(metode).c_str(), u.path.c_str(), nullptr,
                                    WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, bendera);
  if (!req) {
    r.galat = gle("winhttp buka request");
    WinHttpCloseHandle(kon);
    WinHttpCloseHandle(sesi);
    return r;
  }
  if (u.https && host_lokal(u.host)) {
    // API Sunshine di localhost memakai sertifikat self-signed bawaan.
    DWORD abaikan = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
                    SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
    WinHttpSetOption(req, WINHTTP_OPTION_SECURITY_FLAGS, &abaikan, sizeof(abaikan));
  }
  WinHttpSetTimeouts(req, 5000, 5000, 5000, detik * 1000);

  std::wstring hstr;
  for (const auto& kv : header) {
    hstr += utf8_ke_wide(kv.first) + L": " + utf8_ke_wide(kv.second) + L"\r\n";
  }
  if (ada_isi) hstr += L"Content-Type: application/json\r\n";

  BOOL ok = WinHttpSendRequest(req, hstr.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS : hstr.c_str(),
                               hstr.empty() ? 0 : (DWORD)-1, ada_isi ? (LPVOID)isi.data() : nullptr,
                               ada_isi ? (DWORD)isi.size() : 0, ada_isi ? (DWORD)isi.size() : 0, 0);
  if (!ok) {
    r.galat = gle("winhttp kirim");
    WinHttpCloseHandle(req);
    WinHttpCloseHandle(kon);
    WinHttpCloseHandle(sesi);
    return r;
  }
  if (!WinHttpReceiveResponse(req, nullptr)) {
    r.galat = gle("winhttp terima");
    WinHttpCloseHandle(req);
    WinHttpCloseHandle(kon);
    WinHttpCloseHandle(sesi);
    return r;
  }
  DWORD status = 0, uk = sizeof(status);
  WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &status,
                      &uk, nullptr);
  r.status = (long)status;

  // Lokasi redirect (untuk pengunduh).
  DWORD nloc = 0;
  WinHttpQueryHeaders(req, WINHTTP_QUERY_LOCATION, nullptr, WINHTTP_NO_OUTPUT_BUFFER, &nloc,
                      nullptr);
  if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && nloc > 0) {
    std::wstring wl;
    wl.resize(nloc);
    if (WinHttpQueryHeaders(req, WINHTTP_QUERY_LOCATION, nullptr, &wl[0], &nloc, nullptr)) {
      wl.resize(nloc);
      lokasi = wide_ke_utf8(wl);
      lokasi = trim(lokasi);
      size_t nol = lokasi.find('\0');
      if (nol != std::string::npos) lokasi.resize(nol);
    }
  }

  std::string badan;
  for (;;) {
    DWORD ada = 0;
    if (!WinHttpQueryDataAvailable(req, &ada)) break;
    if (ada == 0) break;
    std::string pot;
    pot.resize(ada);
    DWORD baca = 0;
    if (!WinHttpReadData(req, &pot[0], ada, &baca)) break;
    badan.append(pot.data(), baca);
    if (baca < ada) break;
  }
  WinHttpCloseHandle(req);
  WinHttpCloseHandle(kon);
  WinHttpCloseHandle(sesi);

  r.jaringan_ok = true;
  r.teks = badan;
  std::string t = trim(badan);
  if (t.empty()) {
    r.badan = json::object();
  } else {
    try {
      r.badan = json::parse(t);
    } catch (...) {
      r.badan = json(t);
    }
  }
  return r;
}

HttpResp http_minta(const std::string& metode, const std::string& url,
                    const std::optional<json>& badan,
                    const std::vector<std::pair<std::string, std::string>>& header,
                    const std::string& agen, unsigned detik) {
  HttpResp r;
  UrlUrai u = urai_url(url);
  if (!u.ok) {
    r.galat = "URL cacat: " + url;
    return r;
  }
  std::string isi;
  bool ada = false;
  if (badan.has_value()) {
    isi = badan->dump();
    ada = true;
  }
  std::string lokasi;
  // Ikuti redirect sederhana (mis. endpoint publik di balik CDN).
  for (int i = 0; i < 4; i++) {
    r = minta_sekali(metode, u, isi, ada, header, agen, detik, lokasi);
    if (!r.jaringan_ok) return r;
    if ((r.status == 301 || r.status == 302 || r.status == 303 || r.status == 307 ||
         r.status == 308) &&
        !lokasi.empty()) {
      UrlUrai n = urai_url(lokasi);
      if (!n.ok) return r;
      u = n;
      continue;
    }
    return r;
  }
  return r;
}

bool http_unduh(const std::string& url, const std::string& tujuan, const Logger& log,
                const std::string& agen) {
  log("Mengunduh " + url + " …");
  std::string target = url;
  for (int redir = 0; redir < 8; redir++) {
    UrlUrai u = urai_url(target);
    if (!u.ok) {
      log("Gagal unduh: URL cacat.");
      return false;
    }
    HINTERNET sesi =
        WinHttpOpen(utf8_ke_wide(agen).c_str(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!sesi) {
      log("Gagal unduh: " + gle("winhttp buka sesi"));
      return false;
    }
    HINTERNET kon = WinHttpConnect(sesi, u.host.c_str(), (INTERNET_PORT)u.port, 0);
    HINTERNET req = nullptr;
    if (kon) {
      DWORD bendera = u.https ? WINHTTP_FLAG_SECURE : 0;
      req = WinHttpOpenRequest(kon, L"GET", u.path.c_str(), nullptr, WINHTTP_NO_REFERER,
                               WINHTTP_DEFAULT_ACCEPT_TYPES, bendera);
    }
    auto tutup = [&]() {
      if (req) WinHttpCloseHandle(req);
      if (kon) WinHttpCloseHandle(kon);
      if (sesi) WinHttpCloseHandle(sesi);
    };
    if (!req) {
      tutup();
      log("Gagal unduh: " + gle("winhttp sambung"));
      return false;
    }
    WinHttpSetTimeouts(req, 10000, 10000, 10000, 180000);
    if (!WinHttpSendRequest(req, WINHTTP_NO_ADDITIONAL_HEADERS, 0, nullptr, 0, 0, 0) ||
        !WinHttpReceiveResponse(req, nullptr)) {
      std::string e = gle("winhttp unduh");
      tutup();
      log("Gagal unduh: " + e);
      return false;
    }
    DWORD status = 0, uk = sizeof(status);
    WinHttpQueryHeaders(req, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr,
                        &status, &uk, nullptr);
    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
      DWORD nloc = 0;
      WinHttpQueryHeaders(req, WINHTTP_QUERY_LOCATION, nullptr, WINHTTP_NO_OUTPUT_BUFFER, &nloc,
                          nullptr);
      std::string lokasi;
      if (GetLastError() == ERROR_INSUFFICIENT_BUFFER && nloc > 0) {
        std::wstring wl;
        wl.resize(nloc);
        if (WinHttpQueryHeaders(req, WINHTTP_QUERY_LOCATION, nullptr, &wl[0], &nloc, nullptr)) {
          lokasi = trim(wide_ke_utf8(wl));
          size_t nol = lokasi.find('\0');
          if (nol != std::string::npos) lokasi.resize(nol);
        }
      }
      tutup();
      if (lokasi.empty() || (!diawali(lokasi, "https://") && !diawali(lokasi, "http://"))) {
        log("Gagal unduh: redirect tanpa lokasi valid.");
        return false;
      }
      target = lokasi;
      continue;
    }
    if (status < 200 || status >= 300) {
      tutup();
      log("Gagal unduh: HTTP " + std::to_string(status));
      return false;
    }
    // Simpan ke berkas.
    size_t pisah = tujuan.find_last_of("\\/");
    if (pisah != std::string::npos) buat_dir_rekursif(tujuan.substr(0, pisah));
    HANDLE f = CreateFileW(utf8_ke_wide(tujuan).c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) {
      tutup();
      log("Gagal unduh: tak bisa tulis berkas tujuan.");
      return false;
    }
    uint64_t total = 0;
    bool gagal = false;
    for (;;) {
      DWORD ada = 0;
      if (!WinHttpQueryDataAvailable(req, &ada)) {
        gagal = true;
        break;
      }
      if (ada == 0) break;
      std::vector<char> buf(ada);
      DWORD baca = 0;
      if (!WinHttpReadData(req, buf.data(), ada, &baca)) {
        gagal = true;
        break;
      }
      DWORD tulis = 0;
      if (!WriteFile(f, buf.data(), baca, &tulis, nullptr) || tulis != baca) {
        gagal = true;
        break;
      }
      total += baca;
      if (baca < ada) break;
    }
    CloseHandle(f);
    tutup();
    if (gagal) {
      log("Gagal unduh: koneksi terputus.");
      return false;
    }
    log("Installer tersimpan (" + std::to_string(total) + " byte)");
    return true;
  }
  log("Gagal unduh: terlalu banyak redirect.");
  return false;
}

}  // namespace xy
