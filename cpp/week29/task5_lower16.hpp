// Task 5: the number of keys of a Node16 that are less than byte b, as
// ScalarSearch::lower16 (art.hpp), with SSE2. _mm_cmplt_epi8 compares signed
// bytes, and the keys are unsigned: see the chapter. Only keys[0 ... count - 1]
// mean something. Now this calls the scalar loop.
#pragma once
#include <immintrin.h>

#include <bit>

#include "art.hpp"

namespace w29 {

inline int lower16_sse(const Node16& n, std::uint8_t b) {
    return ScalarSearch::lower16(n, b);  // TODO
}

}  // namespace w29
