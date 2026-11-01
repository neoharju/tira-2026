// Task 1: rewrite these loops with AVX2 and FMA intrinsics, 8 floats at a
// time, with several accumulators. Do not forget the last dim % 8 values.
// Automatic vectorization is turned off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "tasks.hpp"

namespace w23 {

float l2_squared(const float* a, const float* b, std::size_t dim) {
    float s = 0;
    for (std::size_t i = 0; i < dim; ++i) {
        const float d = a[i] - b[i];
        s += d * d;
    }
    return s;
}

float inner_product(const float* a, const float* b, std::size_t dim) {
    float s = 0;
    for (std::size_t i = 0; i < dim; ++i) s += a[i] * b[i];
    return s;
}

}  // namespace w23
