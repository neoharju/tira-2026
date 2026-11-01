// Task 6: rewrite this with AVX2, four keys per compare. _mm256_cmpgt_epi64
// compares signed numbers: flip the top bit of both sides first.
// Automatic vectorization is turned off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "tasks.hpp"

namespace w26 {

std::size_t node_lower_bound_avx2(const Key* keys, std::size_t count, Key x) {
    std::size_t less = 0;
    while (less < count && keys[less] < x) ++less;
    return less;
}

}  // namespace w26
