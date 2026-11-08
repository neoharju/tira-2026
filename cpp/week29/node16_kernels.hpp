// The loops that the benchmarks of tasks 4 and 5 measure. They are compiled
// without automatic vectorization (node16_kernels.cpp), so that ScalarSearch
// stays scalar and SimdSearch is your SIMD code.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

#include "art.hpp"

namespace w29 {

struct Query16 {
    std::uint32_t node;  // a place in the array of nodes
    std::uint8_t byte;
};

// n Node16s with 5 to 16 different random bytes each (the children are nullptr).
std::vector<Node16> random_node16s(std::size_t n, std::uint64_t seed);
// n queries: half of them for a byte that the node has, half for a random byte.
std::vector<Query16> random_queries16(std::span<const Node16> nodes, std::size_t n, std::uint64_t seed);

// The sum of find16 + 1 over all queries.
template <class Search>
std::uint64_t sum_find16(std::span<const Node16> nodes, std::span<const Query16> queries);
// The sum of lower16 over all queries.
template <class Search>
std::uint64_t sum_lower16(std::span<const Node16> nodes, std::span<const Query16> queries);

}  // namespace w29
