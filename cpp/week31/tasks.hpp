// Week 31: everything that the tests and the benchmarks use. The tasks:
//   task 1: append_record, recover                  (task1_wal.cpp)
//   task 2: MemTable::add, MemTable::get            (task2_memtable.cpp)
//   task 3: Table::get                              (task3_table_get.cpp)
//   task 4: crc32c                                  (task4_crc32c.cpp)
//   task 5: compact                                 (task5_compact.cpp)
//   task 6: SplitBlockBloom::insert, may_contain    (task6_bloom.cpp)
//   task 7: SplitBlockBloom::insert_avx2, ...       (task7_bloom_avx2.cpp)
//   task 8: compact_parallel                        (task8_subcompactions.cpp)
// lsm.hpp puts all parts together into a key-value store.
#pragma once
#include "bloom.hpp"
#include "compaction.hpp"
#include "crc32c.hpp"
#include "format.hpp"
#include "lsm.hpp"
#include "memtable.hpp"
#include "table.hpp"
#include "wal.hpp"
#include "workload.hpp"
