// The scalar intersection for task 6, compiled without automatic
// vectorization (see CMakeLists.txt). It has no branches that depend on the
// data, which makes it about twice as fast as std::set_intersection.
#include "tasks.hpp"

namespace w21::baseline {

std::size_t intersect_scalar(std::span<const std::uint32_t> a, std::span<const std::uint32_t> b, std::uint32_t* out) {
    std::size_t i = 0, j = 0, k = 0;
    while (i < a.size() && j < b.size()) {
        const std::uint32_t x = a[i], y = b[j];
        out[k] = x;
        k += x == y;
        i += x <= y;
        j += y <= x;
    }
    return k;
}

}  // namespace w21::baseline
