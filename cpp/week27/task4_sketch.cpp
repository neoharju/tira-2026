// Task 4: the frequency sketch of TinyLFU, as sketch.hpp describes: 4-bit
// counters, 16 in a 64-bit word. Halving all counters of a word at once is
// one shift and one AND.
#include "sketch.hpp"

namespace w27 {

FrequencySketch::FrequencySketch(std::size_t w, std::size_t sample) : width(w), sample_size(sample), words(4 * w / 16, 0) {}

void FrequencySketch::increment(std::uint64_t key) {
    (void)key;  // TODO
}

unsigned FrequencySketch::estimate(std::uint64_t key) const {
    (void)key;  // TODO
    return 0;
}

void FrequencySketch::reset() {
    // TODO
}

}  // namespace w27
