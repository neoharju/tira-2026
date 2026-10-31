// Task 8: the distances of one query. A workspace is reused for many queries,
// so begin_query() must make every distance INF again. Now it writes INF to
// every node, which takes as long as a short query. Make it O(1) with a
// version number for every node (see the chapter).
#pragma once
#include <algorithm>
#include <vector>

#include "graph.hpp"

namespace w18 {

class Workspace {
public:
    explicit Workspace(Node nodes) : dist_(nodes, INF) {}

    // Starts a new query: afterwards dist(v) == INF for every node v.
    void begin_query() { std::ranges::fill(dist_, INF); }

    Dist dist(Node v) const { return dist_[v]; }
    void set_dist(Node v, Dist d) { dist_[v] = d; }

    // For the tests: continues as if `count` more queries had been started.
    void skip_queries(std::uint32_t count) { (void)count; }

private:
    std::vector<Dist> dist_;
};

}  // namespace w18
