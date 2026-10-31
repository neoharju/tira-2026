// The scalar baseline of task 7, compiled without automatic vectorization.
#include <algorithm>

#include "baseline.hpp"

namespace w19::baseline {

Dist alt_bound16(const LandmarkRow16& v, const LandmarkRow16& t) {
    std::int32_t best = 0;
    for (int i = 0; i < 16; ++i) {
        best = std::max(best, t.from[i] - v.from[i]);
        best = std::max(best, v.to[i] - t.to[i]);
    }
    return static_cast<Dist>(best);
}

}  // namespace w19::baseline
