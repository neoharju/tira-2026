// Tests for week 20. Run one task's tests with: ./w20_test -tc="task4*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <random>
#include <tuple>

#include "baseline.hpp"
#include "query.hpp"
#include "table.hpp"
#include "tira.hpp"

using namespace w20;

namespace {

// Random directed graphs with up to 14 nodes: zero weights, loops, parallel
// arcs and nodes that cannot be reached all happen.
Graph random_graph(std::mt19937_64& rng) {
    Node n = 1 + static_cast<Node>(rng() % 14);
    std::size_t m = rng() % (4 * n + 1);
    std::vector<Edge> edges(m);
    for (auto& e : edges) e = {static_cast<Node>(rng() % n), static_cast<Node>(rng() % n), static_cast<std::uint32_t>(rng() % 10)};
    return build_csr(n, edges);
}

std::vector<Node> random_order(Node n, std::mt19937_64& rng) {
    std::vector<Node> order(n);
    for (Node v = 0; v < n; ++v) order[v] = v;
    std::shuffle(order.begin(), order.end(), rng);
    return order;
}

// The arcs of every node in sorted order, so that two hierarchies can be
// compared although the arcs of a node may be listed in any order.
using Arcs = std::vector<std::vector<std::tuple<Node, Dist, Node>>>;
Arcs sorted_arcs(const Graph& g, const std::vector<Node>& middle) {
    Arcs a(g.nodes());
    for (Node u = 0; u < g.nodes(); ++u) {
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) a[u].push_back({g.target[e], g.weight[e], middle[e]});
        std::ranges::sort(a[u]);
    }
    return a;
}

void check_same(const Hierarchy& got, const Hierarchy& want) {
    REQUIRE(got.up.nodes() == want.up.nodes());
    REQUIRE(got.down.nodes() == want.down.nodes());
    REQUIRE(got.up_middle.size() == got.up.arcs());
    REQUIRE(got.down_middle.size() == got.down.arcs());
    CHECK(got.rank == want.rank);
    CHECK(got.shortcuts == want.shortcuts);
    CHECK(sorted_arcs(got.up, got.up_middle) == sorted_arcs(want.up, want.up_middle));
    CHECK(sorted_arcs(got.down, got.down_middle) == sorted_arcs(want.down, want.down_middle));
}

void check_path(const Graph& g, const std::vector<Node>& path, Node s, Node t, Dist want) {
    if (want == INF) {
        CHECK(path.empty());
        return;
    }
    REQUIRE(!path.empty());
    CHECK(path.front() == s);
    CHECK(path.back() == t);
    std::uint64_t length = 0;  // the path must use arcs of the graph and have the right length
    for (std::size_t i = 0; i + 1 < path.size(); ++i) {
        std::uint32_t w = INF;
        for (std::uint32_t e = g.offset[path[i]]; e < g.offset[path[i] + 1]; ++e)
            if (g.target[e] == path[i + 1]) w = std::min(w, g.weight[e]);
        REQUIRE(w != INF);
        length += w;
    }
    CHECK(length == want);
}

}  // namespace

TEST_CASE("task1: shortcuts of one node") {
    std::mt19937_64 rng(1);
    for (int round = 0; round < 3000; ++round) {
        Graph g = random_graph(rng);
        DynGraph d = make_dyn(g);
        Node v = static_cast<Node>(rng() % g.nodes());
        // Sometimes skip a few other nodes, but never a neighbour of v (as in task 7).
        std::vector<std::uint8_t> skip;
        if (round % 2) {
            skip.assign(g.nodes(), 0);
            for (Node x = 0; x < g.nodes(); ++x) skip[x] = x != v && rng() % 3 == 0;
            for (Arc a : d.out[v]) skip[a.node] = 0;
            for (Arc a : d.in[v]) skip[a.node] = 0;
        }
        CAPTURE(round);
        WitnessSearch ws(g.nodes());
        auto got = shortcuts_for(d, v, skip, ws);
        auto want = baseline::shortcuts_for(d, v, skip);
        std::ranges::sort(got);
        std::ranges::sort(want);
        REQUIRE(got == want);
    }
}

TEST_CASE("task2: contraction in a given order") {
    std::mt19937_64 rng(2);
    for (int round = 0; round < 1000; ++round) {
        Graph g = random_graph(rng);
        auto order = random_order(g.nodes(), rng);
        CAPTURE(round);
        check_same(contract(g, order), baseline::contract(g, order));
    }
    Graph g = road_grid(12, 10, 3);
    auto order = baseline::node_order(g);
    check_same(contract(g, order), baseline::contract(g, order));
}

TEST_CASE("task3: fast contraction is still right") {
    Graph g = road_grid(40, 30, 4);
    auto order = baseline::node_order(g);
    check_same(contract(g, order), baseline::contract(g, order));
}

TEST_CASE("task4: CH query") {
    std::mt19937_64 rng(5);
    for (int round = 0; round < 500; ++round) {
        Graph g = random_graph(rng);
        Hierarchy h = baseline::contract(g, random_order(g.nodes(), rng));
        CHQuery q(h);
        CAPTURE(round);
        for (Node s = 0; s < g.nodes(); ++s) {
            auto want = baseline::distances_from(g, s);
            for (Node t = 0; t < g.nodes(); ++t) REQUIRE(q.distance(s, t) == want[t]);
        }
    }
    Graph g = road_grid(30, 30, 6);
    Hierarchy h = baseline::contract(g, baseline::node_order(g));
    CHQuery q(h);
    for (Query x : random_queries(g.nodes(), 200, 7)) CHECK(q.distance(x.source, x.target) == baseline::dijkstra(g, x.source, x.target));
}

TEST_CASE("task5: CH path") {
    std::mt19937_64 rng(8);
    for (int round = 0; round < 300; ++round) {
        Graph g = random_graph(rng);
        Hierarchy h = baseline::contract(g, random_order(g.nodes(), rng));
        CHQuery q(h);
        CAPTURE(round);
        for (Node s = 0; s < g.nodes(); ++s) {
            auto want = baseline::distances_from(g, s);
            for (Node t = 0; t < g.nodes(); ++t) check_path(g, q.path(s, t), s, t, want[t]);
        }
    }
    Graph g = road_grid(30, 30, 9);
    Hierarchy h = baseline::contract(g, baseline::node_order(g));
    CHQuery q(h);
    for (Query x : random_queries(g.nodes(), 100, 10))
        check_path(g, q.path(x.source, x.target), x.source, x.target, baseline::dijkstra(g, x.source, x.target));
}

TEST_CASE("task6: SIMD distance table") {
    std::mt19937_64 rng(11);
    for (int round = 0; round < 2000; ++round) {
        std::uint32_t T = 8 * (1 + static_cast<std::uint32_t>(rng() % 6)), rows = 1 + static_cast<std::uint32_t>(rng() % 20);
        std::vector<Dist> B(std::size_t{rows} * T);
        for (Dist& b : B) b = rng() % 4 == 0 ? BIG : static_cast<Dist>(rng() % (round % 2 ? 100 : BIG / 2));
        std::vector<RowDist> space(rng() % 12);
        for (auto& [row, dist] : space) row = static_cast<std::uint32_t>(rng() % rows), dist = static_cast<Dist>(rng() % (BIG / 2));
        std::vector<Dist> got(T), want(T);
        min_plus_row(space, B.data(), T, got.data());
        baseline::min_plus_row(space, B.data(), T, want.data());
        CAPTURE(round);
        REQUIRE(got == want);
    }
    Graph g = road_grid(30, 25, 12);
    Hierarchy h = baseline::contract(g, baseline::node_order(g));
    std::vector<Node> sources = {0, 17, 300, 749}, targets;
    for (Node t = 0; t < 21; ++t) targets.push_back(t * 35);  // 21 targets: T is rounded up to 24
    auto table = distance_table(table_input(h, sources, targets));
    for (std::size_t i = 0; i < sources.size(); ++i) {
        auto want = baseline::distances_from(g, sources[i]);
        for (std::size_t j = 0; j < targets.size(); ++j) CHECK(table[i * 24 + j] == want[targets[j]]);
    }
}

TEST_CASE("task7: parallel contraction") {
    std::mt19937_64 rng(13);
    int saved = omp_get_max_threads();
    for (int round = 0; round < 300; ++round) {
        Graph g = random_graph(rng);
        auto order = random_order(g.nodes(), rng);
        auto want = baseline::contract_parallel(g, order);
        omp_set_num_threads(1 + round % 4);
        CAPTURE(round);
        check_same(contract_parallel(g, order), want);
    }
    Graph g = road_grid(20, 15, 14);
    auto order = baseline::node_order(g);
    auto want = baseline::contract_parallel(g, order);
    for (int t : {1, 2, 3, 4, 7}) {
        CAPTURE(t);
        omp_set_num_threads(t);
        check_same(contract_parallel(g, order), want);
    }
    omp_set_num_threads(saved);
}

TEST_CASE("task8: fast parallel contraction is still right") {
    Graph g = road_grid(40, 30, 16);
    auto order = baseline::node_order(g);
    check_same(contract_parallel(g, order), baseline::contract_parallel(g, order));
}
