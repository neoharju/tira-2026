// Task 6: one row of a distance table with AVX2 intrinsics. Automatic
// vectorization is turned off for this file, so the speed must come from your
// intrinsics. This version works, one entry at a time.
#include <immintrin.h>

#include <algorithm>

#include "tasks.hpp"

namespace w20 {

void min_plus_row(std::span<const RowDist> space, const Dist* B, std::uint32_t T, Dist* D) {
    std::fill(D, D + T, BIG);
    for (auto [row, d] : space) {
        const Dist* b = B + std::size_t{row} * T;
        for (std::uint32_t j = 0; j < T; ++j) D[j] = std::min(D[j], d + b[j]);
    }
}

}  // namespace w20
