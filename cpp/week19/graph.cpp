#include "graph.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <numbers>
#include <numeric>
#include <print>
#include <random>
#include <stdexcept>

namespace w19 {

Graph build_csr(Node nodes, std::span<const Edge> edges) {
    std::vector<std::uint32_t> order(edges.size());
    std::iota(order.begin(), order.end(), 0);
    std::ranges::stable_sort(order, {}, [&](std::uint32_t i) { return edges[i].from; });
    Graph g;
    g.offset.assign(nodes + 1, 0);
    for (const Edge& e : edges) ++g.offset[e.from + 1];
    for (Node v = 0; v < nodes; ++v) g.offset[v + 1] += g.offset[v];
    g.target.reserve(edges.size());
    g.weight.reserve(edges.size());
    for (std::uint32_t i : order) {
        g.target.push_back(edges[i].to);
        g.weight.push_back(edges[i].weight);
    }
    return g;
}

Graph reverse(const Graph& g) {
    std::vector<Edge> edges;
    edges.reserve(g.arcs());
    for (Node u = 0; u < g.nodes(); ++u)
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) edges.push_back({g.target[e], u, g.weight[e]});
    return build_csr(g.nodes(), edges);
}

namespace {

RoadMap make_map(Node nodes, std::span<const Edge> edges, std::vector<Point> points) {
    RoadMap m;
    m.graph = build_csr(nodes, edges);
    m.reverse = reverse(m.graph);
    m.points = std::move(points);
    return m;
}

std::string read_file(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}

// Calls line(kind, numbers) for every line "kind n1 n2 n3" of a DIMACS file.
template <class F>
void dimacs_lines(const std::string& path, char want, F&& line) {
    std::string text = read_file(path);
    const char* p = text.data();
    const char* end = p + text.size();
    while (p < end) {
        char kind = *p++;
        if (kind == want) {
            long long x[3];
            for (long long& value : x) {
                while (p < end && (*p == ' ' || *p == '\t')) ++p;
                auto [next, ec] = std::from_chars(p, end, value);
                if (ec != std::errc{}) throw std::runtime_error("bad number in " + path);
                p = next;
            }
            line(x);
        }
        while (p < end && *p != '\n') ++p;
        ++p;
    }
}

// The largest strongly connected component (Kosaraju's algorithm with an
// explicit stack), renumbered from 0.
RoadMap largest_scc(Node nodes, const std::vector<Edge>& edges, const std::vector<Point>& points) {
    Graph g = build_csr(nodes, edges);
    Graph r = reverse(g);
    std::vector<Node> finish;
    std::vector<std::uint8_t> seen(nodes, 0);
    for (Node s = 0; s < nodes; ++s) {
        if (seen[s]) continue;
        std::vector<std::pair<Node, std::uint32_t>> stack{{s, g.offset[s]}};
        seen[s] = 1;
        while (!stack.empty()) {
            auto& [u, e] = stack.back();
            if (e < g.offset[u + 1]) {
                Node v = g.target[e++];
                if (!seen[v]) {
                    seen[v] = 1;
                    stack.push_back({v, g.offset[v]});
                }
            } else {
                finish.push_back(u);
                stack.pop_back();
            }
        }
    }
    std::vector<Node> comp(nodes, INF);
    std::vector<Node> size;
    for (auto it = finish.rbegin(); it != finish.rend(); ++it) {
        if (comp[*it] != INF) continue;
        Node c = static_cast<Node>(size.size());
        size.push_back(0);
        std::vector<Node> stack{*it};
        comp[*it] = c;
        while (!stack.empty()) {
            Node u = stack.back();
            stack.pop_back();
            ++size[c];
            for (std::uint32_t e = r.offset[u]; e < r.offset[u + 1]; ++e)
                if (comp[r.target[e]] == INF) comp[r.target[e]] = c, stack.push_back(r.target[e]);
        }
    }
    Node big = static_cast<Node>(std::ranges::max_element(size) - size.begin());
    std::vector<Node> id(nodes, INF);
    std::vector<Point> kept;
    for (Node v = 0; v < nodes; ++v)
        if (comp[v] == big) id[v] = static_cast<Node>(kept.size()), kept.push_back(points[v]);
    std::vector<Edge> inside;
    for (const Edge& e : edges)
        if (id[e.from] != INF && id[e.to] != INF) inside.push_back({id[e.from], id[e.to], e.weight});
    return make_map(static_cast<Node>(kept.size()), inside, std::move(kept));
}

}  // namespace

RoadMap road_map(Node width, Node height, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_real_distribution<double> jitter(-30.0, 30.0), coin(0.0, 1.0);
    const Node n = width * height;
    std::vector<Point> p(n);
    for (Node v = 0; v < n; ++v) p[v] = {(v % width) * 100.0 + jitter(rng), (v / width) * 100.0 + jitter(rng)};
    std::vector<Edge> edges;
    auto link = [&](Node a, Node b) {
        auto w = static_cast<std::uint32_t>(std::lround(std::hypot(p[a].x - p[b].x, p[a].y - p[b].y)));
        edges.push_back({a, b, w});
        edges.push_back({b, a, w});
    };
    for (Node v = 0; v < n; ++v) {
        if (v % width + 1 < width) link(v, v + 1);
        if (v / width + 1 < height && (v % width == 0 || coin(rng) < 0.4)) link(v, v + width);
    }
    std::shuffle(edges.begin(), edges.end(), rng);
    return make_map(n, edges, std::move(p));
}

RoadMap benchmark_map() {
    for (std::string dir : {"data/", "../data/", "../../data/"}) {
        std::string gr = dir + "USA-road-d.NY.gr", co = dir + "USA-road-d.NY.co";
        if (!std::filesystem::exists(gr) || !std::filesystem::exists(co)) continue;
        std::println("map: {} and {}", gr, co);
        std::vector<Edge> edges;
        Node nodes = 0;
        dimacs_lines(gr, 'a', [&](long long* x) {  // a <from> <to> <weight>, nodes from 1
            edges.push_back({static_cast<Node>(x[0] - 1), static_cast<Node>(x[1] - 1), static_cast<std::uint32_t>(x[2])});
            nodes = std::max({nodes, edges.back().from + 1, edges.back().to + 1});
        });
        std::vector<Point> points(nodes);
        const double c = std::cos(41.0 * std::numbers::pi / 180.0);
        dimacs_lines(co, 'v', [&](long long* x) {  // v <node> <longitude> <latitude>
            if (x[0] >= 1 && x[0] <= nodes) points[static_cast<Node>(x[0] - 1)] = {static_cast<double>(x[1]) * c, static_cast<double>(x[2])};
        });
        return largest_scc(nodes, edges, points);
    }
    std::println("map: road_map(514, 514, 42) (download New York with tools/download_dimacs.sh)");
    return road_map(514, 514, 42);
}

std::vector<Query> random_queries(Node nodes, std::size_t count, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<Node> node(0, nodes - 1);
    std::vector<Query> q(count);
    for (auto& [s, t] : q) s = node(rng), t = node(rng);
    return q;
}

}  // namespace w19
