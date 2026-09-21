# Streaming PC beda IP tanpa set manual — hasil & desain relay (2026-09-21)

Pertanyaan pemilik: _PC sewa IP-nya beda-beda dan berubah-ubah; bisakah HP
terhubung tanpa set manual? Perlu relay?_

## Jawaban singkat

**Semua otomatis di cabang ini: STREAM-A (jalur langsung) + STREAM-B
(XY-RELAY v1 — relay gratis otomatis, tanpa VPS/biaya/setup manual).**

## STREAM-A — otomatis, sudah jalan ✅

| Masalah | Solusi (kode) |
|---|---|
| IP publik PC beda-beda | Agen auto-deteksi IP publik (ipify dkk) tiap heartbeat 20 dtk (`agent.rs` `alamat_stream`), API `normalisasiHostStream` |
| IP berubah mid-sewa | Heartbeat sync `host` ke sesi `siap`/`berjalan` (`api/src/index.js`); aplikasi refresh sesi tiap 4 dtk + reconnect multi-jalur (`sesi_screen.dart`) |
| Satu WiFi tapi pakai jalur internet | Agen deteksi IP LAN std-only (`ip_lan`, trik socket UDP) → kolom `host_lan` → aplikasi fallback `preferLan` |
| Port Sunshine tertutup | Agen buka via UPnP + firewall Windows (`buka_upnp_firewall`); dasbor Unit PC ada tombol **Uji port** (`cek-port`: 47984/47989/48010) |
| Kolom tunnel/relay kosong | Heartbeat menyimpan `tunnel_host`/`relay_host` bila agen melaporkannya (migrasi 0028/0029) |

Urutan jalur aplikasi: **Tunnel → Publik → LAN → Relay UDP** (dengan fallback
otomatis antar-jalur saat satu gagal).

Uji: `api/test/streaming_heartbeat.test.mjs` (jalur tersimpan, input jahat
ditolak, IP baru tersync ke sesi aktif). Total API **82/82 hijau**.

## Kapan relay dibutuhkan? (jujur)

1. **IP publik + UPnP/port-forward OK** → langsung jalan, tanpa relay.
2. **CGNAT ISP (umum di Indonesia: Indihome/XL orbit/dll)** → IP publik agen
   adalah IP bersama; port tidak bisa dibuka dari internet. **Wajib relay.**
3. **Mode relay Tailscale sudah ada di agen** (`mode_relay`, `ip_tailscale`)
   sebagai jalan keluar tanpa infra — tetapi butuh Tailscale terpasang di PC
   **dan** HP penyewa dalam satu tailnet. Cocok untuk testing/armada kecil,
   bukan untuk penyewa umum.

## STREAM-B — XY-RELAY v1, sudah jalan ✅ (gratis, tanpa VPS)

Keputusan pemilik: **tanpa VPS/biaya/setup manual**. Jawabannya: agen
membungkus 8 port GameStream (TCP kontrol + UDP video/audio/input) ke **satu
WebSocket aman** yang diterbitkan lewat **Quick Tunnel Cloudflare** (gratis,
tanpa akun, koneksi keluar → lolos CGNAT). Spesifikasi:
`docs/protokol-xy-relay.md`.

```
HP: Moonlight ─▶ 127.0.0.1:4798x (proxy Dart)
                    │ WS biner (frame VER|KIND|IDX|CONN|FLAGS|LEN|PAYLOAD)
                    ▼ wss://xxx.trycloudflare.com/xy/{sesi}
PC: cloudflared ─▶ WS lokal ─▶ agen ─▶ Sunshine 127.0.0.1:4798x
```

- Agen (`agent-gui/src-native/src/relay.rs`, std-only): server WS di
  `127.0.0.1:port-acak`, unduh `cloudflared.exe` sekali (~30 MB, `%APPDATA%`),
  lapor URL `wss://…/xy/{sesi_id}` sebagai `relay_host`. Nyalakan otomatis
  hanya bila host privat/CGNAT (`Konfig.relay`: auto/on/off; override
  `paksa_relay` dari API); mati saat `akhiri_sesi`.
- API: heartbeat + konfirmasi `mulai_sesi` menerima `wss://…` dan menyimpan
  SET eksak (anti URL basi antar-sesi) ke `agen.relay_host`/`sesi.relay_host`.
- Aplikasi (`app/lib/game/relay_proxy.dart`): bila `relay_host` diawali
  `wss://`, proxy lokal dibuka (TCP 47984/47989/48010 + UDP
  47998/47999/48000/48002/48010) dan Moonlight diarahkan ke `127.0.0.1`.
  Gagal → fallback jalur lain seperti biasa; proxy dimatikan saat gagal
  total/keluar layar.
- Prioritas jalur tetap: Publik/LAN dulu (latensi terbaik), relay terakhir.

Batasan jujur: Quick Tunnel domain acak per sesi (tidak masalah — URL selalu
diantar API); latensi relay ± lebih tinggi dari direct; UDP video (~10 Mbps)
di dalam WS menambah overhead kecil. Bila suatu saat butuh SLA/kapasitas
besar, barulah VPS relay dipertimbangkan lagi.

## Reproduksi

```bash
cd api && node --test test/streaming_heartbeat.test.mjs
cd ../app && flutter test test/relay_frame_test.dart
grep -n "mod relay" ../agent-gui/src-native/src/agent.rs
```
