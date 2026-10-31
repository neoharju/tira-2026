// Tests for week 22. Run one task's tests with: ./w22_test -tc="task4*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w22;

namespace {

// Random directed graphs with up to 30 nodes: dangling nodes, loops, repeated
// arcs and nodes without incoming arcs all happen.
Graph random_graph(std::mt19937_64& rng) {
    const Node n = 1 + static_cast<Node>(rng() % 30);
    std::vector<Edge> edges(rng() % (3 * n + 1));
    for (auto& e : edges) e = {static_cast<Node>(rng() % n), static_cast<Node>(rng() % n)};
    return build_csr(n, edges);
}

const std::vector<Graph>& test_graphs() {
    static const auto graphs = [] {
        std::mt19937_64 rng(1);
        std::vector<Graph> g;
        for (int i = 0; i < 300; ++i) g.push_back(random_graph(rng));
        g.push_back(build_csr(1, std::vector<Edge>{}));                       // one dangling node
        g.push_back(build_csr(3, std::vector<Edge>{{0, 1}, {1, 2}, {2, 0}}));  // a cycle
        g.push_back(web_graph(3000, 7));
        return g;
    }();
    return graphs;
}

std::vector<double> random_ranks(Node n, std::mt19937_64& rng) {
    std::vector<double> x(n);
    double sum = 0;
    for (double& v : x) sum += v = 0.5 + static_cast<double>(rng() % 1000);
    for (double& v : x) v /= sum;
    return x;
}

bool near(double a, double b, double tolerance = 1e-12) { return std::abs(a - b) <= tolerance * std::max(1.0, std::abs(b)); }

bool near(std::span<const double> a, std::span<const double> b, double tolerance = 1e-12) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i)
        if (!near(a[i], b[i], tolerance)) return false;
    return true;
}

double total(std::span<const double> v) { return std::accumulate(v.begin(), v.end(), 0.0); }

// The forward push result must keep its invariants, and agree with the exact
// personalized PageRank: estimate <= exact, and exact - estimate adds up to
// the remaining residual.
void check_local(const Graph& g, Node seed, double d, double epsilon) {
    CAPTURE(g.nodes());
    CAPTURE(seed);
    CAPTURE(epsilon);
    const LocalRank r = personalized(g, seed, d, epsilon);
    for (const Sparse* s : {&r.estimate, &r.residual}) {
        REQUIRE(s->node.size() == s->value.size());
        CHECK(std::ranges::adjacent_find(s->node, std::greater_equal<>{}) == s->node.end());
        CHECK(std::ranges::all_of(s->value, [](double v) { return v > 0; }));
        CHECK(std::ranges::all_of(s->node, [&](Node v) { return v < g.nodes(); }));
    }
    CHECK(near(total(r.estimate.value) + total(r.residual.value), 1.0, 1e-12));
    for (std::size_t i = 0; i < r.residual.node.size(); ++i)
        CHECK(r.residual.value[i] < epsilon * std::max<std::uint32_t>(1, g.degree(r.residual.node[i])));
    const std::vector<double> exact = baseline::personalized(g, seed, d, 1e-14);
    std::vector<double> estimate(g.nodes(), 0.0);
    for (std::size_t i = 0; i < r.estimate.node.size(); ++i) estimate[r.estimate.node[i]] = r.estimate.value[i];
    double gap = 0;
    for (Node v = 0; v < g.nodes(); ++v) {
        CHECK(estimate[v] <= exact[v] + 1e-12);
        gap += exact[v] - estimate[v];
    }
    CHECK(std::abs(gap - total(r.residual.value)) <= 1e-9);
}

}  // namespace

TEST_CASE("task1: push step") {
    std::mt19937_64 rng(11);
    for (double d : {0.85, 0.5}) {
        for (const Graph& g : test_graphs()) {
            const auto x = random_ranks(g.nodes(), rng);
            std::vector<double> y(g.nodes(), -1.0), want(g.nodes());
            const double change = baseline::push_step(g, x, want, d);
            CAPTURE(g.nodes());
            CHECK(near(push_step(g, x, y, d), change));
            CHECK(near(y, want));
        }
    }
}

TEST_CASE("task2: pull step") {
    std::mt19937_64 rng(12);
    for (double d : {0.85, 0.5}) {
        for (const Graph& g : test_graphs()) {
            const Graph in = transpose(g);
            const auto degree = out_degrees(g);
            const auto x = random_ranks(g.nodes(), rng);
            std::vector<double> y(g.nodes(), -1.0), want(g.nodes());
            const double change = baseline::push_step(g, x, want, d);
            CAPTURE(g.nodes());
            CHECK(near(pull_step(in, degree, x, y, d), change));
            CHECK(near(y, want));
        }
    }
}

TEST_CASE("task3: PageRank") {
    for (const Graph& g : test_graphs()) {
        const PageRank want = baseline::pagerank(g);
        const PageRank got = pagerank(g);
        CAPTURE(g.nodes());
        REQUIRE(got.rank.size() == g.nodes());
        CHECK(std::abs(got.steps - want.steps) <= 1);
        CHECK(near(total(got.rank), 1.0, 1e-9));
        CHECK(near(got.rank, want.rank, 1e-8));
    }
    const Graph& g = test_graphs().back();
    CHECK(pagerank(g, 0.85, 1e-9, 3).steps == 3);
    CHECK(pagerank(g, 0.85, 10.0).steps == 1);
    CHECK(near(pagerank(g, 0.5, 1e-12).rank, baseline::pagerank(g, 0.5, 1e-12).rank, 1e-10));
}

TEST_CASE("task4: personalized PageRank with forward push") {
    const auto& graphs = test_graphs();
    for (std::size_t i = 0; i < graphs.size(); i += 3) {
        const Graph& g = graphs[i];
        for (Node seed : {Node{0}, g.nodes() / 2, g.nodes() - 1})
            for (double epsilon : {1e-2, 1e-4, 1e-7}) check_local(g, seed, 0.85, epsilon);
    }
    const Graph& web = graphs.back();
    check_local(web, 5, 0.5, 1e-6);
    check_local(web, 1234, 0.85, 1e-8);
}

TEST_CASE("task5: rank update with AVX2") {
    std::mt19937_64 rng(5);
    for (std::size_t n : {0, 1, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 1000, 100003}) {
        std::vector<double> sum(n), x(n), inv(n), y(n, -1.0), c(n, -1.0), want_y(n), want_c(n);
        for (std::size_t v = 0; v < n; ++v) {
            sum[v] = static_cast<double>(rng() % 100000) * 1e-9;
            x[v] = static_cast<double>(rng() % 100000) * 1e-9;
            inv[v] = rng() % 5 == 0 ? 0.0 : 1.0 / static_cast<double>(1 + rng() % 40);
        }
        CAPTURE(n);
        const Update want = baseline::update_ranks(sum, x, inv, 2e-7, 0.85, want_y, want_c);
        const Update got = update_ranks(sum, x, inv, 2e-7, 0.85, y, c);
        CHECK(near(got.change, want.change));
        CHECK(near(got.dangling, want.dangling));
        CHECK(near(y, want_y, 1e-14));
        CHECK(near(c, want_c, 1e-14));
    }
}

namespace {
// Runs pull_step_parallel with several thread counts and compares with the baseline.
void check_parallel(const Graph& g) {
    const Graph in = transpose(g);
    const auto degree = out_degrees(g);
    std::mt19937_64 rng(g.nodes());
    const auto x = random_ranks(g.nodes(), rng);
    std::vector<double> want(g.nodes()), y(g.nodes());
    const double change = baseline::pull_step(in, degree, x, want, 0.85);
    const int saved = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(t);
        CAPTURE(t);
        CAPTURE(g.nodes());
        std::ranges::fill(y, -1.0);
        CHECK(near(pull_step_parallel(in, degree, x, y, 0.85), change, 1e-10));
        CHECK(near(y, want));
    }
    omp_set_num_threads(saved);
}
}  // namespace

TEST_CASE("task6: parallel pull step") {
    const auto& graphs = test_graphs();
    for (std::size_t i = 0; i < graphs.size(); i += 10) check_parallel(graphs[i]);
    check_parallel(graphs.back());
}

TEST_CASE("task7: parallel pull step on skewed graphs") {
    const Graph web = web_graph(20000, 9);
    check_parallel(relabel(web, in_degree_order(web)));  // the nodes with the most incoming arcs first
    std::vector<Edge> star;  // every arc goes to node 0
    for (Node u = 1; u < 5000; ++u) star.push_back({u, 0});
    check_parallel(build_csr(5000, star));
}

TEST_CASE("task8: locality order") {
    for (const Graph& g : {test_graphs()[0], test_graphs()[1], test_graphs()[100], test_graphs().back(), web_graph(20000, 3)}) {
        const auto id = locality_order(g);
        REQUIRE(id.size() == g.nodes());
        std::vector<Node> sorted = id;
        std::ranges::sort(sorted);
        std::vector<Node> all(g.nodes());
        std::iota(all.begin(), all.end(), Node{0});
        CHECK(sorted == all);  // a permutation
    }
}
