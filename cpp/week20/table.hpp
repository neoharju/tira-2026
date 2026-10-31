// Week 20: distance tables from a hierarchy (given). The inner loop is
// min_plus_row of task 6.
#pragma once
#include <span>
#include <vector>

#include "tasks.hpp"

namespace w20 {

// The input of a sources x targets table: B has a row for every node that is
// in the backward search space of some target, with the distances d(k, t) of
// the targets (BIG if k is not in the search space of t), and spaces[i] has
// the nodes of the forward search space of sources[i] that have a row.
struct TableInput {
    std::uint32_t T = 0;           // targets, rounded up to a multiple of 8
    std::vector<Dist> B;           // rows * T values
    std::vector<std::vector<RowDist>> spaces;
};
TableInput table_input(const Hierarchy& h, std::span<const Node> sources, std::span<const Node> targets);

// Calls `row` (for example min_plus_row) for every source. The result has
// sources.size() rows of T values; INF where there is no path.
using RowFunction = void (*)(std::span<const RowDist>, const Dist*, std::uint32_t, Dist*);
std::vector<Dist> distance_table(const TableInput& in, RowFunction row = min_plus_row);

}  // namespace w20
