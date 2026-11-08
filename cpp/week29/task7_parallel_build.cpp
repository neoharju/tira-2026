// Tasks 7 and 8: build_parallel (build.hpp) with OpenMP. Now this calls the
// one-thread baseline: sort, then bulk_build. A tree's subtrees do not depend
// on each other: group the items by the byte where the root branches, and
// build the groups in parallel; a group that is too large for one thread
// (task 8) must be split again. bulk_build_nodes (art.hpp) builds the subtree
// of a sorted group, and new_inner and append_child make a node above them.
// The lines at the end compile your code for both searches inside a Node16.
#include <omp.h>

#include "build.hpp"
#include "simd_search.hpp"

namespace w29 {

template <class Search>
Art<Search> build_parallel(std::span<const Item> items) {
    return baseline::build<Search>(items);  // TODO
}

template Art<ScalarSearch> build_parallel<ScalarSearch>(std::span<const Item>);
template Art<SimdSearch> build_parallel<SimdSearch>(std::span<const Item>);

}  // namespace w29
