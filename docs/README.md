# Dokumentasi XyCloudStore

Sumber kebenaran utama tetap [`README.md`](../README.md) di root repo.
Folder ini berisi dokumen topikal (per fitur/subsistem).

## Peta API

- [`api-routes.md`](api-routes.md) — **daftar lengkap endpoint** Worker
  (dibangkitkan dari `api/src/index.js`, cabang `rapih/fondasi`).
  Baca ini dulu sebelum memecah god file `index.js`.

## Arsitektur & build

- [`repository-build-architecture-2026-09-17.md`](repository-build-architecture-2026-09-17.md) — struktur monorepo & alur build
- [`verifikasi-ci-2026-09-18.md`](verifikasi-ci-2026-09-18.md) — workflow Verifikasi Build Menyeluruh
- [`migrasi-dashboard.md`](migrasi-dashboard.md) — migrasi dashboard
- [`rencana-3.0.md`](rencana-3.0.md) / [`rencana-3.3.md`](rencana-3.3.md) — rencana versi (arsip keputusan desain)

## Keamanan & audit

- [`keamanan-audit.md`](keamanan-audit.md) — audit keamanan
- [`audit-duplikasi.md`](audit-duplikasi.md) — audit duplikasi kode
- [`audit-konsistensi-2026-09-18.md`](audit-konsistensi-2026-09-18.md) — audit konsistensi
- [`konsistensi-platform.md`](konsistensi-platform.md) — konsistensi antar platform

## Fitur

- [`login-google.md`](login-google.md) — login Google (APK + web)
- [`facebook-login-meta-setup-2026-09-16.md`](facebook-login-meta-setup-2026-09-16.md) — login Facebook / Meta setup
- [`ai-moderation-openrouter-2026-09-16.md`](ai-moderation-openrouter-2026-09-16.md) — moderasi AI
- [`pakasir-admin-operations-2026-09-16.md`](pakasir-admin-operations-2026-09-16.md) — operasi Pakasir
- [`streaming-tanpa-tailscale-udp-relay.md`](streaming-tanpa-tailscale-udp-relay.md) — streaming tanpa Tailscale
- [`PopupUpdate.md`](PopupUpdate.md) — popup pembaruan aplikasi
- [`VIDEO_TO_ANIMATED_WEBP.md`](VIDEO_TO_ANIMATED_WEBP.md) — konversi video → WebP animasi
- [`optimasi-performa-ala-app-gede.md`](optimasi-performa-ala-app-gede.md) — panduan optimasi performa

## Arsip

[`arsip/`](arsip/) — catatan batch harian (`batch-*`, `perbaikan-*`, `rilis-*`,
cek kesehatan, dsb). **Bukan dokumentasi aktif**: hanya untuk melacak sejarah
keputusan. Jangan tambah dokumen baru di root `docs/` dengan pola tanggal —
masukkan ke `arsip/` atau gabung ke dokumen topikal.
