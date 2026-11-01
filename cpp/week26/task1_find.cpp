// Task 1: find a key. Go down from the root: in an inner node the child to
// follow is node_search(keys, count, key); in the leaf, the same place tells
// where the key is, if it is there.
#include "tasks.hpp"

namespace w26 {

std::optional<Value> BPlusTree::find(Key key) const {
    (void)key;  // TODO
    return std::nullopt;
}

}  // namespace w26
