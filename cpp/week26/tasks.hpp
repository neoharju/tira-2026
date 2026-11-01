// Week 26: the functions that you write, besides find, insert, scan and erase
// of BPlusTree (tasks 1-4, declared in bplus.hpp) and the fuzz harness of
// task 5 (task5_fuzz.hpp). The tests are in test.cpp and the speed goals in
// bench.cpp.
#pragma once
#include <cstddef>
#include <span>
#include <utility>

#include "bplus.hpp"

namespace w26 {

// Task 6. The place of x in a node with AVX2: the number of keys < x among
// keys[0 ... count - 1], which are increasing; count is at most 64. AVX2
// compares four 64-bit keys at once, but only as signed numbers, and our keys
// are unsigned. Read nothing at or after keys[count].
std::size_t node_lower_bound_avx2(const Key* keys, std::size_t count, Key x);

// Task 7. The same with AVX-512: eight keys per compare, unsigned, into a mask.
[[gnu::target("avx512f")]] std::size_t node_lower_bound_avx512(const Key* keys, std::size_t count, Key x);

// Task 8. bulk_load (bplus.hpp) with OpenMP threads: exactly the same tree,
// page for page.
BPlusTree bulk_load_parallel(std::span<const std::pair<Key, Value>> sorted);

// Simple versions for comparison (baseline.cpp).
namespace baseline {
// std::lower_bound in the node: a binary search with a branch on every step.
std::size_t node_lower_bound(const Key* keys, std::size_t count, Key x);
}  // namespace baseline

}  // namespace w26
