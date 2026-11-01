// Task 6: the blocked sketch, as sketch.hpp describes, with AVX2: load the
// block (two __m256i, two rows each), bring every row's counter of the key to
// all lanes of its row with _mm256_shuffle_epi8, take the minimum, and add one
// with _mm256_adds_epu8 only in the lanes of the key's counters that are equal
// to it. Automatic vectorization is off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "sketch.hpp"

namespace w27 {

BlockedSketch::BlockedSketch(std::size_t count, std::size_t sample) : sample_size(sample), blocks(count) {}

void BlockedSketch::increment(std::uint64_t key) {
    (void)key;  // TODO
}

unsigned BlockedSketch::estimate(std::uint64_t key) const {
    (void)key;  // TODO
    return 0;
}

void BlockedSketch::reset() {
    // TODO
}

}  // namespace w27
