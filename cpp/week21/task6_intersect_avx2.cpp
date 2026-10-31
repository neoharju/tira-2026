// Task 6: rewrite this with AVX2 intrinsics: compare 8 values of a with 8
// values of b at a time (see the chapter). Automatic vectorization is turned
// off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "tasks.hpp"

namespace w21 {

std::size_t intersect_avx2(std::span<const std::uint32_t> a, std::span<const std::uint32_t> b, std::uint32_t* out) {
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

}  // namespace w21
