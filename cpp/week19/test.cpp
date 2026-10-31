// Tests for week 19. Run one task's tests with: ./w19_test -tc="task4*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <cmath>
#include <random>

#include "baseline.hpp"
#include "tira.hpp"

using namespace w19;

namespace {

// Random directed graphs with up to 15 nodes: zero weights, loops, parallel
// arcs and nodes that cannot be reached all happen.
Graph random_graph(std::mt19937_64& rng) {
    Node n = 1 + static_cast<Node>(rng() % 15);
    std::size_t m = rng() % (4 * n + 1);
    std::vector<Edge> edges(m);
    for (auto& e : edges) e = {static_cast<Node>(rng() % n), static_cast<Node>(rng() % n), static_cast<std::uint32_t>(rng() % 10)};
    return build_csr(n, edges);
}

// A graph where the first node that both searches settle is not on the
// shortest path: s=0, a=1, b=2, x=3, t=4, c=5, d=6 (as in the chapter).
Graph trap_graph() {
    std::vector<Edge> edges;
    for (auto [a, b, w] : std::vector<Edge>{{0, 1, 6}, {1, 2, 4}, {2, 4, 6}, {0, 3, 9}, {3, 4, 9}, {0, 5, 7}, {4, 6, 7}, {5, 3, 8}, {6, 3, 8}}) {
        edges.push_back({a, b, w});
        edges.push_back({b, a, w});
    }
    return build_csr(7, edges);
}

std::vector<Dist> geo_values(const RoadMap& m, Node t) {
    return baseline::geo_potential(m.points, baseline::geo_scale(m.graph, m.points), m.points[t]);
}

void check_path(const Graph& g, const Graph& rev, Node s, Node t) {
    CAPTURE(s);
    CAPTURE(t);
    Dist want = baseline::simple_search(g, s, t).dist[t];
    PathResult got = bidirectional_path(g, rev, s, t);
    CHECK(got.distance == want);
    if (want == INF) {
        CHECK(got.path.empty());
        return;
    }
    REQUIRE(!got.path.empty());
    CHECK(got.path.front() == s);
    CHECK(got.path.back() == t);
    std::uint64_t length = 0;  // the path must use arcs of the graph and have the right length
    for (std::size_t i = 0; i + 1 < got.path.size(); ++i) {
        Node u = got.path[i], v = got.path[i + 1];
        std::uint32_t w = INF;
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e)
            if (g.target[e] == v) w = std::min(w, g.weight[e]);
        REQUIRE(w != INF);
        length += w;
    }
    CHECK(length == want);
}

}  // namespace

TEST_CASE("task1: A*") {
    RoadMap m = road_map(20, 15, 1);
    auto queries = random_queries(m.graph.nodes(), 40, 2);
    queries.push_back({7, 7});
    for (Query q : queries) {
        Node s = q.source, t = q.target;  // not a structured binding: Clang's OpenMP cannot capture those
        CAPTURE(s);
        CAPTURE(t);
        auto plain = baseline::simple_search(m.graph, s, t);
        SearchResult d = dijkstra(m.graph, s, t);
        CHECK(d.distance == plain.dist[t]);
        CHECK(d.settled == plain.order.size());
        std::vector<Dist> h = geo_values(m, t);
        auto guided = baseline::simple_search(m.graph, s, t, h);
        SearchResult a = astar(m.graph, s, t, [&](Node v) { return h[v]; });
        CHECK(a.distance == guided.dist[t]);
        CHECK(a.settled == guided.order.size());
    }
    std::mt19937_64 rng(3);  // targets that cannot be reached, zero weights, ...
    for (int round = 0; round < 300; ++round) {
        Graph g = random_graph(rng);
        Node s = static_cast<Node>(rng() % g.nodes()), t = static_cast<Node>(rng() % g.nodes());
        CAPTURE(round);
        auto plain = baseline::simple_search(g, s, t);
        SearchResult d = dijkstra(g, s, t);
        CHECK(d.distance == plain.dist[t]);
        CHECK(d.settled == plain.order.size());
    }
}

TEST_CASE("task2: straight-line bound") {
    RoadMap m = road_map(30, 20, 4);
    double want = baseline::geo_scale(m.graph, m.points);
    CHECK(geo_scale(m.graph, m.points) == doctest::Approx(want).epsilon(1e-12));
    std::mt19937_64 rng(5);
    for (int round = 0; round < 10; ++round) {
        Node t = static_cast<Node>(rng() % m.graph.nodes());
        CAPTURE(t);
        GeoPotential h{m.points, geo_scale(m.graph, m.points), m.points[t]};
        std::vector<Dist> ref = geo_values(m, t);
        CHECK(h(t) == 0);
        for (Node v = 0; v < m.graph.nodes(); ++v) REQUIRE(std::abs(static_cast<long long>(h(v)) - ref[v]) <= 1);
        for (Node u = 0; u < m.graph.nodes(); ++u)  // consistent: h(u) <= w + h(v) for every arc
            for (std::uint32_t e = m.graph.offset[u]; e < m.graph.offset[u + 1]; ++e)
                REQUIRE(h(u) <= m.graph.weight[e] + h(m.graph.target[e]));
    }
    // Two nodes at the same point: the arc between them does not count.
    std::vector<Point> p = {{0, 0}, {0, 0}, {30, 40}};
    std::vector<Edge> edges = {{0, 1, 0}, {1, 2, 100}, {2, 0, 60}};
    Graph g = build_csr(3, edges);
    CHECK(geo_scale(g, p) == doctest::Approx(1.2 * (1 - 1e-6)).epsilon(1e-12));
}

TEST_CASE("task3: farthest-point landmarks") {
    for (std::uint64_t seed : {1, 2, 3}) {
        RoadMap m = road_map(25, 20, seed);
        for (std::uint32_t k : {1u, 2u, 8u, 16u}) {
            Node start = static_cast<Node>(seed * 97 % m.graph.nodes());
            CAPTURE(seed);
            CAPTURE(k);
            CHECK(farthest_landmarks(m.graph, k, start) == baseline::farthest_landmarks(m.graph, k, start));
        }
    }
}

TEST_CASE("task4: ALT potential") {
    RoadMap m = road_map(30, 25, 6);
    auto landmarks = baseline::farthest_landmarks(m.graph, 8, 0);
    auto rows = baseline::landmark_rows(m.graph, m.reverse, landmarks);
    for (Query q : random_queries(m.graph.nodes(), 20, 7)) {
        Node t = q.target;
        CAPTURE(t);
        AltPotential h{rows, rows[t]};
        std::vector<Dist> want(m.graph.nodes());
        for (Node v = 0; v < m.graph.nodes(); ++v) want[v] = baseline::alt_potential(rows[v], rows[t]);
        for (Node v = 0; v < m.graph.nodes(); ++v) REQUIRE(h(v) == want[v]);
    }
    LandmarkRow a{}, b{};  // negative differences and large distances
    for (int i = 0; i < 8; ++i) a.from[i] = 1000000 + i, a.to[i] = 5 * i, b.from[i] = 7, b.to[i] = 2000000000;
    CHECK(AltPotential{std::span(&a, 1), b}(0) == baseline::alt_potential(a, b));
    CHECK(AltPotential{std::span(&b, 1), a}(0) == baseline::alt_potential(b, a));
}

TEST_CASE("task5: bidirectional Dijkstra") {
    std::mt19937_64 rng(8);
    for (int round = 0; round < 2000; ++round) {
        Graph g = random_graph(rng);
        Graph rev = reverse(g);
        CAPTURE(round);
        for (Node s = 0; s < g.nodes(); ++s) {
            auto want = baseline::simple_search(g, s, INF).dist;
            for (Node t = 0; t < g.nodes(); ++t) {
                CAPTURE(s);
                CAPTURE(t);
                REQUIRE(bidirectional(g, rev, s, t) == want[t]);
            }
        }
    }
    Graph trap = trap_graph();
    CHECK(bidirectional(trap, reverse(trap), 0, 4) == 16);
    RoadMap m = road_map(30, 30, 9);
    for (Query q : random_queries(m.graph.nodes(), 50, 10))
        CHECK(bidirectional(m.graph, m.reverse, q.source, q.target) == baseline::simple_search(m.graph, q.source, q.target).dist[q.target]);
}

TEST_CASE("task6: bidirectional path") {
    std::mt19937_64 rng(11);
    for (int round = 0; round < 500; ++round) {
        Graph g = random_graph(rng);
        Graph rev = reverse(g);
        CAPTURE(round);
        for (Node s = 0; s < g.nodes(); ++s)
            for (Node t = 0; t < g.nodes(); ++t) check_path(g, rev, s, t);
    }
    Graph trap = trap_graph();
    check_path(trap, reverse(trap), 0, 4);
    RoadMap m = road_map(30, 30, 12);
    for (Query q : random_queries(m.graph.nodes(), 50, 13)) check_path(m.graph, m.reverse, q.source, q.target);
}

TEST_CASE("task7: ALT bound for 16 landmarks") {
    std::mt19937_64 rng(14);
    for (int round = 0; round < 100000; ++round) {
        LandmarkRow16 v, t;
        std::uint32_t range = round % 3 == 0 ? 100 : round % 3 == 1 ? 1000000 : 0x7fffffff;  // ties, and large values
        for (int i = 0; i < 16; ++i) {
            v.from[i] = static_cast<std::int32_t>(rng() % range);
            v.to[i] = static_cast<std::int32_t>(rng() % range);
            t.from[i] = static_cast<std::int32_t>(rng() % range);
            t.to[i] = static_cast<std::int32_t>(rng() % range);
        }
        CAPTURE(round);
        REQUIRE(alt_bound16(v, t) == baseline::alt_bound16(v, t));
    }
}

TEST_CASE("task8: landmark rows in parallel") {
    RoadMap m = road_map(40, 30, 15);
    auto landmarks = baseline::farthest_landmarks(m.graph, 8, 3);
    auto want = baseline::landmark_rows(m.graph, m.reverse, landmarks);
    int saved = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        CAPTURE(t);
        omp_set_num_threads(t);
        CHECK(landmark_rows(m.graph, m.reverse, landmarks) == want);
    }
    omp_set_num_threads(saved);
}
