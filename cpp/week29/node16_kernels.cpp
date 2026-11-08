#include "node16_kernels.hpp"

#include <algorithm>
#include <numeric>
#include <random>

#include "simd_search.hpp"

namespace w29 {

std::vector<Node16> random_node16s(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Node16> nodes(n);
    std::vector<std::uint8_t> all(256);
    std::iota(all.begin(), all.end(), std::uint8_t{0});
    for (Node16& m : nodes) {
        m = Node16{};
        m.kind = Kind::node16;
        m.count = static_cast<std::uint16_t>(5 + rng() % 12);
        std::ranges::shuffle(all, rng);
        std::copy_n(all.begin(), m.count, m.keys);
        std::sort(m.keys, m.keys + m.count);
    }
    return nodes;
}

std::vector<Query16> random_queries16(std::span<const Node16> nodes, std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Query16> q(n);
    for (Query16& x : q) {
        x.node = static_cast<std::uint32_t>(rng() % nodes.size());
        const Node16& m = nodes[x.node];
        x.byte = rng() % 2 ? m.keys[rng() % m.count] : static_cast<std::uint8_t>(rng());
    }
    return q;
}

template <class Search>
std::uint64_t sum_find16(std::span<const Node16> nodes, std::span<const Query16> queries) {
    std::uint64_t s = 0;
    for (const Query16& q : queries) s += static_cast<std::uint64_t>(Search::find16(nodes[q.node], q.byte) + 1);
    return s;
}

template <class Search>
std::uint64_t sum_lower16(std::span<const Node16> nodes, std::span<const Query16> queries) {
    std::uint64_t s = 0;
    for (const Query16& q : queries) s += static_cast<std::uint64_t>(Search::lower16(nodes[q.node], q.byte));
    return s;
}

template std::uint64_t sum_find16<ScalarSearch>(std::span<const Node16>, std::span<const Query16>);
template std::uint64_t sum_find16<SimdSearch>(std::span<const Node16>, std::span<const Query16>);
template std::uint64_t sum_lower16<ScalarSearch>(std::span<const Node16>, std::span<const Query16>);
template std::uint64_t sum_lower16<SimdSearch>(std::span<const Node16>, std::span<const Query16>);

}  // namespace w29
