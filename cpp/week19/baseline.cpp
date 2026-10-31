#include "baseline.hpp"

#include <algorithm>
#include <cmath>

namespace w19::baseline {

SimpleResult simple_search(const Graph& g, Node source, Node target, std::span<const Dist> h) {
    const Node n = g.nodes();
    auto pot = [&](Node v) { return h.empty() ? std::uint64_t{0} : std::uint64_t{h[v]}; };
    SimpleResult r{std::vector<Dist>(n, INF), {}, std::vector<Node>(n, INF)};
    std::vector<bool> settled(n);
    r.dist[source] = 0;
    for (;;) {
        Node u = INF;
        for (Node v = 0; v < n; ++v)
            if (!settled[v] && r.dist[v] != INF && (u == INF || r.dist[v] + pot(v) < r.dist[u] + pot(u))) u = v;
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

std::vector<Dist> distances_from(const Graph& g, Node source) {
    std::vector<Dist> dist(g.nodes(), INF);
    StdHeap heap;
    dist[source] = 0;
    heap.push(make_key(0, source));
    while (!heap.empty()) {
        std::uint64_t key = heap.pop();
        Node u = key_node(key);
        Dist d = key_dist(key);
        if (d != dist[u]) continue;
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
            Node v = g.target[e];
            Dist nd = d + g.weight[e];
            if (nd < dist[v]) {
                dist[v] = nd;
                heap.push(make_key(nd, v));
            }
        }
    }
    return dist;
}

double geo_scale(const Graph& g, std::span<const Point> points) {
    double c = std::numeric_limits<double>::infinity();
    for (Node u = 0; u < g.nodes(); ++u)
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
            const Point a = points[u], b = points[g.target[e]];
            double length = std::hypot(a.x - b.x, a.y - b.y);
            if (length > 0) c = std::min(c, g.weight[e] / length);
        }
    return std::isfinite(c) ? c * (1 - 1e-6) : 0.0;
}

std::vector<Dist> geo_potential(std::span<const Point> points, double scale, Point target) {
    std::vector<Dist> h(points.size());
    for (std::size_t v = 0; v < points.size(); ++v)
        h[v] = static_cast<Dist>(scale * std::hypot(points[v].x - target.x, points[v].y - target.y));
    return h;
}

std::vector<Node> farthest_landmarks(const Graph& g, std::uint32_t k, Node start) {
    std::vector<Dist> far = distances_from(g, start);
    std::vector<Node> landmarks;
    while (landmarks.size() < k) {
        Node next = static_cast<Node>(std::ranges::max_element(far) - far.begin());
        landmarks.push_back(next);
        if (landmarks.size() == 1) far.assign(g.nodes(), INF);
        std::vector<Dist> d = distances_from(g, next);
        for (Node v = 0; v < g.nodes(); ++v) far[v] = std::min(far[v], d[v]);
    }
    return landmarks;
}

std::vector<LandmarkRow> landmark_rows(const Graph& g, const Graph& rev, std::span<const Node> landmarks) {
    std::vector<LandmarkRow> rows(g.nodes());
    for (int i = 0; i < 8; ++i) {
        std::vector<Dist> from = distances_from(g, landmarks[i]), to = distances_from(rev, landmarks[i]);
        for (Node v = 0; v < g.nodes(); ++v) {
            rows[v].from[i] = static_cast<std::int32_t>(from[v]);
            rows[v].to[i] = static_cast<std::int32_t>(to[v]);
        }
    }
    return rows;
}

Dist alt_potential(const LandmarkRow& row, const LandmarkRow& target) {
    std::int32_t best = 0;
    for (int i = 0; i < 8; ++i) {
        best = std::max(best, target.from[i] - row.from[i]);
        best = std::max(best, row.to[i] - target.to[i]);
    }
    return static_cast<Dist>(best);
}

}  // namespace w19::baseline
