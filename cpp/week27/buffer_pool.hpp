// Week 27: a disk of pages (simulated in memory), the CLOCK replacer (task 2)
// and the buffer pool (task 3). The given parts are in buffer_pool.cpp.
#pragma once
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <unordered_map>
#include <utility>
#include <vector>

#include "page.hpp"

namespace w27 {

using PageId = std::uint32_t;
using FrameId = std::uint32_t;
inline constexpr PageId no_page = std::numeric_limits<PageId>::max();

// A disk in memory: up to `capacity` pages of 4096 bytes, zeros at first. It
// counts the pages that are read and written: a buffer pool tries to keep
// these numbers small, because a real SSD needs about 100 µs for a read.
// Different threads may read and write different pages at the same time.
class Disk {
public:
    explicit Disk(std::size_t capacity);
    PageId allocate();  // a new page: 0, 1, 2, ... (throws if the disk is full)
    void read(PageId page, std::byte* to);
    void write(PageId page, const std::byte* from);
    std::size_t pages() const { return next_.load(); }
    std::uint64_t reads() const { return reads_.load(); }
    std::uint64_t writes() const { return writes_.load(); }

private:
    struct alignas(64) Block {
        std::byte bytes[page_size];
    };
    std::vector<Block> data_;
    std::atomic<std::uint32_t> next_{0};
    std::atomic<std::uint64_t> reads_{0}, writes_{0};
};

// Task 2. CLOCK replacement. The frames stand in a circle, each with a
// reference bit, and a hand points at one of them: frame 0 at first.
//  - record_access(f) sets the reference bit of frame f.
//  - set_evictable(f, e) says whether frame f may be evicted: a frame whose
//    page is pinned may not. At first no frame is evictable.
//  - evict() returns nothing (and changes nothing) if no frame is evictable.
//    Otherwise it looks at the frame under the hand: a frame that is not
//    evictable is skipped; a frame whose reference bit is set gets the bit
//    cleared and is skipped; otherwise the frame is the victim. After every
//    look, also the one that finds the victim, the hand moves to the next
//    frame (after the last frame comes frame 0). The victim is no longer
//    evictable, and its reference bit is clear.
class ClockReplacer {
public:
    explicit ClockReplacer(std::size_t frames);
    void record_access(FrameId frame);
    void set_evictable(FrameId frame, bool evictable);
    std::optional<FrameId> evict();
    std::size_t size() const;  // the number of evictable frames

    // The state of the replacer, open for your code.
    std::vector<std::uint8_t> referenced, evictable;
    std::size_t hand = 0;
    std::size_t count = 0;  // evictable frames
};

// Task 3. A buffer pool: `frames` frames of 4096 bytes in memory, each holding
// a copy of one page of the disk.
//  - fetch(p) pins page p and returns its bytes. If p is in the pool, the
//    frame's pin count grows by one (a hit). Otherwise (a miss) the pool takes
//    a frame that has never held a page, in the order 0, 1, 2, ..., or, when
//    there is none, asks the replacer for a victim; if the victim's page is
//    dirty it is written to the disk first. Then the page is read into the
//    frame, with pin count 1 and not dirty. If every frame is pinned, fetch
//    returns nullptr and changes nothing.
//  - Every fetch records an access of the frame in the replacer. A frame is
//    evictable exactly when its pin count is 0.
//  - create(p) is fetch of a page p that the caller has just allocated with
//    disk.allocate(), without reading it: the frame is filled with zeros.
//  - unpin(p, dirty) lowers the pin count of p, and marks the page dirty if
//    `dirty`. It returns false if p is not in the pool or not pinned.
//  - flush(p) writes p to the disk if it is dirty, and then it is not dirty;
//    p stays in the pool. It returns false if p is not in the pool.
//    flush_all() flushes every page of the pool, in the order of the frames.
class BufferPool {
public:
    BufferPool(std::size_t frames, Disk& disk);

    std::byte* fetch(PageId page);
    std::byte* create(PageId page);
    bool unpin(PageId page, bool dirty);
    bool flush(PageId page);
    void flush_all();

    // Given (buffer_pool.cpp).
    std::size_t frame_count() const { return page_of.size(); }
    std::byte* frame_data(FrameId frame) { return buffers[frame].bytes; }
    FrameId frame_of(const std::byte* data) const;  // the frame whose bytes start at data
    bool contains(PageId page) const { return table.contains(page); }
    std::uint32_t pin_count(PageId page) const;  // 0 if the page is not in the pool
    bool is_dirty(PageId page) const;            // false if the page is not in the pool

    // The state of the pool, open for your code.
    struct alignas(64) Buffer {
        std::byte bytes[page_size];
    };
    Disk& disk;
    std::vector<Buffer> buffers;          // the frames' bytes
    std::vector<PageId> page_of;          // the page in each frame, or no_page
    std::vector<std::uint32_t> pins;      // the pin count of each frame
    std::vector<std::uint8_t> dirty;      // 1 if the frame's page was changed
    std::unordered_map<PageId, FrameId> table;  // the page table: page -> frame
    std::vector<FrameId> unused;          // frames that never held a page, the next one at the back
    ClockReplacer replacer;
};

}  // namespace w27
