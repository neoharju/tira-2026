// Task 6: the node test of a range query with AVX2: bit i of the result is 1
// when the box of slot i meets q, as ScalarTest::mask (rtree.hpp). Each of
// the four coordinates is an array of 8 floats in the node, one aligned
// register. Now this calls the scalar test.
#pragma once
#include <immintrin.h>

#include "rtree.hpp"

namespace w30 {

inline unsigned intersect_mask_avx2(const Node& n, const Rect& q) {
    return ScalarTest::mask(n, q);  // TODO
}

}  // namespace w30
