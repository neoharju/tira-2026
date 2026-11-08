// Task 1: find in the adaptive radix tree, as art.hpp describes. The lines at
// the end compile your code for both searches inside a Node16 (Search is
// ScalarSearch or SimdSearch: call Search::find16 for a Node16). Automatic
// vectorization is off for this file, so that ScalarSearch stays scalar.
#include "art.hpp"
#include "simd_search.hpp"

namespace w29 {

template <class Search>
std::optional<Value> Art<Search>::find(Key key) const {
    (void)key;  // TODO
    return std::nullopt;
}

template std::optional<Value> Art<ScalarSearch>::find(Key) const;
template std::optional<Value> Art<SimdSearch>::find(Key) const;

}  // namespace w29
