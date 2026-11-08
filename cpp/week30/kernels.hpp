// The loops that the benchmark of task 6 measures. They are compiled without
// automatic vectorization (kernels.cpp), so that ScalarTest stays scalar and
// SimdTest is your SIMD code.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

#include "rtree.hpp"

namespace w30 {

struct NodeQuery {
    std::uint32_t node;  // a place in the array of nodes
    Rect q;
};

// n nodes with 1 to 8 random boxes, and queries that meet about half of them.
std::vector<Node> random_nodes(std::size_t n, std::uint64_t seed);
std::vector<NodeQuery> random_node_queries(std::span<const Node> nodes, std::size_t n, std::uint64_t seed);

// The number of slots that meet their query, over all queries.
template <class Test>
std::uint64_t sum_masks(std::span<const Node> nodes, std::span<const NodeQuery> queries);

}  // namespace w30
