// Tasks 7 and 8: contraction in parallel rounds. Phase 1 (in parallel): the
// shortcuts of every node of the round, with one WitnessSearch per thread;
// the graph is only read. Phase 2: remove the nodes and add the shortcuts.
#include <omp.h>

#include "tasks.hpp"

namespace w20 {

Hierarchy contract_parallel(const Graph& g, std::span<const Node> order) {
    (void)g;  // TODO
    (void)order;
    return {};
}

}  // namespace w20
