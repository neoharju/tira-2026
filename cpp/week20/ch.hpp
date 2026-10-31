// Week 20: the graph during contraction and the finished hierarchy. These
// types and helpers are given (you do not need to change this file).
#pragma once
#include <compare>
#include <cstdint>
#include <span>
#include <vector>

#include "graph.hpp"

namespace w20 {

struct Arc {
    Node node;     // the other end of the arc
    Dist weight;
    Node middle;   // the contracted node of a shortcut, INF for a road
};

// The graph during contraction: one vector of arcs per node and direction.
struct DynGraph {
    std::vector<std::vector<Arc>> out;  // out[u]: the arcs u -> v
    std::vector<std::vector<Arc>> in;   // in[v]:  the arcs u -> v
};

// The graph g with at most one arc per ordered pair of nodes (the shortest of
// parallel arcs) and without loops.
DynGraph make_dyn(const Graph& g);

// Removes v and all its arcs.
void remove_node(DynGraph& g, Node v);

struct Shortcut {
    Node from, to;
    Dist weight;
    Node middle;
    friend auto operator<=>(const Shortcut&, const Shortcut&) = default;
};

// Adds the arc s.from -> s.to, or lowers the weight of the arc that is already
// there (and sets its middle node). Does nothing if that arc is not longer
// than s. Returns true if the graph changed.
bool add_shortcut(DynGraph& g, const Shortcut& s);

// A contraction hierarchy. Both search graphs point upwards: up has u -> v for
// every arc u -> v with rank[u] < rank[v], and down has v -> u for every arc
// u -> v with rank[u] > rank[v] (the downward arcs, reversed). The middle
// vectors have one value per arc, INF for a road.
struct Hierarchy {
    Graph up, down;
    std::vector<Node> up_middle, down_middle;
    std::vector<std::uint32_t> rank;  // rank[v]: when v was contracted (0 = first)
    std::uint64_t shortcuts = 0;      // how many shortcuts added or lowered an arc
};

// Builds the hierarchy from the arcs that every node had when it was
// contracted: up_arcs[v] = out[v] and down_arcs[v] = in[v] at that moment.
Hierarchy make_hierarchy(std::span<const std::vector<Arc>> up_arcs, std::span<const std::vector<Arc>> down_arcs,
                         std::vector<std::uint32_t> rank, std::uint64_t shortcuts);

}  // namespace w20
