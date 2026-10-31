// Week 22: directed graphs, the generated web graph and helpers that are given
// (you do not need to change this file).
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace w22 {

using Node = std::uint32_t;

struct Edge {
    Node from, to;
};

// A directed graph in CSR form, as in weeks 18-20 but without weights: the
// arcs that leave node u go to target[offset[u]], ..., target[offset[u + 1] - 1].
struct Graph {
    std::vector<std::uint32_t> offset;  // nodes() + 1 values, offset[0] == 0
    std::vector<Node> target;           // one value per arc
    Node nodes() const { return static_cast<Node>(offset.size() - 1); }
    std::size_t arcs() const { return target.size(); }
    std::uint32_t degree(Node u) const { return offset[u + 1] - offset[u]; }
    std::span<const Node> neighbours(Node u) const { return {target.data() + offset[u], degree(u)}; }
    friend bool operator==(const Graph&, const Graph&) = default;
};

// The CSR form of an edge list. The arcs of a node keep their order.
Graph build_csr(Node nodes, std::span<const Edge> edges);

// The reverse graph: the arc v -> u for every arc u -> v. The arcs that enter
// v come out in increasing order of u.
Graph transpose(const Graph& g);

// The out-degree of every node.
std::vector<std::uint32_t> out_degrees(const Graph& g);

// The same graph with node u renamed to new_id[u] (new_id is a permutation of
// 0, ..., n - 1). The arcs of every node are sorted by target.
Graph relabel(const Graph& g, std::span<const Node> new_id);

// A generated web graph with the statistics of web-Google (875,713 pages and
// about 5 million links, 16 % of the pages without links): pages belong to
// sites of 1-4000 pages, and 80 % of the links stay inside the site (to its
// home page, to nearby pages or to any page). The other links go to popular
// pages (with probability proportional to the links that they already have)
// or to random pages. Finally the pages are numbered in a random order, as if
// by a hash of their address.
Graph web_graph(Node nodes, std::uint64_t seed);

// Reads a graph in the SNAP edge list format: lines "from to" and comment
// lines that start with '#'. The node numbers are renumbered 0, 1, ... in
// increasing order.
Graph read_snap(const std::string& path);

// The graph of the benchmarks: data/web-Google.txt if it exists (see
// tools/download_snap.sh) with the pages in a random order, otherwise
// web_graph(875713, 42).
Graph benchmark_graph();

// The nodes renumbered by decreasing in-degree (ties: the smaller node
// first): new_id[u] is the new number of u. The benchmark of task 7 uses it.
std::vector<Node> in_degree_order(const Graph& g);

// Counts how many of the reads x[u] of a pull step (for v = 0, 1, ...: for
// every arc u -> v) miss in a cache of `cache_bytes` bytes with 64-byte lines,
// 8 ways and LRU replacement, when x has 8-byte values. `in` is transpose(g).
std::uint64_t simulated_misses(const Graph& in, std::size_t cache_bytes = 256 * 1024);

}  // namespace w22
