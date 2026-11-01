// Task 5: rewrite this loop with AVX2, 32 bytes at a time. The difference of
// two bytes needs more than 8 bits, and its square more than 16.
// Automatic vectorization is turned off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "tasks.hpp"

namespace w24 {

std::uint32_t l2_squared(const std::uint8_t* a, const std::uint8_t* b, std::size_t dim) {
    std::uint32_t s = 0;
    for (std::size_t i = 0; i < dim; ++i) {
        const int d = a[i] - b[i];
        s += static_cast<std::uint32_t>(d * d);
    }
    return s;
}

}  // namespace w24
