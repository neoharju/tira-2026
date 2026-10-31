cmake_minimum_required(VERSION 3.25)
project(tira_cpp LANGUAGES CXX)

# C++23 without compiler extensions, for every target.
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)  # for clangd and clang-tidy
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -g -DNDEBUG")  # -g lets perf and gdb show source lines

# All code may use AVX2, FMA and BMI2 (x86-64-v3, Intel Haswell and AMD Zen
# or newer). Functions that use AVX-512 say so with [[gnu::target("avx512f")]].
add_compile_options(-march=x86-64-v3 -Wall -Wextra -Wpedantic -Wshadow)

set(TIRA_SANITIZE "" CACHE STRING "Sanitizers to build with, for example address;undefined or thread")
if(TIRA_SANITIZE)
  list(JOIN TIRA_SANITIZE "," sanitizers)
  add_compile_options(-fsanitize=${sanitizers} -fno-omit-frame-pointer)
  add_link_options(-fsanitize=${sanitizers})
  if("undefined" IN_LIST TIRA_SANITIZE)
    add_compile_options(-fno-sanitize-recover=undefined)  # stop at the first error
  endif()
  if("thread" IN_LIST TIRA_SANITIZE)
    add_compile_options(-O1)  # ThreadSanitizer is very slow without optimization
  endif()
endif()

find_package(OpenMP REQUIRED)
find_package(Threads REQUIRED)

# doctest: an installed copy if there is one, otherwise the single header.
find_package(doctest 2.4 QUIET)
if(NOT doctest_FOUND)
  set(doctest_dir ${CMAKE_BINARY_DIR}/_deps/doctest)
  if(NOT EXISTS ${doctest_dir}/doctest/doctest.h)
    file(DOWNLOAD https://raw.githubusercontent.com/doctest/doctest/v2.4.12/doctest/doctest.h
         ${doctest_dir}/doctest/doctest.h
         EXPECTED_HASH SHA256=94029a7d32da24a56249658147dbd2b33ff0b9ed665295cbbaf19aafff5b0ced
         STATUS status)
    list(GET status 0 code)
    if(NOT code EQUAL 0)
      message(FATAL_ERROR "Could not download doctest.h: ${status}. Install doctest (for example the package doctest-dev) and try again.")
    endif()
  endif()
  add_library(doctest INTERFACE)
  target_include_directories(doctest SYSTEM INTERFACE ${doctest_dir})
  add_library(doctest::doctest ALIAS doctest)
endif()

add_library(common INTERFACE)
target_include_directories(common INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/common)
target_link_libraries(common INTERFACE OpenMP::OpenMP_CXX Threads::Threads)

# Code compiled without automatic vectorization, for scalar baselines.
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  set(TIRA_NO_VECTORIZE -fno-vectorize -fno-slp-vectorize)
else()
  set(TIRA_NO_VECTORIZE -fno-tree-vectorize)
endif()

enable_testing()
add_subdirectory(week17)
add_subdirectory(week18)
add_subdirectory(week19)
add_subdirectory(week20)
add_subdirectory(week21)
add_subdirectory(week22)
