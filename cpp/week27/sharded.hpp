// Week 27: a buffer pool for many threads (task 7) and pages with latches
// (task 8). The given parts are in sharded.cpp.
#pragma once
#include <cstddef>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <utility>
#include <vector>

#include "buffer_pool.hpp"
#include "sketch.hpp"

namespace w27 {

class ReadGuard;
class WriteGuard;

// Task 7. A buffer pool for many threads: `shards` buffer pools (a power of
// two) of frames / shards frames each, every one with its own mutex, so that
// threads that use pages of different shards do not wait for each other.
// Page p belongs to shard shard_of(p). fetch, create, unpin and flush_all do
// what the methods of BufferPool do, and any number of threads may call them
// at the same time. The bytes that fetch returns stay valid while the page is
// pinned. create() allocates a new page from the disk and creates it in its
// shard; it returns {page, nullptr} if every frame of that shard is pinned.
class ShardedPool {
public:
    ShardedPool(std::size_t frames, std::size_t shards, Disk& disk);

    std::byte* fetch(PageId page);
    std::pair<PageId, std::byte*> create();
    bool unpin(PageId page, bool dirty);
    void flush_all();

    // Task 8. Pins the page and locks the latch of its frame: shared for a
    // ReadGuard (any number of readers at a time), exclusive for a WriteGuard
    // (one writer and no readers). The guard unlocks and unpins when it is
    // destroyed or released; a WriteGuard unpins the page as dirty. The guard
    // is empty (false) if every frame of the shard is pinned. Never wait for a
    // latch while you hold the mutex of a shard.
    ReadGuard fetch_read(PageId page);
    WriteGuard fetch_write(PageId page);

    std::size_t shard_of(PageId page) const { return mix(page) & (shards.size() - 1); }

    // The state of the pool, open for your code. A Shard is aligned to a cache
    // line so that the mutexes of two shards never share one.
    struct alignas(64) Shard {
        Shard(std::size_t frames, Disk& d) : pool(frames, d), latches(frames) {}
        std::mutex mutex;
        BufferPool pool;
        std::vector<std::shared_mutex> latches;  // one per frame of the pool (task 8)
    };
    Disk& disk;
    std::vector<std::unique_ptr<Shard>> shards;
};

// A pinned page whose latch is held for reading. It can be moved but not
// copied; the moved-from guard is empty.
class ReadGuard {
public:
    ReadGuard() = default;
    ReadGuard(ShardedPool* p, PageId pg, const std::byte* b, std::shared_mutex* l) : pool(p), page(pg), bytes(b), latch(l) {}
    ReadGuard(ReadGuard&& other) noexcept;
    ReadGuard& operator=(ReadGuard&& other) noexcept;
    ~ReadGuard() { release(); }
    // Task 8. Unlocks the latch, unpins the page and empties the guard. Does
    // nothing if the guard is empty.
    void release();
    explicit operator bool() const { return bytes != nullptr; }

    ShardedPool* pool = nullptr;
    PageId page = no_page;
    const std::byte* bytes = nullptr;
    std::shared_mutex* latch = nullptr;
};

// A pinned page whose latch is held for writing.
class WriteGuard {
public:
    WriteGuard() = default;
    WriteGuard(ShardedPool* p, PageId pg, std::byte* b, std::shared_mutex* l) : pool(p), page(pg), bytes(b), latch(l) {}
    WriteGuard(WriteGuard&& other) noexcept;
    WriteGuard& operator=(WriteGuard&& other) noexcept;
    ~WriteGuard() { release(); }
    // Task 8. Unlocks the latch, unpins the page as dirty and empties the
    // guard. Does nothing if the guard is empty.
    void release();
    explicit operator bool() const { return bytes != nullptr; }

    ShardedPool* pool = nullptr;
    PageId page = no_page;
    std::byte* bytes = nullptr;
    std::shared_mutex* latch = nullptr;
};

namespace baseline {
// One buffer pool (your BufferPool of task 3) behind one mutex.
class LockedPool {
public:
    LockedPool(std::size_t frames, Disk& disk) : pool_(frames, disk) {}
    std::byte* fetch(PageId page) {
        std::scoped_lock lock(mutex_);
        return pool_.fetch(page);
    }
    bool unpin(PageId page, bool dirty) {
        std::scoped_lock lock(mutex_);
        return pool_.unpin(page, dirty);
    }

private:
    std::mutex mutex_;
    BufferPool pool_;
};
}  // namespace baseline

}  // namespace w27
