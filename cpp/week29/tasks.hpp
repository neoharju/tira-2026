// Week 29: everything that the tests and the benchmarks use. The tasks:
//   task 1:    Art::find                      (task1_find.cpp)
//   task 2:    Art::insert                    (task2_insert.cpp)
//   task 3:    Art::scan                      (task3_scan.cpp)
//   task 4:    find16_sse                     (task4_find16.hpp)
//   task 5:    lower16_sse                    (task5_lower16.hpp)
//   task 6:    Lpm                            (task6_lpm.cpp)
//   tasks 7-8: build_parallel                 (task7_parallel_build.cpp)
#pragma once
#include "art.hpp"
#include "build.hpp"
#include "keys.hpp"
#include "lpm.hpp"
#include "node16_kernels.hpp"
#include "simd_search.hpp"
