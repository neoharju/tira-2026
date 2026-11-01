// Task 3: the buffer pool, with your CLOCK replacer of task 2, exactly as
// buffer_pool.hpp describes: the tests count the pages that are read and
// written.
#include "buffer_pool.hpp"

namespace w27 {

std::byte* BufferPool::fetch(PageId page) {
    (void)page;  // TODO
    return nullptr;
}

std::byte* BufferPool::create(PageId page) {
    (void)page;  // TODO
    return nullptr;
}

bool BufferPool::unpin(PageId page, bool is_dirty) {
    (void)page;  // TODO
    (void)is_dirty;
    return false;
}

bool BufferPool::flush(PageId page) {
    (void)page;  // TODO
    return false;
}

void BufferPool::flush_all() {
    // TODO
}

}  // namespace w27
