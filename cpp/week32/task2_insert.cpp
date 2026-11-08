// Task 2: insert with exclusive latch coupling. Keep the latched nodes in an
// array (the path). When a newly latched child has room for one more key, it
// will not split, so nothing above it changes: release all latches above it,
// and root_latch if you still hold it. At the leaf, insert_into_path does the
// rest. Now this calls insert_coarse, which never releases early.
#include "btree.hpp"

namespace w32 {

bool ConcurrentTree::insert(Key key, Value value) {
    return insert_coarse(key, value);  // TODO
}

}  // namespace w32
