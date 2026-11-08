#include "kernels.hpp"

#include <bit>
#include <random>

#include "simd_test.hpp"

namespace w30 {

std::vector<Node> random_nodes(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Node> nodes(n);
    for (Node& x : nodes) {
        x.count = static_cast<std::uint16_t>(1 + rng() % fanout);
        x.level = 1;
        for (unsigned i = 0; i < fanout; ++i) {
            const bool used = i < x.count;
            const auto cx = static_cast<float>(rng() % 10'000), cy = static_cast<float>(rng() % 10'000);
            const auto w = static_cast<float>(rng() % 3'000), hh = static_cast<float>(rng() % 3'000);
            x.min_x[i] = used ? cx : inf;
            x.min_y[i] = used ? cy : inf;
            x.max_x[i] = used ? cx + w : -inf;
            x.max_y[i] = used ? cy + hh : -inf;
            x.child[i] = i;
        }
    }
    return nodes;
}

std::vector<NodeQuery> random_node_queries(std::span<const Node> nodes, std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<NodeQuery> q(n);
    for (NodeQuery& x : q) {
        const auto cx = static_cast<float>(rng() % 10'000), cy = static_cast<float>(rng() % 10'000), w = static_cast<float>(1'000 + rng() % 4'000);
        x = {static_cast<std::uint32_t>(rng() % nodes.size()), {cx, cy, cx + w, cy + w}};
    }
    return q;
}

template <class Test>
std::uint64_t sum_masks(std::span<const Node> nodes, std::span<const NodeQuery> queries) {
    std::uint64_t s = 0;
    for (const NodeQuery& x : queries) s += static_cast<std::uint64_t>(std::popcount(Test::mask(nodes[x.node], x.q)));
    return s;
}

template std::uint64_t sum_masks<ScalarTest>(std::span<const Node>, std::span<const NodeQuery>);
template std::uint64_t sum_masks<SimdTest>(std::span<const Node>, std::span<const NodeQuery>);

}  // namespace w30
