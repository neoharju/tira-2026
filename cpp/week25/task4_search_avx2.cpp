// Task 4: rewrite the loops over the 16 keys of a node with AVX2: two
// _mm256_cmpgt_epi32, a mask, and std::popcount.
#include <immintrin.h>

#include "tasks.hpp"

namespace w25 {

Key static_btree_search(const StaticBTree& t, Key x) {
    std::size_t node = 0;
    for (std::size_t level = t.levels() - 1; level > 0; --level) {
        const Key* keys = t.node(level, node);
        std::size_t less = 0;
        while (less < StaticBTree::B && keys[less] < x) ++less;
        node = node * 17 + less;
    }
    const Key* leaf = t.node(0, node);
    std::size_t i = 0;
    while (leaf[i] < x) ++i;
    return leaf[i];
}

}  // namespace w25
