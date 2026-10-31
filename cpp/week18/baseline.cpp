#include "baseline.hpp"

#include <numeric>

namespace w18::baseline {

Graph build_csr(Node nodes, std::span<const Edge> edges) {
    std::vector<std::uint32_t> order(edges.size());
    std::iota(order.begin(), order.end(), 0);
    std::ranges::stable_sort(order, {}, [&](std::uint32_t i) { return edges[i].from; });
    Graph g;
    g.offset.assign(nodes + 1, 0);
    for (const Edge& e : edges) ++g.offset[e.from + 1];
    for (Node v = 0; v < nodes; ++v) g.offset[v + 1] += g.offset[v];
    for (std::uint32_t i : order) {
        g.target.push_back(edges[i].to);
        g.weight.push_back(edges[i].weight);
    }
    return g;
}

SimpleResult simple_dijkstra(const Graph& g, Node source, Node target) {
    const Node n = g.nodes();
    SimpleResult r{std::vector<Dist>(n, INF), {}, std::vector<Node>(n, INF)};
    std::vector<bool> settled(n);
    r.dist[source] = 0;
    for (;;) {
        Node u = INF;
        for (Node v = 0; v < n; ++v)
            if (!settled[v] && r.dist[v] != INF && (u == INF || r.dist[v] < r.dist[u])) u = v;
        if (u == INF) break;
        settled[u] = true;
        r.order.push_back(u);
        if (u == target) break;
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
            Node v = g.target[e];
            if (r.dist[u] + g.weight[e] < r.dist[v]) {
                r.dist[v] = r.dist[u] + g.weight[e];
                r.parent[v] = u;
            }
        }
    }
    return r;
}

PathResult shortest_path(const Graph& g, Node source, Node target) {
    SimpleResult s = simple_dijkstra(g, source, target);
    PathResult r;
    r.settled = static_cast<std::uint32_t>(s.order.size());
    if (s.dist[target] == INF) return r;
    r.distance = s.dist[target];
    for (Node v = target; v != source; v = s.parent[v]) r.path.push_back(v);
    r.path.push_back(source);
    std::ranges::reverse(r.path);
    return r;
}

std::vector<Dist> distances(const Graph& g, std::span<const Query> queries) {
    std::vector<Dist> out;
    for (auto [s, t] : queries) out.push_back(simple_dijkstra(g, s, t).dist[t]);
    return out;
}

}  // namespace w18::baseline
