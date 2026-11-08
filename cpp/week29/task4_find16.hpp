// Task 4: the place of byte b among the keys of a Node16, as
// ScalarSearch::find16 (art.hpp), with SSE2: one compare for all 16 keys
// (_mm_loadu_si128, _mm_set1_epi8, _mm_cmpeq_epi8, _mm_movemask_epi8). Only
// keys[0 ... count - 1] mean something. Now this calls the scalar loop.
#pragma once
#include <immintrin.h>

#include <bit>

#include "art.hpp"

namespace w29 {

inline int find16_sse(const Node16& n, std::uint8_t b) {
    return ScalarSearch::find16(n, b);  // TODO
}

}  // namespace w29
