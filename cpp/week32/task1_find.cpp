// Task 1: find and scan with shared latches, coupled: latch the child, then
// release the parent. Take root_latch (shared) before the latch of the root
// node, and release it after. Release every latch that you take, also when
// the key is not there.
#include "btree.hpp"

namespace w32 {

std::optional<Value> ConcurrentTree::find(Key key) {
    (void)key;  // TODO
    return std::nullopt;
}

void ConcurrentTree::scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out) {
    (void)lo;  // TODO
    (void)hi;
    (void)out;
}

}  // namespace w32
