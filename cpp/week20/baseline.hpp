// Simple versions for the tests and benchmarks of week 20, and the node order.
#pragma once
#include "table.hpp"
#include "tasks.hpp"

namespace w20::baseline {

// Dijkstra with a heap, as in week 18: to all nodes, and from s to t (stops
// when t is settled).
std::vector<Dist> distances_from(const Graph& g, Node source);
Dist dijkstra(const Graph& g, Node source, Node target);

// Tasks 1, 2 and 7 without any optimization: every witness search writes INF
// to all nodes first and runs until its limit.
std::vector<Shortcut> shortcuts_for(const DynGraph& g, Node v, std::span<const std::uint8_t> skip);
Hierarchy contract(const Graph& g, std::span<const Node> order);
Hierarchy contract_parallel(const Graph& g, std::span<const Node> order);

// The node order of the tasks: priority = edge difference + contracted
// neighbours, with lazy updates; ties go to the smaller node. Its witness
// searches stop after 50 settled nodes, so it is fast but only an estimate.
std::vector<Node> node_order(const Graph& g);

// One entry at a time; compiled without automatic vectorization.
void min_plus_row(std::span<const RowDist> space, const Dist* B, std::uint32_t T, Dist* D);

}  // namespace w20::baseline
