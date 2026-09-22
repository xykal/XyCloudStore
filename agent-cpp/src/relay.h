// Relay otomatis XY-RELAY v1 (lihat docs/protokol-xy-relay.md).
//
// Untuk PC di balik CGNAT: membungkus 8 port GameStream ke satu WebSocket
// lokal, lalu mempublikasikannya via `cloudflared tunnel` (Quick Tunnel
// gratis tanpa akun, atau named tunnel bervolume tetap).
#pragma once

#include <optional>
#include <string>

#include "util.h"

namespace xy {
namespace relay {

// Port lokal TETAP untuk mode named (harus sama dengan ingress di Worker).
const unsigned short PORT_NAMED = 48101;

struct Hasil {
  bool ok = false;
  std::string teks;  // url bila ok, pesan galat bila gagal
};

// URL WSS publik yang sedang aktif (format `wss://host/xy/{sesi}`).
std::optional<std::string> url_aktif();

// Heuristik: butuh relay bila host direct jelas tak bisa dijangkau HP.
bool perlu_relay_otomatis(const std::string& stream);

// Nyalakan relay QUICK untuk sesi (fallback tanpa domain).
Hasil mulai(const std::string& sesi_id, const Logger& log);

// Nyalakan relay NAMED (hostname tetap). Gagal => pemanggil fallback quick.
Hasil mulai_named(const std::string& server, const std::string& kode,
                 const std::string& sesi_id, const Logger& log);

// Hentikan relay (cloudflared + proxy). Idempotent.
void berhenti();

}  // namespace relay
}  // namespace xy
