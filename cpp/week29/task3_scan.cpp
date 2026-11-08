// Task 3: the range scan of the adaptive radix tree, as art.hpp describes:
// the keys in increasing order, from the first key >= lo. The lines at the
// end compile your code for both searches inside a Node16 (call
// Search::lower16 for a Node16). Automatic vectorization is off for this file.
#include "art.hpp"
#include "simd_search.hpp"

namespace w29 {

template <class Search>
void Art<Search>::scan(Key lo, Key hi, std::vector<Item>& out) const {
    (void)lo;  // TODO
    (void)hi;
    (void)out;
}

template void Art<ScalarSearch>::scan(Key, Key, std::vector<Item>&) const;
template void Art<SimdSearch>::scan(Key, Key, std::vector<Item>&) const;

}  // namespace w29
