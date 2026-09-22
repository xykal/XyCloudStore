# XyCloudStore — Agen PC Host (C++ native murni)
# Win32 + DirectX 11 + Dear ImGui. Satu exe mandiri, tanpa OBS/live-PC.
cmake_minimum_required(VERSION 3.20)

project(xycloud-agent VERSION 1.6.0 LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(MSVC)
  add_compile_options(/utf-8 /W3 /EHsc)
  add_compile_definitions(UNICODE _UNICODE _CRT_SECURE_NO_WARNINGS NOMINMAX WIN32_LEAN_AND_MEAN)
else()
  add_compile_options(-Wall -Wextra)
  add_compile_definitions(UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()

include(FetchContent)

# --- Dear ImGui (pinned) ---
FetchContent_Declare(
  imgui
  URL https://github.com/ocornut/imgui/archive/refs/tags/v1.92.9b.zip
)
FetchContent_MakeAvailable(imgui)

add_library(imgui STATIC
  ${imgui_SOURCE_DIR}/imgui.cpp
  ${imgui_SOURCE_DIR}/imgui_draw.cpp
  ${imgui_SOURCE_DIR}/imgui_tables.cpp
  ${imgui_SOURCE_DIR}/imgui_widgets.cpp
  ${imgui_SOURCE_DIR}/backends/imgui_impl_win32.cpp
  ${imgui_SOURCE_DIR}/backends/imgui_impl_dx11.cpp
)
target_include_directories(imgui PUBLIC ${imgui_SOURCE_DIR} ${imgui_SOURCE_DIR}/backends)
if(MSVC)
  # Backend ImGui bersih dari warning; tetap W3 agar error terlihat.
  target_compile_options(imgui PRIVATE /W3)
endif()

# --- nlohmann/json (pinned, header-only) ---
FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp
  DOWNLOAD_NO_EXTRACT TRUE
)
FetchContent_MakeAvailable(nlohmann_json)
add_library(nlohmann_json_iface INTERFACE)
target_include_directories(nlohmann_json_iface INTERFACE ${nlohmann_json_SOURCE_DIR})
# json.hpp tunggal: sediakan sebagai <nlohmann/json.hpp> via direktori tiruan.
file(MAKE_DIRECTORY ${CMAKE_BINARY_DIR}/jsonshim/nlohmann)
file(COPY ${nlohmann_json_SOURCE_DIR}/json.hpp DESTINATION ${CMAKE_BINARY_DIR}/jsonshim/nlohmann)
target_include_directories(nlohmann_json_iface INTERFACE ${CMAKE_BINARY_DIR}/jsonshim)

add_executable(xycloud-agent WIN32
  src/main.cpp
  src/util.cpp
  src/http.cpp
  src/relay.cpp
  src/agent.cpp
  src/gui.cpp
  res/app.rc
)
target_include_directories(xycloud-agent PRIVATE src)
target_link_libraries(xycloud-agent PRIVATE
  imgui
  nlohmann_json_iface
  d3d11 dxgi d3dcompiler winhttp ws2_32 dwmapi
)

if(MSVC)
  # GUI tanpa konsol, entry tetap main() agar satu kode dengan MinGW.
  set_target_properties(xycloud-agent PROPERTIES LINK_FLAGS "/SUBSYSTEM:WINDOWS /ENTRY:mainCRTStartup")
endif()

set_target_properties(xycloud-agent PROPERTIES OUTPUT_NAME "xycloud-agent")
