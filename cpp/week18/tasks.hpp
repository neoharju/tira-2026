// Week 18: the functions that you write in tasks 1, 3 and 7. Task 2 and the
// rest of task 3 are in dijkstra.hpp, tasks 4-6 in heap4.hpp,
// task5_min_child_avx512.cpp and task6_min_child_avx2.cpp, and task 8 in
// workspace.hpp.
#pragma once
#include <span>
#include <vector>

#include "graph.hpp"

namespace w18 {

// Task 1. The CSR form of a graph with `nodes` nodes. The arcs that leave a
// node must be in the same order as in `edges`.
Graph build_csr(Node nodes, std::span<const Edge> edges);

// Task 2. The distances from `source` to every node (INF if a node cannot be
// reached): settle_order (dijkstra.hpp) with std::priority_queue.
std::vector<Dist> dijkstra(const Graph& g, Node source);

// Task 3. A shortest path from source to target. Stop as soon as target is
// settled. Settle the nodes in the order of (distance, node): of two nodes
// with the same distance, the smaller node number first.
struct PathResult {
    Dist distance = INF;       // INF if target cannot be reached
    std::vector<Node> path;    // source, ..., target; empty if not reachable
    std::uint32_t settled = 0; // how many nodes were settled
};
PathResult shortest_path(const Graph& g, Node source, Node target);

// Task 7. The distance of every query (INF if not reachable), computed with
// OpenMP threads. Each thread uses its own Workspace and heap.
std::vector<Dist> distances(const Graph& g, std::span<const Query> queries);

}  // namespace w18
