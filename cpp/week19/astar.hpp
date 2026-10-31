// Week 19, task 1: A* search for any potential. Tasks 2 and 4 write
// potentials, and their speed is measured with your astar.
#pragma once
#include "graph.hpp"

namespace w19 {

struct SearchResult {
    Dist distance = INF;        // INF if target cannot be reached
    std::uint32_t settled = 0;  // nodes taken from the heap; old keys do not count
};

// Task 1. A* from source to target: Dijkstra's algorithm with lazy deletion
// and the keys make_key(d + h(v), v), where d is the distance found so far and
// h(v) is a lower bound of the distance from v to target (h is a consistent
// potential, for example GeoPotential or AltPotential). Stop as soon as target
// is settled. h(v) returns a Dist.
template <class Potential>
SearchResult astar(const Graph& g, Node source, Node target, const Potential& h) {
    SearchResult result;
    (void)g;  // TODO
    (void)source;
    (void)target;
    (void)h;
    return result;
}

// Dijkstra's algorithm is A* with h(v) = 0.
inline SearchResult dijkstra(const Graph& g, Node source, Node target) {
    return astar(g, source, target, [](Node) { return Dist{0}; });
}

}  // namespace w19
