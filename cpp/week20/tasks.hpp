// Week 20: the functions that you write in tasks 1, 2, 6 and 7. The witness
// search of tasks 1 and 3 is in witness.hpp, and the queries of tasks 4 and 5
// are in query.hpp.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

#include "ch.hpp"
#include "witness.hpp"

namespace w20 {

// Task 1. The shortcuts that are needed when v is contracted from g: for
// every pair of arcs u -> v and v -> w with u != w, the shortcut
// {u, w, weight(u, v) + weight(v, w), v}, unless there is a witness: a path
// from u to w that is not longer and avoids v and every node x with
// skip[x] != 0 (skip may be empty). Compute all of them before changing g.
// The order of the result does not matter.
std::vector<Shortcut> shortcuts_for(const DynGraph& g, Node v, std::span<const std::uint8_t> skip, WitnessSearch& ws);

// Task 2. Contracts all nodes in the given order and returns the hierarchy.
// The shortcuts of a node are added (add_shortcut) after it has been removed
// (remove_node), and `shortcuts` counts the ones that changed the graph.
// Task 3 asks you to make this fast.
Hierarchy contract(const Graph& g, std::span<const Node> order);

// Task 6. One row of a distance table, with AVX2 intrinsics:
// D[j] = min(BIG, min over {row, dist} in space of dist + B[row * T + j])
// for j = 0, ..., T - 1. T is a multiple of 8, every value is at most BIG,
// and BIG means that there is no path.
inline constexpr Dist BIG = Dist{1} << 30;
struct RowDist {
    std::uint32_t row;
    Dist dist;
};
void min_plus_row(std::span<const RowDist> space, const Dist* B, std::uint32_t T, Dist* D);

// Task 7. Contraction in parallel rounds. A round contracts every remaining
// node that comes before all of its remaining neighbours in `order`, at the
// same time. Its witness searches skip all nodes of the round. Then the nodes
// of the round are removed and their shortcuts are added in sorted order
// (operator< of Shortcut). The rank of a node is its position when the
// rounds are put one after another, each round in the order of `order`.
Hierarchy contract_parallel(const Graph& g, std::span<const Node> order);

}  // namespace w20
