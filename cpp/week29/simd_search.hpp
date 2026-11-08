// The SIMD search inside a Node16 that the tree uses with Art<SimdSearch>:
// task 4 (find16_sse) and task 5 (lower16_sse).
#pragma once
#include "art.hpp"
#include "task4_find16.hpp"
#include "task5_lower16.hpp"

namespace w29 {

struct SimdSearch {
    static int find16(const Node16& n, std::uint8_t b) { return find16_sse(n, b); }
    static int lower16(const Node16& n, std::uint8_t b) { return lower16_sse(n, b); }
};

}  // namespace w29
