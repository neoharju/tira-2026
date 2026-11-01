// The given parts of the disk and the buffer pool.
#include <algorithm>
#include <cstring>
#include <stdexcept>

#include "buffer_pool.hpp"

namespace w27 {

Disk::Disk(std::size_t capacity) : data_(capacity) {}

PageId Disk::allocate() {
    const PageId page = next_.fetch_add(1);
    if (page >= data_.size()) throw std::length_error("Disk::allocate: the disk is full");
    return page;
}

void Disk::read(PageId page, std::byte* to) {
    if (page >= next_.load()) throw std::out_of_range("Disk::read: the page was not allocated");
    std::memcpy(to, data_[page].bytes, page_size);
    reads_.fetch_add(1, std::memory_order_relaxed);
}

void Disk::write(PageId page, const std::byte* from) {
    if (page >= next_.load()) throw std::out_of_range("Disk::write: the page was not allocated");
    std::memcpy(data_[page].bytes, from, page_size);
    writes_.fetch_add(1, std::memory_order_relaxed);
}

BufferPool::BufferPool(std::size_t frames, Disk& d)
    : disk(d), buffers(frames), page_of(frames, no_page), pins(frames, 0), dirty(frames, 0), replacer(frames) {
    table.reserve(frames);
    for (std::size_t f = frames; f-- > 0;) unused.push_back(static_cast<FrameId>(f));
}

FrameId BufferPool::frame_of(const std::byte* data) const {
    return static_cast<FrameId>((data - buffers[0].bytes) / static_cast<std::ptrdiff_t>(sizeof(Buffer)));
}

std::uint32_t BufferPool::pin_count(PageId page) const {
    const auto it = table.find(page);
    return it == table.end() ? 0 : pins[it->second];
}

bool BufferPool::is_dirty(PageId page) const {
    const auto it = table.find(page);
    return it != table.end() && dirty[it->second];
}

}  // namespace w27
