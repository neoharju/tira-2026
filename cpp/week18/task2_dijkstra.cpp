// Task 2: the distances from one source. Write settle_order (dijkstra.hpp)
// first; then this function only calls it with std::priority_queue (StdHeap).
#include "dijkstra.hpp"
#include "tasks.hpp"

namespace w18 {

std::vector<Dist> dijkstra(const Graph& g, Node source) {
    StdHeap heap;
    std::vector<Dist> dist;
    settle_order(g, source, heap, dist);
    return dist;
}

}  // namespace w18
