// Task 5: the search with AVX-512: one compare of the 16 keys of a node into a
// mask register (__mmask16). Now this calls your AVX2 search of task 4.
#include <immintrin.h>

#include "tasks.hpp"

namespace w25 {

[[gnu::target("avx512f")]] Key static_btree_search_avx512(const StaticBTree& t, Key x) {
    return static_btree_search(t, x);  // TODO
}

}  // namespace w25
