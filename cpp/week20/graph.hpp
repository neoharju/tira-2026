// Week 20: graphs, heap keys and helpers that are given (you do not need to
// change this file). Graph, the keys and StdHeap are the same as in week 18.
#pragma once
#include <cstdint>
#include <functional>
#include <limits>
#include <queue>
#include <span>
#include <vector>

namespace w20 {

using Node = std::uint32_t;
using Dist = std::uint32_t;
inline constexpr Dist INF = std::numeric_limits<Dist>::max();

struct Edge {
    Node from, to;
    std::uint32_t weight;
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

// The CSR form of an edge list. The arcs of a node keep their order.
Graph build_csr(Node nodes, std::span<const Edge> edges);

// Heap keys: the distance in the high 32 bits and the node in the low 32 bits.
constexpr std::uint64_t make_key(Dist d, Node v) { return std::uint64_t{d} << 32 | v; }
constexpr Dist key_dist(std::uint64_t key) { return static_cast<Dist>(key >> 32); }
constexpr Node key_node(std::uint64_t key) { return static_cast<Node>(key); }

// std::priority_queue with the interface of the heaps of week 18.
class StdHeap : std::priority_queue<std::uint64_t, std::vector<std::uint64_t>, std::greater<>> {
public:
    using priority_queue::empty;
    using priority_queue::push;
    using priority_queue::size;
    using priority_queue::top;  // the smallest key, without removing it
    std::uint64_t pop() {
        std::uint64_t key = top();
        priority_queue::pop();
        return key;
    }
    void clear() { c.clear(); }  // keeps the memory for the next query
};

// A generated road network: width x height crossings about 100 units apart.
// Every row and the first column are roads, and about 40 % of the other
// vertical links exist. Every link is two arcs with the same weight, a travel
// time. Node v is in row v / width and column v % width.
Graph road_grid(Node width, Node height, std::uint64_t seed);

// Random (source, target) pairs.
struct Query {
    Node source, target;
};
std::vector<Query> random_queries(Node nodes, std::size_t count, std::uint64_t seed);

}  // namespace w20
