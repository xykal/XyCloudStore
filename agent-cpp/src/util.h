// Utilitas umum agen: string, base64, SHA-1, waktu, proses, berkas.
#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace xy {

// Logger: dipanggil dari thread pekerja mana pun; implementasi harus aman-thread.
using Logger = std::function<void(const std::string&)>;

std::string trim(const std::string& s);
std::string ke_kecil(std::string s);
bool diawali(const std::string& s, const std::string& prefix);

std::string base64_encode(const uint8_t* data, size_t len);
inline std::string base64_encode(const std::string& s) {
  return base64_encode(reinterpret_cast<const uint8_t*>(s.data()), s.size());
}
std::array<uint8_t, 20> sha1(const uint8_t* data, size_t len);
inline std::array<uint8_t, 20> sha1(const std::string& s) {
  return sha1(reinterpret_cast<const uint8_t*>(s.data()), s.size());
}

// Stempel ISO-8601 UTC, mis. "2026-09-22T15:04:05Z".
std::string iso_utc_now();
// Jam dinding WIB "HH:MM:SS" untuk panel log.
std::string jam_wib();

std::wstring utf8_ke_wide(const std::string& s);
std::string wide_ke_utf8(const std::wstring& s);
// Dekode keluaran proses konsol (halaman kode sistem) ke UTF-8.
std::string konsol_ke_utf8(const std::string& bytes);

std::string env_ambil(const char* nama);
std::string dir_temp();

struct HasilProses {
  bool ok = false;  // selesai sebelum timeout (berapa pun kode keluarnya)
  int kode = -1;
  std::string keluar;  // stdout+stderr digabung
  std::string galat;   // pesan kegagalan spawn/timeout
};

// Jalankan program dengan batas waktu detik; kill bila lewat.
HasilProses jalankan(const std::string& program, const std::vector<std::string>& args,
                     unsigned detik);
// Jalankan lalu lupakan (tanpa tunggu selesai, tanpa tangkap keluaran).
bool jalankan_lepas(const std::string& program, const std::vector<std::string>& args);

bool tulis_berkas(const std::string& path, const std::string& isi);
bool baca_berkas(const std::string& path, std::string& isi);
bool buat_dir_rekursif(const std::string& path);
bool berkas_ada(const std::string& path);
uint64_t ukuran_berkas(const std::string& path);
bool pindah_berkas(const std::string& dari, const std::string& ke);

// Pastikan Winsock terinisialisasi (idempotent, aman-thread).
void pastikan_winsock();

void tidur_ms(unsigned ms);

}  // namespace xy
