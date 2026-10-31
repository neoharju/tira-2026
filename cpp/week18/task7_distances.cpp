// Task 7: answer the queries in parallel with OpenMP. Each thread needs its
// own Workspace and heap: create them inside the parallel region.
#include <omp.h>

#include "dijkstra.hpp"
#include "tasks.hpp"
#include "workspace.hpp"

namespace w18 {

std::vector<Dist> distances(const Graph& g, std::span<const Query> queries) {
    std::vector<Dist> out(queries.size());
    Workspace ws(g.nodes());
    StdHeap heap;
    for (std::size_t i = 0; i < queries.size(); ++i) out[i] = query(g, queries[i].source, queries[i].target, ws, heap);
    return out;
}

}  // namespace w18
