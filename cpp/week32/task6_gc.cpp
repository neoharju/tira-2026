// Task 6: garbage collection, as mvcc.hpp describes. Read the watermark under
// active_mutex (and commit_latch, shared, if no transaction is active), then
// clean one shard at a time with its latch held exclusively. Resetting a
// unique_ptr frees the versions below it (Version's destructor loops).
#include "mvcc.hpp"

namespace w32 {

std::size_t MvccStore::gc() {
    return 0;  // TODO
}

}  // namespace w32
