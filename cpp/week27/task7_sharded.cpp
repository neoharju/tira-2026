// Task 7: the sharded buffer pool. Now it has one shard with all the frames,
// so every thread waits for the same mutex. Make `shards` shards, each with
// frames / shards frames, and lock only the shard of the page.
#include "sharded.hpp"

namespace w27 {

ShardedPool::ShardedPool(std::size_t frames, std::size_t count, Disk& d) : disk(d) {
    (void)count;  // TODO
    shards.push_back(std::make_unique<Shard>(frames, d));
}

std::byte* ShardedPool::fetch(PageId page) {
    Shard& s = *shards[shard_of(page)];
    std::scoped_lock lock(s.mutex);
    return s.pool.fetch(page);
}

std::pair<PageId, std::byte*> ShardedPool::create() {
    const PageId page = disk.allocate();
    Shard& s = *shards[shard_of(page)];
    std::scoped_lock lock(s.mutex);
    return {page, s.pool.create(page)};
}

bool ShardedPool::unpin(PageId page, bool dirty) {
    Shard& s = *shards[shard_of(page)];
    std::scoped_lock lock(s.mutex);
    return s.pool.unpin(page, dirty);
}

void ShardedPool::flush_all() {
    for (auto& s : shards) {
        std::scoped_lock lock(s->mutex);
        s->pool.flush_all();
    }
}

}  // namespace w27
