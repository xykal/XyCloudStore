# Streaming PC beda IP tanpa set manual — hasil & desain relay (2026-09-21)

Pertanyaan pemilik: _PC sewa IP-nya beda-beda dan berubah-ubah; bisakah HP
terhubung tanpa set manual? Perlu relay?_

## Jawaban singkat

**Sebagian besar sudah otomatis (STREAM-A, diimplementasikan cabang ini).
Relay UDP hanya wajib untuk PC di balik CGNAT/double-NAT yang port-nya tidak
bisa dibuka — dan itu butuh VPS + biayanya relay; desainnya di bawah
(STREAM-B, belum dibangun).**

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
ditolak, IP baru tersync ke sesi aktif). Total API **81/81 hijau**.

## Kapan relay dibutuhkan? (jujur)

1. **IP publik + UPnP/port-forward OK** → langsung jalan, tanpa relay.
2. **CGNAT ISP (umum di Indonesia: Indihome/XL orbit/dll)** → IP publik agen
   adalah IP bersama; port tidak bisa dibuka dari internet. **Wajib relay.**
3. **Mode relay Tailscale sudah ada di agen** (`mode_relay`, `ip_tailscale`)
   sebagai jalan keluar tanpa infra — tetapi butuh Tailscale terpasang di PC
   **dan** HP penyewa dalam satu tailnet. Cocok untuk testing/armada kecil,
   bukan untuk penyewa umum.

## STREAM-B — desain relay UDP (belum dibangun)

Syarat: VPS publik (1 vCPU, ~US$5/bln) + domain. GameStream/Moonlight memakai
UDP (video/audio/input) + TCP (kontrol); relay harus meneruskan keduanya.

```
HP penyewa ──UDP/TCP──▶ VPS relay ──UDP/TCP──▶ agen PC (koneksi keluar,
                                              lolos CGNAT/NAT)
```

- Agen membuka **terowongan keluar** ke VPS saat sesi `menyiapkan`
  (tidak perlu port inbound di PC).
- VPS memetakan `sesi_id → terowongan agen`; HP diberi `relay_host`
  (`vps:port/sesi`) lewat `sesi.relay_host` yang sudah ada.
- Auth: token sesi sekali pakai; relay menolak paket tanpa token.
- Kapasitas: ±5–10 sesi 1080p60 per VPS kecil (ukur ulang saat prototipe).
- Alternatif tanpa kelola VPS: Cloudflare Tunnel `cloudflared` di agen untuk
  TCP kontrol + **tetap butuh relay UDP** untuk video (Workers tidak bisa UDP;
  lihat `docs/streaming-tanpa-tailscale-udp-relay.md`). Spectrum=UDP jadi
  opsi enterprise (mahal).

### Keputusan yang dibutuhkan pemilik

1. Sediakan VPS relay? (ya → dibangun STREAM-B; tidak → PC CGNAT wajib
   Tailscale/port-forward manual, dan dasbor menandainya lewat Uji port)
2. Batas sesi/VPS dan siapa menanggung biaya (masuk harga sewa?)

## Reproduksi

```bash
cd api && node --test test/streaming_heartbeat.test.mjs
grep -n "ip_lan\|host_lan" ../agent-gui/src-native/src/agent.rs | head
```
