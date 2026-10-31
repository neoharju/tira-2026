// Task 7: the ALT bound for 16 landmarks with AVX2 intrinsics. Automatic
// vectorization is turned off for this file, so the speed must come from your
// intrinsics. This version works, one landmark at a time.
#include <immintrin.h>

#include <algorithm>

#include "tasks.hpp"

namespace w19 {

Dist alt_bound16(const LandmarkRow16& v, const LandmarkRow16& t) {
    std::int32_t best = 0;
    for (int i = 0; i < 16; ++i) {
        best = std::max(best, t.from[i] - v.from[i]);
        best = std::max(best, v.to[i] - t.to[i]);
    }
    return static_cast<Dist>(best);
}

}  // namespace w19
