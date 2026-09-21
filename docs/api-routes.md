# Peta Route API (`api/src/index.js`)

> Dibangkitkan otomatis dari pola `p === '...'` / `p.startsWith('...')`
> (publik) dan `a === '...'` / `a.startsWith('...')` (admin) pada cabang
> `rapih/fondasi`. Kolom `/*` = cocok prefix (`startsWith`).

## Cara dispatch

- `fetch` memotong prefix `/api/` menjadi variabel `p`, lalu rantai `if`
  panjang (≈ baris 2684–8714) mencocokkan `p` + `req.method`.
- Blok admin memotong lagi `admin/` menjadi variabel `a` setelah cek
  `kenaliAdmin` + `bolehAkses(peran, jalur)`.
- Guard global: rate-limit IP 180 req/60 dtk (lewati `admin/`, `agen/`,
  `bayar/webhook/`) + mode pemeliharaan bertingkat.
- Di luar `/api/`: `/health`, `/api/rilis`, `/unduh/*`, `/bayar/webhook/*`,
  `/ws/*` (Durable Object realtime), `/img/*`, `/media/*`, `/brand/*`,
  `/legal/*`, `/admin`, `/admin-legacy`, halaman web publik.

## Temuan saat pemetaan

- `GET /api/admin/ulasan-pc` dobel (LIMIT 100 menang, LIMIT 200 mati) —
  blok mati sudah dihapus di cabang ini.
- Webhook bayar di `/bayar/webhook/*` (bukan `/api/`), sesuai guard.

## Route publik `/api/*` (136 pola)

### `/api/admin`

| Method | Path |
|---|---|
| * | `/api/admin//*` |

### `/api/admin-ws`

| Method | Path |
|---|---|
| * | `/api/admin-ws` |

### `/api/agen`

| Method | Path |
|---|---|
| * | `/api/agen//*` |
| POST | `/api/agen/cek-port` |
| POST | `/api/agen/heartbeat` |
| POST | `/api/agen/perintah//*` |
| POST | `/api/agen/sesi/selesai` |

### `/api/akun`

| Method | Path |
|---|---|
| POST | `/api/akun/beli` |
| GET | `/api/akun/produk` |
| * | `/api/akun/produk//*` |

### `/api/auth`

| Method | Path |
|---|---|
| * | `/api/auth//*` |
| GET | `/api/auth/facebook/data-deletion` |
| GET | `/api/auth/facebook/deletion-status` |
| POST | `/api/auth/forgot` |
| POST | `/api/auth/google/native` |
| POST | `/api/auth/login` |
| GET | `/api/auth/login-confirm` |
| POST | `/api/auth/register` |
| POST | `/api/auth/resend` |
| POST | `/api/auth/reset` |
| POST | `/api/auth/social/exchange` |
| POST | `/api/auth/verify` |

### `/api/banners`

| Method | Path |
|---|---|
| GET | `/api/banners` |

### `/api/bayar`

| Method | Path |
|---|---|
| * | `/api/bayar/webhook//*` |

### `/api/cek-nama`

| Method | Path |
|---|---|
| POST | `/api/cek-nama` |

### `/api/cloudgime`

| Method | Path |
|---|---|
| * | `/api/cloudgime//*` |
| GET | `/api/cloudgime/booking//*` |
| POST | `/api/cloudgime/bookings` |
| GET | `/api/cloudgime/status` |

### `/api/config`

| Method | Path |
|---|---|
| GET | `/api/config` |

### `/api/cs`

| Method | Path |
|---|---|
| * | `/api/cs//*` |
| POST | `/api/cs/dibaca` |
| DELETE | `/api/cs/messages` |
| GET | `/api/cs/messages` |
| POST | `/api/cs/messages` |
| DELETE | `/api/cs/messages//*` |
| * | `/api/cs/reply` |
| POST | `/api/cs/typing` |

### `/api/dm`

| Method | Path |
|---|---|
| * | `/api/dm//*` |
| GET | `/api/dm//*` |
| POST | `/api/dm//*` |

### `/api/favorit`

| Method | Path |
|---|---|
| GET | `/api/favorit` |
| POST | `/api/favorit//*` |

### `/api/forum`

| Method | Path |
|---|---|
| GET | `/api/forum` |
| POST | `/api/forum` |
| * | `/api/forum//*` |
| * | `/api/forum/balasan//*` |
| DELETE | `/api/forum/balasan//*` |
| GET | `/api/forum/balasan/suka/saya` |
| GET | `/api/forum/suka/saya` |

### `/api/galat`

| Method | Path |
|---|---|
| POST | `/api/galat` |

### `/api/hud`

| Method | Path |
|---|---|
| GET | `/api/hud/presets` |
| POST | `/api/hud/presets` |
| * | `/api/hud/presets//*` |

### `/api/kunjungan`

| Method | Path |
|---|---|
| POST | `/api/kunjungan` |

### `/api/laporan`

| Method | Path |
|---|---|
| POST | `/api/laporan` |

### `/api/leaderboard`

| Method | Path |
|---|---|
| GET | `/api/leaderboard` |

### `/api/legacy`

| Method | Path |
|---|---|
| * | `/api/legacy` |

### `/api/legal`

| Method | Path |
|---|---|
| * | `/api/legal//*` |
| GET | `/api/legal/live` |
| GET | `/api/legal/privasi` |
| GET | `/api/legal/refund` |
| GET | `/api/legal/syarat` |

### `/api/live`

| Method | Path |
|---|---|
| GET | `/api/live` |
| POST | `/api/live/creator/apply` |
| GET | `/api/live/creator/me` |
| POST | `/api/live/creator/payout` |
| POST | `/api/live/start` |

### `/api/live-watch`

| Method | Path |
|---|---|
| * | `/api/live-watch` |

### `/api/live-watch-handoff`

| Method | Path |
|---|---|
| * | `/api/live-watch-handoff` |

### `/api/me`

| Method | Path |
|---|---|
| DELETE | `/api/me` |
| GET | `/api/me` |
| PATCH | `/api/me` |
| POST | `/api/me/banding` |
| DELETE | `/api/me/banner-media` |
| POST | `/api/me/banner-media` |
| GET | `/api/me/bisukan` |
| POST | `/api/me/bisukan` |
| GET | `/api/me/blokir` |
| GET | `/api/me/data` |
| GET | `/api/me/follows` |
| GET | `/api/me/hapus/info` |
| POST | `/api/me/hapus/kode` |
| GET | `/api/me/hud-presets` |
| POST | `/api/me/notifikasi/tes` |
| POST | `/api/me/password` |
| POST | `/api/me/password/kode` |
| POST | `/api/me/pin-transfer` |
| POST | `/api/me/pin-transfer/kode` |
| GET | `/api/me/simpan` |
| POST | `/api/me/transfer` |
| GET | `/api/me/transfer/cari` |

### `/api/notifikasi`

| Method | Path |
|---|---|
| * | `/api/notifikasi/*` |
| DELETE | `/api/notifikasi` |
| GET | `/api/notifikasi` |
| POST | `/api/notifikasi/baca` |

### `/api/orders`

| Method | Path |
|---|---|
| GET | `/api/orders` |
| POST | `/api/orders` |
| * | `/api/orders//*` |
| GET | `/api/orders//*` |
| * | `/api/orders/antre` |
| POST | `/api/orders/estimasi` |

### `/api/pc`

| Method | Path |
|---|---|
| GET | `/api/pc/plans` |
| * | `/api/pc/plans//*` |
| POST | `/api/pc/ulasan` |
| GET | `/api/pc/unit-live` |

### `/api/pengguna`

| Method | Path |
|---|---|
| GET | `/api/pengguna/mention` |

### `/api/promosi`

| Method | Path |
|---|---|
| GET | `/api/promosi` |

### `/api/referral`

| Method | Path |
|---|---|
| GET | `/api/referral` |
| * | `/api/referral/atribusi` |
| POST | `/api/referral/buka` |
| POST | `/api/referral/klik` |
| * | `/api/referral/pakai` |
| GET | `/api/referral/unduh` |

### `/api/sesi`

| Method | Path |
|---|---|
| * | `/api/sesi//*` |
| POST | `/api/sesi/mulai` |

### `/api/sewa`

| Method | Path |
|---|---|
| * | `/api/sewa/antre` |

### `/api/stiker`

| Method | Path |
|---|---|
| GET | `/api/stiker/giphy` |
| POST | `/api/stiker/impor` |

### `/api/stories`

| Method | Path |
|---|---|
| GET | `/api/stories` |
| POST | `/api/stories` |
| * | `/api/stories//*` |
| DELETE | `/api/stories//*` |

### `/api/ulasan`

| Method | Path |
|---|---|
| POST | `/api/ulasan` |

### `/api/upload`

| Method | Path |
|---|---|
| POST | `/api/upload` |

### `/api/user`

| Method | Path |
|---|---|
| GET | `/api/user/devices` |
| POST | `/api/user/devices/revoke` |

### `/api/user-ws`

| Method | Path |
|---|---|
| * | `/api/user-ws` |

### `/api/users`

| Method | Path |
|---|---|
| * | `/api/users//*` |

### `/api/voucher`

| Method | Path |
|---|---|
| POST | `/api/voucher/cek` |

### `/api/wallet`

| Method | Path |
|---|---|
| GET | `/api/wallet/topup` |
| POST | `/api/wallet/topup` |
| * | `/api/wallet/topup//*` |
| GET | `/api/wallet/topup//*` |
| GET | `/api/wallet/transaksi` |

### `/api/ws`

| Method | Path |
|---|---|
| POST | `/api/ws/ticket` |

## Route admin `/api/admin/*` (124 pola)

### `/api/admin/agen`

| Method | Path |
|---|---|
| GET | `/api/admin/agen` |
| POST | `/api/admin/agen` |
| * | `/api/admin/agen//*` |
| DELETE | `/api/admin/agen//*` |
| PATCH | `/api/admin/agen//*` |

### `/api/admin/alat`

| Method | Path |
|---|---|
| GET | `/api/admin/alat` |

### `/api/admin/analitik`

| Method | Path |
|---|---|
| GET | `/api/admin/analitik` |

### `/api/admin/audit`

| Method | Path |
|---|---|
| * | `/api/admin/audit` |
| GET | `/api/admin/audit` |

### `/api/admin/banners`

| Method | Path |
|---|---|
| GET | `/api/admin/banners` |
| POST | `/api/admin/banners` |
| DELETE | `/api/admin/banners//*` |

### `/api/admin/bayar`

| Method | Path |
|---|---|
| GET | `/api/admin/bayar/events` |
| GET | `/api/admin/bayar/info` |
| POST | `/api/admin/bayar/rekonsiliasi` |

### `/api/admin/brand`

| Method | Path |
|---|---|
| GET | `/api/admin/brand/logo` |
| GET | `/api/admin/brand/logo-full` |

### `/api/admin/cadangan`

| Method | Path |
|---|---|
| GET | `/api/admin/cadangan` |
| POST | `/api/admin/cadangan` |
| GET | `/api/admin/cadangan//*` |
| POST | `/api/admin/cadangan/impor` |

### `/api/admin/cs`

| Method | Path |
|---|---|
| * | `/api/admin/cs` |
| POST | `/api/admin/cs/reply` |
| GET | `/api/admin/cs/room//*` |
| * | `/api/admin/cs/rooms` |
| POST | `/api/admin/cs/typing` |

### `/api/admin/dbinfo`

| Method | Path |
|---|---|
| GET | `/api/admin/dbinfo` |

### `/api/admin/devices`

| Method | Path |
|---|---|
| * | `/api/admin/devices` |
| * | `/api/admin/devices//*` |

### `/api/admin/favorit`

| Method | Path |
|---|---|
| GET | `/api/admin/favorit` |

### `/api/admin/forum`

| Method | Path |
|---|---|
| GET | `/api/admin/forum` |
| POST | `/api/admin/forum` |
| * | `/api/admin/forum//*` |
| DELETE | `/api/admin/forum//*` |

### `/api/admin/galat`

| Method | Path |
|---|---|
| GET | `/api/admin/galat` |
| DELETE | `/api/admin/galat//*` |
| PATCH | `/api/admin/galat//*` |

### `/api/admin/integrasi`

| Method | Path |
|---|---|
| * | `/api/admin/integrasi/giphy/*` |
| DELETE | `/api/admin/integrasi/giphy` |
| GET | `/api/admin/integrasi/giphy` |
| POST | `/api/admin/integrasi/giphy` |

### `/api/admin/kata`

| Method | Path |
|---|---|
| GET | `/api/admin/kata` |

### `/api/admin/keuangan`

| Method | Path |
|---|---|
| GET | `/api/admin/keuangan` |

### `/api/admin/konten`

| Method | Path |
|---|---|
| PATCH | `/api/admin/konten//*` |

### `/api/admin/laporan`

| Method | Path |
|---|---|
| GET | `/api/admin/laporan` |
| PATCH | `/api/admin/laporan//*` |

### `/api/admin/live`

| Method | Path |
|---|---|
| GET | `/api/admin/live` |

### `/api/admin/livestream`

| Method | Path |
|---|---|
| GET | `/api/admin/livestream` |
| POST | `/api/admin/livestream/config` |
| POST | `/api/admin/livestream/reconcile` |

### `/api/admin/log`

| Method | Path |
|---|---|
| GET | `/api/admin/log` |

### `/api/admin/log-sistem`

| Method | Path |
|---|---|
| GET | `/api/admin/log-sistem` |
| DELETE | `/api/admin/log-sistem/bersihkan` |

### `/api/admin/media`

| Method | Path |
|---|---|
| GET | `/api/admin/media` |

### `/api/admin/moderasi`

| Method | Path |
|---|---|
| GET | `/api/admin/moderasi/ai` |
| POST | `/api/admin/moderasi/ai/mode` |
| POST | `/api/admin/moderasi/ai/verifikasi` |
| GET | `/api/admin/moderasi/banding` |
| POST | `/api/admin/moderasi/banding//*` |

### `/api/admin/notifikasi`

| Method | Path |
|---|---|
| GET | `/api/admin/notifikasi` |

### `/api/admin/orders`

| Method | Path |
|---|---|
| GET | `/api/admin/orders` |
| PATCH | `/api/admin/orders//*` |

### `/api/admin/peran`

| Method | Path |
|---|---|
| GET | `/api/admin/peran` |
| POST | `/api/admin/peran` |
| * | `/api/admin/peran//*` |
| DELETE | `/api/admin/peran//*` |

### `/api/admin/perintah`

| Method | Path |
|---|---|
| GET | `/api/admin/perintah` |

### `/api/admin/plans`

| Method | Path |
|---|---|
| GET | `/api/admin/plans` |
| POST | `/api/admin/plans` |
| DELETE | `/api/admin/plans//*` |

### `/api/admin/produk`

| Method | Path |
|---|---|
| GET | `/api/admin/produk` |
| POST | `/api/admin/produk` |
| DELETE | `/api/admin/produk//*` |

### `/api/admin/promosi`

| Method | Path |
|---|---|
| * | `/api/admin/promosi/*` |
| GET | `/api/admin/promosi` |
| POST | `/api/admin/promosi` |
| DELETE | `/api/admin/promosi//*` |

### `/api/admin/push`

| Method | Path |
|---|---|
| POST | `/api/admin/push` |
| GET | `/api/admin/push/statistik` |

### `/api/admin/referral`

| Method | Path |
|---|---|
| GET | `/api/admin/referral` |

### `/api/admin/rilis`

| Method | Path |
|---|---|
| GET | `/api/admin/rilis` |
| POST | `/api/admin/rilis` |

### `/api/admin/security`

| Method | Path |
|---|---|
| * | `/api/admin/security` |
| * | `/api/admin/security//*` |

### `/api/admin/sesi`

| Method | Path |
|---|---|
| GET | `/api/admin/sesi` |

### `/api/admin/setelan`

| Method | Path |
|---|---|
| GET | `/api/admin/setelan` |
| POST | `/api/admin/setelan` |
| DELETE | `/api/admin/setelan//*` |

### `/api/admin/sistem`

| Method | Path |
|---|---|
| GET | `/api/admin/sistem` |
| POST | `/api/admin/sistem/bersihkan` |
| DELETE | `/api/admin/sistem/cache` |
| GET | `/api/admin/sistem/kesehatan` |
| GET | `/api/admin/sistem/oauth` |
| POST | `/api/admin/sistem/pemeliharaan` |
| POST | `/api/admin/sistem/versi` |

### `/api/admin/statistik`

| Method | Path |
|---|---|
| GET | `/api/admin/statistik` |

### `/api/admin/stats`

| Method | Path |
|---|---|
| GET | `/api/admin/stats` |

### `/api/admin/stok`

| Method | Path |
|---|---|
| GET | `/api/admin/stok` |
| POST | `/api/admin/stok` |

### `/api/admin/topup`

| Method | Path |
|---|---|
| GET | `/api/admin/topup` |
| * | `/api/admin/topup//*` |
| PATCH | `/api/admin/topup//*` |

### `/api/admin/transaksi`

| Method | Path |
|---|---|
| GET | `/api/admin/transaksi` |

### `/api/admin/uji`

| Method | Path |
|---|---|
| POST | `/api/admin/uji/email` |
| POST | `/api/admin/uji/push` |

### `/api/admin/uji-kata`

| Method | Path |
|---|---|
| POST | `/api/admin/uji-kata` |

### `/api/admin/ulasan`

| Method | Path |
|---|---|
| GET | `/api/admin/ulasan` |
| DELETE | `/api/admin/ulasan//*` |
| PATCH | `/api/admin/ulasan//*` |

### `/api/admin/ulasan-pc`

| Method | Path |
|---|---|
| GET | `/api/admin/ulasan-pc` |
| DELETE | `/api/admin/ulasan-pc//*` |
| PATCH | `/api/admin/ulasan-pc//*` |

### `/api/admin/unit`

| Method | Path |
|---|---|
| * | `/api/admin/unit` |

### `/api/admin/units`

| Method | Path |
|---|---|
| * | `/api/admin/units` |

### `/api/admin/upload`

| Method | Path |
|---|---|
| POST | `/api/admin/upload` |

### `/api/admin/usernames`

| Method | Path |
|---|---|
| GET | `/api/admin/usernames` |

### `/api/admin/users`

| Method | Path |
|---|---|
| GET | `/api/admin/users` |
| * | `/api/admin/users//*` |
| POST | `/api/admin/users/saldo` |

### `/api/admin/voucher`

| Method | Path |
|---|---|
| GET | `/api/admin/voucher` |
| POST | `/api/admin/voucher` |
| DELETE | `/api/admin/voucher//*` |

### `/api/admin/voucher-pakai`

| Method | Path |
|---|---|
| GET | `/api/admin/voucher-pakai` |

### `/api/admin/ws-ticket`

| Method | Path |
|---|---|
| POST | `/api/admin/ws-ticket` |

## Rencana pecah (berikutnya)

`index.js` 8.714 baris dipecah bertahap per domain, contoh urutan:
`admin/*` → `routes/admin/*.js`, lalu `auth/*`, `forum/*` + `stories/*`,
`wallet/*` + `bayar/*`, `live/*`, `agen/*`, `me/*`, `cs/*` + `dm/*`.
Setiap pemindahan wajib: test API tetap 79/79 hijau.
