// Task 3: a k-d tree. build_kdtree must reorder the points as described in
// tasks.hpp (std::nth_element finds a median), and kdtree_knn must skip the
// subtrees that cannot have a better point. Now it does not build a tree and
// searches by brute force.
#include <algorithm>
#include <numeric>

#include "tasks.hpp"

namespace w23 {

KdTree build_kdtree(const Dataset& points, std::size_t leaf_size) {
    KdTree tree{points, std::vector<Id>(points.n), leaf_size};
    std::iota(tree.ids.begin(), tree.ids.end(), Id{0});  // TODO: the order of the tree
    return tree;
}

std::vector<Neighbor> kdtree_knn(const KdTree& tree, const float* query, std::size_t k) {
    std::vector<Neighbor> all(tree.points.n);
    for (std::size_t i = 0; i < tree.points.n; ++i) all[i] = {l2_squared(tree.points[i], query, tree.points.dim), tree.ids[i]};
    const std::size_t m = std::min(k, all.size());
    std::ranges::partial_sort(all, all.begin() + static_cast<std::ptrdiff_t>(m));
    all.resize(m);
    return all;
}

}  // namespace w23
