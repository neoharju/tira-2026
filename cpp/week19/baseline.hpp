// Simple versions for the tests and benchmarks of week 19.
#pragma once
#include "tasks.hpp"

namespace w19::baseline {

// A* (Dijkstra if h is empty) without a heap: every round scans all nodes for
// the unsettled node with the smallest (distance + h, node). O(n^2) time,
// which is fine for the small graphs of the tests. It stops when target is
// settled (never if target == INF).
struct SimpleResult {
    std::vector<Dist> dist;
    std::vector<Node> order;   // the settled nodes in order
    std::vector<Node> parent;  // parent[v]: the node before v on a shortest path
};
SimpleResult simple_search(const Graph& g, Node source, Node target, std::span<const Dist> h = {});

// Dijkstra from one node to all nodes with a heap, as in week 18.
std::vector<Dist> distances_from(const Graph& g, Node source);

double geo_scale(const Graph& g, std::span<const Point> points);
std::vector<Dist> geo_potential(std::span<const Point> points, double scale, Point target);  // for every node

std::vector<Node> farthest_landmarks(const Graph& g, std::uint32_t k, Node start);
std::vector<LandmarkRow> landmark_rows(const Graph& g, const Graph& rev, std::span<const Node> landmarks);
Dist alt_potential(const LandmarkRow& row, const LandmarkRow& target);

// One landmark at a time; compiled without automatic vectorization.
Dist alt_bound16(const LandmarkRow16& v, const LandmarkRow16& t);

}  // namespace w19::baseline
