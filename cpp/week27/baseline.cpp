// The baselines of week 27: LRU replacement and the textbook Count-Min sketch.
#include "tasks.hpp"

namespace w27 {

namespace baseline {

LruReplacer::LruReplacer(std::size_t frames) : prev_(frames + 1), next_(frames + 1), in_list_(frames, 0) {
    const auto head = static_cast<FrameId>(frames);
    prev_[head] = next_[head] = head;
}

void LruReplacer::unlink(FrameId f) {
    next_[prev_[f]] = next_[f];
    prev_[next_[f]] = prev_[f];
}

void LruReplacer::link_front(FrameId f) {
    const auto head = static_cast<FrameId>(in_list_.size());
    next_[f] = next_[head];
    prev_[f] = head;
    prev_[next_[head]] = f;
    next_[head] = f;
}

void LruReplacer::record_access(FrameId frame) {
    if (in_list_[frame]) {
        unlink(frame);
        link_front(frame);
    }
}

void LruReplacer::set_evictable(FrameId frame, bool evictable) {
    if (evictable && !in_list_[frame]) {
        link_front(frame);
        in_list_[frame] = 1;
        ++count_;
    } else if (!evictable && in_list_[frame]) {
        unlink(frame);
        in_list_[frame] = 0;
        --count_;
    }
}

std::optional<FrameId> LruReplacer::evict() {
    if (count_ == 0) return std::nullopt;
    const FrameId victim = prev_[in_list_.size()];  // the least recent end
    unlink(victim);
    in_list_[victim] = 0;
    --count_;
    return victim;
}

CountMinSketch::CountMinSketch(std::size_t w) : width(w), counters(4 * w, 0) {}

void CountMinSketch::increment(std::uint64_t key) {
    const std::uint64_t h = mix(key);
    std::uint8_t* c[4];
    unsigned smallest = 255;
    for (unsigned r = 0; r < 4; ++r) {
        c[r] = &counters[r * width + row_index(h, r, width)];
        smallest = std::min<unsigned>(smallest, *c[r]);
    }
    if (smallest == 255) return;
    for (unsigned r = 0; r < 4; ++r)
        if (*c[r] == smallest) ++*c[r];
}

unsigned CountMinSketch::estimate(std::uint64_t key) const {
    const std::uint64_t h = mix(key);
    unsigned m = 255;
    for (unsigned r = 0; r < 4; ++r) m = std::min<unsigned>(m, counters[r * width + row_index(h, r, width)]);
    return m;
}

}  // namespace baseline

}  // namespace w27
