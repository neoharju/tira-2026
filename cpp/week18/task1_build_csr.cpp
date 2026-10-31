// Task 1: this works, but sorting takes O(m log m) time. Build the CSR arrays
// in O(n + m) time with counting: count the arcs of each node, turn the
// counts into offsets with a prefix sum, then put every arc in its place.
#include <algorithm>
#include <numeric>

#include "tasks.hpp"

namespace w18 {

Graph build_csr(Node nodes, std::span<const Edge> edges) {
    std::vector<std::uint32_t> order(edges.size());
    std::iota(order.begin(), order.end(), 0);
    std::ranges::stable_sort(order, {}, [&](std::uint32_t i) { return edges[i].from; });
    Graph g;
    g.offset.assign(nodes + 1, 0);
    for (const Edge& e : edges) ++g.offset[e.from + 1];
    for (Node v = 0; v < nodes; ++v) g.offset[v + 1] += g.offset[v];
    for (std::uint32_t i : order) {
        g.target.push_back(edges[i].to);
        g.weight.push_back(edges[i].weight);
    }
    return g;
}

}  // namespace w18
