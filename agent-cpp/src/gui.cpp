#include "gui.h"

#include <atomic>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#include "imgui.h"
#include "imgui_impl_dx11.h"
#include "imgui_impl_win32.h"

#include "agent.h"
#include "relay.h"
#include "util.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <d3d11.h>
#include <tchar.h>
#include <windows.h>
#include <shellapi.h>

#include "../res/resource.h"

// Dideklarasikan di lingkup global (milik backend ImGui).
extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hWnd, UINT msg, WPARAM wParam,
                                                             LPARAM lParam);

namespace xy {
namespace gui {
namespace {

// ---------- keadaan bersama (dibagi thread pekerja) ----------
enum Sibuk { S_TIDAK = 0, S_UJI, S_SETUP, S_CEKPORT, S_UPNP, S_LOOP };

struct Bersama {
  std::mutex m;
  agent::Konfig cfg;
  std::vector<std::string> log;
  std::string uji_status, uji_pesan;
  std::string setup_status, setup_pesan;
  std::string simpan_pesan;
  bool simpan_ok = false;
  std::atomic<bool> berjalan{false};
  std::atomic<bool> stop{false};
  std::atomic<bool> sinkron{false};
  std::atomic<int> sibuk{S_TIDAK};
};

void log_baris(const std::shared_ptr<Bersama>& b, const std::string& teks) {
  std::lock_guard<std::mutex> k(b->m);
  b->log.push_back("[" + jam_wib() + "] " + teks);
  if (b->log.size() > 600) b->log.erase(b->log.begin(), b->log.begin() + (b->log.size() - 600));
}

Logger logger_ke(const std::shared_ptr<Bersama>& b) {
  return [b](const std::string& t) { log_baris(b, t); };
}

bool kunci_sibuk(const std::shared_ptr<Bersama>& b, int nilai) {
  int harap = S_TIDAK;
  return b->sibuk.compare_exchange_strong(harap, nilai);
}

// ---------- pekerja latar ----------
void kerja_uji(const std::shared_ptr<Bersama>& b) {
  agent::Konfig cfg;
  {
    std::lock_guard<std::mutex> k(b->m);
    cfg = b->cfg;
  }
  log_baris(b, "Menjalankan uji koneksi lokal (Sunshine API)…");
  agent::json hasil = agent::periksa_sunshine(cfg);
  std::string st = hasil.is_object() && hasil.contains("status") && hasil["status"].is_string()
                       ? hasil["status"].get<std::string>()
                       : "-";
  std::string pesan = hasil.is_object() && hasil.contains("pesan") && hasil["pesan"].is_string()
                          ? hasil["pesan"].get<std::string>()
                          : "";
  {
    std::lock_guard<std::mutex> k(b->m);
    b->uji_status = st;
    b->uji_pesan = pesan;
  }
  b->sibuk.store(S_TIDAK);
  log_baris(b, "Hasil uji: " + st + " — " + pesan);
}

void kerja_setup(const std::shared_ptr<Bersama>& b) {
  agent::Konfig cfg;
  {
    std::lock_guard<std::mutex> k(b->m);
    cfg = b->cfg;
  }
  Logger log = logger_ke(b);
  auto [k_baru, hasil] = agent::setup_otomatis(cfg, log);
  std::string st = hasil.is_object() && hasil.contains("status") && hasil["status"].is_string()
                       ? hasil["status"].get<std::string>()
                       : "-";
  bool siap = hasil.is_object() && hasil.contains("siap") && hasil["siap"].is_boolean()
                  ? hasil["siap"].get<bool>()
                  : false;
  {
    std::lock_guard<std::mutex> k(b->m);
    b->cfg = k_baru;
    b->setup_status = st;
    b->setup_pesan = siap ? "Sunshine siap." : "Belum siap — lihat log.";
    b->sinkron.store(true);
  }
  b->sibuk.store(S_TIDAK);
  log_baris(b, "Setup selesai · unit=" + k_baru.kode + " · sunshine_user=" + k_baru.user +
                   " · siap=" + (siap ? "true" : "false"));
}

void kerja_cekport(const std::shared_ptr<Bersama>& b) {
  agent::Konfig cfg;
  {
    std::lock_guard<std::mutex> k(b->m);
    cfg = b->cfg;
  }
  agent::cek_port_dari_server(cfg, logger_ke(b));
  b->sibuk.store(S_TIDAK);
}

void kerja_upnp(const std::shared_ptr<Bersama>& b) {
  agent::Konfig cfg;
  {
    std::lock_guard<std::mutex> k(b->m);
    cfg = b->cfg;
  }
  Logger log = logger_ke(b);
  agent::json h = agent::buka_upnp_firewall(cfg, log);
  bool ok = h.is_object() && h.contains("ok") && h["ok"].is_boolean() && h["ok"].get<bool>();
  log("Auto-UPnP selesai: " + std::string(ok ? "OK" : "perlu perhatian") + ".");
  b->sibuk.store(S_TIDAK);
}

void kerja_loop(const std::shared_ptr<Bersama>& b) {
  agent::Konfig cfg;
  {
    std::lock_guard<std::mutex> k(b->m);
    cfg = b->cfg;
  }
  auto stop = std::make_shared<std::atomic<bool>>(false);
  {
    // Penanda stop bersama: pakai flag di Bersama via polling silang.
    // Sederhana: loop memeriksa b->stop tiap detik.
  }
  Logger log = logger_ke(b);
  // Jembatan: jalankan_loop butuh shared_ptr; selaraskan dari b->stop.
  std::atomic<bool>* ext = &b->stop;
  std::thread penyelarasan([stop, ext]() {
    while (!stop->load()) {
      if (ext->load()) {
        stop->store(true);
        break;
      }
      tidur_ms(300);
    }
  });
  penyelarasan.detach();
  agent::jalankan_loop(cfg, log, stop);
  b->berjalan.store(false);
  b->sibuk.store(S_TIDAK);
}

// ---------- aplikasi ----------

struct Aplikasi {
  std::shared_ptr<Bersama> b;
  char d_kode[128] = {0};
  char d_server[256] = {0};
  char d_user[128] = {0};
  char d_sandi[128] = {0};
  char d_host[256] = {0};
  bool tampil_sandi = false;
  bool autostart = false;
  bool mode_relay = false;
  bool keluar_total = false;
  unsigned frame = 0;

  void sinkron_dari_cfg() {
    std::lock_guard<std::mutex> k(b->m);
    snprintf(d_kode, sizeof(d_kode), "%s", b->cfg.kode.c_str());
    snprintf(d_server, sizeof(d_server), "%s", b->cfg.server.c_str());
    snprintf(d_user, sizeof(d_user), "%s", b->cfg.user.c_str());
    snprintf(d_sandi, sizeof(d_sandi), "%s", b->cfg.sandi.c_str());
    snprintf(d_host, sizeof(d_host), "%s", b->cfg.stream_host.value_or("").c_str());
  }

  void simpan() {
    agent::Konfig lama;
    {
      std::lock_guard<std::mutex> k(b->m);
      lama = b->cfg;
    }
    agent::Konfig kk;
    kk.kode = trim(d_kode);
    kk.user = trim(d_user);
    kk.sandi = trim(d_sandi);
    kk.server = trim(d_server);
    if (kk.server.empty()) kk.server = "https://api.xycloud.my.id";
    std::string h = trim(d_host);
    if (!h.empty()) kk.stream_host = h;
    kk.relay = lama.relay;
    std::lock_guard<std::mutex> k(b->m);
    if (kk.kode.empty()) {
      b->simpan_pesan = "Kode unit wajib diisi.";
      b->simpan_ok = false;
      return;
    }
    if (kk.sandi.empty()) kk.sandi = lama.sandi;
    if (kk.user.empty()) kk.user = lama.user;
    std::string galat;
    if (agent::simpan_konfig(kk, galat)) {
      b->cfg = kk;
      snprintf(d_user, sizeof(d_user), "%s", kk.user.c_str());
      snprintf(d_sandi, sizeof(d_sandi), "%s", kk.sandi.c_str());
      snprintf(d_server, sizeof(d_server), "%s", kk.server.c_str());
      b->simpan_pesan = "Pengaturan tersimpan untuk unit " + kk.kode;
      b->simpan_ok = true;
    } else {
      b->simpan_pesan = "Gagal menyimpan: " + galat;
      b->simpan_ok = false;
    }
  }

  void mulai_uji() {
    if (!kunci_sibuk(b, S_UJI)) return;
    {
      std::lock_guard<std::mutex> k(b->m);
      b->uji_status.clear();
      b->uji_pesan.clear();
    }
    std::thread([bb = b]() { kerja_uji(bb); }).detach();
  }
  void mulai_setup() {
    if (!kunci_sibuk(b, S_SETUP)) return;
    {
      std::lock_guard<std::mutex> k(b->m);
      b->setup_status.clear();
      b->setup_pesan.clear();
    }
    std::thread([bb = b]() { kerja_setup(bb); }).detach();
  }
  void mulai_cekport() {
    std::string kode;
    {
      std::lock_guard<std::mutex> k(b->m);
      kode = b->cfg.kode;
    }
    if (kode.empty()) {
      log_baris(b, "Isi & simpan kode unit dulu sebelum cek port.");
      return;
    }
    if (!kunci_sibuk(b, S_CEKPORT)) return;
    std::thread([bb = b]() { kerja_cekport(bb); }).detach();
  }
  void mulai_upnp() {
    if (!kunci_sibuk(b, S_UPNP)) return;
    std::thread([bb = b]() { kerja_upnp(bb); }).detach();
  }
  void mulai_loop() {
    agent::Konfig cfg;
    {
      std::lock_guard<std::mutex> k(b->m);
      cfg = b->cfg;
    }
    if (cfg.kode.empty()) {
      log_baris(b, "Simpan pengaturan (kode unit) dulu.");
      return;
    }
    if (cfg.user.empty() || cfg.sandi.empty()) {
      log_baris(b, "Sunshine belum di-setup. Jalankan Setup Engine dulu.");
      return;
    }
    if (!kunci_sibuk(b, S_LOOP)) return;
    b->stop.store(false);
    b->berjalan.store(true);
    std::thread([bb = b]() { kerja_loop(bb); }).detach();
  }
  void hentikan() {
    b->stop.store(true);
    log_baris(b, "Menghentikan agen…");
  }
  void toggle_autostart(bool aktif) {
    autostart = aktif;
    std::thread([bb = b, aktif]() { agent::atur_autostart(aktif, logger_ke(bb)); }).detach();
  }
  void toggle_relay(bool aktif) {
    mode_relay = aktif;
    std::string galat;
    if (agent::set_mode_relay(aktif, galat)) {
      if (aktif) {
        if (auto ip = agent::ip_tailscale()) {
          log_baris(b, "Mode relay AKTIF — IP Tailscale terdeteksi: " + *ip +
                           ". Penyewa harus tergabung di tailnet yang sama. Hanya untuk testing, "
                           "bukan produksi.");
        } else {
          log_baris(b, "Mode relay AKTIF tapi IP Tailscale tidak ditemukan. Pastikan Tailscale "
                       "terpasang & login, lalu coba lagi.");
        }
      } else {
        log_baris(b, "Mode relay dimatikan — kembali pakai IP publik.");
      }
    } else {
      log_baris(b, "Gagal simpan mode relay: " + galat);
    }
  }
  void buka_web_sunshine() {
    ShellExecuteW(nullptr, L"open", L"https://localhost:47990", nullptr, nullptr, SW_SHOWNORMAL);
  }
};

// ---------- gaya quiet-surface ----------
const ImU32 AKSEN = IM_COL32(0x7C, 0x3A, 0xED, 0xFF);
const ImU32 AKSEN_HOVER = IM_COL32(0x8B, 0x5C, 0xF6, 0xFF);
const ImU32 TEKS_REDUP = IM_COL32(0x8B, 0x94, 0x9E, 0xFF);
const ImU32 HIJAU_T = IM_COL32(0x4A, 0xDE, 0x80, 0xFF);
const ImU32 HIJAU_BG = IM_COL32(0x14, 0x36, 0x26, 0xFF);
const ImU32 KUNING_T = IM_COL32(0xFB, 0xBF, 0x24, 0xFF);
const ImU32 KUNING_BG = IM_COL32(0x3A, 0x2A, 0x12, 0xFF);
const ImU32 ABU_BG = IM_COL32(0x23, 0x23, 0x29, 0xFF);
const ImU32 MERAH_T = IM_COL32(0xF8, 0x71, 0x71, 0xFF);

void terapkan_gaya() {
  ImGuiStyle& s = ImGui::GetStyle();
  s.WindowRounding = 0.0f;
  s.ChildRounding = 12.0f;
  s.FrameRounding = 8.0f;
  s.GrabRounding = 8.0f;
  s.PopupRounding = 10.0f;
  s.ScrollbarRounding = 8.0f;
  s.FramePadding = ImVec2(10, 7);
  s.ItemSpacing = ImVec2(8, 8);
  s.WindowPadding = ImVec2(16, 14);
  ImVec4* c = s.Colors;
  c[ImGuiCol_WindowBg] = ImVec4(0.066f, 0.066f, 0.078f, 1.0f);
  c[ImGuiCol_ChildBg] = ImVec4(0.090f, 0.090f, 0.106f, 1.0f);
  c[ImGuiCol_Border] = ImVec4(0.149f, 0.149f, 0.173f, 1.0f);
  c[ImGuiCol_FrameBg] = ImVec4(0.133f, 0.133f, 0.157f, 1.0f);
  c[ImGuiCol_FrameBgHovered] = ImVec4(0.163f, 0.163f, 0.192f, 1.0f);
  c[ImGuiCol_FrameBgActive] = ImVec4(0.180f, 0.180f, 0.216f, 1.0f);
  c[ImGuiCol_Button] = ImVec4(0.137f, 0.137f, 0.161f, 1.0f);
  c[ImGuiCol_ButtonHovered] = ImVec4(0.180f, 0.180f, 0.216f, 1.0f);
  c[ImGuiCol_ButtonActive] = ImVec4(0.220f, 0.220f, 0.263f, 1.0f);
  c[ImGuiCol_CheckMark] = ImVec4(0.486f, 0.227f, 0.929f, 1.0f);
  c[ImGuiCol_ScrollbarBg] = ImVec4(0.066f, 0.066f, 0.078f, 1.0f);
  c[ImGuiCol_ScrollbarGrab] = ImVec4(0.220f, 0.220f, 0.263f, 1.0f);
  c[ImGuiCol_ScrollbarGrabHovered] = ImVec4(0.290f, 0.290f, 0.345f, 1.0f);
  c[ImGuiCol_ScrollbarGrabActive] = ImVec4(0.361f, 0.361f, 0.427f, 1.0f);
  c[ImGuiCol_Text] = ImVec4(0.910f, 0.910f, 0.918f, 1.0f);
  c[ImGuiCol_TextDisabled] = ImVec4(0.545f, 0.580f, 0.620f, 1.0f);
}

void judul_seksi(const char* teks) {
  ImGui::TextColored(ImVec4(0.545f, 0.580f, 0.620f, 1.0f), "%s", teks);
  ImGui::Spacing();
}

// Pil status membulat (mis. BERJALAN / STANDBY).
void pil(const char* teks, ImU32 bg, ImU32 fg) {
  ImVec2 pad(12, 5);
  ImVec2 uk = ImGui::CalcTextSize(teks);
  ImVec2 pos = ImGui::GetCursorScreenPos();
  ImVec2 kotak(uk.x + pad.x * 2, uk.y + pad.y * 2);
  ImGui::GetWindowDrawList()->AddRectFilled(pos, ImVec2(pos.x + kotak.x, pos.y + kotak.y), bg,
                                            kotak.y * 0.5f);
  ImGui::GetWindowDrawList()->AddText(ImVec2(pos.x + pad.x, pos.y + pad.y), fg, teks);
  ImGui::Dummy(kotak);
}

void lencana_hasil(const char* nama, const std::string& status, const std::string& pesan) {
  if (status.empty()) return;
  bool ok = (status == "API_SIAP" || status == "OK");
  ImGui::Spacing();
  ImGui::TextDisabled("%s:", nama);
  ImGui::SameLine();
  ImGui::TextColored(ok ? ImVec4(0.29f, 0.87f, 0.50f, 1.0f) : ImVec4(0.97f, 0.44f, 0.44f, 1.0f),
                     "%s", status.c_str());
  if (!pesan.empty()) {
    ImGui::SameLine();
    ImGui::TextDisabled("— %s", pesan.c_str());
  }
}

// ---------- DirectX 11 ----------
static ID3D11Device* g_pd3dDevice = nullptr;
static ID3D11DeviceContext* g_pd3dContext = nullptr;
static IDXGISwapChain* g_pSwapChain = nullptr;
static ID3D11RenderTargetView* g_mainRenderTargetView = nullptr;

void CreateRenderTarget() {
  ID3D11Texture2D* pBackBuffer = nullptr;
  g_pSwapChain->GetBuffer(0, IID_PPV_ARGS(&pBackBuffer));
  if (pBackBuffer) {
    g_pd3dDevice->CreateRenderTargetView(pBackBuffer, nullptr, &g_mainRenderTargetView);
    pBackBuffer->Release();
  }
}

void CleanupRenderTarget() {
  if (g_mainRenderTargetView) {
    g_mainRenderTargetView->Release();
    g_mainRenderTargetView = nullptr;
  }
}

bool CreateDeviceD3D(HWND hWnd) {
  DXGI_SWAP_CHAIN_DESC sd{};
  sd.BufferCount = 2;
  sd.BufferDesc.Width = 0;
  sd.BufferDesc.Height = 0;
  sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  sd.BufferDesc.RefreshRate.Numerator = 60;
  sd.BufferDesc.RefreshRate.Denominator = 1;
  sd.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_MODE_SWITCH;
  sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  sd.OutputWindow = hWnd;
  sd.SampleDesc.Count = 1;
  sd.SampleDesc.Quality = 0;
  sd.Windowed = TRUE;
  sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
  UINT createDeviceFlags = 0;
  D3D_FEATURE_LEVEL featureLevel;
  const D3D_FEATURE_LEVEL featureLevelArray[2] = {D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0};
  HRESULT res = D3D11CreateDeviceAndSwapChain(
      nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, createDeviceFlags, featureLevelArray, 2,
      D3D11_SDK_VERSION, &sd, &g_pSwapChain, &g_pd3dDevice, &featureLevel, &g_pd3dContext);
  if (res == DXGI_ERROR_UNSUPPORTED) {
    res = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, createDeviceFlags,
                                        featureLevelArray, 2, D3D11_SDK_VERSION, &sd, &g_pSwapChain,
                                        &g_pd3dDevice, &featureLevel, &g_pd3dContext);
  }
  if (res != S_OK) return false;
  CreateRenderTarget();
  return true;
}

void CleanupDeviceD3D() {
  CleanupRenderTarget();
  if (g_pSwapChain) {
    g_pSwapChain->Release();
    g_pSwapChain = nullptr;
  }
  if (g_pd3dContext) {
    g_pd3dContext->Release();
    g_pd3dContext = nullptr;
  }
  if (g_pd3dDevice) {
    g_pd3dDevice->Release();
    g_pd3dDevice = nullptr;
  }
}

static Aplikasi* g_app = nullptr;

LRESULT WINAPI WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  if (ImGui_ImplWin32_WndProcHandler(hWnd, msg, wParam, lParam)) return true;
  switch (msg) {
    case WM_SIZE:
      if (g_pd3dDevice != nullptr && wParam != SIZE_MINIMIZED) {
        CleanupRenderTarget();
        g_pSwapChain->ResizeBuffers(0, (UINT)LOWORD(lParam), (UINT)HIWORD(lParam),
                                    DXGI_FORMAT_UNKNOWN, 0);
        CreateRenderTarget();
      }
      return 0;
    case WM_CLOSE:
      // Tombol X = minimalkan ke latar belakang; agen tetap melayani.
      if (g_app && !g_app->keluar_total) {
        log_baris(
            g_app->b,
            "Jendela diminimalkan ke latar belakang. Agen tetap aktif melayani streaming.");
        log_baris(g_app->b,
                  "Gunakan tombol 'Tutup Total' di antarmuka bila ingin menghentikan agen "
                  "sepenuhnya.");
        ShowWindow(hWnd, SW_MINIMIZE);
        return 0;
      }
      DestroyWindow(hWnd);
      return 0;
    case WM_SYSCOMMAND:
      if ((wParam & 0xfff0) == SC_KEYMENU) return 0;
      break;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProc(hWnd, msg, wParam, lParam);
}

// ---------- render satu frame ----------
static ImFont* g_font_ui = nullptr;
static ImFont* g_font_mono = nullptr;

void gambar_frame(Aplikasi& app) {
  // Potret keadaan (sekali kunci per frame).
  struct Potret {
    bool berjalan;
    int sibuk;
    std::vector<std::string> log;
    std::string uji_status, uji_pesan, setup_status, setup_pesan;
    std::string simpan_pesan;
    bool simpan_ok;
  };
  Potret p;
  {
    std::lock_guard<std::mutex> k(app.b->m);
    p.berjalan = app.b->berjalan.load();
    p.sibuk = app.b->sibuk.load();
    p.log = app.b->log;
    p.uji_status = app.b->uji_status;
    p.uji_pesan = app.b->uji_pesan;
    p.setup_status = app.b->setup_status;
    p.setup_pesan = app.b->setup_pesan;
    p.simpan_pesan = app.b->simpan_pesan;
    p.simpan_ok = app.b->simpan_ok;
  }
  if (app.b->sinkron.exchange(false)) app.sinkron_dari_cfg();

  ImGuiViewport* vp = ImGui::GetMainViewport();
  ImGui::SetNextWindowPos(vp->Pos);
  ImGui::SetNextWindowSize(vp->Size);
  ImGui::Begin("##utama", nullptr,
              ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove |
                  ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoBringToFrontOnFocus);
  if (g_font_ui) ImGui::PushFont(g_font_ui);

  // ===== KEPALA =====
  {
    ImVec2 pos = ImGui::GetCursorScreenPos();
    ImGui::GetWindowDrawList()->AddRectFilled(pos, ImVec2(pos.x + 40, pos.y + 40), AKSEN, 12.0f);
    ImGui::GetWindowDrawList()->AddCircleFilled(ImVec2(pos.x + 20, pos.y + 20), 7.0f,
                                                IM_COL32(255, 255, 255, 255));
    ImGui::Dummy(ImVec2(40, 40));
    ImGui::SameLine();
    ImGui::BeginGroup();
    ImGui::Text("XyCloud Agent");
    ImGui::TextDisabled("PC Host  ·  v%s  ·  C++ native", agent::VERSI);
    ImGui::EndGroup();
    ImGui::SameLine();
    // Pil status rata kanan.
    const char* teks_pil = p.berjalan ? "BERJALAN" : (p.sibuk != S_TIDAK ? "BEKERJA" : "STANDBY");
    ImU32 bg = p.berjalan ? HIJAU_BG : (p.sibuk != S_TIDAK ? KUNING_BG : ABU_BG);
    ImU32 fg = p.berjalan ? HIJAU_T : (p.sibuk != S_TIDAK ? KUNING_T : TEKS_REDUP);
    ImVec2 uk = ImGui::CalcTextSize(teks_pil);
    ImGui::SetCursorPosX(ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x -
                         (uk.x + 24));
    pil(teks_pil, bg, fg);
  }
  ImGui::Spacing();

  bool mati = (p.sibuk != S_TIDAK);

  // ===== 1. LAYANAN =====
  judul_seksi("LAYANAN SEWA");
  ImGui::BeginChild("##layanan", ImVec2(0, 118), true);
  ImGui::BeginDisabled(mati && !p.berjalan);
  if (!p.berjalan) {
    ImGui::PushStyleColor(ImGuiCol_Button, (ImVec4)ImColor(AKSEN));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, (ImVec4)ImColor(AKSEN_HOVER));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive, (ImVec4)ImColor(AKSEN));
    if (ImGui::Button("Mulai melayani sewa", ImVec2(ImGui::GetContentRegionAvail().x, 38)))
      app.mulai_loop();
    ImGui::PopStyleColor(3);
    ImGui::TextDisabled("Layanan standby: klik tombol di atas untuk mulai menerima koneksi sewa.");
  } else {
    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.35f, 0.16f, 0.16f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.45f, 0.20f, 0.20f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive, ImVec4(0.35f, 0.16f, 0.16f, 1.0f));
    if (ImGui::Button("Hentikan layanan", ImVec2(ImGui::GetContentRegionAvail().x, 38)))
      app.hentikan();
    ImGui::PopStyleColor(3);
    ImGui::TextDisabled("Agen aktif: heartbeat tiap 20 detik, perintah sewa diproses otomatis.");
  }
  ImGui::EndDisabled();
  ImGui::EndChild();
  ImGui::Spacing();

  // ===== 2. ALAT =====
  judul_seksi("ALAT & DIAGNOSTIK ENGINE");
  ImGui::BeginChild("##alat", ImVec2(0, 218), true);
  ImGui::BeginDisabled(mati);
  float setengah = (ImGui::GetContentRegionAvail().x - 8.0f) * 0.5f;
  if (ImGui::Button("Uji Sunshine", ImVec2(setengah, 32))) app.mulai_uji();
  ImGui::SameLine();
  if (ImGui::Button("Setup Engine", ImVec2(setengah, 32))) app.mulai_setup();
  if (ImGui::Button("Cek Port Publik", ImVec2(setengah, 32))) app.mulai_cekport();
  ImGui::SameLine();
  if (ImGui::Button("Auto-UPnP", ImVec2(setengah, 32))) app.mulai_upnp();
  ImGui::EndDisabled();
  lencana_hasil("Uji koneksi", p.uji_status, p.uji_pesan);
  lencana_hasil("Setup engine", p.setup_status, p.setup_pesan);
  if (p.sibuk != S_TIDAK) {
    const char* t = "";
    switch (p.sibuk) {
      case S_UJI: t = "Menguji koneksi ke Sunshine…"; break;
      case S_SETUP: t = "Setup otomatis berjalan (unduh/pasang bisa beberapa menit)…"; break;
      case S_CEKPORT: t = "Server sedang memeriksa port dari internet…"; break;
      case S_UPNP: t = "Membuka port via UPnP router & Windows Firewall…"; break;
      case S_LOOP: t = "Agen berjalan…"; break;
      default: break;
    }
    int titik = (int)(ImGui::GetTime() * 2) % 4;
    ImGui::TextColored(ImVec4(0.65f, 0.55f, 0.98f, 1.0f), "%s%s", t, std::string(titik, '.').c_str());
  }
  if (ImGui::SmallButton("Buka Web Sunshine (localhost:47990)")) app.buka_web_sunshine();
  ImGui::SameLine();
  ImGui::SetCursorPosX(ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x - 96);
  ImGui::PushStyleColor(ImGuiCol_Text, (ImVec4)ImColor(MERAH_T));
  if (ImGui::SmallButton("Tutup Total")) {
    app.keluar_total = true;
    app.hentikan();
    relay::berhenti();
    PostMessage(GetActiveWindow(), WM_CLOSE, 0, 0);
  }
  ImGui::PopStyleColor();
  ImGui::EndChild();
  ImGui::Spacing();

  // ===== 3. KONFIGURASI =====
  judul_seksi("KONFIGURASI UNIT & KONEKSI");
  ImGui::BeginChild("##cfg", ImVec2(0, 296), true);
  ImGui::TextDisabled("Kode Unit:");
  ImGui::InputTextWithHint("##kode", "contoh: UNIT-01 / PC-RTX-01", app.d_kode, sizeof(app.d_kode));
  ImGui::TextDisabled("Server API:");
  ImGui::InputTextWithHint("##server", "https://api.xycloud.my.id", app.d_server,
                           sizeof(app.d_server));
  ImGui::TextDisabled("User Sunshine:");
  ImGui::InputTextWithHint("##user", "kosongkan = auto-setup", app.d_user, sizeof(app.d_user));
  ImGui::TextDisabled("Sandi Sunshine:");
  ImGui::InputTextWithHint("##sandi", "kosongkan = dipertahankan", app.d_sandi, sizeof(app.d_sandi),
                           app.tampil_sandi ? 0 : ImGuiInputTextFlags_Password);
  ImGui::SameLine();
  if (ImGui::SmallButton(app.tampil_sandi ? "sembunyi" : "intip")) app.tampil_sandi = !app.tampil_sandi;
  ImGui::TextDisabled("Host / Relay:");
  ImGui::InputTextWithHint("##host", "kosongkan = auto IP publik", app.d_host, sizeof(app.d_host));
  if (ImGui::Button("Simpan Konfigurasi", ImVec2(170, 30))) app.simpan();
  if (!p.simpan_pesan.empty()) {
    ImGui::SameLine();
    ImGui::TextColored(p.simpan_ok ? ImVec4(0.29f, 0.87f, 0.50f, 1.0f)
                                   : ImVec4(0.97f, 0.44f, 0.44f, 1.0f),
                       "%s", p.simpan_pesan.c_str());
  }
  if (ImGui::Checkbox("Jalankan otomatis saat login Windows", &app.autostart))
    app.toggle_autostart(app.autostart);
  if (ImGui::Checkbox("Mode Relay (Tailscale) — host dilaporkan pakai IP tailnet 100.x",
                      &app.mode_relay))
    app.toggle_relay(app.mode_relay);
  ImGui::EndChild();
  ImGui::Spacing();

  // ===== 4. LOG =====
  char judul_log[64];
  snprintf(judul_log, sizeof(judul_log), "LOG AKTIVITAS (%u)", (unsigned)p.log.size());
  judul_seksi(judul_log);
  ImGui::BeginChild("##log", ImVec2(0, 190), true);
  if (g_font_mono) ImGui::PushFont(g_font_mono);
  bool di_bawah = ImGui::GetScrollY() >= ImGui::GetScrollMaxY() - 4.0f;
  for (const std::string& baris : p.log) ImGui::TextUnformatted(baris.c_str());
  if (di_bawah) ImGui::SetScrollHereY(1.0f);
  if (g_font_mono) ImGui::PopFont();
  ImGui::EndChild();

  if (g_font_ui) ImGui::PopFont();
  ImGui::End();
}

}  // namespace

int run(bool tes_gui) {
  pastikan_winsock();
  auto b = std::make_shared<Bersama>();
  {
    std::lock_guard<std::mutex> k(b->m);
    b->cfg = agent::muat_konfig();
  }
  Aplikasi app;
  app.b = b;
  app.sinkron_dari_cfg();
  app.autostart = agent::autostart_aktif();
  app.mode_relay = agent::mode_relay_aktif();
  g_app = &app;

  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(wc);
  wc.style = CS_CLASSDC;
  wc.lpfnWndProc = WndProc;
  wc.hInstance = GetModuleHandle(nullptr);
  wc.lpszClassName = L"XyCloudAgent";
  wc.hIcon = LoadIcon(wc.hInstance, MAKEINTRESOURCE(IDI_ICON1));
  RegisterClassExW(&wc);
  HWND hwnd = CreateWindowW(wc.lpszClassName, L"XyCloud Agent — PC Host", WS_OVERLAPPEDWINDOW, 100,
                            100, 920, 800, nullptr, nullptr, wc.hInstance, nullptr);
  if (!hwnd) return 1;
  HICON ikon_kecil = (HICON)LoadImage(wc.hInstance, MAKEINTRESOURCE(IDI_ICON1), IMAGE_ICON, 16, 16, 0);
  if (ikon_kecil) SendMessage(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)ikon_kecil);

  if (!CreateDeviceD3D(hwnd)) {
    CleanupDeviceD3D();
    UnregisterClassW(wc.lpszClassName, wc.hInstance);
    return 1;
  }
  ShowWindow(hwnd, SW_SHOWDEFAULT);
  UpdateWindow(hwnd);

  IMGUI_CHECKVERSION();
  ImGui::CreateContext();
  ImGuiIO& io = ImGui::GetIO();
  io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
  io.IniFilename = nullptr;  // jangan tulis imgui.ini
  terapkan_gaya();
  g_font_ui = io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\segoeui.ttf", 16.0f);
  g_font_mono = io.Fonts->AddFontFromFileTTF("C:\\Windows\\Fonts\\consola.ttf", 13.0f);
  ImGui_ImplWin32_Init(hwnd);
  ImGui_ImplDX11_Init(g_pd3dDevice, g_pd3dContext);

  log_baris(b, std::string("XyCloudStore Agen ") + agent::VERSI + " (C++) siap.");

  bool selesai = false;
  while (!selesai) {
    MSG msg;
    while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessage(&msg);
      if (msg.message == WM_QUIT) selesai = true;
    }
    if (selesai) break;

    ImGui_ImplDX11_NewFrame();
    ImGui_ImplWin32_NewFrame();
    ImGui::NewFrame();
    gambar_frame(app);
    ImGui::Render();
    const float jernih[4] = {0.066f, 0.066f, 0.078f, 1.0f};
    g_pd3dContext->OMSetRenderTargets(1, &g_mainRenderTargetView, nullptr);
    g_pd3dContext->ClearRenderTargetView(g_mainRenderTargetView, jernih);
    ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());
    HRESULT hr = g_pSwapChain->Present(1, 0);
    if (hr == DXGI_ERROR_DEVICE_REMOVED || hr == DXGI_ERROR_DEVICE_RESET) break;

    if (tes_gui) {
      app.frame++;
      printf("gui-tes frame %u\n", app.frame);
      fflush(stdout);
      if (app.frame >= 5) {
        printf("gui-tes OK — jendela dibuat & dirender, menutup\n");
        fflush(stdout);
        break;
      }
    }
  }

  app.b->stop.store(true);
  relay::berhenti();
  ImGui_ImplDX11_Shutdown();
  ImGui_ImplWin32_Shutdown();
  ImGui::DestroyContext();
  CleanupDeviceD3D();
  DestroyWindow(hwnd);
  UnregisterClassW(wc.lpszClassName, wc.hInstance);
  g_app = nullptr;
  return 0;
}

}  // namespace gui
}  // namespace xy
