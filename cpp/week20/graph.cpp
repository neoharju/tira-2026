#include "graph.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>

namespace w20 {

Graph build_csr(Node nodes, std::span<const Edge> edges) {
    std::vector<std::uint32_t> order(edges.size());
    std::iota(order.begin(), order.end(), 0);
    std::ranges::stable_sort(order, {}, [&](std::uint32_t i) { return edges[i].from; });
    Graph g;
    g.offset.assign(nodes + 1, 0);
    for (const Edge& e : edges) ++g.offset[e.from + 1];
    for (Node v = 0; v < nodes; ++v) g.offset[v + 1] += g.offset[v];
    g.target.reserve(edges.size());
    g.weight.reserve(edges.size());
    for (std::uint32_t i : order) {
        g.target.push_back(edges[i].to);
        g.weight.push_back(edges[i].weight);
    }
    return g;
}

Graph road_grid(Node width, Node height, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_real_distribution<double> jitter(-30.0, 30.0), slow(1.0, 3.0), coin(0.0, 1.0);
    const Node n = width * height;
    std::vector<double> x(n), y(n);
    for (Node v = 0; v < n; ++v) {
        x[v] = (v % width) * 100.0 + jitter(rng);
        y[v] = (v / width) * 100.0 + jitter(rng);
    }
    std::vector<Edge> edges;
    auto link = [&](Node a, Node b) {
        auto w = static_cast<std::uint32_t>(std::lround(std::hypot(x[a] - x[b], y[a] - y[b]) * slow(rng)));
        edges.push_back({a, b, w});
        edges.push_back({b, a, w});
    };
    for (Node v = 0; v < n; ++v) {
        if (v % width + 1 < width) link(v, v + 1);
        if (v / width + 1 < height && (v % width == 0 || coin(rng) < 0.4)) link(v, v + width);
    }
    std::shuffle(edges.begin(), edges.end(), rng);
    return build_csr(n, edges);
}

std::vector<Query> random_queries(Node nodes, std::size_t count, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<Node> node(0, nodes - 1);
    std::vector<Query> q(count);
    for (auto& [s, t] : q) s = node(rng), t = node(rng);
    return q;
}

}  // namespace w20
