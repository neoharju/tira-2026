// Week 28: a hash map for many threads (task 7).
#pragma once
#include <bit>
#include <cstddef>
#include <memory>
#include <mutex>
#include <optional>
#include <vector>

#include "swiss.hpp"
#include "task5_group_sse.hpp"

namespace w28 {

// Task 7. `shards` Swiss tables (a power of two), each behind its own mutex,
// so that threads that use different shards do not wait for each other. Key k
// belongs to the shard given by the top bits of hash_key(k, seed): each table
// uses the low bits, so the shard must not. Any number of threads may call
// find, insert and erase at the same time.
class ShardedMap {
public:
    explicit ShardedMap(std::size_t shards, std::uint64_t seed = 0);

    std::optional<Value> find(Key key);
    bool insert(Key key, Value value);
    bool erase(Key key);
    std::size_t size();  // the number of keys in all shards

    std::size_t shard_of(Key key) const {
        const auto bits = static_cast<unsigned>(std::countr_zero(shards.size()));
        return bits == 0 ? 0 : static_cast<std::size_t>(hash_key(key, seed) >> (64 - bits));
    }

    // Open for your code. A Shard is aligned to a cache line, so that the
    // mutexes of two shards never share one.
    struct alignas(64) Shard {
        explicit Shard(std::uint64_t s) : map(16, s) {}
        std::mutex mutex;
        SwissMap<SseGroup> map;
    };
    std::vector<std::unique_ptr<Shard>> shards;
    std::uint64_t seed;
};

namespace baseline {
// One Swiss table (your SwissMap of tasks 3-5) behind one mutex.
class LockedMap {
public:
    explicit LockedMap(std::uint64_t seed = 0) : map_(16, seed) {}
    std::optional<Value> find(Key key) {
        std::scoped_lock lock(mutex_);
        return map_.find(key);
    }
    bool insert(Key key, Value value) {
        std::scoped_lock lock(mutex_);
        return map_.insert(key, value);
    }
    bool erase(Key key) {
        std::scoped_lock lock(mutex_);
        return map_.erase(key);
    }

private:
    std::mutex mutex_;
    SwissMap<SseGroup> map_;
};
}  // namespace baseline

}  // namespace w28
