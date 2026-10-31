#include "ch.hpp"

#include <algorithm>

namespace w20 {

DynGraph make_dyn(const Graph& g) {
    DynGraph d{std::vector<std::vector<Arc>>(g.nodes()), std::vector<std::vector<Arc>>(g.nodes())};
    for (Node u = 0; u < g.nodes(); ++u)
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e)
            if (g.target[e] != u) add_shortcut(d, {u, g.target[e], g.weight[e], INF});
    return d;
}

void remove_node(DynGraph& g, Node v) {
    for (Arc a : g.in[v]) std::erase_if(g.out[a.node], [v](Arc x) { return x.node == v; });
    for (Arc b : g.out[v]) std::erase_if(g.in[b.node], [v](Arc x) { return x.node == v; });
    g.out[v].clear();
    g.in[v].clear();
}

bool add_shortcut(DynGraph& g, const Shortcut& s) {
    for (Arc& a : g.out[s.from]) {
        if (a.node != s.to) continue;
        if (a.weight <= s.weight) return false;
        a = {s.to, s.weight, s.middle};
        for (Arc& b : g.in[s.to])
            if (b.node == s.from) b = {s.from, s.weight, s.middle};
        return true;
    }
    g.out[s.from].push_back({s.to, s.weight, s.middle});
    g.in[s.to].push_back({s.from, s.weight, s.middle});
    return true;
}

namespace {
Graph csr(std::span<const std::vector<Arc>> arcs, std::vector<Node>& middle) {
    Graph g;
    g.offset.assign(arcs.size() + 1, 0);
    for (std::size_t u = 0; u < arcs.size(); ++u) g.offset[u + 1] = g.offset[u] + static_cast<std::uint32_t>(arcs[u].size());
    for (const auto& list : arcs)
        for (Arc a : list) {
            g.target.push_back(a.node);
            g.weight.push_back(a.weight);
            middle.push_back(a.middle);
        }
    return g;
}
}  // namespace

Hierarchy make_hierarchy(std::span<const std::vector<Arc>> up_arcs, std::span<const std::vector<Arc>> down_arcs,
                         std::vector<std::uint32_t> rank, std::uint64_t shortcuts) {
    Hierarchy h;
    h.up = csr(up_arcs, h.up_middle);
    h.down = csr(down_arcs, h.down_middle);
    h.rank = std::move(rank);
    h.shortcuts = shortcuts;
    return h;
}

}  // namespace w20
