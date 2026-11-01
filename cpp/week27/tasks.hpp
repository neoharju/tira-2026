// Week 27: everything that the tests and the benchmarks use. The tasks are
// methods of the classes in these headers:
//   task 1: SlottedPage::insert, erase, compact         (page.hpp)
//   task 2: ClockReplacer                               (buffer_pool.hpp)
//   task 3: BufferPool::fetch, create, unpin, flush     (buffer_pool.hpp)
//   task 4: FrequencySketch                             (sketch.hpp)
//   task 5: WTinyLfu                                    (task5_wtinylfu.hpp)
//   task 6: BlockedSketch                               (sketch.hpp)
//   task 7: ShardedPool                                 (sharded.hpp)
//   task 8: ShardedPool::fetch_read, fetch_write, ReadGuard and WriteGuard
#pragma once
#include <optional>

#include "buffer_pool.hpp"
#include "cache.hpp"
#include "page.hpp"
#include "sharded.hpp"
#include "sketch.hpp"
#include "task5_wtinylfu.hpp"

namespace w27::baseline {

// LRU replacement, with the interface of ClockReplacer: evicts the evictable
// frame that was accessed (or became evictable) longest ago. The evictable
// frames are kept in a doubly linked list in that order, made of two arrays
// of links, so that every operation is a few steps without allocation.
class LruReplacer {
public:
    explicit LruReplacer(std::size_t frames);
    void record_access(FrameId frame);
    void set_evictable(FrameId frame, bool evictable);
    std::optional<FrameId> evict();
    std::size_t size() const { return count_; }

private:
    void unlink(FrameId f);
    void link_front(FrameId f);
    std::vector<FrameId> prev_, next_;  // index frames is the head of the list
    std::vector<std::uint8_t> in_list_;
    std::size_t count_ = 0;
};

}  // namespace w27::baseline
