// Task 5: rewrite this loop with AVX2 intrinsics, 4 nodes at a time.
// Automatic vectorization is turned off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include <cmath>

#include "tasks.hpp"

namespace w22 {

Update update_ranks(std::span<const double> sum, std::span<const double> x, std::span<const double> inv_degree, double base,
                    double d, std::span<double> y, std::span<double> contrib) {
    Update u{0, 0};
    for (std::size_t v = 0; v < sum.size(); ++v) {
        y[v] = base + d * sum[v];
        contrib[v] = y[v] * inv_degree[v];
        u.change += std::abs(y[v] - x[v]);
        if (inv_degree[v] == 0) u.dangling += y[v];
    }
    return u;
}

}  // namespace w22
