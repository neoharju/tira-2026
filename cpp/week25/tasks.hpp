// Week 25: the functions that you write. Each one is in its own file
// (task1_eytzinger.cpp, ...). The tests are in test.cpp and the speed goals in
// bench.cpp.
//
// Every search returns the lower bound of x: the smallest key >= x, or none if
// there is no such key.
#pragma once
#include <cstddef>
#include <span>

#include "layout.hpp"

namespace w25 {

// Task 1. The Eytzinger layout of the sorted keys: e has n + 1 places,
// e[0] = none, and e[1 ... n] are the keys in the order of a breadth-first
// walk of the implicit binary search tree whose node k has the children 2k
// and 2k + 1. An in-order walk of that tree gives the keys in sorted order.
Keys eytzinger(std::span<const Key> sorted);

// Task 2. Search in the Eytzinger layout: start at node 1 and go to child
// 2k + (e[k] < x) until past the end, without a branch that depends on the
// keys. The answer is the last node where the search went left.
Key eytzinger_search(std::span<const Key> e, Key x);

// Task 3. Fill in the keys of the static B+ tree t (made by
// static_btree_shape(sorted.size())) as layout.hpp describes. One thread:
// task 8 is the parallel version.
void build_static_btree(StaticBTree& t, std::span<const Key> sorted);

// Task 4. Search in the static B+ tree with AVX2: on every level, compare x
// with the 16 keys of the node (two 8-key compares), count the keys < x, and
// go to that child. In the leaf, the count is the place of the answer.
Key static_btree_search(const StaticBTree& t, Key x);

// Task 5. The same with AVX-512: one 16-key compare per node, into a mask.
[[gnu::target("avx512f")]] Key static_btree_search_avx512(const StaticBTree& t, Key x);

// Task 6. eytzinger_search with software prefetching: ask for the node four
// levels ahead (its 16 descendants are one cache line).
Key eytzinger_search_prefetch(std::span<const Key> e, Key x);

// Task 7. results[i] = static_btree_search(t, queries[i]) for all i, with
// OpenMP threads.
void search_batch(const StaticBTree& t, std::span<const Key> queries, std::span<Key> results);

// Task 8. build_static_btree with OpenMP threads. The keys of t are not yet
// written: let each thread write (first touch) the part that it fills.
void build_static_btree_parallel(StaticBTree& t, std::span<const Key> sorted);

// Simple versions for comparison (baseline.cpp).
namespace baseline {
// std::ranges::lower_bound on the sorted array.
Key lower_bound(std::span<const Key> sorted, Key x);
// Binary search without a branch on the keys: the compiler uses a conditional
// move (cmov) instead.
Key branchless_lower_bound(std::span<const Key> sorted, Key x);
}  // namespace baseline

}  // namespace w25
