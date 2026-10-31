#include "graph.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <print>
#include <random>
#include <stdexcept>

namespace w18 {

EdgeList read_dimacs(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    EdgeList g;
    const char* p = text.data();
    const char* end = p + text.size();
    auto number = [&](std::uint64_t& x) {
        while (p < end && (*p == ' ' || *p == '\t')) ++p;
        auto [next, ec] = std::from_chars(p, end, x);
        if (ec != std::errc{}) throw std::runtime_error("bad number in " + path);
        p = next;
    };
    while (p < end) {
        char kind = *p++;
        if (kind == 'p') {  // p sp <nodes> <arcs>
            while (p < end && *p == ' ') ++p;
            while (p < end && *p != ' ') ++p;  // the word "sp"
            std::uint64_t n, m;
            number(n);
            number(m);
            g.nodes = static_cast<Node>(n);
            g.edges.reserve(m);
        } else if (kind == 'a') {  // a <from> <to> <weight>
            std::uint64_t u, v, w;
            number(u);
            number(v);
            number(w);
            g.edges.push_back({static_cast<Node>(u - 1), static_cast<Node>(v - 1), static_cast<std::uint32_t>(w)});
        }
        while (p < end && *p != '\n') ++p;  // the rest of the line (comments start with c)
        ++p;
    }
    return g;
}

EdgeList road_grid(Node width, Node height, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_real_distribution<double> jitter(-30.0, 30.0), speed(1.0, 3.0), coin(0.0, 1.0);
    const Node n = width * height;
    std::vector<double> x(n), y(n);
    for (Node v = 0; v < n; ++v) {
        x[v] = (v % width) * 100.0 + jitter(rng);
        y[v] = (v / width) * 100.0 + jitter(rng);
    }
    EdgeList g;
    g.nodes = n;
    auto link = [&](Node a, Node b) {
        auto w = static_cast<std::uint32_t>(std::lround(std::hypot(x[a] - x[b], y[a] - y[b]) * speed(rng)));
        g.edges.push_back({a, b, w});
        g.edges.push_back({b, a, w});
    };
    for (Node v = 0; v < n; ++v) {
        if (v % width + 1 < width) link(v, v + 1);
        if (v / width + 1 < height && coin(rng) < 0.4) link(v, v + width);
    }
    // Shuffle the edge list, as in a file that lists the arcs in any order.
    std::shuffle(g.edges.begin(), g.edges.end(), rng);
    return g;
}

EdgeList benchmark_graph() {
    for (const char* path : {"data/USA-road-d.NY.gr", "../data/USA-road-d.NY.gr", "../../data/USA-road-d.NY.gr"}) {
        if (std::filesystem::exists(path)) {
            std::println("graph: {}", path);
            return read_dimacs(path);
        }
    }
    std::println("graph: road_grid(514, 514, 42) (download the New York graph with tools/download_dimacs.sh)");
    return road_grid(514, 514, 42);
}

std::vector<Query> random_queries(Node nodes, std::size_t count, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<Node> node(0, nodes - 1);
    std::vector<Query> q(count);
    for (auto& [s, t] : q) s = node(rng), t = node(rng);
    return q;
}

}  // namespace w18
