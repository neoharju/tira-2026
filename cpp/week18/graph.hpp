// Week 18: graphs, heap keys and helpers that are given (you do not need to
// change this file).
#pragma once
#include <cstdint>
#include <limits>
#include <span>
#include <string>
#include <vector>

namespace w18 {

using Node = std::uint32_t;
using Dist = std::uint32_t;
inline constexpr Dist INF = std::numeric_limits<Dist>::max();

struct Edge {
    Node from, to;
    std::uint32_t weight;
    friend bool operator==(const Edge&, const Edge&) = default;
};

struct EdgeList {
    Node nodes = 0;
    std::vector<Edge> edges;
};

// A directed graph in compressed sparse row (CSR) form. The arcs that leave
// node u are the indices offset[u], ..., offset[u + 1] - 1 of target and
// weight.
struct Graph {
    std::vector<std::uint32_t> offset;  // nodes() + 1 values, offset[0] == 0
    std::vector<Node> target;           // one value per arc
    std::vector<std::uint32_t> weight;  // one value per arc
    Node nodes() const { return static_cast<Node>(offset.size() - 1); }
    std::size_t arcs() const { return target.size(); }
    friend bool operator==(const Graph&, const Graph&) = default;
};

// Heap keys: the distance in the high 32 bits and the node in the low 32 bits.
// Comparing two keys compares the distances first and the nodes second.
constexpr std::uint64_t make_key(Dist d, Node v) { return std::uint64_t{d} << 32 | v; }
constexpr Dist key_dist(std::uint64_t key) { return static_cast<Dist>(key >> 32); }
constexpr Node key_node(std::uint64_t key) { return static_cast<Node>(key); }

// Reads a road network in the DIMACS shortest-path format ("p sp n m" and
// "a u v w" lines). The file numbers nodes from 1; the result from 0.
EdgeList read_dimacs(const std::string& path);

// A road network shaped like a grid: width x height crossings. Every row is a
// road, about 40 % of the vertical links exist, and every link is two arcs
// (one in each direction) with the same travel time. 514 x 514 gives about as
// many nodes and arcs as the DIMACS New York graph.
EdgeList road_grid(Node width, Node height, std::uint64_t seed);

// The graph used by the benchmarks: data/USA-road-d.NY.gr if it exists (see
// tools/download_dimacs.sh), otherwise road_grid(514, 514, 42).
EdgeList benchmark_graph();

// Random (source, target) pairs.
struct Query {
    Node source, target;
};
std::vector<Query> random_queries(Node nodes, std::size_t count, std::uint64_t seed);

}  // namespace w18
