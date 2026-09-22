# XyCloud Agent — PC Host (C++ native murni)

Satu `xycloud-agent.exe` mandiri: **Win32 + DirectX 11 + Dear ImGui**.
Tanpa WebView/runtime tambahan, tanpa installer, **tanpa OBS** — siaran publik
hanya dari aplikasi mobile (live-PC dihapus total).

## Fitur (jalur sewa)

- Heartbeat + perintah sewa (`mulai_sesi`, `pasangkan`, `akhiri_sesi`).
- Perintah siaran lawas (`mulai_siaran`/`akhiri_siaran`) dibalas sukses no-op
  berkode `MOBILE_ONLY` agar orkestrasi server tak menggantung.
- Auto-setup Sunshine: pasang (winget → MSI GitHub) → kredensial → service →
  kunci landscape 1920x1080@60 → UPnP + Windows Firewall.
- Relay otomatis XY-RELAY v1 (WebSocket mux + `cloudflared` Quick/Named).
- Cek port dari server, autostart registry, mode headless `-Jalankan`.
- UI modern quiet-surface: kartu membulat, satu aksen ungu, panel log mono.

## Dependensi (diambil otomatis via CMake FetchContent, pinned)

- Dear ImGui `v1.92.9b` (+ backend win32/dx11).
- nlohmann/json `v3.11.3` (header-only).
- Library sistem Windows: `d3d11`, `dxgi`, `d3dcompiler`, `winhttp`, `ws2_32`.

## Bangun (Windows, MSVC)

```powershell
cmake -S agent-cpp -B build-agent -DCMAKE_BUILD_TYPE=Release
cmake --build build-agent --config Release
.\build-agent\Release\xycloud-agent.exe --veri
```

## Cek silang (Linux + MinGW, tanpa jalan — hanya pastikan kompilasi)

```bash
cmake -S agent-cpp -B build-cek -DCMAKE_TOOLCHAIN_FILE=cmake/mingw-w64-x86_64.cmake
cmake --build build-cek
```

## Mode CLI

| Argumen             | Efek                                              |
| ------------------- | ------------------------------------------------- |
| `--veri` / `-V`     | cetak versi lalu keluar 0 (smoke-test CI)         |
| `-Jalankan`         | headless loop, log ke `%APPDATA%\XyCloudStore\Agent\agent.log` |
| `--gui-tes`         | buka GUI lalu tutup setelah 5 frame (smoke-test CI) |
| (tanpa argumen)     | buka jendela GUI                                  |

Menutup jendela (X) hanya meminimalkan — agen tetap melayani di latar.
Gunakan tombol **Tutup Total** untuk berhenti penuh.
