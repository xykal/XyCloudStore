# Migrasi Dashboard Admin — tuntas (2026-09-11)

## Ringkasan
Console admin monolit `api/src/admin-legacy.html` (1826 baris) sudah diganti **Next.js 14** di `dashboard/` dengan parity aksi operasional utama.

Legacy **sudah dihapus permanen** pada 2026-09-21 (cabang `rapih/satu-admin`) —
lihat [Penuntasan](#penuntasan-2026-09-21) di bawah. Entry `/admin` mengarah ke dashboard baru.

## Penuntasan (2026-09-21, cabang `rapih/satu-admin`)

Audit parity ulang menemukan 4 gap di dashboard baru — semuanya diperbaiki,
lalu console legacy **dihapus permanen**. Admin dashboard kini tinggal 1 (Next.js).

| Temuan | Perbaikan |
|---|---|
| Voucher: form kirim field salah (`persen` diabaikan API → potongan Rp0) + list selalu kosong + tanpa ubah/hapus | Rewrite `dashboard/app/voucher/page.tsx`: form lengkap sesuai API + ubah + hapus + salin + badge status |
| CS: admin tidak bisa kirim gambar (di legacy pun rusak: API menolak teks kosong 400) | API `cs/reply` terima `gambar` (URL/dataURI) + tombol lampir di halaman CS |
| Tombol "jalankan pemeliharaan" (legacy `vSistem`) tidak ada | Kartu Tugas Berkala di halaman Sistem (`POST /sistem/bersihkan`) |
| Tandai sensitif konten (legacy moderasi) tidak ada | Tombol Sensitif di halaman Moderasi + Laporan (`PATCH /konten/...`) |

Dihapus: `api/src/admin-legacy.html`, route `/admin-legacy`, `/admin/legacy`,
`?legacy=1`, dan endpoint `GET /api/admin/log` (duplikat `/audit`, bahkan dobel 2 blok
di `index.js`). `api/src/admin.html` tinggal gateway login → dashboard baru.

Bug legacy yang ikut terkubur (tidak dimigrasikan): blokir massal via
`POST /users/:id/block` (endpoint tidak ada → 404), kirim gambar CS (400),
menu Sampah mengandalkan `vUsers`, dan `GET /voucher` legacy yang benar tapi
sempat dirusak ulang oleh dashboard baru.

## Yang dituntaskan di gelombang ini

### Kit bersama (`components/ui/kit.tsx`)
`Header`, `Load`, `ErrBox`, `EmptyBox`, `Chip`, `Stat`, `Tabel`, `Btn`, `SelectBar`, `useSelection`, `useAdminList`, `runBatch`, `Panel`, `Field`, `Input`, `TextArea`, `MsgOk`, `asList`, `toneStatus`, `rupiah`/`jam`/`tgl`.

### Halaman aksi penuh (sebelumnya stub / read-only)
| Halaman | Aksi |
|---|---|
| **Pengguna** | Cari server, kelola panel (saldo, tier/badge, blokir, peringatan, trash), multi-select blokir massal |
| **Pesanan** | Filter status, selesai/batal per baris + massal (`PATCH /orders/:id`) |
| **TopUp** | Setuju/tolak + massal + filter pending |
| **Sampah** | Pulihkan / hapus permanen (konfirmasi email) + massal |
| **Unit PC** | Daftar via `/agen`, salin kode, hapus unit |
| **Stiker/GIPHY** | Simpan key / nonaktifkan |
| **Perangkat** | Blokir, reset kuota, detail akun tertaut |
| **Moderasi** | Tutup laporan, hapus konten terkait |
| **Security** | Lihat stats + simpan kebijakan anti-abuse |
| **Favorit** | Agregasi top wishlist (API Worker diperkuat) |
| **Galat** | Tandai selesai / hapus + detail stack |
| **Audit** | Tabel jejak admin |
| **Sesi** | Monitor sesi sewa |
| **Media** | Grid + salin URL |
| **Referral** | Tabel undangan |
| **Forum** | Balas, hapus, **sematkan**, **pengumuman baru** |

### API Worker
- `GET /api/admin/favorit` kini mengembalikan `{ total, top[], produk_top }` (agregasi), bukan hanya count.

## Yang sudah oke sebelumnya (tidak dirombak total)
CS realtime, Sistem/pemeliharaan, Push builder, Peran, Promosi, Plans/Produk/Voucher/Banners (CRUD), Rilis, Keuangan, Live monitor, Statistik, Analitik, Cadangan, Setelan, Ulasan, dll.

## Batasan yang disengaja
1. **Auth** masih `localStorage` + header `x-admin-key` (static export Cloudflare Pages). httpOnly cookie + proxy Next butuh server runtime — backlog hardening, bukan blocker migrasi UI.
2. Status pesanan `siap/aktif` hanya dari agen — admin hanya `selesai`/`batal` (sesuai Worker).
3. Hapus permanen user butuh ketik email + `HAPUS PERMANEN` (sama legacy).
4. GIPHY dari env Worker tidak bisa dihapus lewat UI.
5. Skema `favorit` bervariasi — Worker punya fallback bila kolom beda.

## Cara uji cepat
1. Login `admin.xycloud.my.id` dengan admin key.
2. **Pengguna** → Kelola → sesuaikan saldo Rp1 (lalu balikkan).
3. **TopUp** pending → setujui 1 (staging).
4. **Pesanan** → filter → aksi massal (staging).
5. **Unit** → daftar dummy → salin kode → hapus.
6. **Stiker** → status GIPHY tampil.
7. **Perangkat** → buka detail.
8. **Forum** → pin + balas.
9. ~~Legacy darurat~~ — dihapus 2026-09-21; console tinggal dashboard Next.js.

## Deploy
```bash
cd dashboard && npm ci && npm run build
# Cloudflare Pages: wrangler pages deploy out --project-name xycloud-dashboard
# atau Vercel production
# Worker (favorit): cd api && wrangler deploy
```
