// Week 29: building a whole tree at once (tasks 7 and 8).
#pragma once
#include <algorithm>
#include <span>
#include <vector>

#include "art.hpp"

namespace w29 {

namespace baseline {

// The tree of `items` (different keys, in any order) on one thread: sort a
// copy, then bulk_build.
template <class Search>
Art<Search> build(std::span<const Item> items) {
    std::vector<Item> s(items.begin(), items.end());
    std::ranges::sort(s, {}, &Item::key);
    return bulk_build<Search>(s);
}

}  // namespace baseline

// Tasks 7 and 8. The same tree as baseline::build, built by many threads with
// OpenMP. Split the keys into ranges that do not depend on each other, for
// example by the byte where the root branches, and build the ranges in parallel.
template <class Search>
Art<Search> build_parallel(std::span<const Item> items);

}  // namespace w29
