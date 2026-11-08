// Week 32: everything that the tests and the benchmarks use. The tasks:
//   task 1: ConcurrentTree::find, scan                  (task1_find.cpp)
//   task 2: ConcurrentTree::insert                      (task2_insert.cpp)
//   task 3: ConcurrentTree::insert_optimistic, erase    (task3_optimistic.cpp)
//   task 4: MvccStore::get                              (task4_get.cpp)
//   task 5: MvccStore::put, erase, commit, abort        (task5_write.cpp)
//   task 6: MvccStore::gc                               (task6_gc.cpp)
//   task 7: check_history                               (task7_check.cpp)
//   task 8: stress                                      (task8_stress.hpp)
#pragma once
#include "btree.hpp"
#include "copy_store.hpp"
#include "history.hpp"
#include "mvcc.hpp"
#include "task8_stress.hpp"
