// Task 2: this works, but it stores and sorts all n distances to keep only k
// of them. Keep the best k so far in a heap instead, and use your l2_squared.
#include <algorithm>

#include "tasks.hpp"

namespace w23 {

std::vector<Neighbor> knn(const Dataset& data, const float* query, std::size_t k) {
    std::vector<Neighbor> all(data.n);
    for (std::size_t i = 0; i < data.n; ++i) all[i] = {l2_squared(data[i], query, data.dim), static_cast<Id>(i)};
    std::ranges::sort(all);
    if (all.size() > k) all.resize(k);
    return all;
}

}  // namespace w23
