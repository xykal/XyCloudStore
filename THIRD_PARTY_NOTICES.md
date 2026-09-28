# Third-Party Notices / Pemberitahuan Pihak Ketiga

Status: DRAFT — review by licensed counsel before publishing a release that relies on it.
Daftar lengkap per komponen ada di lockfile masing-masing (`app/pubspec.lock`, `api/package-lock.json`, `dashboard/package-lock.json`, `native/moonlight.lock.json`). Tabel ini merangkum komponen yang menentukan kewajiban lisensi.

| Komponen / Component | Lisensi | Dipakai di | Kewajiban utama |
|---|---|---|---|
| Moonlight Android v12.1 (moonlight-stream) | GPL-3.0 | `native/`, dibundel ke APK `app/` | APK terintegrasi didistribusikan di bawah GPLv3; sumber lengkap disertakan tiap rilis; lihat `native/README.md`, `app/LICENSE` |
| OpenSSL, Opus (via Moonlight) | Apache-2.0 / BSD-3-Clause | `native/` | Sertakan pemberitahuan lisensi |
| Flutter SDK, Dart packages | BSD-3-Clause dan lisensi per paket | `app/` | Sertakan pemberitahuan; halaman lisensi in-app (`showLicensePage`) |
| Next.js, React, lucide-react, Tailwind CSS | MIT / ISC | `dashboard/` | Sertakan pemberitahuan hak cipta |
| Wrangler, esbuild | MIT / Apache-2.0 | `api/` (toolchain) | Sertakan pemberitahuan |
| Dear ImGui (MIT), DirectX SDK headers | MIT / Microsoft | `agent-cpp/` | Sertakan pemberitahuan lisensi ImGui |
| Inter (font) | SIL OFL 1.1 | `dashboard/` (saat ini via next/font/google) | Nama font tidak boleh dipakai untuk turunan; self-host direncanakan |
| Material Icons | Apache-2.0 | `app/` | Sertakan pemberitahuan |

Aturan repositori:
- Aset visual, ikon, dan ilustrasi di luar tabel ini adalah karya XyVerse Technology Global dan tunduk pada `LICENSE` root.
- Menambah dependensi baru wajib menambah baris di tabel ini bila lisensinya bukan MIT/BSD/Apache/ISC, atau bila komponen tersebut dibundel ke artefak rilis.
