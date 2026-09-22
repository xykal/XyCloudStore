// Klien HTTP sinkron via WinHTTP (JSON + unduh berkas).
#pragma once

#include "util.h"

#include <functional>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

namespace xy {

using nlohmann::json;

struct HttpResp {
  bool jaringan_ok = false;  // false = gagal jaringan (lihat `galat`)
  long status = 0;
  json badan = json::object();
  std::string teks;   // badan mentah
  std::string galat;  // pesan kegagalan jaringan
};

// Minta HTTP JSON. Sertifikat TLS tak-valid diizinkan HANYA untuk localhost
// (API Sunshine memakai self-signed); URL publik wajib TLS valid.
HttpResp http_minta(const std::string& metode, const std::string& url,
                    const std::optional<json>& badan,
                    const std::vector<std::pair<std::string, std::string>>& header,
                    const std::string& agen, unsigned detik = 10);

// Unduh berkas (mengikuti redirect, maks 8). Timeout total 180 detik.
bool http_unduh(const std::string& url, const std::string& tujuan, const Logger& log,
                const std::string& agen);

}  // namespace xy
