#include "agent.h"

#include <chrono>
#include <cstdio>
#include <thread>

#include "http.h"
#include "relay.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winsock2.h>

namespace xy {
namespace agent {
namespace {

const char* SUNSHINE_BAWAAN = "https://127.0.0.1:47990";
const char* SUNSHINE_MSI_URL =
    "https://github.com/LizardByte/Sunshine/releases/latest/download/"
    "Sunshine-Windows-AMD64-installer.msi";
const char* SUNSHINE_EXE_URL =
    "https://github.com/LizardByte/Sunshine/releases/latest/download/"
    "Sunshine-Windows-AMD64-installer.exe";

std::string agen_ua() { return std::string("XyAgent/") + VERSI; }

HttpResp minta(const std::string& url, const std::optional<json>& badan, const std::string& metode,
               const std::vector<std::pair<std::string, std::string>>& header = {},
               unsigned detik = 10) {
  return http_minta(metode, url, badan, header, agen_ua(), detik);
}

std::string jstr(const json& j, const char* kunci, const std::string& def = "") {
  if (j.is_object()) {
    auto it = j.find(kunci);
    if (it != j.end() && it->is_string()) return it->get<std::string>();
  }
  return def;
}

bool jbool(const json& j, const char* kunci, bool def = false) {
  if (j.is_object()) {
    auto it = j.find(kunci);
    if (it != j.end() && it->is_boolean()) return it->get<bool>();
  }
  return def;
}

std::vector<std::pair<std::string, std::string>> header_basic(const Konfig& k) {
  return {{"Authorization", "Basic " + base64_encode(k.user + ":" + k.sandi)}};
}

std::string server_bersih(const Konfig& k) {
  std::string s = k.server;
  while (!s.empty() && s.back() == '/') s.pop_back();
  return s;
}

std::optional<std::string> service_sunshine() {
  HasilProses h = jalankan("powershell", {"-NoProfile", "-Command",
                                          "(Get-Service -Name 'SunshineService' -ErrorAction "
                                          "SilentlyContinue).Status"},
                           20);
  if (!h.ok) return std::nullopt;
  std::string t = trim(h.keluar);
  if (t.empty()) return std::nullopt;
  size_t nl = t.find_first_of("\r\n");
  if (nl != std::string::npos) t.resize(nl);
  return trim(t);
}

std::string status_service_sunshine() {
  auto s = service_sunshine();
  return s ? *s : "tidak ada";
}

std::optional<std::string> cari_sunshine_exe() {
  const char* tetap[] = {
      "C:\\Program Files\\Sunshine\\sunshine.exe",
      "C:\\Program Files (x86)\\Sunshine\\sunshine.exe",
  };
  for (const char* p : tetap) {
    if (berkas_ada(p)) return std::string(p);
  }
  HasilProses h = jalankan("where", {"sunshine.exe"}, 15);
  if (h.ok) {
    std::string t = trim(h.keluar);
    size_t nl = t.find_first_of("\r\n");
    std::string baris = trim(t.substr(0, nl));
    if (!baris.empty() && berkas_ada(baris)) return baris;
  }
  std::string local = env_ambil("LOCALAPPDATA");
  if (!local.empty()) {
    std::string pola = local + "\\Programs\\*";
    WIN32_FIND_DATAA fd{};
    HANDLE f = FindFirstFileA(pola.c_str(), &fd);
    if (f != INVALID_HANDLE_VALUE) {
      do {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
          std::string nama = fd.cFileName;
          if (nama != "." && nama != "..") {
            std::string coba = local + "\\Programs\\" + nama + "\\Sunshine\\sunshine.exe";
            if (berkas_ada(coba)) {
              FindClose(f);
              return coba;
            }
          }
        }
      } while (FindNextFileA(f, &fd));
      FindClose(f);
    }
  }
  return std::nullopt;
}

std::string acak_sandi(size_t n) {
  static const char AB[] = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  FILETIME ft;
  GetSystemTimeAsFileTime(&ft);
  ULARGE_INTEGER u;
  u.LowPart = ft.dwLowDateTime;
  u.HighPart = ft.dwHighDateTime;
  uint64_t x = u.QuadPart ^ 0xA5A55A5AC3C33C3CULL;
  std::string out;
  out.reserve(n);
  for (size_t i = 0; i < n; i++) {
    x = x * 6364136223846793005ULL + 1;
    out.push_back(AB[(x >> 33) % (sizeof(AB) - 1)]);
  }
  return out;
}

bool set_creds_sunshine(const std::string& exe, const std::string& user, const std::string& sandi,
                        const Logger& log) {
  log("Menyetel kredensial Sunshine otomatis (user=" + user + ") lewat --creds …");
  jalankan("powershell",
           {"-NoProfile", "-Command",
            "Stop-Service -Name 'SunshineService' -Force -ErrorAction SilentlyContinue; Start-Sleep "
            "-Seconds 1"},
           15);
  HasilProses h = jalankan(exe, {"--creds", user, sandi}, 30);
  if (!h.ok) {
    log("Gagal jalankan sunshine --creds: " + h.galat);
    return false;
  }
  int n = 0;
  size_t pos = 0;
  while (n < 6 && pos < h.keluar.size()) {
    size_t nl = h.keluar.find('\n', pos);
    std::string baris = trim(h.keluar.substr(pos, nl == std::string::npos ? nl : nl - pos));
    if (!baris.empty()) {
      log(baris);
      n++;
    }
    if (nl == std::string::npos) break;
    pos = nl + 1;
  }
  if (h.kode == 0) {
    log("Kredensial Sunshine diset tanpa buka web UI.");
  } else {
    log("sunshine --creds selesai dengan kode " + std::to_string(h.kode) + ". Mencoba lanjut.");
  }
  jalankan("powershell",
           {"-NoProfile", "-Command",
            "Start-Service -Name 'SunshineService' -ErrorAction SilentlyContinue; Start-Sleep "
            "-Seconds 2"},
           20);
  return true;
}

json tunggu_api_siap(const Konfig& k, const Logger& log, unsigned detik);

std::optional<std::string> ip_lan() {
  pastikan_winsock();
  SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (s == INVALID_SOCKET) return std::nullopt;
  sockaddr_in jauh{};
  jauh.sin_family = AF_INET;
  jauh.sin_port = htons(80);
  jauh.sin_addr.s_addr = htonl(0x08080808);  // 8.8.8.8 (tak ada paket terkirim)
  std::optional<std::string> hasil;
  if (connect(s, (sockaddr*)&jauh, sizeof(jauh)) == 0) {
    sockaddr_in lokal{};
    int uk = sizeof(lokal);
    if (getsockname(s, (sockaddr*)&lokal, &uk) == 0 && lokal.sin_family == AF_INET) {
      uint32_t ip = ntohl(lokal.sin_addr.s_addr);
      uint8_t a = (ip >> 24) & 0xFF, b = (ip >> 16) & 0xFF, c = (ip >> 8) & 0xFF, d = ip & 0xFF;
      if (!(a == 127 || (a == 0 && b == 0 && c == 0 && d == 0))) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%u.%u.%u.%u", a, b, c, d);
        hasil = buf;
      }
    }
  }
  closesocket(s);
  return hasil;
}

json spesifikasi() {
  std::string host = env_ambil("COMPUTERNAME");
  if (host.empty()) host = "PC-XY";
  json spec = {{"hostname", host},
               {"os", "Windows"},
               {"cpu", env_ambil("PROCESSOR_IDENTIFIER")},
               {"cpp", true},
               {"versi", VERSI}};
  HasilProses h =
      jalankan("powershell",
               {"-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"},
               20);
  if (h.ok) {
    try {
      double v = std::stod(trim(h.keluar));
      char buf[32];
      snprintf(buf, sizeof(buf), "%.1f", v / 1e9);
      spec["ram_total_gb"] = std::string(buf);
    } catch (...) {
    }
  }
  h = jalankan("powershell",
               {"-NoProfile", "-Command",
                "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object "
                "{ $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | "
                "Select-Object -First 3 -ExpandProperty IPAddress) -join ','"},
               20);
  if (h.ok) {
    std::string t = trim(h.keluar);
    if (!t.empty() && t.size() < 120) spec["ip_lan"] = t;
  }
  h = jalankan("powershell",
               {"-NoProfile", "-Command",
                "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"},
               20);
  if (h.ok) {
    std::string t = trim(h.keluar);
    if (!t.empty() && t.size() < 120) spec["gpu"] = t;
  }
  h = jalankan("powershell",
               {"-NoProfile", "-Command", "[System.Environment]::OSVersion.Version.ToString()"}, 20);
  if (h.ok) {
    std::string t = trim(h.keluar);
    if (!t.empty() && t.size() < 40) spec["os_versi"] = t;
  }
  return spec;
}

std::string alamat_stream(const Konfig& k);

void kirim_balasan(const Konfig& k, const std::string& id, const json& hasil) {
  minta(server_bersih(k) + "/api/agen/perintah/" + id, hasil, "POST", {{"x-agen-kode", k.kode}});
}

void kerjakan(const Konfig& k, const json& perintah, const Logger& log) {
  std::string jenis = jstr(perintah, "jenis", "?");
  json muatan = (perintah.is_object() && perintah.contains("muatan")) ? perintah["muatan"]
                                                                      : json::object();
  std::string sesi_id = jstr(muatan, "sesi_id", "-");
  std::string id_per = jstr(perintah, "id");
  log("Perintah masuk: " + jenis + " (" + sesi_id + ")");
  auto balas = [&](const json& hasil) {
    if (!id_per.empty()) kirim_balasan(k, id_per, hasil);
  };

  if (jenis == "mulai_sesi") {
    json cek = periksa_sunshine(k);
    if (jbool(cek, "siap")) {
      minta(std::string(SUNSHINE_BAWAAN) + "/api/clients/unpair-all", json::object(), "POST",
            header_basic(k));
      minta(std::string(SUNSHINE_BAWAAN) + "/api/apps/close", json::object(), "POST",
            header_basic(k));
      std::string stream = alamat_stream(k);
      log("Host streaming untuk penyewa: " + stream);
      std::string mode = k.relay.value_or("auto");
      bool paksa = jbool(muatan, "paksa_relay");
      bool perlu = paksa || mode == "on" || mode == "named" || mode == "quick" ||
                   (mode != "off" && relay::perlu_relay_otomatis(stream));
      std::optional<std::string> relay_host;
      if (perlu) {
        bool coba_named = (mode == "auto" || mode == "on" || mode == "named");
        relay::Hasil hn{false, "mode quick"};
        if (coba_named) hn = relay::mulai_named(k.server, k.kode, sesi_id, log);
        if (hn.ok) {
          relay_host = hn.teks;
        } else if (mode == "named") {
          log("Relay named gagal: " + hn.teks);
        } else {
          if (coba_named) log("Relay named gagal (" + hn.teks + "); fallback Quick Tunnel…");
          relay::Hasil hq = relay::mulai(sesi_id, log);
          if (hq.ok) {
            relay_host = hq.teks;
          } else {
            log("Relay gagal dinyalakan: " + hq.teks);
          }
        }
      } else {
        relay::berhenti();
      }
      json j = {{"ok", true},
                {"sesi_id", sesi_id},
                {"status", "siap"},
                {"host", stream},
                {"catatan", "Sunshine siap menerima sambungan"}};
      j["relay_host"] = relay_host ? json(*relay_host) : json(nullptr);
      balas(j);
    } else {
      json catatan = (cek.is_object() && cek.contains("pesan")) ? cek["pesan"] : json("Sunshine tidak siap");
      balas({{"ok", false},
             {"sesi_id", sesi_id},
             {"status", "gagal"},
             {"catatan", catatan}});
    }
  } else if (jenis == "pasangkan") {
    std::string pin = jstr(muatan, "pin");
    json hasil = {{"ok", false},
                  {"sesi_id", sesi_id},
                  {"status", "siap"},
                  {"catatan", "Gagal pasangkan."}};
    HttpResp r = minta(std::string(SUNSHINE_BAWAAN) + "/api/pin", std::nullopt, "GET",
                       header_basic(k));
    if (r.jaringan_ok && r.badan.is_object() && r.badan.contains("pairings") &&
        r.badan["pairings"].is_array() && !r.badan["pairings"].empty()) {
      json p = r.badan["pairings"][0];
      json id_p = (p.is_object() && p.contains("id")) ? p["id"] : json("");
      HttpResp r2 = minta(std::string(SUNSHINE_BAWAAN) + "/api/pin",
                          json({{"pin", pin}, {"name", "XyCloudStore"}, {"pairing_id", id_p}}),
                          "POST", header_basic(k));
      if (r2.jaringan_ok) {
        bool oke = r2.status >= 200 && r2.status < 300;
        hasil = {{"ok", oke},
                 {"sesi_id", sesi_id},
                 {"status", "siap"},
                 {"catatan", oke ? "Perangkat berhasil dipasangkan"
                                  : "PIN ditolak, minta penyewa mencoba lagi"}};
      }
    } else if (r.jaringan_ok) {
      hasil = {{"ok", false},
               {"sesi_id", sesi_id},
               {"status", "siap"},
               {"catatan", "Belum ada permintaan pairing dari HP."}};
    }
    balas(hasil);
  } else if (jenis == "akhiri_sesi") {
    relay::berhenti();
    HttpResp tutup = minta(std::string(SUNSHINE_BAWAAN) + "/api/apps/close", json::object(),
                           "POST", header_basic(k));
    HttpResp lepas = minta(std::string(SUNSHINE_BAWAAN) + "/api/clients/unpair-all", json::object(),
                           "POST", header_basic(k));
    bool oke = tutup.jaringan_ok && lepas.jaringan_ok;
    balas({{"ok", oke},
           {"sesi_id", sesi_id},
           {"status", oke ? "selesai" : "mengakhiri"},
           {"catatan", oke ? "Sesi dan Sunshine dibersihkan"
                            : "Pembersihan Sunshine belum terverifikasi; unit tetap dikunci"}});
  } else if (jenis == "mulai_siaran" || jenis == "akhiri_siaran") {
    // Live kini hanya dari aplikasi mobile — PC tak lagi menyiarkan.
    // Balas sukses no-op agar orkestrasi server tak menggantung.
    std::string live_id = jstr(muatan, "live_id");
    log("Perintah " + jenis + " (" + live_id + "): live-PC nonaktif, dialihkan ke mobile.");
    balas({{"ok", true}, {"live_id", live_id}, {"code", "MOBILE_ONLY"}});
  } else {
    balas({{"ok", false}, {"catatan", "Perintah " + jenis + " tidak dikenal"}});
  }
}

void detak(const Konfig& k, const Logger& log) {
  json cek = periksa_sunshine(k);
  json spec = spesifikasi();
  spec["sunshine"] = cek;
  std::string stream = alamat_stream(k);
  spec["stream_host"] = stream;
  std::string lan = ip_lan().value_or("");
  if (!lan.empty()) spec["ip_lan"] = lan;
  std::optional<std::string> rh = relay::url_aktif();
  json muatan = {{"status", "online"},
                 {"versi", VERSI},
                 {"spec", spec},
                 {"host", stream},
                 {"host_lan", lan},
                 {"hostname", env_ambil("COMPUTERNAME")}};
  muatan["relay_host"] = rh ? json(*rh) : json(nullptr);
  HttpResp r = minta(server_bersih(k) + "/api/agen/heartbeat", muatan, "POST",
                     {{"x-agen-kode", k.kode}}, 15);
  if (!r.jaringan_ok) {
    log("Gagal lapor ke server: " + r.galat);
    return;
  }
  if (r.status < 200 || r.status >= 300) {
    log("Server belum mengonfirmasi heartbeat (periksa server & kode unit).");
    return;
  }
  if (r.badan.is_object() && r.badan.contains("data") && r.badan["data"].is_object()) {
    json data = r.badan["data"];
    if (jbool(data, "ok") && data.contains("perintah") && data["perintah"].is_array()) {
      for (const json& p : data["perintah"]) kerjakan(k, p, log);
    }
  }
}

bool pasang_sunshine_winget(const Logger& log) {
  log("Mencoba winget install LizardByte.Sunshine (maks 90 dtk)…");
  HasilProses h = jalankan("winget",
                           {"install", "--id", "LizardByte.Sunshine", "-e", "--silent",
                            "--disable-interactivity", "--accept-source-agreements",
                            "--accept-package-agreements"},
                           90);
  if (!h.ok) {
    log("winget: " + h.galat);
    return false;
  }
  int n = 0;
  size_t pos = 0;
  while (n < 12 && pos < h.keluar.size()) {
    size_t nl = h.keluar.find('\n', pos);
    std::string baris = trim(h.keluar.substr(pos, nl == std::string::npos ? nl : nl - pos));
    if (!baris.empty()) {
      log(baris);
      n++;
    }
    if (nl == std::string::npos) break;
    pos = nl + 1;
  }
  log("winget selesai (kode " + std::to_string(h.kode) + ").");
  return h.kode == 0 || h.kode == -1978335189 || cari_sunshine_exe().has_value();
}

bool pasang_sunshine_msi(const Logger& log) {
  std::string tmp = dir_temp() + "\\xycloud-sunshine-setup";
  buat_dir_rekursif(tmp);
  struct Target {
    const char* url;
    std::string path;
    bool msi;
  };
  std::vector<Target> targets = {{SUNSHINE_MSI_URL, tmp + "\\Sunshine-setup.msi", true},
                                 {SUNSHINE_EXE_URL, tmp + "\\Sunshine-setup.exe", false}};
  for (const Target& t : targets) {
    if (!http_unduh(t.url, t.path, log, agen_ua())) {
      log("Gagal unduh installer.");
      continue;
    }
    bool ok = false;
    if (t.msi) {
      log("Memasang MSI diam-diam (msiexec /qn)…");
      HasilProses h = jalankan("msiexec", {"/i", t.path, "/qn", "/norestart"}, 180);
      if (!h.ok) {
        log("msiexec: " + h.galat);
      } else {
        ok = (h.kode == 0 || h.kode == 3010);
      }
    } else {
      log("Memasang EXE silent (/S)…");
      HasilProses h = jalankan(t.path, {"/S"}, 180);
      if (!h.ok) {
        log("installer exe: " + h.galat);
      } else {
        ok = (h.kode == 0);
      }
    }
    if (ok || cari_sunshine_exe().has_value()) return true;
  }
  return false;
}

void pastikan_service_sunshine(const Logger& log) {
  log("Memastikan layanan SunshineService…");
  jalankan("powershell",
           {"-NoProfile", "-Command",
            "Start-Service -Name 'SunshineService' -ErrorAction SilentlyContinue; "
            "$s=(Get-Service SunshineService -EA SilentlyContinue).Status; "
            "if($s){Write-Output \"status=$s\"}else{Write-Output 'status=tidak-ada'}"},
           20);
  if (!service_sunshine().has_value()) {
    std::string bat = "C:\\Program Files\\Sunshine\\install-service.bat";
    if (berkas_ada(bat)) {
      log("Menjalankan install-service.bat (tanpa tunggu UAC)…");
      jalankan_lepas("cmd", {"/C", bat});
      tidur_ms(3000);
      jalankan("powershell",
               {"-NoProfile", "-Command",
                "Start-Service -Name 'SunshineService' -ErrorAction SilentlyContinue"},
               20);
    }
  }
  if (!service_sunshine().has_value()) {
    if (auto exe = cari_sunshine_exe()) {
      log("Service belum ada — mencoba jalankan sunshine.exe di background…");
      jalankan_lepas(*exe, {});
      tidur_ms(3000);
    }
  }
  log("Service: " + status_service_sunshine());
}

json tunggu_api_siap(const Konfig& k, const Logger& log, unsigned detik) {
  auto mulai = std::chrono::steady_clock::now();
  json terakhir = {{"siap", false}, {"status", "MENUNGGU"}, {"pesan", "Menunggu API Sunshine…"}};
  while (std::chrono::steady_clock::now() - mulai < std::chrono::seconds(detik)) {
    terakhir = periksa_sunshine(k);
    if (jbool(terakhir, "siap")) {
      log("API Sunshine siap.");
      return terakhir;
    }
    tidur_ms(2000);
  }
  log("API Sunshine belum siap setelah menunggu.");
  return terakhir;
}

std::string alamat_stream(const Konfig& k) {
  if (mode_relay_aktif()) {
    if (auto ip = ip_tailscale()) return *ip;
  }
  for (const char* key : {"STREAM_HOST", "XY_STREAM_HOST", "SUNSHINE_HOST"}) {
    std::string v = trim(env_ambil(key));
    if (!v.empty()) return v;
  }
  std::string isi;
  if (baca_berkas(jalur_config(), isi)) {
    try {
      json v = json::parse(isi);
      std::string h = jstr(v, "stream_host");
      if (!trim(h).empty()) return trim(h);
    } catch (...) {
    }
  }
  for (const char* url : {"https://api.ipify.org", "https://ifconfig.me/ip", "https://icanhazip.com"}) {
    HttpResp r = minta(url, std::nullopt, "GET");
    if (r.jaringan_ok && r.status >= 200 && r.status < 300) {
      std::string ip = r.badan.is_string() ? trim(r.badan.get<std::string>()) : "";
      size_t nl = ip.find_first_of("\r\n");
      if (nl != std::string::npos) ip.resize(nl);
      ip = trim(ip);
      if (!ip.empty() && ip.size() < 64 && ip.find(' ') == std::string::npos &&
          (ip.find('.') != std::string::npos || ip.find(':') != std::string::npos))
        return ip;
    }
  }
  std::string pc = env_ambil("COMPUTERNAME");
  return pc.empty() ? "127.0.0.1" : pc;
}

}  // namespace

std::string dir_data() {
  std::string base = env_ambil("APPDATA");
  if (base.empty()) base = dir_temp();
  return base + "\\XyCloudStore\\Agent";
}

std::string jalur_config() { return dir_data() + "\\config.json"; }

std::string jalur_log_headless() { return dir_data() + "\\agent.log"; }

void tulis_log_headless(const std::string& teks) {
  std::string p = jalur_log_headless();
  size_t pisah = p.find_last_of("\\/");
  if (pisah != std::string::npos) buat_dir_rekursif(p.substr(0, pisah));
  if (ukuran_berkas(p) > 1000000) pindah_berkas(p, dir_data() + "\\agent.log.old");
  std::wstring w = utf8_ke_wide(p);
  HANDLE f =
      CreateFileW(w.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr, OPEN_ALWAYS, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return;
  std::string baris = "[" + iso_utc_now() + "] [XYAGENT] " + teks + "\n";
  DWORD tulis = 0;
  WriteFile(f, baris.data(), (DWORD)baris.size(), &tulis, nullptr);
  CloseHandle(f);
}

Konfig muat_konfig() {
  Konfig k;
  std::string isi;
  if (baca_berkas(jalur_config(), isi)) {
    try {
      json v = json::parse(isi);
      k.kode = jstr(v, "kode");
      k.user = jstr(v, "user");
      k.sandi = jstr(v, "sandi");
      std::string srv = jstr(v, "server");
      if (!srv.empty()) k.server = srv;
      if (v.is_object()) {
        auto it = v.find("stream_host");
        if (it != v.end() && it->is_string() && !it->get<std::string>().empty())
          k.stream_host = it->get<std::string>();
        auto it2 = v.find("relay");
        if (it2 != v.end() && it2->is_string() && !it2->get<std::string>().empty())
          k.relay = it2->get<std::string>();
      }
    } catch (...) {
    }
  }
  return k;
}

bool simpan_konfig(const Konfig& k, std::string& galat) {
  json v = json::object();
  std::string isi;
  if (baca_berkas(jalur_config(), isi)) {
    try {
      json lama = json::parse(isi);
      if (lama.is_object()) v = lama;
    } catch (...) {
    }
  }
  v["kode"] = k.kode;
  v["user"] = k.user;
  v["sandi"] = k.sandi;
  v["server"] = k.server;
  if (k.stream_host && !k.stream_host->empty()) {
    v["stream_host"] = *k.stream_host;
  } else {
    v.erase("stream_host");
  }
  if (k.relay && !k.relay->empty()) {
    v["relay"] = *k.relay;
  }
  std::string dir = dir_data();
  if (!buat_dir_rekursif(dir)) {
    galat = "tak bisa buat direktori data";
    return false;
  }
  if (!tulis_berkas(jalur_config(), v.dump(2))) {
    galat = "tak bisa tulis config.json";
    return false;
  }
  return true;
}

json periksa_sunshine(const Konfig& k) {
  std::string svc = status_service_sunshine();
  if (k.user.empty() || k.sandi.empty()) {
    return {{"siap", false},
            {"status", "KREDENSIAL_KOSONG"},
            {"pesan", "Kredensial Sunshine belum diisi — jalankan auto-setup."},
            {"service", svc}};
  }
  HttpResp r = minta(std::string(SUNSHINE_BAWAAN) + "/api/apps", std::nullopt, "GET",
                     header_basic(k));
  if (!r.jaringan_ok) {
    std::string info = r.galat;
    if (svc == "Stopped") {
      info += " (SunshineService sedang berhenti — jalankan service atau klik Setup Engine)";
    } else if (svc == "TIDAK_DITEMUKAN" || svc == "tidak ada") {
      info += " (Sunshine belum terpasang atau service belum dibuat — jalankan Setup Engine)";
    }
    return {{"siap", false}, {"status", "TIDAK_TERHUBUNG"}, {"pesan", info}, {"service", svc}};
  }
  if (r.status >= 200 && r.status < 300) {
    if (r.badan.is_object() && r.badan.contains("apps")) {
      return {{"siap", true},
              {"status", "API_SIAP"},
              {"pesan", "API Sunshine merespons."},
              {"service", svc}};
    }
    return {{"siap", true},
            {"status", "API_SIAP"},
            {"pesan", "API merespons HTTP " + std::to_string(r.status) + "."},
            {"service", svc}};
  }
  return {{"siap", false},
          {"status", "API_TIDAK_SESUAI"},
          {"pesan", "HTTP " + std::to_string(r.status) + ": akses API ditolak / belum cocok."},
          {"service", svc}};
}

json kunci_lanskap_sunshine(const Konfig& k, const Logger& log) {
  json muatan = {{"dd_configuration_option", "ensure_primary"},
                 {"dd_resolution_option", "manual"},
                 {"dd_manual_resolution", "1920x1080"},
                 {"dd_refresh_rate_option", "manual"},
                 {"dd_manual_refresh_rate", 60}};
  HttpResp r = minta(std::string(SUNSHINE_BAWAAN) + "/api/config", muatan, "POST", header_basic(k));
  if (r.jaringan_ok && r.status >= 200 && r.status < 300) {
    log("Display terkunci landscape 1920x1080@60 (termasuk headless).");
    return {{"ok", true}, {"status", "OK"}};
  }
  if (r.jaringan_ok) {
    log("Sunshine menolak kunci rasio (HTTP " + std::to_string(r.status) +
        "). Stream memakai rasio bawaan host.");
    return {{"ok", false}, {"status", "HTTP_" + std::to_string(r.status)}};
  }
  log("Gagal mengunci rasio display: " + r.galat);
  return {{"ok", false}, {"status", "GAGAL"}, {"pesan", r.galat}};
}

json buka_upnp_firewall(const Konfig& k, const Logger& log) {
  log("Langkah UPnP 1/3: aktifkan modul UPnP internal Sunshine…");
  HttpResp r = minta(std::string(SUNSHINE_BAWAAN) + "/api/config", json({{"upnp", "enabled"}}),
                     "POST", header_basic(k));
  if (r.jaringan_ok && r.status >= 200 && r.status < 300) {
    log("Sunshine: fitur UPnP internal DIAKTIFKAN.");
  } else {
    log("Sunshine API belum merespons opsi UPnP (melanjutkan ke router langsung).");
  }

  log("Langkah UPnP 2/3: daftarkan aturan Windows Firewall (inbound TCP & UDP)…");
  jalankan("netsh",
           {"advfirewall", "firewall", "add", "rule", "name=XyCloud-Sunshine-TCP", "dir=in",
            "action=allow", "protocol=TCP", "localport=47984,47989,47990,48010"},
           30);
  jalankan("netsh",
           {"advfirewall", "firewall", "add", "rule", "name=XyCloud-Sunshine-UDP", "dir=in",
            "action=allow", "protocol=UDP", "localport=47998,47999,48000,48002,48010"},
           30);
  if (auto exe = cari_sunshine_exe()) {
    jalankan("netsh",
             {"advfirewall", "firewall", "add", "rule", "name=XyCloud-Sunshine-App", "dir=in",
              "action=allow", "program=" + *exe, "enable=yes"},
             30);
  }
  log("Windows Firewall diizinkan.");

  log("Langkah UPnP 3/3: kirim permintaan port mapping UPnP IGD ke router WiFi…");
  const char* ps = R"PS(
$ErrorActionPreference = 'SilentlyContinue';
$upnp = New-Object -ComObject HNetCfg.NATUPnP;
$maps = $upnp.StaticPortMappingCollection;
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Tailscale|ZeroTier|VMware' -and
    ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -like '172.*')
} | Select-Object -First 1).IPAddress;
if (-not $localIp) {
    $localIp = (Find-NetRoute -RemoteIPAddress '8.8.8.8' | Select-Object -First 1 | Get-NetIPAddress).IPAddress;
}
if ($maps) {
    $sukses = 0;
    @(
        @{p=47984;pr='TCP'}, @{p=47989;pr='TCP'}, @{p=48010;pr='TCP'},
        @{p=47998;pr='UDP'}, @{p=47999;pr='UDP'}, @{p=48000;pr='UDP'},
        @{p=48002;pr='UDP'}, @{p=48010;pr='UDP'}
    ) | ForEach-Object {
        try {
            $maps.Remove($_.p, $_.pr) | Out-Null;
            $maps.Add($_.p, $_.pr, $_.p, $localIp, $true, ('XyCloud ' + $_.pr + ' ' + $_.p)) | Out-Null;
            $sukses++;
        } catch { }
    };
    Write-Output "UPNP_OK:$sukses:$localIp";
} else {
    Write-Output "UPNP_NO_ROUTER:$localIp";
}
)PS";
  HasilProses h = jalankan("powershell", {"-NoProfile", "-Command", ps}, 90);
  if (!h.ok) {
    log("Gagal memanggil UPnP powershell: " + h.galat);
    return {{"ok", false}, {"status", "GAGAL"}, {"pesan", h.galat}};
  }
  std::string out = trim(h.keluar);
  if (diawali(out, "UPNP_OK:")) {
    std::string sisa = out.substr(8);
    size_t dp = sisa.find(':');
    std::string jumlah = (dp == std::string::npos) ? sisa : sisa.substr(0, dp);
    std::string ip = (dp == std::string::npos) ? "-" : sisa.substr(dp + 1);
    log("UPnP SUKSES: " + jumlah + " port streaming berhasil dibuka di router ke IP " + ip + ".");
    return {{"ok", true},
            {"status", "OK"},
            {"pesan", jumlah + " port berhasil dipetakan di router ke IP " + ip}};
  }
  if (diawali(out, "UPNP_NO_ROUTER:")) {
    std::string ip = out.substr(15);
    log("Router lokal di jaringan (IP PC: " + ip + ") belum merespons UPnP.");
    log("Tips: Buka pengaturan router WiFi (192.168.1.1) lalu aktifkan opsi 'UPnP' agar port otomatis terbuka.");
    return {{"ok", false},
            {"status", "ROUTER_NO_UPNP"},
            {"pesan", "Router belum merespons UPnP. Aktifkan opsi UPnP di router jika ada."}};
  }
  log("Permintaan UPnP selesai dikirim.");
  return {{"ok", true}, {"status", "SELESAI"}, {"pesan", "Permintaan UPnP selesai dikirim."}};
}

std::optional<std::string> ip_tailscale() {
  HasilProses h = jalankan("powershell",
                           {"-NoProfile", "-Command",
                            "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | "
                            "Where-Object { $_.IPAddress -like '100.*' } | Select-Object -First 1 "
                            "-ExpandProperty IPAddress)"},
                           20);
  if (!h.ok) return std::nullopt;
  std::string ip = trim(h.keluar);
  size_t nl = ip.find_first_of("\r\n");
  if (nl != std::string::npos) ip.resize(nl);
  ip = trim(ip);
  unsigned o[4] = {0, 0, 0, 0};
  if (sscanf(ip.c_str(), "%u.%u.%u.%u", &o[0], &o[1], &o[2], &o[3]) == 4 && o[0] == 100 &&
      o[1] >= 64 && o[1] <= 127 && o[2] < 256 && o[3] < 256)
    return ip;
  return std::nullopt;
}

bool mode_relay_aktif() {
  std::string isi;
  if (!baca_berkas(jalur_config(), isi)) return false;
  try {
    json v = json::parse(isi);
    return jbool(v, "mode_relay");
  } catch (...) {
    return false;
  }
}

bool set_mode_relay(bool aktif, std::string& galat) {
  json v = json::object();
  std::string isi;
  if (baca_berkas(jalur_config(), isi)) {
    try {
      json lama = json::parse(isi);
      if (lama.is_object()) v = lama;
    } catch (...) {
    }
  }
  v["mode_relay"] = aktif;
  std::string dir = dir_data();
  if (!buat_dir_rekursif(dir)) {
    galat = "tak bisa buat direktori data";
    return false;
  }
  if (!tulis_berkas(jalur_config(), v.dump(2))) {
    galat = "tak bisa tulis config.json";
    return false;
  }
  return true;
}

std::pair<Konfig, json> setup_otomatis(const Konfig& k, const Logger& log) {
  Konfig kk = k;
  log(std::string("=== Auto-setup Sunshine · Agen ") + VERSI + " ===");
  log("Langkah 1/5: deteksi engine…");

  bool sudah_exe = cari_sunshine_exe().has_value();
  bool sudah_svc = service_sunshine().has_value();
  if (sudah_exe || sudah_svc) {
    log("Sunshine sudah terdeteksi di PC ini.");
    if (auto p = cari_sunshine_exe()) log("Path: " + *p);
  } else {
    log("Sunshine belum ada — pasang otomatis (winget → MSI GitHub)…");
    bool ok = pasang_sunshine_winget(log);
    if (!ok && !cari_sunshine_exe().has_value()) {
      log("Winget gagal — fallback unduh installer resmi GitHub…");
      ok = pasang_sunshine_msi(log);
    }
    if (!ok && !cari_sunshine_exe().has_value()) {
      log("GAGAL pasang otomatis. Opsi manual:");
      log("  1) winget install --id LizardByte.Sunshine -e");
      log("  2) https://github.com/LizardByte/Sunshine/releases/latest");
      log("  3) Jalankan Agent sebagai Administrator lalu ulangi setup.");
      return {kk, periksa_sunshine(kk)};
    }
    tidur_ms(3000);
  }

  auto exe = cari_sunshine_exe();
  if (!exe) {
    log("Sunshine.exe masih belum ketemu setelah install.");
    return {kk, periksa_sunshine(kk)};
  }
  log("Sunshine exe: " + *exe);

  log("Langkah 2/5: kredensial API lokal…");
  if (kk.user.empty() || kk.sandi.empty()) {
    if (kk.user.empty()) kk.user = "xycloud";
    if (kk.sandi.empty()) kk.sandi = acak_sandi(18);
    log("Membuat user/sandi otomatis (hanya 127.0.0.1)…");
    set_creds_sunshine(*exe, kk.user, kk.sandi, log);
    std::string galat;
    if (!simpan_konfig(kk, galat)) {
      log("Gagal simpan konfig setelah creds: " + galat);
    } else {
      log("Kredensial tersimpan di %APPDATA%\\XyCloudStore\\Agent\\config.json");
    }
  } else {
    log("Menyelaraskan kredensial tersimpan lewat --creds …");
    set_creds_sunshine(*exe, kk.user, kk.sandi, log);
  }

  log("Langkah 3/5: layanan…");
  pastikan_service_sunshine(log);

  log("Langkah 4/5: tunggu API 47990 (maks 45 dtk)…");
  json cek = tunggu_api_siap(kk, log, 45);
  if (jbool(cek, "siap")) {
    log("SETUP OK — Sunshine siap. Tidak perlu login web UI manual.");
    log("Langkah 5/5: kunci rasio landscape & konfigurasi Auto-UPnP…");
    kunci_lanskap_sunshine(kk, log);
    buka_upnp_firewall(kk, log);
  } else {
    log("SETUP SEBAGIAN — " + jstr(cek, "pesan", "API belum merespons"));
    log("Tips: jalankan Agent sebagai Admin, atau buka https://127.0.0.1:47990 sekali.");
    log("Lalu klik 'Uji koneksi' / ulangi Pasang & kunci.");
  }
  return {kk, cek};
}

void cek_port_dari_server(const Konfig& k, const Logger& log) {
  if (mode_relay_aktif()) {
    log("Catatan: Mode Relay aktif — cek port dari internet biasanya TERTUTUP dan itu normal. "
        "Streaming berjalan lewat tailnet.");
  }
  log("Meminta server memeriksa port streaming dari internet…");
  HttpResp r = minta(server_bersih(k) + "/api/agen/cek-port", json::object(), "POST",
                     {{"x-agen-kode", k.kode}}, 90);
  if (!r.jaringan_ok) {
    log("Gagal cek port: " + r.galat);
    return;
  }
  if (r.status < 200 || r.status >= 300) {
    std::string pesan = jstr(r.badan, "error");
    if (pesan.empty()) {
      log("Gagal cek port: HTTP " + std::to_string(r.status));
    } else {
      log("Gagal cek port: HTTP " + std::to_string(r.status) + " — " + pesan);
    }
    return;
  }
  std::string host = jstr(r.badan, "host", "?");
  unsigned tutup = 0, total = 0;
  if (r.badan.is_object() && r.badan.contains("hasil") && r.badan["hasil"].is_array()) {
    for (const json& h : r.badan["hasil"]) {
      total++;
      long port = 0;
      if (h.is_object() && h.contains("port") && h["port"].is_number())
        port = h["port"].get<long>();
      bool terbuka = jbool(h, "terbuka");
      if (!terbuka) tutup++;
      log("Port " + std::to_string(port) + "/TCP → " + host + ": " +
          (terbuka ? "TERBUKA" : "TERTUTUP"));
    }
  }
  if (tutup > 0) {
    log("Ada port tertutup → HP penyewa tidak bisa menyambung dari internet. Buka/forward port "
        "47984–47990 TCP+UDP & 48010 (router: UPnP/port-forward; VM cloud: inbound rule NSG/Security "
        "Group; Windows Firewall: izinkan Sunshine).");
  } else if (total > 0) {
    log("Semua port penting terbuka — streaming dari HP bisa menyambung dari mana pun.");
  }
}

static const wchar_t* KUNCI_RUN = L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
static const wchar_t* NAMA_RUN = L"XyCloudStoreAgent";

void atur_autostart(bool aktif, const Logger& log) {
  if (aktif) {
    wchar_t exe[MAX_PATH];
    DWORD n = GetModuleFileNameW(nullptr, exe, MAX_PATH);
    if (n == 0 || n >= MAX_PATH) {
      log("Gagal daftar autostart: tak bisa baca path exe.");
      return;
    }
    std::wstring cmd = L"\"" + std::wstring(exe) + L"\" -Jalankan";
    HKEY hk = nullptr;
    LONG r = RegOpenKeyExW(HKEY_CURRENT_USER, KUNCI_RUN, 0, KEY_SET_VALUE, &hk);
    if (r != ERROR_SUCCESS) {
      log("Gagal daftar autostart: registry tak bisa dibuka.");
      return;
    }
    r = RegSetValueExW(hk, NAMA_RUN, 0, REG_SZ, (const BYTE*)cmd.c_str(),
                       (DWORD)((cmd.size() + 1) * sizeof(wchar_t)));
    RegCloseKey(hk);
    if (r == ERROR_SUCCESS) {
      log("Autostart didaftarkan (XyCloudStoreAgent @ login).");
    } else {
      log("Gagal daftar autostart: registry ditolak.");
    }
  } else {
    HKEY hk = nullptr;
    LONG r = RegOpenKeyExW(HKEY_CURRENT_USER, KUNCI_RUN, 0, KEY_SET_VALUE, &hk);
    if (r != ERROR_SUCCESS) {
      log("Gagal hapus autostart: registry tak bisa dibuka.");
      return;
    }
    RegDeleteValueW(hk, NAMA_RUN);
    RegCloseKey(hk);
    log("Autostart dihapus.");
  }
}

bool autostart_aktif() {
  HKEY hk = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, KUNCI_RUN, 0, KEY_QUERY_VALUE, &hk) != ERROR_SUCCESS)
    return false;
  LONG r = RegQueryValueExW(hk, NAMA_RUN, nullptr, nullptr, nullptr, nullptr);
  RegCloseKey(hk);
  return r == ERROR_SUCCESS;
}

void jalankan_loop(const Konfig& k, const Logger& log,
                   const std::shared_ptr<std::atomic<bool>>& stop) {
  log(std::string("XyCloudStore Agen ") + VERSI + " (C++) mulai.");
  log("Server   : " + k.server);
  log(std::string("Sunshine : ") + SUNSHINE_BAWAAN);
  auto terakhir = std::chrono::steady_clock::now();
  for (;;) {
    if (stop->load()) break;
    if (std::chrono::steady_clock::now() - terakhir >= std::chrono::seconds(20)) {
      terakhir = std::chrono::steady_clock::now();
      detak(k, log);
    }
    tidur_ms(1000);
  }
  log("Agen dihentikan.");
}

}  // namespace agent
}  // namespace xy
