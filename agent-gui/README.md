## Unduh siap pakai

- **Permanent:** https://github.com/xykalnotkel/XyCloudStore-build/releases/download/agent-windows/XyCloudStore-Agent-Windows.zip
- Actions artifact: workflow **Build Agen Windows**

# Agen PC Host XyCloudStore (Rust + egui native)

Program kecil di setiap PC/VM sewa. Menyambungkan mesin ke server XyCloudStore supaya
sesi **dinyalakan, dipasangkan, dan ditutup otomatis** dari aplikasi HP.

Satu exe mandiri: **tanpa WebView2, tanpa jendela terminal**.
Konfigurasi dibaca dari lokasi lama — upgrade cukup timpa exe.

```
Aplikasi (HP)          Server Cloudflare            Agen (Rust) di PC        Sunshine
     |  Mulai Main  ->        |                          |                       |
     |                        |  simpan sesi + perintah  |                       |
     |                        |  <-- heartbeat 20 dtk    |                       |
     |                        |  --> perintah mulai      |                       |
     |                        |                          |  bersihkan mesin     |
     |                        |                          |  cek API 47990  -->  |
     |  status: siap  <--     |  <-- lapor siap          |                       |
     |  kirim PIN     ->      |  --> perintah pasangkan  |                       |
     |                        |                          |  POST /api/pin  -->  |
     |  status: berjalan <--  |  <-- lapor berhasil      |                       |
```

Agen hanya keluar ke server + API lokal Sunshine. Port streaming Sunshine
(47984/47989 TCP, 48010 TCP, 47998–48002 UDP) tetap dibuka ke internet bila perlu.

## Struktur

| Path | Isi |
|---|---|
| `agent-gui/src-native/src/main.rs` | GUI native egui (pengaturan, uji koneksi, setup engine, mulai/stop, log, autostart) |
| `agent-gui/src-native/src/agent.rs` | Inti agen: heartbeat, perintah, `sunshine --creds`, winget, autostart |
| `agent-gui/src-native/src/obs_live.rs` | Kontrol OBS untuk live (start/stop/cek status) |
| `agent-gui/src-native/icons/` | Ikon exe (ico/png) |
| `agent-gui/src-native/vendor/` | Patch `egui-wgpu` (fallback adapter WARP) — lihat `vendor/README.md` |

> Riwayat: build Tauri lama (`src-tauri/` + `ui/`) sudah dihapus dari repo
> (cabang `rapih/fondasi`). Riwayat git tetap menyimpan berkas lamanya bila perlu.

## Setup di PC (3 klik)

1. **Admin** → [Unit PC](https://admin.xycloud.my.id/unit) → Daftarkan unit → **salin kode**.
2. Unduh `XyCloudStore-Agent.exe` (artifact CI / rilis) → jalankan (dobel klik, tanpa terminal).
3. Jendela agen:
   - **1 · Unit** — tempel kode unit (+ server bila bukan default) → **Simpan**
   - **2 · Engine** — **Setup Engine** (winget + `sunshine --creds`, tanpa web UI)
   - **3 · Jalan** — **Mulai Agen** (+ centang autostart Windows bila mau)

Opsi lanjutan (username/password Sunshine) hanya jika mau pakai akun yang sudah ada.

## CLI

```powershell
.\XyCloudStore-Agent.exe --veri          # cek versi (smoke-test CI)
.\XyCloudStore-Agent.exe -Jalankan       # headless loop (dipakai entri autostart registry)
```

## Hasil uji Engine

| Status | Arti |
|---|---|
| `API_SIAP` | Kredensial OK, API 47990 merespons |
| `API_TIDAK_SESUAI` | Sunshine hidup tapi auth ditolak — ulang auto-setup |
| `KREDENSIAL_KOSONG` | Belum setup — klik *Setup Engine* |
| `TIDAK_TERHUBUNG` | Service/exe belum jalan |

## Keamanan

- API Sunshine hanya `127.0.0.1:47990` (self-signed, diterima longgar).
- Server hanya memerintahkan agen dengan **kode unit** valid.
- Sandi lokal di `%APPDATA%\XyCloudStore\Agent\config.json` (akun Windows itu saja).

## Build

CI: `.github/workflows/build-agent.yml` → artifact `XyCloudStore-Agent-Windows.zip`
(runs-on `windows-latest`, cukup `cargo build --release`).

```powershell
cd agent-gui/src-native
cargo build --release --locked
# hasil: target/release/xycloud-agent.exe  → didistribusikan sebagai XyCloudStore-Agent.exe
```
