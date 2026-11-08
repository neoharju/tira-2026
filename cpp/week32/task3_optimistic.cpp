// Task 3: the optimistic insert, and erase. Go down with shared latches,
// coupled, but take the latch of a leaf (a child of a node with level 1, or
// a root that is a leaf) exclusively. Most inserts find room in the leaf;
// for a full leaf, release it and call insert() of task 2. Now
// insert_optimistic calls insert().
#include <algorithm>

#include "btree.hpp"

namespace w32 {

bool ConcurrentTree::insert_optimistic(Key key, Value value) {
    return insert(key, value);  // TODO
}

bool ConcurrentTree::erase(Key key) {
    (void)key;  // TODO
    return false;
}

}  // namespace w32
