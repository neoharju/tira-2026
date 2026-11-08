// Task 8: many range queries at once with OpenMP, as rtree.hpp describes.
// Now this answers them one after another on one thread.
#include "rtree.hpp"
#include "simd_test.hpp"

namespace w30 {

void range_query_batch(const RTree& t, std::span<const Rect> queries, std::vector<std::vector<std::uint32_t>>& out) {
    out.resize(queries.size());
    for (std::size_t i = 0; i < queries.size(); ++i) {  // TODO
        out[i].clear();
        range_query<SimdTest>(t, queries[i], out[i]);
    }
}

}  // namespace w30
