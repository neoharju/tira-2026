// Task 7: the sharded map. Now it has one shard, so every thread waits for
// the same mutex. Make `count` shards and lock only the shard of the key.
#include "sharded_map.hpp"

namespace w28 {

ShardedMap::ShardedMap(std::size_t count, std::uint64_t s) : seed(s) {
    (void)count;  // TODO
    shards.push_back(std::make_unique<Shard>(s));
}

std::optional<Value> ShardedMap::find(Key key) {
    Shard& sh = *shards.front();
    std::scoped_lock lock(sh.mutex);
    return sh.map.find(key);
}

bool ShardedMap::insert(Key key, Value value) {
    Shard& sh = *shards.front();
    std::scoped_lock lock(sh.mutex);
    return sh.map.insert(key, value);
}

bool ShardedMap::erase(Key key) {
    Shard& sh = *shards.front();
    std::scoped_lock lock(sh.mutex);
    return sh.map.erase(key);
}

std::size_t ShardedMap::size() {
    std::size_t n = 0;
    for (auto& sh : shards) {
        std::scoped_lock lock(sh->mutex);
        n += sh->map.size();
    }
    return n;
}

}  // namespace w28
