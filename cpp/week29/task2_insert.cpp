// Task 2: insert into the adaptive radix tree, as art.hpp describes: lazy
// expansion, splitting a compressed path, and growing a full node into the
// next kind. The lines at the end compile your code for both searches inside
// a Node16 (call Search::find16 and Search::lower16 for a Node16). Automatic
// vectorization is off for this file.
#include "art.hpp"
#include "simd_search.hpp"

namespace w29 {

template <class Search>
bool Art<Search>::insert(Key key, Value value) {
    (void)key;  // TODO
    (void)value;
    return false;
}

template bool Art<ScalarSearch>::insert(Key, Value);
template bool Art<SimdSearch>::insert(Key, Value);

}  // namespace w29
