// Inti agen PC: konfigurasi, Sunshine, heartbeat, perintah sewa, auto-setup.
// Tanpa OBS dan tanpa live-PC: siaran publik hanya dari aplikasi mobile.
#pragma once

#include <atomic>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "util.h"

namespace xy {
namespace agent {

using nlohmann::json;

constexpr const char* VERSI = "1.6.0-cpp";

struct Konfig {
  std::string kode;
  std::string user;
  std::string sandi;
  std::string server = "https://api.xycloud.my.id";
  std::optional<std::string> stream_host;
  std::optional<std::string> relay;  // auto|named|quick|on|off
};

std::string dir_data();
std::string jalur_config();
std::string jalur_log_headless();

// Tulis satu baris ke log headless (dengan stempel). Tak pernah throw.
void tulis_log_headless(const std::string& teks);

Konfig muat_konfig();
// Simpan dengan MEMPERTAHANKAN field tak dikenal (mis. mode_relay).
bool simpan_konfig(const Konfig& k, std::string& galat);

// Diagnosa API Sunshine (siap/status/pesan/service).
json periksa_sunshine(const Konfig& k);
// Kunci display landscape 1920x1080@60 di sisi host.
json kunci_lanskap_sunshine(const Konfig& k, const Logger& log);
// UPnP router + Windows Firewall untuk port GameStream.
json buka_upnp_firewall(const Konfig& k, const Logger& log);

// IP Tailscale (100.64/10) bila ada; flag mode relay di config.json.
std::optional<std::string> ip_tailscale();
bool mode_relay_aktif();
bool set_mode_relay(bool aktif, std::string& galat);

// Auto-setup: pasang Sunshine → kredensial → service → API → lanskap+UPnP.
// Kembali: (konfig terbaru, hasil diagnosa).
std::pair<Konfig, json> setup_otomatis(const Konfig& k, const Logger& log);

// Cek keterjangkauan port DARI SERVER (POST /api/agen/cek-port).
void cek_port_dari_server(const Konfig& k, const Logger& log);

// Autostart saat login via registry HKCU ...\Run.
void atur_autostart(bool aktif, const Logger& log);
bool autostart_aktif();

// Putaran utama agen (heartbeat + perintah). Berhenti bila stop=true.
void jalankan_loop(const Konfig& k, const Logger& log, const std::shared_ptr<std::atomic<bool>>& stop);

}  // namespace agent
}  // namespace xy
