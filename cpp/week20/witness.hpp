// Tasks 1 and 3: the witness search. This version is correct but slow: every
// run writes INF to the distances of all nodes and searches until the limit.
// In task 3 you make it fast; you may change this class as you like (the
// tests only call shortcuts_for and contract).
#pragma once
#include <algorithm>
#include <span>
#include <vector>

#include "ch.hpp"

namespace w20 {

class WitnessSearch {
public:
    explicit WitnessSearch(Node nodes) : dist_(nodes, INF) {}

    // Dijkstra from s in g that never enters the node `avoid` or a node x with
    // skip[x] != 0 (skip may be empty), and stops when the smallest key is
    // larger than limit. Afterwards dist(x) is the distance from s to x for
    // every node x whose distance is at most limit.
    void run(const DynGraph& g, Node s, Node avoid, std::span<const std::uint8_t> skip, Dist limit) {
        std::ranges::fill(dist_, INF);
        StdHeap heap;
        dist_[s] = 0;
        heap.push(make_key(0, s));
        while (!heap.empty() && key_dist(heap.top()) <= limit) {
            std::uint64_t key = heap.pop();
            Node u = key_node(key);
            if (key_dist(key) != dist_[u]) continue;
            for (Arc a : g.out[u]) {
                if (a.node == avoid || (!skip.empty() && skip[a.node])) continue;
                Dist d = dist_[u] + a.weight;
                if (d < dist_[a.node]) {
                    dist_[a.node] = d;
                    heap.push(make_key(d, a.node));
                }
            }
        }
    }

    Dist dist(Node x) const { return dist_[x]; }

private:
    std::vector<Dist> dist_;
};

}  // namespace w20
