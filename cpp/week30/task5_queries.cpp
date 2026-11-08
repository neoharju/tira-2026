// Task 5: range queries and the k nearest points in the R-tree, as rtree.hpp
// describes. The lines at the end compile range_query for both node tests
// (call Test::mask for a node). Automatic vectorization is off for this file,
// so that ScalarTest stays scalar.
#include <algorithm>
#include <bit>
#include <queue>

#include "rtree.hpp"
#include "simd_test.hpp"

namespace w30 {

template <class Test>
void range_query(const RTree& t, const Rect& q, std::vector<std::uint32_t>& out) {
    (void)t;  // TODO
    (void)q;
    (void)out;
}

template void range_query<ScalarTest>(const RTree&, const Rect&, std::vector<std::uint32_t>&);
template void range_query<SimdTest>(const RTree&, const Rect&, std::vector<std::uint32_t>&);

std::vector<std::uint32_t> knn(const RTree& t, Point p, std::size_t k) {
    (void)t;  // TODO
    (void)p;
    (void)k;
    return {};
}

}  // namespace w30
