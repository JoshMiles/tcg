# Windows only: the plugin ships for the stream PC (ROADMAP 62)

include_guard(GLOBAL)

set(CMAKE_C_EXTENSIONS FALSE)
set(CMAKE_CXX_EXTENSIONS FALSE)
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/windows")
set(OS_WINDOWS TRUE)
