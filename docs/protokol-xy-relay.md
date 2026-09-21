# Protokol XY-RELAY v1 — relay GameStream gratis & otomatis

Relay untuk PC di balik CGNAT/double-NAT: membungkus 8 port GameStream
(TCP+UDP) ke **satu WebSocket** yang dipublikasikan via **cloudflared Quick
Tunnel** (gratis, tanpa akun, tanpa kartu kredit, bandwidth unlimited).
Klien HP tidak menginstal apa pun; fallback terjadi otomatis (jalur Relay
sudah prioritas terakhir di aplikasi).

```
Sunshine (PC) ⇄ proxy Rust (WS :P acak) ⇄ cloudflared ⇄ edge CF ⇄
wss://xxx.trycloudflare.com ⇄ proxy Dart (HP) ⇄ Moonlight (127.0.0.1)
```

## Frame (satu pesan WS biner = satu frame)

```
VER(1)=0x01 | KIND(1) | IDX(1) | CONN(1) | FLAGS(1) | LEN(2 BE) | PAYLOAD
```

| KIND | Nama | Arah | Isi |
|---|---|---|---|
| 0 | TCP_DATA | dua arah | byte TCP mentah (end-to-end, TLS utuh) |
| 1 | UDP_DATA | dua arah | satu datagram utuh |
| 2 | TCP_OPEN | HP→PC | payload kosong; PC dial ke Sunshine |
| 3 | TCP_CLOSE | dua arah | payload kosong; FLAGS bit1=ERR (OPEN gagal, PC→HP) |
| 4 | PING | HP→PC | payload kosong |
| 5 | PONG | PC→HP | payload kosong |

- `IDX` TCP: 0→47984, 1→47989, 2→48010. `IDX` UDP: 0→47998, 1→47999,
  2→48000, 3→48002, 4→48010.
- `CONN`: id koneksi TCP pilihan HP (1–255 bergulir); 0 untuk UDP/PING.
- `LEN` ≤ 65535; pesan WS ≤ 128 KB.

## Aturan main

1. HP membuka TCP lokal (Moonlight→127.0.0.1:port) → kirim TCP_OPEN →
   PC dial 127.0.0.1:port Sunshine → pipa dua arah sampai TCP_CLOSE/EOF.
2. UDP: HP kirim datagram → PC teruskan ke Sunshine; balasan Sunshine
   dikirim ke endpoint Moonlight terakhir per IDX (client selalu kirim dulu).
3. Path WS: `/xy/{sesi_id}` (ditolak bila sesi tidak cocok; `/` diterima
   dengan peringatan untuk kompatibilitas).
4. PING tiap 20 dtk; WS mati >60 dtk tanpa trafik → kedua sisi tutup.
5. Relay hidup hanya selama sesi berjalan (agen start saat `mulai_sesi`,
   stop saat `akhiri_sesi`); URL ephemeral dilaporkan tiap heartbeat.

## Batasan jujur

- TCP-basis menambah latensi dibanding UDP langsung (head-of-line blocking);
  relay adalah **fallback**, direct tetap prioritas.
- Quick Tunnel URL berubah tiap restart (ditangani via heartbeat).
- Pantau ToS Cloudflare untuk trafik video berat; siapkan migrasi ke Named
  Tunnel + domain sendiri bila skala membesar. Disarankan batasi bitrate
  saat mode relay (keputusan produk, belum diimplementasikan).
