// Week 24: the layers of an HNSW index. This file is given (you do not need
// to change it): it stores the links, and you choose them (tasks.hpp).
#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "vectors.hpp"

namespace w24 {

struct Params {
    std::size_t m = 16;                 // links per node on layers 1, 2, ...; layer 0 allows 2 * m
    std::size_t ef_construction = 100;  // the ef of the searches that find the neighbours of a new node
    std::uint64_t seed = 24;            // for the levels of the nodes
};

// The level of a node: floor(-ln(u) / ln(m)) for a random u in (0, 1], from a
// hash of the seed and the id (so the levels do not depend on the order of
// the work). A node is in the layers 0 ... level. About 1 node in m reaches
// level 1, 1 in m^2 level 2, and so on.
int random_level(Id id, std::size_t m, std::uint64_t seed);

// All nodes are in layer 0, which allows m0 = 2m links per node; layer l >= 1
// has the nodes with level >= l, with at most m links each. The links of a
// node are stored in a fixed slot: its count, then the links, as in hnswlib.
struct Hnsw {
    const Vectors* data = nullptr;
    std::size_t m = 0, m0 = 0;
    std::vector<int> level;               // level[i]: node i is in the layers 0 ... level[i]
    Id entry = 0;                         // the entry point: a node of the highest level
    int top = -1;                         // the highest level (-1 while the index is empty)
    std::size_t inserted = 0;             // nodes 0 ... inserted - 1 are in the graph
    std::vector<Id> links0;               // node i on layer 0: slot at i * (m0 + 1)
    std::vector<std::size_t> upper_slot;  // node i on layer l >= 1: slot at upper_slot[i] + (l - 1) * (m + 1)
    std::vector<Id> upper;

    std::size_t capacity(int layer) const { return layer == 0 ? m0 : m; }

    std::span<const Id> links(Id node, int layer) const {
        const Id* slot = layer == 0 ? links0.data() + node * (m0 + 1) : upper.data() + upper_slot[node] + (layer - 1) * (m + 1);
        return {slot + 1, slot[0]};
    }

    // Replaces the links of the node on the layer (at most capacity(layer)).
    void set_links(Id node, int layer, std::span<const Id> ids);
};

// An index for the data with the levels of all nodes and no links yet.
Hnsw empty_index(const Vectors& data, const Params& params);

// Memory that a search can reuse, so that it allocates nothing: a mark for
// every node with a version number, as in week 18 (node i is visited if
// visited[i] == version), and room for heaps and lists.
struct Workspace {
    std::vector<std::uint32_t> visited;
    std::uint32_t version = 0;
    std::vector<Neighbor> candidates, results, list;
    std::vector<Id> ids;
};

// Builds the index: empty_index, then your insert (task 3) for the nodes
// 0, 1, 2, ... in this order.
Hnsw build(const Vectors& data, const Params& params);

}  // namespace w24
