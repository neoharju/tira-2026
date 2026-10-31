// Simple versions for the tests and benchmarks of week 18.
#pragma once
#include <algorithm>

#include "dijkstra.hpp"
#include "tasks.hpp"

namespace w18::baseline {

// O(m log m) with a stable sort.
Graph build_csr(Node nodes, std::span<const Edge> edges);

// Dijkstra without a heap: every round scans all nodes for the unsettled
// node with the smallest (distance, node). O(n^2) time, which is fine for the
// small graphs of the tests. With target != INF it stops when target is settled.
struct SimpleResult {
    std::vector<Dist> dist;
    std::vector<Node> order;   // the settled nodes in order
    std::vector<Node> parent;  // parent[v]: the node before v on a shortest path
};
SimpleResult simple_dijkstra(const Graph& g, Node source, Node target = INF);

PathResult shortest_path(const Graph& g, Node source, Node target);
std::vector<Dist> distances(const Graph& g, std::span<const Query> queries);

// The workspace of task 8 before the change: begin_query() writes INF to
// every node.
class ResettingWorkspace {
public:
    explicit ResettingWorkspace(Node nodes) : dist_(nodes, INF) {}
    void begin_query() { std::ranges::fill(dist_, INF); }
    Dist dist(Node v) const { return dist_[v]; }
    void set_dist(Node v, Dist d) { dist_[v] = d; }

private:
    std::vector<Dist> dist_;
};

}  // namespace w18::baseline
