// Tasks 4 and 5: queries in a contraction hierarchy. Add the memory that your
// searches reuse between queries (distances, heaps, ...) as members.
#pragma once
#include <vector>

#include "ch.hpp"

namespace w20 {

class CHQuery {
public:
    explicit CHQuery(const Hierarchy& h) : h_(h) {}

    // Task 4. The distance from s to t (INF if t cannot be reached): Dijkstra
    // upwards from s in h.up and upwards from t in h.down. A search stops when
    // its smallest key is at least mu, the best distance found so far.
    Dist distance(Node s, Node t);

    // Task 5. A shortest path s, ..., t in the original graph (empty if t
    // cannot be reached): the path in the hierarchy with every shortcut
    // replaced by the roads that it stands for.
    std::vector<Node> path(Node s, Node t);

private:
    const Hierarchy& h_;
};

}  // namespace w20
