// Task 2: CLOCK replacement, exactly as buffer_pool.hpp describes, so that the
// tests can check every victim.
#include "buffer_pool.hpp"

namespace w27 {

ClockReplacer::ClockReplacer(std::size_t frames) : referenced(frames, 0), evictable(frames, 0) {}

void ClockReplacer::record_access(FrameId frame) {
    (void)frame;  // TODO
}

void ClockReplacer::set_evictable(FrameId frame, bool e) {
    (void)frame;  // TODO
    (void)e;
}

std::optional<FrameId> ClockReplacer::evict() {
    return std::nullopt;  // TODO
}

std::size_t ClockReplacer::size() const { return count; }

}  // namespace w27
