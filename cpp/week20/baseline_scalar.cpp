// The scalar baseline of task 6, compiled without automatic vectorization.
#include <algorithm>

#include "baseline.hpp"

namespace w20::baseline {

void min_plus_row(std::span<const RowDist> space, const Dist* B, std::uint32_t T, Dist* D) {
    std::fill(D, D + T, BIG);
    for (auto [row, d] : space) {
        const Dist* b = B + std::size_t{row} * T;
        for (std::uint32_t j = 0; j < T; ++j) D[j] = std::min(D[j], d + b[j]);
    }
}

}  // namespace w20::baseline
