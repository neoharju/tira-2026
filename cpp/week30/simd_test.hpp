// The SIMD node test that range_query uses with SimdTest (task 6).
#pragma once
#include "rtree.hpp"
#include "task6_node_avx2.hpp"

namespace w30 {

struct SimdTest {
    static unsigned mask(const Node& n, const Rect& q) { return intersect_mask_avx2(n, q); }
};

}  // namespace w30
