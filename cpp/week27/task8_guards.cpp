// Task 8: pages with latches. fetch_read and fetch_write pin the page under
// the shard's mutex, unlock the mutex, and only then lock the frame's latch
// (shared or exclusive). release() unlocks the latch first and then unpins.
#include "sharded.hpp"

namespace w27 {

ReadGuard ShardedPool::fetch_read(PageId page) {
    (void)page;  // TODO
    return {};
}

WriteGuard ShardedPool::fetch_write(PageId page) {
    (void)page;  // TODO
    return {};
}

void ReadGuard::release() {
    // TODO: unlock and unpin
    pool = nullptr;
    bytes = nullptr;
    latch = nullptr;
}

void WriteGuard::release() {
    // TODO: unlock and unpin as dirty
    pool = nullptr;
    bytes = nullptr;
    latch = nullptr;
}

}  // namespace w27
