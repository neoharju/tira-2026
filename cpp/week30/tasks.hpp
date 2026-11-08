// Week 30: everything that the tests and the benchmarks use. The tasks:
//   task 1:  morton_encode, morton_decode        (task1_morton.cpp)
//   task 2:  hilbert_encode                       (task2_hilbert.cpp)
//   task 3:  geohash, hex_of, hex_disk            (task3_cells.cpp)
//   task 4:  str_build                            (task4_str.cpp)
//   task 5:  range_query, knn                     (task5_queries.cpp)
//   task 6:  intersect_mask_avx2                  (task6_node_avx2.hpp)
//   task 7:  str_build_parallel                   (task7_str_parallel.cpp)
//   task 8:  range_query_batch                    (task8_batch.cpp)
#pragma once
#include "geo.hpp"
#include "kernels.hpp"
#include "points.hpp"
#include "rtree.hpp"
#include "simd_test.hpp"
