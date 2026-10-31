// Tests for week 18. Run one task's tests with: ./w18_test -tc="task5*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <limits>
#include <queue>
#include <random>

#include "baseline.hpp"
#include "heap4.hpp"
#include "heap8.hpp"
#include "tira.hpp"
#include "workspace.hpp"

using namespace w18;

namespace {

// A small road network plus 5 extra nodes that cannot be reached from it.
Graph test_graph(Node width, Node height, std::uint64_t seed) {
    EdgeList el = road_grid(width, height, seed);
    el.edges.push_back({el.nodes, el.nodes + 1, 7});
    return baseline::build_csr(el.nodes + 5, el.edges);
}

template <class Heap>
void check_heap(Heap& heap) {
    std::mt19937_64 rng(5);
    std::priority_queue<std::uint64_t, std::vector<std::uint64_t>, std::greater<>> want;
    for (int round = 0; round < 30000; ++round) {
        if (want.empty() || rng() % 3 != 0) {
            std::uint64_t key = round % 7 == 0 ? rng() : rng() % 1000;  // ties, and keys >= 2^63
            heap.push(key);
            want.push(key);
        } else {
            REQUIRE(heap.pop() == want.top());
            want.pop();
        }
        REQUIRE(heap.size() == want.size());
    }
    while (!want.empty()) {
        REQUIRE(heap.pop() == want.top());
        want.pop();
    }
    CHECK(heap.empty());
    heap.push(5);
    heap.push(3);
    heap.clear();
    CHECK(heap.empty());
    heap.push(9);
    CHECK(heap.pop() == 9);
}

template <class Kernel>
void check_kernel() {
    alignas(64) std::uint64_t a[8 * 3 + 8] = {};
    std::mt19937_64 rng(9);
    for (int round = 0; round < 50000; ++round) {
        std::size_t h = static_cast<std::size_t>(round % 3);
        std::uint64_t* c = a + 8 * h + 8;
        for (int j = 0; j < 8; ++j) {
            switch (round % 6) {
                case 0: c[j] = rng(); break;                                      // any 64-bit keys
                case 1: c[j] = rng() % 3; break;                                  // many ties
                case 2: c[j] = j < 1 + round % 8 ? rng() % 100 : EMPTY; break;    // a group that is not full
                case 3: c[j] = make_key(static_cast<Dist>(rng() % 5), static_cast<Node>(rng() % 3)); break;
                case 4: c[j] = rng() | std::uint64_t{1} << 63; break;             // all >= 2^63
                default: c[j] = j == round % 8 ? 1 : (j % 2 ? EMPTY : 2); break;  // the minimum moves around
            }
        }
        CAPTURE(round);
        REQUIRE(Kernel::min_child(a, h) == MinChildScalar::min_child(a, h));
    }
}

void check_path(const Graph& g, Node s, Node t) {
    CAPTURE(s);
    CAPTURE(t);
    PathResult want = baseline::shortest_path(g, s, t);
    PathResult got = shortest_path(g, s, t);
    CHECK(got.distance == want.distance);
    CHECK(got.settled == want.settled);
    if (want.distance == INF) {
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
    CHECK(length == got.distance);
}

}  // namespace

TEST_CASE("task1: build CSR") {
    std::mt19937_64 rng(1);
    for (Node n : {1u, 2u, 10u, 1000u}) {
        for (std::size_t m : {std::size_t{0}, std::size_t{1}, std::size_t{n}, std::size_t{5} * n}) {
            std::vector<Edge> edges(m);
            for (auto& e : edges) {  // includes loops, parallel arcs and nodes without arcs
                e.from = static_cast<Node>(rng() % n);
                e.to = static_cast<Node>(rng() % n);
                e.weight = static_cast<std::uint32_t>(rng() % 100);
            }
            CAPTURE(n);
            CAPTURE(m);
            CHECK(build_csr(n, edges) == baseline::build_csr(n, edges));
        }
    }
    EdgeList el = road_grid(50, 40, 2);
    CHECK(build_csr(el.nodes, el.edges) == baseline::build_csr(el.nodes, el.edges));
}

TEST_CASE("task2: Dijkstra") {
    Graph g = test_graph(30, 25, 1);
    for (Node s : {0u, 5u, 377u, g.nodes() - 6, g.nodes() - 5}) {
        CAPTURE(s);
        auto want = baseline::simple_dijkstra(g, s);
        StdHeap heap;
        std::vector<Dist> dist;
        CHECK(settle_order(g, s, heap, dist) == want.order);
        CHECK(dist == want.dist);
        CHECK(dijkstra(g, s) == want.dist);
    }
}

TEST_CASE("task3: shortest path with early exit") {
    Graph g = test_graph(25, 25, 2);
    auto queries = random_queries(g.nodes() - 5, 80, 3);
    queries.push_back({10, 10});                       // source == target
    queries.push_back({0, g.nodes() - 1});             // cannot be reached
    queries.push_back({g.nodes() - 5, g.nodes() - 4}); // the lone arc
    baseline::ResettingWorkspace ws(g.nodes());
    StdHeap heap;
    for (auto [s, t] : queries) {
        check_path(g, s, t);
        CHECK(query(g, s, t, ws, heap) == baseline::simple_dijkstra(g, s, t).dist[t]);
    }
}

TEST_CASE("task4: 4-ary heap") {
    Heap4 heap;
    check_heap(heap);
}

TEST_CASE("task5: smallest child with AVX-512") {
    if (!tira::has_avx512()) {
        MESSAGE("SKIPPED: no AVX-512 on this CPU. Run under Intel SDE: sde64 -- ./w18_test -tc=\"task5*\"");
        return;
    }
    check_kernel<MinChildAvx512>();
    Heap8<MinChildAvx512> heap;
    check_heap(heap);
}

TEST_CASE("task6: smallest child with AVX2") {
    check_kernel<MinChildAvx2>();
    Heap8<MinChildAvx2> heap;
    check_heap(heap);
}

TEST_CASE("task7: parallel queries") {
    Graph g = test_graph(25, 25, 4);
    auto queries = random_queries(g.nodes(), 40, 5);
    queries.push_back({3, 3});
    queries.push_back({0, g.nodes() - 1});
    auto want = baseline::distances(g, queries);
    int saved = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        CAPTURE(t);
        omp_set_num_threads(t);
        CHECK(distances(g, queries) == want);
    }
    omp_set_num_threads(saved);
}

TEST_CASE("task8: versioned workspace") {
    Workspace ws(10);
    ws.begin_query();
    for (Node v = 0; v < 10; ++v) CHECK(ws.dist(v) == INF);
    ws.set_dist(3, 7);
    ws.set_dist(5, 0);
    CHECK(ws.dist(3) == 7);
    CHECK(ws.dist(5) == 0);
    CHECK(ws.dist(4) == INF);
    ws.begin_query();
    CHECK(ws.dist(3) == INF);
    CHECK(ws.dist(5) == INF);
    ws.set_dist(4, 1);
    // About 2^32 queries later: the version number goes around.
    ws.skip_queries(std::numeric_limits<std::uint32_t>::max() - 4);
    for (Node i = 0; i < 10; ++i) {
        ws.begin_query();
        CAPTURE(i);
        for (Node v = 0; v < 10; ++v) REQUIRE(ws.dist(v) == INF);
        ws.set_dist(i, i);
    }
    Graph g = test_graph(25, 25, 6);
    Workspace mine(g.nodes());
    StdHeap heap;
    auto queries = random_queries(g.nodes(), 60, 7);
    auto want = baseline::distances(g, queries);
    for (std::size_t i = 0; i < queries.size(); ++i)
        CHECK(query(g, queries[i].source, queries[i].target, mine, heap) == want[i]);
}
