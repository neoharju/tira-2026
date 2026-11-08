// Task 1: Morton keys with BMI2, as geo.hpp describes. _pdep_u64(v, mask)
// puts the low bits of v into the places of the 1 bits of the mask, in order,
// and _pext_u64(v, mask) takes the bits of v at the 1 bits of the mask out
// again. Now these call the baselines, which handle one bit at a time.
#include <immintrin.h>

#include "geo.hpp"

namespace w30 {

std::uint64_t morton_encode(std::uint32_t x, std::uint32_t y) {
    return baseline::morton_encode(x, y);  // TODO
}

std::pair<std::uint32_t, std::uint32_t> morton_decode(std::uint64_t key) {
    return baseline::morton_decode(key);  // TODO
}

}  // namespace w30
