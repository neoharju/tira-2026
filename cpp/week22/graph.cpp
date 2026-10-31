#include "graph.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <numeric>
#include <print>
#include <random>
#include <stdexcept>

namespace w22 {

namespace {
// Our own distributions, so that the generated graph is the same everywhere.
double unit(std::mt19937_64& rng) { return static_cast<double>(rng() >> 11) * 0x1.0p-53; }
std::uint64_t below(std::mt19937_64& rng, std::uint64_t n) { return rng() % n; }

// CSR with the arcs of every node sorted by target.
Graph sorted_csr(Node nodes, std::span<const Edge> edges) {
    Graph g = build_csr(nodes, edges);
    for (Node u = 0; u < nodes; ++u) std::sort(g.target.begin() + g.offset[u], g.target.begin() + g.offset[u + 1]);
    return g;
}
}  // namespace

Graph build_csr(Node nodes, std::span<const Edge> edges) {
    Graph g;
    g.offset.assign(nodes + 1, 0);
    for (const Edge& e : edges) ++g.offset[e.from + 1];
    for (Node v = 0; v < nodes; ++v) g.offset[v + 1] += g.offset[v];
    std::vector<std::uint32_t> next(g.offset.begin(), g.offset.end() - 1);
    g.target.resize(edges.size());
    for (const Edge& e : edges) g.target[next[e.from]++] = e.to;
    return g;
}

Graph transpose(const Graph& g) {
    std::vector<Edge> edges;
    edges.reserve(g.arcs());
    for (Node u = 0; u < g.nodes(); ++u)
        for (Node v : g.neighbours(u)) edges.push_back({v, u});
    return build_csr(g.nodes(), edges);  // u increases, and build_csr keeps the order
}

std::vector<std::uint32_t> out_degrees(const Graph& g) {
    std::vector<std::uint32_t> d(g.nodes());
    for (Node u = 0; u < g.nodes(); ++u) d[u] = g.degree(u);
    return d;
}

Graph relabel(const Graph& g, std::span<const Node> new_id) {
    std::vector<Edge> edges;
    edges.reserve(g.arcs());
    for (Node u = 0; u < g.nodes(); ++u)
        for (Node v : g.neighbours(u)) edges.push_back({new_id[u], new_id[v]});
    return sorted_csr(g.nodes(), edges);
}

Graph web_graph(Node nodes, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    // Sites of 1-4000 pages with a power-law size (Pareto, exponent 1.2).
    std::vector<Node> site_start;
    for (Node v = 0; v < nodes;) {
        site_start.push_back(v);
        const double size = std::min({static_cast<double>(nodes - v), 4000.0, std::ceil(2.0 / std::pow(1 - unit(rng), 1 / 1.2))});
        v += std::max<Node>(1, static_cast<Node>(size));
    }
    site_start.push_back(nodes);
    std::vector<Edge> edges;
    std::vector<Node> targets;  // all link targets so far, for preferential attachment
    for (std::size_t s = 0; s + 1 < site_start.size(); ++s) {
        const Node a = site_start[s], b = site_start[s + 1];
        for (Node u = a; u < b; ++u) {
            const int links = unit(rng) < 0.15 ? 0 : 1 + static_cast<int>(-std::log(1 - unit(rng)) * 10.5);
            for (int k = 0; k < links; ++k) {
                Node t;
                if (unit(rng) < 0.8 && b - a > 1) {  // inside the site
                    const double q = unit(rng);
                    if (q < 0.25) {
                        t = a;  // the home page
                    } else if (q < 0.75) {  // a nearby page
                        const auto step = 1 + static_cast<std::int64_t>(-std::log(1 - unit(rng)) * 8);
                        const std::int64_t w = unit(rng) < 0.5 ? std::int64_t{u} - step : std::int64_t{u} + step;
                        t = static_cast<Node>(std::clamp<std::int64_t>(w, a, std::int64_t{b} - 1));
                    } else {
                        t = a + static_cast<Node>(below(rng, b - a));
                    }
                } else if (!targets.empty() && unit(rng) < 0.5) {
                    t = targets[below(rng, targets.size())];  // a popular page
                } else {
                    t = static_cast<Node>(below(rng, nodes));
                }
                if (t == u) continue;
                edges.push_back({u, t});
                targets.push_back(t);
            }
        }
    }
    // Random numbers for the pages, then remove repeated links.
    std::vector<Node> id(nodes);
    std::iota(id.begin(), id.end(), Node{0});
    std::shuffle(id.begin(), id.end(), rng);
    for (Edge& e : edges) e = {id[e.from], id[e.to]};
    Graph g = sorted_csr(nodes, edges);
    std::vector<Edge> unique;
    unique.reserve(edges.size());
    for (Node u = 0; u < nodes; ++u)
        for (std::uint32_t i = g.offset[u]; i < g.offset[u + 1]; ++i)
            if (i == g.offset[u] || g.target[i] != g.target[i - 1]) unique.push_back({u, g.target[i]});
    return build_csr(nodes, unique);
}

Graph read_snap(const std::string& path) {
    std::ifstream in(path);
    if (!in) throw std::runtime_error("cannot open " + path);
    std::vector<std::pair<std::uint64_t, std::uint64_t>> pairs;
    std::string line;
    while (std::getline(in, line)) {
        if (line.empty() || line[0] == '#') continue;
        const char* p = line.data();
        const char* end = line.data() + line.size();
        std::uint64_t a = 0, b = 0;
        auto r = std::from_chars(p, end, a);
        while (r.ptr < end && (*r.ptr == ' ' || *r.ptr == '\t')) ++r.ptr;
        auto r2 = std::from_chars(r.ptr, end, b);
        if (r.ec != std::errc{} || r2.ec != std::errc{}) throw std::runtime_error("bad line in " + path + ": " + line);
        pairs.push_back({a, b});
    }
    std::vector<std::uint64_t> ids;
    for (auto [a, b] : pairs) ids.push_back(a), ids.push_back(b);
    std::ranges::sort(ids);
    ids.erase(std::unique(ids.begin(), ids.end()), ids.end());
    auto number = [&](std::uint64_t x) { return static_cast<Node>(std::ranges::lower_bound(ids, x) - ids.begin()); };
    std::vector<Edge> edges;
    edges.reserve(pairs.size());
    for (auto [a, b] : pairs) edges.push_back({number(a), number(b)});
    return sorted_csr(static_cast<Node>(ids.size()), edges);
}

Graph benchmark_graph() {
    const std::string path = "data/web-Google.txt";
    if (std::filesystem::exists(path)) {
        std::println("graph: {} (SNAP web-Google, pages in a random order)", path);
        const Graph g = read_snap(path);
        // Random numbers for the pages, as in web_graph: the SNAP numbers may
        // already have some locality, and task 8 starts from a random order.
        std::vector<Node> id(g.nodes());
        std::iota(id.begin(), id.end(), Node{0});
        std::mt19937_64 rng(42);
        std::shuffle(id.begin(), id.end(), rng);
        return relabel(g, id);
    }
    std::println("graph: web_graph(875713, 42) (download web-Google with tools/download_snap.sh)");
    return web_graph(875713, 42);
}

std::vector<Node> in_degree_order(const Graph& g) {
    std::vector<std::uint32_t> in(g.nodes(), 0);
    for (Node v : g.target) ++in[v];
    std::vector<Node> order(g.nodes());
    std::iota(order.begin(), order.end(), Node{0});
    std::ranges::stable_sort(order, std::greater<>{}, [&](Node v) { return in[v]; });
    std::vector<Node> id(g.nodes());
    for (Node i = 0; i < g.nodes(); ++i) id[order[i]] = i;
    return id;
}

std::uint64_t simulated_misses(const Graph& in, std::size_t cache_bytes) {
    const std::size_t ways = 8, sets = std::max<std::size_t>(1, cache_bytes / 64 / ways);
    std::vector<std::uint64_t> tag(sets * ways, ~std::uint64_t{0}), used(sets * ways, 0);
    std::uint64_t clock = 0, misses = 0;
    for (Node v = 0; v < in.nodes(); ++v) {
        for (Node u : in.neighbours(v)) {
            const std::uint64_t line = std::uint64_t{u} * 8 / 64;
            const std::size_t base = static_cast<std::size_t>(line % sets) * ways;
            ++clock;
            std::size_t hit = ways, oldest = 0;
            for (std::size_t w = 0; w < ways; ++w) {
                if (tag[base + w] == line) hit = w;
                if (used[base + w] < used[base + oldest]) oldest = w;
            }
            if (hit < ways) {
                used[base + hit] = clock;
            } else {
                ++misses;
                tag[base + oldest] = line;
                used[base + oldest] = clock;
            }
        }
    }
    return misses;
}

}  // namespace w22
