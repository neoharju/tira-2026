// Week 18: Dijkstra's algorithm for any heap (tasks 2 and 3). The heaps of
// tasks 4-6 are measured with your settle_order, and tasks 7-8 use your query.
#pragma once
#include <functional>
#include <queue>
#include <vector>

#include "graph.hpp"

namespace w18 {

// std::priority_queue with the same interface as the heaps of tasks 4-6.
class StdHeap : std::priority_queue<std::uint64_t, std::vector<std::uint64_t>, std::greater<>> {
public:
    using priority_queue::empty;
    using priority_queue::push;
    using priority_queue::size;
    std::uint64_t pop() {
        std::uint64_t key = top();
        priority_queue::pop();
        return key;
    }
    void clear() { c.clear(); }  // keeps the memory for the next query
};

// Task 2. Dijkstra from `source` with lazy deletion and keys make_key(d, v).
// `heap` has push(key), pop() (removes and returns the smallest key), empty()
// and clear(). Fills `dist` (INF for nodes that cannot be reached) and returns
// the nodes in the order in which they were settled.
template <class Heap>
std::vector<Node> settle_order(const Graph& g, Node source, Heap& heap, std::vector<Dist>& dist) {
    dist.assign(g.nodes(), INF);
    heap.clear();
    std::vector<Node> order;
    (void)source;  // TODO
    return order;
}

// Task 3. Point-to-point Dijkstra that stops when `target` is settled.
// `ws` keeps the distances (begin_query(), dist(v), set_dist(v, d); see
// workspace.hpp) and `heap` the keys; both are reused between queries.
// Returns the distance, or INF if target cannot be reached.
template <class Workspace, class Heap>
Dist query(const Graph& g, Node source, Node target, Workspace& ws, Heap& heap) {
    ws.begin_query();
    heap.clear();
    (void)g;  // TODO
    (void)source;
    (void)target;
    return INF;
}

}  // namespace w18
