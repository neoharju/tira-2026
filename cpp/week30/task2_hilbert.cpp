// Task 2: Hilbert keys, the same numbers as baseline::hilbert_encode. The
// loop of the baseline handles 1 bit of x and y per round, and its branches
// depend on the bits. A faster way (see the chapter): a state machine that
// reads the Morton key of task 1, 8 bits (4 rounds) at a time, with a table
// of 4 states x 256 bytes. Now this calls the baseline.
#include "geo.hpp"

namespace w30 {

std::uint64_t hilbert_encode(std::uint32_t x, std::uint32_t y) {
    return baseline::hilbert_encode(x, y);  // TODO
}

}  // namespace w30
