cmake_minimum_required(VERSION 3.28...3.30)

include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/common/bootstrap.cmake" NO_POLICY_SCOPE)

project(${_name} VERSION ${_version})

include(compilerconfig)
include(defaults)
include(helpers)

add_library(${CMAKE_PROJECT_NAME} MODULE)

find_package(libobs REQUIRED)
find_package(obs-frontend-api REQUIRED)
find_package(Qt6 REQUIRED COMPONENTS Core Widgets)

# The WebSocket client: IXWebSocket at a pinned commit (v11.4.6), plain ws:// only (no TLS, no zlib), built static into the plugin.
include(FetchContent)
FetchContent_Declare(
  ixwebsocket
  GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git
  GIT_TAG 2efe037c9cc96fd536774f17bdb5215161ee5087
)
set(USE_TLS OFF CACHE BOOL "" FORCE)
set(USE_ZLIB OFF CACHE BOOL "" FORCE)
set(USE_WS OFF CACHE BOOL "" FORCE)
set(USE_TEST OFF CACHE BOOL "" FORCE)
set(IXWEBSOCKET_INSTALL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5) # IXWebSocket asks for an older CMake than CMake 4 accepts
# Not our code: its warnings must not fail our build.
set(_tcg_werror ${CMAKE_COMPILE_WARNING_AS_ERROR})
set(CMAKE_COMPILE_WARNING_AS_ERROR OFF)
FetchContent_MakeAvailable(ixwebsocket)
set(CMAKE_COMPILE_WARNING_AS_ERROR ${_tcg_werror})

target_link_libraries(
  ${CMAKE_PROJECT_NAME}
  PRIVATE OBS::libobs OBS::obs-frontend-api Qt6::Core Qt6::Widgets ixwebsocket
)
target_sources(${CMAKE_PROJECT_NAME} PRIVATE src/plugin-main.cpp src/dock.cpp src/link.cpp)
target_compile_definitions(${CMAKE_PROJECT_NAME} PRIVATE TCG_PLUGIN_VERSION="${PLUGIN_VERSION}")

set_target_properties_plugin(${CMAKE_PROJECT_NAME} PROPERTIES OUTPUT_NAME ${_name})

# The pure parts (src/core.h) have no OBS or Qt in them, so their test is a plain executable: ctest runs it.
enable_testing()
add_executable(core_test tests/core_test.cpp)
add_test(NAME core COMMAND core_test)
