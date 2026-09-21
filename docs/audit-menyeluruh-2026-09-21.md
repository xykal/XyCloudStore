# Audit Menyeluruh XyCloudStore — 2026-09-21

> Cabang: `rapih/satu-admin`. Metode: pemindaian statis + baca kode + uji.
> Perintah reproduce ada di [Lampiran](#lampiran--reproduce).

## Ringkasan eksekutif

| Area | Skor | Kesimpulan |
|---|---|---|
| API (Worker + D1) | **7,5/10** | Logika sehat (80 test hijau), tapi `index.js` 8.700 baris + pola rantai-`if` sudah menelurkan 2 route duplikat |
| Dashboard (Next.js) | **6/10** | Fitur lengkap & build hijau, tapi duplikasi halaman, 6 page tanpa kit, `any` merajalela |
| App Flutter | **5,5/10** | Berjalan, tapi god files + 296 hardcode warna (design system tidak dipatuhi) |
| Agen Rust | **8/10** | Satu crate native, fokus. Belum diverifikasi compile di audit ini (tanpa toolchain) |
| Keamanan source | **9/10** | `cek_secret_source.py` LULUS — 0 credential di source (384 berkas) |
| Dokumentasi | **7/10** | Dirapikan ronde ini (17 topikal + arsip + index). Beberapa doc historis kedaluwarsa sebagian |

**Skor keseluruhan: 6,5/10** — fondasi kokoh, kerapian kurang. Cocok dengan keluhan
pemilik: *"sangat tidak konsisten, apalagi kualitasnya"*.

## Temuan kritis (sudah diperbaiki ronde ini)

1. **Voucher dashboard rusak total** — form kirim `persen` (diabaikan API → potongan
   Rp0), list selalu kosong (`d.vouchers || d.data` padahal API return array langsung),
   tanpa ubah/hapus. → Rewrite total `dashboard/app/voucher/page.tsx`.
2. **CS kirim gambar mustahil** — API `cs/reply` menolak teks kosong (400) dan
   mengabaikan `gambar`; console lama mengunggah file (sampah storage) lalu gagal.
   → API terima `gambar` + tombol lampir dashboard + test baru `cs_reply_gambar.test.mjs`.
3. **Blokir massal legacy 404** — `POST /users/:id/block` tidak ada di API.
   → Ikut terkubur bersama legacy; dashboard pakai `kelola PATCH` (benar).
4. **Route duplikat mengendap** — `GET ulasan-pc` dobel (ronde lalu), `GET /log`
   dobel 2 blok identik (ronde ini). → Dihapus. Akar: rantai `if` 6.000 baris.
5. **3 console admin** — legacy 167 KB + gateway + Next.js. → Legacy dihapus,
   tinggal 1 dashboard + gateway login. 4 gap parity dimigrasikan
   (voucher, CS gambar, tugas berkala, sensitif).

## Temuan sedang (belum diperbaiki)

### Dashboard
6. **Halaman kembar** — `ulasan` ↔ `ulasan-pc` 94% identik → **digabung ronde ini**
   via `components/ui/ulasan-list.tsx` (hemat ±100 baris). Sisa kembar fungsional:
   `laporan` ≈ tab Laporan `moderasi` (dua menu, satu kerjaan) — putuskan: gabung
   atau bedakan peran (triase vs eksekusi).
7. **6 page tanpa kit** — `analitik`, `keuangan`, `live`, `livestream` (411 baris!),
   `statistik` (+`login` yang wajar). Akibat: `rupiah()` didefinisikan ulang di
   `statistik` & `keuangan`, bar-chart didefinisikan ulang di `statistik`
   (`TrenBaris`) & `analitik` (`Baris`). → Ekstrak `Bar` ke kit, wajibkan kit.
8. **`any` merajalela** — `livestream` 19×, `moderasi` 14×, `statistik`/`referral` 8×…
   `tsc` lolos tapi buta tipe. → Ketik minimal respons API per halaman (bertahap).
9. **Penamaan menu vs endpoint tidak 1:1** — `unit`→`/agen`, `perangkat`→`/devices`,
   `keamanan`+`security` dua menu mirip. → Rapikan label/struktur menu.

### API
10. **God file `index.js`** (~8.700 baris) — penyebab temuan #4. Peta lengkap di
    `docs/api-routes.md` (136 publik + 127 admin). → Pecah per domain,
    mulai `admin/*` → `routes/admin/*.js`. Syarat tiap langkah: test tetap hijau.
11. **Penamaan campur EN/ID** — `orders/plans/cs/live` vs `galat/laporan/keuangan`.
    → **Bekukan** (jangan rename = breaking); tulis konvensi untuk endpoint baru.
12. **49× `catch(_)`** — sebagian wajar (fallback), sebagian menelan error penting.
    → Audit satu-satu; minimal log ke `log_sistem` untuk jalur tulis.
13. **Alias membingungkan** — `a==='cs'||a==='cs/rooms'`, `unit||units`.
    → Dokumentasikan di `api-routes.md`, pilih 1 kanonis per sumber daya.

### Flutter
14. **God files** — `pengaturan_screen` 2.637, `forum_screen` 2.555,
    `app_state` 2.373, `livestream_screen` 1.902 baris. → Pecah per seksi/widget.
15. **296 hardcode warna di 30 file** — 65 kemunculan = nilai yang SUDAH ada di
    `XyTheme` (mis. `0xFF7C3AED` ×8), 231 kemunculan = 124 warna di luar palette
    (mis. `0xFFEF4444` ×18 padahal theme punya merah). → Ganti bertahap ke
    `XyTheme.*`; tambah warna sah bila perlu. Target: 0 `Color(0x` di luar theme.
16. **Belum bisa diverifikasi di audit ini** — tanpa Flutter SDK: `analyze`/`test`/
    `build` wajib jalan di CI sebelum merge cabang rapih.

## Temuan ringan / tech debt

- `preview/xycloudorder-preview.html` 965 KB masih di root (dirujuk README) —
  pertimbangkan pindah ke rilis/filebin bila memberatkan clone.
- `web.html` 146 KB diserve dari Worker — oke untuk sekarang; pisah ke Pages bila
  tumbuh (aturan: >200 KB atau butuh build-step → keluar dari Worker).
- `mock_data.dart` + mode mock masih terjalin di `repository.dart` — pertahankan
  (dipakai APK uji), tapi tandai jelas batas mock vs produksi.
- `docs/PopupUpdate.md`, `docs/keamanan-audit.md` mengandung fakta pra-rapih —
  diberi banner kedaluwarsa; tulis ulang ringkas bila sempat.
- Duplikat kecil: `formVoucher` legacy vs baru (selesai), chip/status badge di
  tiap page (seragamkan via kit `Chip`).

## Yang sudah diperbaiki (ronde rapih)

| Ronde | Hasil | Verifikasi |
|---|---|---|
| `rapih/fondasi` | Hapus Tauri+UI legacy (-6.168 baris), arsip 31 docs + 10 preview, hapus route mati, peta route API | test API 79/79, `node --check`, YAML OK |
| `rapih/satu-admin` | 1 dashboard (legacy -1.833 baris), voucher rewrite, CS gambar (API+UI+test), tugas berkala, sensitif, gabung ulasan (-100 baris) | test API 80/80, `tsc` bersih, `next build` sukses 55+ halaman |

## Roadmap (prioritas)

> Status eksekusi cabang `rapih/semua` (2026-09-21, komit terpisah): ✅=selesai,
> 🟡=sebagian + sisa terdokumentasi.

1. **P0** ✅ — `flutter analyze/test/build` di CI untuk cabang rapih
   (`rapih/**` ditambah ke `verifikasi-build.yml`).
2. **P0** ✅ — Pecah `index.js`: `admin/*` → `api/src/admin/index.js`
   (index 8705→6719; 81/81 API hijau; pelajaran: `return await` + scope `url`).
3. **P1** ✅ — Kit di 6 page + `Bar` kit (unifikasi 4 varian) + 0 `rupiah` lokal
   + `Stat` kit dukung ikon + `toneStatus` diperkaya.
4. **P1** ✅ — `laporan` vs `moderasi`: satu `LaporanList` bersama;
   `/laporan`=antrean murni, `/moderasi`=pusat (laporan+banding+AI).
5. **P1** 🟡 — Flutter: 216/287 situs → `XyTheme` (+45 token baru, 11 alpha →
   `withOpacity`); sisa 71 warna artistik 1x di 15 file (perlu review visual
   per situs; reproduce di bawah).
6. **P2** 🟡 — God files: `models.dart` 1898→barrel+8 file domain, 0 referensi
   silang; `pengaturan_screen`/`forum_screen`/`app_state` masih god (butuh
   `flutter analyze` + review visual, di luar jangkauan tanpa toolchain).
7. **P2** 🟡 — `adminFetch<T>` + `useAdminList<T>` generik (fondasi ketik
   bertahap); 210 `any` belum dimigrasi per situs.
8. **P2** 🟡 — 8 `catch` kosong diberi komentar penjelas (fail-open forum
   ditandai); 83 `catch(_)` lain sudah berkomentar/tujuan jelas.

## Lampiran — reproduce

```bash
# duplikasi halaman
diff dashboard/app/ulasan/page.tsx dashboard/app/ulasan-pc/page.tsx | wc -l
# rupiah lokal
grep -rn "const rupiah" dashboard/app/*/page.tsx
# hardcode warna Flutter (di luar theme; target 0, sisa artistik 1x)
grep -ro "Color(0x[0-9A-Fa-f]*)" app/lib --include="*.dart" | grep -v "core/theme.dart" | wc -l
# secret
python3 tools/cek_secret_source.py
# test & build
cd api && npm ci && node --test test/*.test.mjs
cd ../dashboard && npm ci && npx tsc --noEmit && npm run build
```
