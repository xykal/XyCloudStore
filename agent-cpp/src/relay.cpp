#include "relay.h"

#include <atomic>
#include <cctype>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

#include "agent.h"
#include "http.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

namespace xy {
namespace relay {
namespace {

// ---------- konstanta protokol ----------
const uint8_t VER = 1;
const uint8_t K_TCP = 0;
const uint8_t K_UDP = 1;
const uint8_t K_OPEN = 2;
const uint8_t K_CLOSE = 3;
const uint8_t K_PING = 4;
const uint8_t K_PONG = 5;
const uint16_t TCP_PORTS[3] = {47984, 47989, 48010};
const uint16_t UDP_PORTS[5] = {47998, 47999, 48000, 48002, 48010};
const char* WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const char* CLOUDFLARED_URL =
    "https://github.com/cloudflare/cloudflared/releases/latest/download/"
    "cloudflared-windows-amd64.exe";

// ---------- state ----------
struct Aktif {
  std::string url_wss;
  std::string sesi;
  std::shared_ptr<std::atomic<bool>> jalan;
};
std::mutex g_mutex;
std::unique_ptr<Aktif> g_aktif;
HANDLE g_cf_proses = nullptr;

// Job object: cloudflared otomatis mati bila agen mati/crash (anti-yatim).
HANDLE job_cloudflared() {
  static HANDLE job = nullptr;
  static std::once_flag f;
  std::call_once(f, []() {
    job = CreateJobObjectW(nullptr, nullptr);
    if (job) {
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION info{};
      info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info, sizeof(info));
    }
  });
  return job;
}

// ---------- helper soket ----------
void soket_tutup(SOCKET s) {
  if (s != INVALID_SOCKET) closesocket(s);
}

bool soket_timeout_baca(SOCKET s, unsigned ms) {
  DWORD t = ms;
  return setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char*)&t, sizeof(t)) == 0;
}

bool kirim_semua(SOCKET s, const uint8_t* data, size_t len) {
  size_t terkirim = 0;
  while (terkirim < len) {
    int n = send(s, (const char*)data + terkirim, (int)(len - terkirim), 0);
    if (n <= 0) return false;
    terkirim += (size_t)n;
  }
  return true;
}

enum class BacaHasil { OK, TIMEOUT, GAGAL };

BacaHasil baca_pasti(SOCKET s, uint8_t* buf, size_t len) {
  size_t dapat = 0;
  while (dapat < len) {
    int n = recv(s, (char*)buf + dapat, (int)(len - dapat), 0);
    if (n > 0) {
      dapat += (size_t)n;
      continue;
    }
    if (n == 0) return BacaHasil::GAGAL;  // ditutup lawan
    int e = WSAGetLastError();
    if (e == WSAETIMEDOUT) return BacaHasil::TIMEOUT;
    return BacaHasil::GAGAL;
  }
  return BacaHasil::OK;
}

// TCP connect ke 127.0.0.1 dengan timeout (detik).
SOCKET tcp_sambung_timeout(uint16_t port, unsigned detik) {
  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return INVALID_SOCKET;
  u_long nb = 1;
  ioctlsocket(s, FIONBIO, &nb);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(port);
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  int r = connect(s, (sockaddr*)&a, sizeof(a));
  if (r != 0) {
    int e = WSAGetLastError();
    if (e != WSAEWOULDBLOCK) {
      soket_tutup(s);
      return INVALID_SOCKET;
    }
    fd_set w;
    FD_ZERO(&w);
    FD_SET(s, &w);
    timeval tv{(long)detik, 0};
    r = select(0, nullptr, &w, nullptr, &tv);
    if (r <= 0) {
      soket_tutup(s);
      return INVALID_SOCKET;
    }
    int err = 0, uk = sizeof(err);
    getsockopt(s, SOL_SOCKET, SO_ERROR, (char*)&err, &uk);
    if (err != 0) {
      soket_tutup(s);
      return INVALID_SOCKET;
    }
  }
  nb = 0;
  ioctlsocket(s, FIONBIO, &nb);
  soket_timeout_baca(s, 1000);
  return s;
}

// ---------- antre baris thread-safe (stderr cloudflared) ----------
struct AntreBaris {
  std::mutex m;
  std::condition_variable cv;
  std::deque<std::string> antre;
  bool selesai = false;
  void dorong(std::string b) {
    std::lock_guard<std::mutex> k(m);
    antre.push_back(std::move(b));
    cv.notify_one();
  }
  void tutup() {
    std::lock_guard<std::mutex> k(m);
    selesai = true;
    cv.notify_all();
  }
  // Tunggu satu baris; nullopt bila timeout/selesai-tanpa-baru.
  std::optional<std::string> ambil(unsigned detik) {
    std::unique_lock<std::mutex> k(m);
    if (antre.empty() && !selesai)
      cv.wait_for(k, std::chrono::seconds(detik), [&] { return !antre.empty() || selesai; });
    if (!antre.empty()) {
      std::string b = std::move(antre.front());
      antre.pop_front();
      return b;
    }
    return std::nullopt;
  }
};

// ---------- framing XY-RELAY ----------
std::vector<uint8_t> bingkai_xy(uint8_t k, uint8_t i, uint8_t c, uint8_t f, const uint8_t* d,
                                size_t len) {
  if (len > 65535) len = 65535;
  std::vector<uint8_t> v;
  v.reserve(7 + len);
  v.push_back(VER);
  v.push_back(k);
  v.push_back(i);
  v.push_back(c);
  v.push_back(f);
  v.push_back((uint8_t)((len >> 8) & 0xFF));
  v.push_back((uint8_t)(len & 0xFF));
  v.insert(v.end(), d, d + len);
  return v;
}

std::vector<uint8_t> bingkai_ws(uint8_t opcode, const uint8_t* d, size_t len) {
  std::vector<uint8_t> v;
  v.reserve(10 + len);
  v.push_back(0x80 | (opcode & 0x0F));
  if (len < 126) {
    v.push_back((uint8_t)len);
  } else if (len < 65536) {
    v.push_back(126);
    v.push_back((uint8_t)((len >> 8) & 0xFF));
    v.push_back((uint8_t)(len & 0xFF));
  } else {
    v.push_back(127);
    for (int i = 7; i >= 0; i--) v.push_back((uint8_t)((len >> (8 * i)) & 0xFF));
  }
  v.insert(v.end(), d, d + len);
  return v;
}

}  // namespace

bool perlu_relay_otomatis(const std::string& stream) {
  std::string s = trim(stream);
  if (s.empty()) return true;
  // IPv4 literal?
  unsigned o[4] = {0, 0, 0, 0};
  char ekstra = 0;
  if (sscanf(s.c_str(), "%u.%u.%u.%u%c", &o[0], &o[1], &o[2], &o[3], &ekstra) == 4 ||
      sscanf(s.c_str(), "%u.%u.%u.%u", &o[0], &o[1], &o[2], &o[3]) == 4) {
    bool valid = o[0] < 256 && o[1] < 256 && o[2] < 256 && o[3] < 256;
    size_t titik = 0;
    for (char c : s) {
      if (c == '.') titik++;
    }
    if (valid && titik == 3) {
      if (o[0] == 10 || o[0] == 127 || o[0] == 0) return true;
      if (o[0] == 100 && o[1] >= 64 && o[1] <= 127) return true;
      if (o[0] == 172 && o[1] >= 16 && o[1] <= 31) return true;
      if (o[0] == 192 && o[1] == 168) return true;
      if (o[0] == 169 && o[1] == 254) return true;
      return false;
    }
  }
  if (s.find(':') != std::string::npos) return false;  // IPv6: direct
  return s.find('.') == std::string::npos;  // nama PC tanpa titik => relay
}

std::optional<std::string> url_aktif() {
  std::lock_guard<std::mutex> k(g_mutex);
  if (g_aktif) return g_aktif->url_wss;
  return std::nullopt;
}

void berhenti() {
  std::lock_guard<std::mutex> k(g_mutex);
  if (g_aktif) {
    g_aktif->jalan->store(false);
    g_aktif.reset();
  }
  if (g_cf_proses) {
    TerminateProcess(g_cf_proses, 1);
    CloseHandle(g_cf_proses);
    g_cf_proses = nullptr;
  }
}

namespace {

// ---------- server WebSocket minimal ----------

struct PesanWs {
  bool timeout = false;
  bool gagal = false;
  uint8_t opcode = 0;
  std::vector<uint8_t> data;
};

// Baca satu pesan WS utuh (gabung fragmentasi). frag dipertahankan antar panggilan.
PesanWs baca_ws_pesan(SOCKET s, std::vector<uint8_t>& frag) {
  PesanWs p;
  uint8_t head[2];
  BacaHasil hr = baca_pasti(s, head, 2);
  if (hr == BacaHasil::TIMEOUT) {
    p.timeout = true;
    return p;
  }
  if (hr != BacaHasil::OK) {
    p.gagal = true;
    return p;
  }
  bool fin = (head[0] & 0x80) != 0;
  uint8_t opcode = head[0] & 0x0F;
  bool masked = (head[1] & 0x80) != 0;
  uint64_t len = head[1] & 0x7F;
  if (len == 126) {
    uint8_t e[2];
    if (baca_pasti(s, e, 2) != BacaHasil::OK) {
      p.gagal = true;
      return p;
    }
    len = ((uint64_t)e[0] << 8) | e[1];
  } else if (len == 127) {
    uint8_t e[8];
    if (baca_pasti(s, e, 8) != BacaHasil::OK) {
      p.gagal = true;
      return p;
    }
    len = 0;
    for (int i = 0; i < 8; i++) len = (len << 8) | e[i];
  }
  if (len > 4 * 1024 * 1024) {
    p.gagal = true;
    return p;
  }
  uint8_t mask[4] = {0, 0, 0, 0};
  if (masked) {
    if (baca_pasti(s, mask, 4) != BacaHasil::OK) {
      p.gagal = true;
      return p;
    }
  }
  std::vector<uint8_t> data((size_t)len);
  if (len > 0 && baca_pasti(s, data.data(), (size_t)len) != BacaHasil::OK) {
    p.gagal = true;
    return p;
  }
  if (masked) {
    for (size_t i = 0; i < data.size(); i++) data[i] ^= mask[i % 4];
  }
  if (opcode == 8 || opcode == 9 || opcode == 10) {
    p.opcode = opcode;
    p.data = std::move(data);
    return p;
  }
  if (opcode == 0) {
    frag.insert(frag.end(), data.begin(), data.end());
  } else {
    frag = std::move(data);
  }
  if (fin) {
    p.opcode = (opcode == 0) ? 2 : opcode;
    p.data = std::move(frag);
    frag.clear();
    return p;
  }
  if (frag.size() > 4 * 1024 * 1024) {
    p.gagal = true;
    return p;
  }
  p.timeout = true;  // fragmentasi lanjutan dibaca panggilan berikut
  return p;
}

using PetaTcp = std::map<std::pair<uint8_t, uint8_t>, SOCKET>;

struct Penulis {
  std::mutex m;
  std::condition_variable cv;
  std::deque<std::vector<uint8_t>> antre;
  std::atomic<bool> tutup{false};
  SOCKET sok = INVALID_SOCKET;
  void kirim(std::vector<uint8_t> v) {
    {
      std::lock_guard<std::mutex> k(m);
      if (tutup.load()) return;
      antre.push_back(std::move(v));
    }
    cv.notify_one();
  }
};

void proses_frame(const uint8_t* muatan, size_t n, const std::shared_ptr<Penulis>& tx,
                  SOCKET udp[5], const std::shared_ptr<std::mutex>& tcp_mutex,
                  const std::shared_ptr<PetaTcp>& tcp_map,
                  const std::shared_ptr<std::atomic<bool>>& jalan, const Logger& log) {
  if (n < 7 || muatan[0] != VER) return;
  uint8_t kind = muatan[1], idx = muatan[2], conn = muatan[3];
  size_t len = ((size_t)muatan[5] << 8) | muatan[6];
  if (n < 7 + len) return;
  const uint8_t* data = muatan + 7;

  if (kind == K_PING) {
    uint8_t kosong = 0;
    tx->kirim(bingkai_xy(K_PONG, 0, 0, 0, &kosong, 0));
    return;
  }
  if (kind == K_UDP) {
    size_t i = idx;
    if (i >= 5) return;
    if (udp[i] == INVALID_SOCKET) {
      SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
      if (s == INVALID_SOCKET) {
        log("Relay: UDP gagal bind.");
        return;
      }
      sockaddr_in a{};
      a.sin_family = AF_INET;
      a.sin_port = htons(UDP_PORTS[i]);
      a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
      if (connect(s, (sockaddr*)&a, sizeof(a)) != 0) {
        soket_tutup(s);
        log("Relay: UDP gagal connect.");
        return;
      }
      soket_timeout_baca(s, 1000);
      udp[i] = s;
      // Thread baca balasan Sunshine → teruskan ke HP.
      std::thread([s, tx, jalan, idx]() {
        std::vector<uint8_t> b(65535);
        for (;;) {
          if (!jalan->load() || tx->tutup.load()) break;
          int r = recv(s, (char*)b.data(), (int)b.size(), 0);
          if (r > 0) {
            tx->kirim(bingkai_xy(K_UDP, idx, 0, 0, b.data(), (size_t)r));
          } else if (r == 0) {
            break;
          } else {
            int e = WSAGetLastError();
            if (e == WSAETIMEDOUT) continue;
            break;
          }
        }
      }).detach();
    }
    send(udp[i], (const char*)data, (int)len, 0);
    return;
  }
  if (kind == K_OPEN) {
    size_t i = idx;
    if (i >= 3) return;
    SOCKET s = tcp_sambung_timeout(TCP_PORTS[i], 8);
    if (s == INVALID_SOCKET) {
      uint8_t kosong = 0;
      tx->kirim(bingkai_xy(K_CLOSE, idx, conn, 2, &kosong, 0));
      return;
    }
    {
      std::lock_guard<std::mutex> k(*tcp_mutex);
      auto it = tcp_map->find({idx, conn});
      if (it != tcp_map->end()) {
        soket_tutup(it->second);
        tcp_map->erase(it);
      }
      (*tcp_map)[{idx, conn}] = s;
    }
    std::thread([s, tx, jalan, tcp_mutex, tcp_map, idx, conn]() {
      std::vector<uint8_t> b(32768);
      for (;;) {
        if (!jalan->load() || tx->tutup.load()) break;
        int r = recv(s, (char*)b.data(), (int)b.size(), 0);
        if (r > 0) {
          tx->kirim(bingkai_xy(K_TCP, idx, conn, 0, b.data(), (size_t)r));
        } else if (r == 0) {
          break;
        } else {
          int e = WSAGetLastError();
          if (e == WSAETIMEDOUT) continue;
          break;
        }
      }
      {
        std::lock_guard<std::mutex> k(*tcp_mutex);
        auto it = tcp_map->find({idx, conn});
        if (it != tcp_map->end() && it->second == s) {
          tcp_map->erase(it);
          soket_tutup(s);
        }
      }
      uint8_t kosong = 0;
      tx->kirim(bingkai_xy(K_CLOSE, idx, conn, 0, &kosong, 0));
    }).detach();
    return;
  }
  if (kind == K_TCP) {
    std::lock_guard<std::mutex> k(*tcp_mutex);
    auto it = tcp_map->find({idx, conn});
    if (it != tcp_map->end()) kirim_semua(it->second, data, len);
    return;
  }
  if (kind == K_CLOSE) {
    std::lock_guard<std::mutex> k(*tcp_mutex);
    auto it = tcp_map->find({idx, conn});
    if (it != tcp_map->end()) {
      shutdown(it->second, SD_BOTH);
      soket_tutup(it->second);
      tcp_map->erase(it);
    }
    return;
  }
}

void layani_ws(SOCKET alir, std::shared_ptr<std::atomic<bool>> jalan, std::string sesi, Logger log) {
  pastikan_winsock();
  soket_timeout_baca(alir, 1000);
  // 1) Baca HTTP Upgrade (maks 16 KB).
  std::string kepala;
  kepala.reserve(1024);
  char buf[512];
  bool ok_baca = false;
  for (;;) {
    if (!jalan->load() || kepala.size() > 16384) break;
    int n = recv(alir, buf, sizeof(buf), 0);
    if (n > 0) {
      kepala.append(buf, (size_t)n);
      if (kepala.find("\r\n\r\n") != std::string::npos) {
        ok_baca = true;
        break;
      }
    } else if (n == 0) {
      break;
    } else {
      int e = WSAGetLastError();
      if (e == WSAETIMEDOUT) continue;
      break;
    }
  }
  if (!ok_baca) {
    soket_tutup(alir);
    return;
  }
  // 2) Urai header.
  std::string permintaan, kunci;
  bool upgrade_ws = false;
  {
    size_t pos = 0;
    bool pertama = true;
    while (pos < kepala.size()) {
      size_t eol = kepala.find("\r\n", pos);
      if (eol == std::string::npos) break;
      std::string baris = kepala.substr(pos, eol - pos);
      pos = eol + 2;
      if (baris.empty()) break;
      if (pertama) {
        permintaan = baris;
        pertama = false;
      } else {
        std::string kecil = ke_kecil(baris);
        if (diawali(kecil, "sec-websocket-key:")) {
          size_t dp = baris.find(':');
          kunci = trim(baris.substr(dp + 1));
        }
        if (diawali(kecil, "upgrade:") && kecil.find("websocket") != std::string::npos)
          upgrade_ws = true;
      }
    }
  }
  std::string path;
  {
    size_t a = permintaan.find(' ');
    size_t b = (a == std::string::npos) ? std::string::npos : permintaan.find(' ', a + 1);
    if (a != std::string::npos && b != std::string::npos) path = permintaan.substr(a + 1, b - a - 1);
  }
  bool path_ok = (path == "/" || path == ("/xy/" + sesi));
  if (kunci.empty() || !upgrade_ws || !path_ok) {
    const char* bad = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
    send(alir, bad, (int)strlen(bad), 0);
    soket_tutup(alir);
    return;
  }
  if (diawali(permintaan, "GET / ")) log("Relay: WS tanpa sesi (kompatibilitas) — diterima dengan peringatan.");
  std::array<uint8_t, 20> h = sha1(kunci + WS_GUID);
  std::string terima = base64_encode(h.data(), h.size());
  std::string resp =
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
      "Sec-WebSocket-Accept: " +
      terima + "\r\n\r\n";
  if (!kirim_semua(alir, (const uint8_t*)resp.data(), resp.size())) {
    soket_tutup(alir);
    return;
  }
  // 3) Loop pesan.
  auto tx = std::make_shared<Penulis>();
  tx->sok = alir;
  std::thread([tx]() {
    for (;;) {
      std::vector<uint8_t> frame;
      {
        std::unique_lock<std::mutex> k(tx->m);
        if (tx->antre.empty() && !tx->tutup.load())
          tx->cv.wait_for(k, std::chrono::seconds(1), [&] { return !tx->antre.empty() || tx->tutup.load(); });
        if (tx->tutup.load()) break;
        if (tx->antre.empty()) continue;
        frame = std::move(tx->antre.front());
        tx->antre.pop_front();
      }
      std::vector<uint8_t> w = bingkai_ws(0x2, frame.data(), frame.size());
      if (!kirim_semua(tx->sok, w.data(), w.size())) {
        tx->tutup.store(true);
        break;
      }
    }
  }).detach();

  SOCKET udp[5] = {INVALID_SOCKET, INVALID_SOCKET, INVALID_SOCKET, INVALID_SOCKET, INVALID_SOCKET};
  auto tcp_mutex = std::make_shared<std::mutex>();
  // Peta TCP harus hidup lintas thread pembaca; simpan di shared_ptr.
  auto tcp_map = std::make_shared<PetaTcp>();
  std::vector<uint8_t> sisa_frag;
  for (;;) {
    if (!jalan->load() || tx->tutup.load()) break;
    PesanWs p = baca_ws_pesan(alir, sisa_frag);
    if (p.timeout) continue;
    if (p.gagal || p.opcode == 8) break;
    if (p.opcode == 9) {
      std::vector<uint8_t> pong = bingkai_ws(0xA, nullptr, 0);
      std::lock_guard<std::mutex> k(tx->m);
      if (!kirim_semua(alir, pong.data(), pong.size())) break;
      continue;
    }
    if (p.opcode != 1 && p.opcode != 2) continue;
    // Adaptor: proses_frame butuh referensi peta — bungkus via mutex bersama.
    proses_frame(p.data.data(), p.data.size(), tx, udp, tcp_mutex, tcp_map, jalan, log);
  }
  tx->tutup.store(true);
  tx->cv.notify_all();
  {
    std::lock_guard<std::mutex> k(*tcp_mutex);
    for (auto& kv : *tcp_map) {
      shutdown(kv.second, SD_BOTH);
      soket_tutup(kv.second);
    }
    tcp_map->clear();
  }
  for (int i = 0; i < 5; i++) soket_tutup(udp[i]);
  soket_tutup(alir);
}

// Buka proxy WS lokal (`port_minta`: 0 = acak, atau port tetap mode named).
struct SiapWs {
  bool ok = false;
  std::string galat;
  uint16_t port = 0;
  std::shared_ptr<std::atomic<bool>> jalan;
};

SiapWs siapkan_ws(uint16_t port_minta, const std::string& sesi_id, const Logger& log) {
  SiapWs h;
  pastikan_winsock();
  SOCKET d = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (d == INVALID_SOCKET) {
    h.galat = "gagal buat soket relay";
    return h;
  }
  BOOL reuse = TRUE;
  setsockopt(d, SOL_SOCKET, SO_REUSEADDR, (const char*)&reuse, sizeof(reuse));
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(port_minta);
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(d, (sockaddr*)&a, sizeof(a)) != 0 || listen(d, 8) != 0) {
    soket_tutup(d);
    h.galat = "gagal bind relay 127.0.0.1:" + std::to_string(port_minta);
    return h;
  }
  sockaddr_in nyata{};
  int uk = sizeof(nyata);
  getsockname(d, (sockaddr*)&nyata, &uk);
  h.port = ntohs(nyata.sin_port);
  log("Relay: proxy WS lokal di 127.0.0.1:" + std::to_string(h.port));
  h.jalan = std::make_shared<std::atomic<bool>>(true);
  std::shared_ptr<std::atomic<bool>> jalan = h.jalan;
  std::string sesi = sesi_id;
  Logger lg = log;
  std::thread([d, jalan, sesi, lg]() {
    for (;;) {
      if (!jalan->load()) break;
      fd_set r;
      FD_ZERO(&r);
      FD_SET(d, &r);
      timeval tv{0, 200000};
      int n = select(0, &r, nullptr, nullptr, &tv);
      if (n < 0) break;
      if (n == 0) continue;
      SOCKET c = accept(d, nullptr, nullptr);
      if (c == INVALID_SOCKET) {
        if (!jalan->load()) break;
        continue;
      }
      std::thread([c, jalan, sesi, lg]() { layani_ws(c, jalan, sesi, lg); }).detach();
    }
    soket_tutup(d);
  }).detach();
  h.ok = true;
  return h;
}

// ---------- cloudflared ----------

struct CfJalan {
  bool ok = false;
  std::string galat;
  HANDLE proses = nullptr;
  std::shared_ptr<AntreBaris> log_antre;
};

CfJalan jalankan_cloudflared(const std::string& bin, const std::vector<std::string>& args) {
  CfJalan h;
  SECURITY_ATTRIBUTES sa{};
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = TRUE;
  HANDLE baca = nullptr, tulis = nullptr;
  if (!CreatePipe(&baca, &tulis, &sa, 0)) {
    h.galat = "gagal buat pipe cloudflared";
    return h;
  }
  SetHandleInformation(baca, HANDLE_FLAG_INHERIT, 0);
  HANDLE nul_out =
      CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, nullptr);
  HANDLE nul_in =
      CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, nullptr);

  std::wstring cmd = L"\"" + utf8_ke_wide(bin) + L"\"";
  for (const auto& a : args) cmd += L" \"" + utf8_ke_wide(a) + L"\"";
  STARTUPINFOW si{};
  si.cb = sizeof(si);
  si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  si.hStdOutput = (nul_out != INVALID_HANDLE_VALUE) ? nul_out : nullptr;
  si.hStdError = tulis;
  si.hStdInput = (nul_in != INVALID_HANDLE_VALUE) ? nul_in : nullptr;
  PROCESS_INFORMATION pi{};
  std::vector<wchar_t> cmdbuf(cmd.begin(), cmd.end());
  cmdbuf.push_back(L'\0');
  BOOL ok = CreateProcessW(nullptr, cmdbuf.data(), nullptr, nullptr, TRUE, CREATE_NO_WINDOW,
                           nullptr, nullptr, &si, &pi);
  CloseHandle(tulis);
  if (nul_out != INVALID_HANDLE_VALUE) CloseHandle(nul_out);
  if (nul_in != INVALID_HANDLE_VALUE) CloseHandle(nul_in);
  if (!ok) {
    CloseHandle(baca);
    h.galat = "cloudflared gagal jalan";
    return h;
  }
  CloseHandle(pi.hThread);
  if (HANDLE job = job_cloudflared()) AssignProcessToJobObject(job, pi.hProcess);
  h.proses = pi.hProcess;
  h.log_antre = std::make_shared<AntreBaris>();
  std::shared_ptr<AntreBaris> antre = h.log_antre;
  std::thread([baca, antre]() {
    std::string sisa;
    char buf[4096];
    DWORD n = 0;
    for (;;) {
      BOOL r = ReadFile(baca, buf, sizeof(buf), &n, nullptr);
      if (!r || n == 0) break;
      sisa.append(buf, n);
      size_t pos = 0;
      for (;;) {
        size_t nl = sisa.find('\n', pos);
        if (nl == std::string::npos) break;
        std::string baris = trim(sisa.substr(pos, nl - pos));
        pos = nl + 1;
        if (!baris.empty()) antre->dorong(baris);
      }
      sisa.erase(0, pos);
    }
    antre->tutup();
    CloseHandle(baca);
  }).detach();
  h.ok = true;
  return h;
}

std::optional<std::string> petik_trycloudflare(const std::string& baris) {
  size_t i = baris.find("https://");
  if (i == std::string::npos) return std::nullopt;
  std::string sisa = baris.substr(i + 8);
  size_t akhir = sisa.find_first_of(" \t\r\n\"')");
  std::string host = trim(sisa.substr(0, akhir));
  while (!host.empty() && host.back() == '/') host.pop_back();
  if (host.size() >= 18 && host.compare(host.size() - 18, 18, ".trycloudflare.com") == 0 &&
      host.find(' ') == std::string::npos)
    return host;
  return std::nullopt;
}

bool hostname_valid(const std::string& h) {
  if (h.size() < 4 || h.size() > 253 || h.find('.') == std::string::npos) return false;
  size_t pos = 0;
  while (pos <= h.size()) {
    size_t dp = h.find('.', pos);
    std::string label = h.substr(pos, dp == std::string::npos ? dp : dp - pos);
    if (label.empty() || label.size() > 63) return false;
    for (char c : label) {
      if (!(isalnum((unsigned char)c) || c == '-')) return false;
    }
    if (label.front() == '-' || label.back() == '-') return false;
    if (dp == std::string::npos) break;
    pos = dp + 1;
  }
  return true;
}

std::string agen_ua() { return std::string("XyAgent/") + agent::VERSI; }

Hasil pastikan_cloudflared(const Logger& log) {
  std::string bin = agent::dir_data() + "\\cloudflared.exe";
  if (berkas_ada(bin) && ukuran_berkas(bin) > 1000000) return {true, bin};
  log("Relay: mengunduh cloudflared (~35 MB, sekali saja)…");
  if (!http_unduh(CLOUDFLARED_URL, bin, log, agen_ua()))
    return {false, "unduh cloudflared gagal"};
  if (ukuran_berkas(bin) < 1000000) return {false, "berkas cloudflared rusak"};
  return {true, bin};
}

std::optional<std::string> url_sesi_aktif(const std::string& sesi_id) {
  std::lock_guard<std::mutex> k(g_mutex);
  if (g_aktif && g_aktif->sesi == sesi_id && g_aktif->jalan->load()) return g_aktif->url_wss;
  return std::nullopt;
}

Hasil simpan_aktif(HANDLE proses, const std::string& sesi_id, const std::string& url_wss,
                  const std::shared_ptr<std::atomic<bool>>& jalan, const Logger& log) {
  {
    std::lock_guard<std::mutex> k(g_mutex);
    if (g_cf_proses) {
      TerminateProcess(g_cf_proses, 1);
      CloseHandle(g_cf_proses);
    }
    g_cf_proses = proses;
    g_aktif.reset(new Aktif{url_wss, sesi_id, jalan});
  }
  log("Relay AKTIF: " + url_wss);
  return {true, url_wss};
}

}  // namespace

Hasil mulai(const std::string& sesi_id, const Logger& log) {
  if (auto u = url_sesi_aktif(sesi_id)) return {true, *u};
  berhenti();
  SiapWs ws = siapkan_ws(0, sesi_id, log);
  if (!ws.ok) return {false, ws.galat};
  Hasil bin = pastikan_cloudflared(log);
  if (!bin.ok) {
    ws.jalan->store(false);
    return {false, bin.teks};
  }
  log("Relay: membuka Quick Tunnel (maks 90 dtk)…");
  std::string url_lokal = "http://127.0.0.1:" + std::to_string(ws.port);
  CfJalan cf = jalankan_cloudflared(bin.teks, {"tunnel", "--url", url_lokal, "--no-autoupdate"});
  if (!cf.ok) {
    ws.jalan->store(false);
    return {false, cf.galat};
  }
  std::optional<std::string> host;
  for (int i = 0; i < 45; i++) {
    auto baris = cf.log_antre->ambil(2);
    if (!baris) {
      if (cf.log_antre->selesai) break;
      continue;
    }
    if (auto h = petik_trycloudflare(*baris)) {
      host = h;
      break;
    }
  }
  if (!host) {
    TerminateProcess(cf.proses, 1);
    CloseHandle(cf.proses);
    ws.jalan->store(false);
    return {false, "Quick Tunnel tidak memberi URL dalam 90 dtk"};
  }
  return simpan_aktif(cf.proses, sesi_id, "wss://" + *host + "/xy/" + sesi_id, ws.jalan, log);
}

namespace {

Hasil mulai_named_sekali(const std::string& server, const std::string& kode,
                         const std::string& sesi_id, const Logger& log) {
  if (auto u = url_sesi_aktif(sesi_id)) return {true, *u};
  berhenti();
  // 1) Minta setup ke Worker (idempotent; 503 bila token CF belum diset).
  std::string srv = server;
  while (!srv.empty() && srv.back() == '/') srv.pop_back();
  HttpResp resp =
      http_minta("POST", srv + "/api/agen/relay/named", json::object(), {{"x-agen-kode", kode}},
                 agen_ua(), 15);
  if (!resp.jaringan_ok) return {false, "API relay named tak terjangkau: " + resp.galat};
  if (resp.status < 200 || resp.status >= 300) {
    std::string pesan;
    if (resp.badan.is_object() && resp.badan.contains("error") && resp.badan["error"].is_string())
      pesan = resp.badan["error"].get<std::string>();
    return {false, "API relay named HTTP " + std::to_string(resp.status) + ": " + pesan};
  }
  json data = (resp.badan.is_object() && resp.badan.contains("data")) ? resp.badan["data"] : resp.badan;
  std::string hostname = (data.is_object() && data.contains("hostname") && data["hostname"].is_string())
                             ? trim(data["hostname"].get<std::string>())
                             : "";
  std::string token = (data.is_object() && data.contains("tunnel_token") && data["tunnel_token"].is_string())
                          ? trim(data["tunnel_token"].get<std::string>())
                          : "";
  if (!hostname_valid(hostname)) return {false, "API relay named memberi hostname cacat"};
  bool token_cacat = token.size() < 20 || token.size() > 4096;
  for (char c : token) {
    if (c == ' ' || c == '\t' || c == '\r' || c == '\n') token_cacat = true;
  }
  if (token_cacat) return {false, "API relay named memberi token cacat"};
  // 2) WS lokal port tetap (sesuai ingress di Worker).
  SiapWs ws = siapkan_ws(PORT_NAMED, sesi_id, log);
  if (!ws.ok) {
    std::string e = ws.galat;
    berhenti();
    tidur_ms(500);
    ws = siapkan_ws(PORT_NAMED, sesi_id, log);
    if (!ws.ok) return {false, "port relay " + std::to_string(PORT_NAMED) + " dipakai: " + e};
  }
  // 3) cloudflared run --token …; siap saat "Registered tunnel connection".
  Hasil bin = pastikan_cloudflared(log);
  if (!bin.ok) {
    ws.jalan->store(false);
    return {false, bin.teks};
  }
  log("Relay: membuka named tunnel (maks 90 dtk)…");
  CfJalan cf = jalankan_cloudflared(bin.teks, {"tunnel", "--no-autoupdate", "run", "--token", token});
  if (!cf.ok) {
    ws.jalan->store(false);
    return {false, cf.galat};
  }
  bool siap = false, salah_token = false;
  for (int i = 0; i < 45; i++) {
    auto baris = cf.log_antre->ambil(2);
    if (!baris) {
      if (cf.log_antre->selesai) break;
      continue;
    }
    if (baris->find("Registered tunnel connection") != std::string::npos) {
      siap = true;
      break;
    }
    std::string rendah = ke_kecil(*baris);
    if (rendah.find("unauthorized") != std::string::npos ||
        (rendah.find("token") != std::string::npos &&
         (rendah.find("invalid") != std::string::npos || rendah.find("expired") != std::string::npos ||
          rendah.find("malform") != std::string::npos))) {
      salah_token = true;
      break;
    }
  }
  if (!siap) {
    TerminateProcess(cf.proses, 1);
    CloseHandle(cf.proses);
    ws.jalan->store(false);
    if (salah_token) return {false, "TOKEN_DITOLAK: tunnel token ditolak Cloudflare"};
    return {false, "named tunnel tidak terhubung dalam 90 dtk"};
  }
  return simpan_aktif(cf.proses, sesi_id, "wss://" + hostname + "/xy/" + sesi_id, ws.jalan, log);
}

}  // namespace

Hasil mulai_named(const std::string& server, const std::string& kode, const std::string& sesi_id,
                 const Logger& log) {
  Hasil h = mulai_named_sekali(server, kode, sesi_id, log);
  if (h.ok) return h;
  if (diawali(h.teks, "TOKEN_DITOLAK")) {
    log("Relay: token ditolak (tunnel mungkin dihapus manual); reset lalu coba lagi…");
    std::string srv = server;
    while (!srv.empty() && srv.back() == '/') srv.pop_back();
    http_minta("DELETE", srv + "/api/agen/relay/named", std::nullopt, {{"x-agen-kode", kode}},
               agen_ua(), 15);
    berhenti();
    Hasil h2 = mulai_named_sekali(server, kode, sesi_id, log);
    if (!h2.ok && diawali(h2.teks, "TOKEN_DITOLAK: ")) h2.teks = h2.teks.substr(15);
    return h2;
  }
  return h;
}

}  // namespace relay
}  // namespace xy

