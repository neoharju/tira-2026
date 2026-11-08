// Task 4: a snapshot read, as mvcc.hpp describes. Hold the latch of the key's
// shard (shared) while you walk its chain, and copy the value out before you
// release it: after that, gc() may free the versions.
#include "mvcc.hpp"

namespace w32 {

std::optional<Value> MvccStore::get(const Txn& t, Key key) {
    (void)t;  // TODO
    (void)key;
    return std::nullopt;
}

}  // namespace w32
