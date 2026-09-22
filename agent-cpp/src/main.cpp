// XyCloudStore — Agen PC Host (C++ native murni).
// Satu exe mandiri: Win32 + DirectX 11 + Dear ImGui. Tanpa OBS/live-PC.
//
// Mode:
//   --veri / -V        → cetak versi lalu keluar 0 (smoke-test CI)
//   -Jalankan          → headless loop (dipakai autostart registry)
//   --gui-tes          → buka GUI, tutup otomatis setelah 5 frame (smoke-test CI)
//   (tanpa argumen)    → buka jendela GUI
#include <atomic>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

#include "agent.h"
#include "gui.h"
#include "util.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <shellapi.h>

// Siapkan stdout untuk mode CLI di bawah /SUBSYSTEM:WINDOWS.
// Bila stdout sudah diwariskan valid (pipe/berkas/konsol induk), PAKAI APA
// ADANYA — jangan freopen ke CONOUT$ karena akan memutus redirect CI.
// Hanya bila tak ada handle sama sekali, tempel ke konsol induk.
static void sambung_konsol() {
  HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
  if (h != nullptr && h != INVALID_HANDLE_VALUE) return;  // sudah valid, pakai apa adanya
  if (AttachConsole(ATTACH_PARENT_PROCESS)) {
    freopen("CONOUT$", "w", stdout);
    freopen("CONOUT$", "w", stderr);
  }
}

int main() {
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  std::vector<std::string> arg;
  for (int i = 0; i < argc; i++) arg.push_back(xy::wide_ke_utf8(argv[i]));
  LocalFree(argv);

  bool veri = false, jalankan = false, gui_tes = false;
  for (size_t i = 1; i < arg.size(); i++) {
    if (arg[i] == "--veri" || arg[i] == "-V") veri = true;
    if (arg[i] == "-Jalankan" || arg[i] == "--jalankan") jalankan = true;
    if (arg[i] == "--gui-tes") gui_tes = true;
  }

  if (veri) {
    sambung_konsol();
    printf("XyCloudStore Agen %s (C++)\n", xy::agent::VERSI);
    fflush(stdout);
    return 0;
  }

  if (jalankan) {
    sambung_konsol();
    xy::agent::Konfig k = xy::agent::muat_konfig();
    xy::agent::tulis_log_headless(
        std::string("Mulai headless — agen v") + xy::agent::VERSI + ", kode unit terpasang=" +
        (k.kode.empty() ? "BELUM" : "YA"));
    xy::Logger log = [](const std::string& t) {
      printf("%s\n", t.c_str());
      fflush(stdout);
      xy::agent::tulis_log_headless(t);
    };
    auto stop = std::make_shared<std::atomic<bool>>(false);
    xy::agent::jalankan_loop(k, log, stop);
    return 0;
  }

  if (gui_tes) sambung_konsol();
  return xy::gui::run(gui_tes);
}
