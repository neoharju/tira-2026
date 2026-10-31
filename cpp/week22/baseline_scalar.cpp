// The scalar update for task 5, compiled without automatic vectorization (see
// CMakeLists.txt).
#include <cmath>

#include "tasks.hpp"

namespace w22::baseline {

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

}  // namespace w22::baseline
