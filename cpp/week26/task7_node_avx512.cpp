// Task 7: rewrite this with AVX-512: eight unsigned keys per compare, into a
// mask register, and masked loads for the last keys.
#include <immintrin.h>

#include "tasks.hpp"

namespace w26 {

[[gnu::target("avx512f")]] std::size_t node_lower_bound_avx512(const Key* keys, std::size_t count, Key x) {
    std::size_t less = 0;
    while (less < count && keys[less] < x) ++less;
    return less;
}

}  // namespace w26
