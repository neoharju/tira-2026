// Speed goals for week 22 (tasks 1, 2, 3 and 6 have none). Run in the release
// build: ./w22_bench [task]
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <cmath>
#include <numeric>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w22;

namespace {

const Graph& graph() {
    static const Graph g = benchmark_graph();
    return g;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

std::vector<double> uniform(Node n) { return std::vector<double>(n, 1.0 / n); }

bool near(double a, double b, double tolerance) { return std::abs(a - b) <= tolerance * std::max(1.0, std::abs(b)); }

bool near(std::span<const double> a, std::span<const double> b, double tolerance) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i)
        if (!near(a[i], b[i], tolerance)) return false;
    return true;
}

// One pull step as the chapter times it: contrib[u] = x[u] / outdeg(u) first,
// so that the sums read one array, once per link. Task 8 prints its time.
double pull_step_contrib(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x,
                         std::span<double> y, std::span<double> contrib, double d) {
    const Node n = in.nodes();
    double dangling = 0;
    for (Node u = 0; u < n; ++u) {
        if (out_degree[u] > 0) contrib[u] = x[u] / out_degree[u];
        else contrib[u] = 0, dangling += x[u];
    }
    const double base = (1 - d) / n + d * dangling / n;
    double change = 0;
    for (Node v = 0; v < n; ++v) {
        double sum = 0;
        for (Node u : in.neighbours(v)) sum += contrib[u];
        y[v] = base + d * sum;
        change += std::abs(y[v] - x[v]);
    }
    return change;
}

bool bench_personalized() {
    const std::string_view task = "task4 personalized PageRank";
    const Graph& g = graph();
    const double d = 0.85, epsilon = 1e-6;
    std::vector<Node> seeds;  // pages with links, spread over the graph
    for (Node u = g.nodes() / 7; seeds.size() < 2; u = (u + g.nodes() / 3) % g.nodes())
        if (g.degree(u) > 0) seeds.push_back(u);
    for (Node seed : seeds) {
        const LocalRank r = personalized(g, seed, d, epsilon);
        double sum = 0;
        for (double v : r.estimate.value) sum += v;
        for (double v : r.residual.value) sum += v;
        bool small = r.residual.node.size() == r.residual.value.size();
        for (std::size_t i = 0; small && i < r.residual.node.size(); ++i)
            small = r.residual.value[i] < epsilon * std::max<std::uint32_t>(1, g.degree(r.residual.node[i]));
        if (!near(sum, 1.0, 1e-9) || !small || r.estimate.node.size() != r.estimate.value.size())
            return wrong(task, "the estimate and the residual do not add up");
    }
    // Power iteration until the change is below 1e-6, against forward push with epsilon 1e-6.
    auto t = tira::compare([&] { for (Node s : seeds) tira::keep(baseline::personalized(g, s, d, 1e-6)); },
                           [&] { for (Node s : seeds) tira::keep(personalized(g, s, d, epsilon)); }, 3);
    return tira::report(task, t, 30.0);
}

bool bench_update() {
    const std::string_view task = "task5 rank update with AVX2";
    const Node n = graph().nodes();
    const auto degree = out_degrees(graph());
    std::vector<double> sum(n), x(n), inv(n), y(n), c(n), want_y(n), want_c(n);
    for (Node v = 0; v < n; ++v) {
        sum[v] = (v % 997) * 1e-9;
        x[v] = (v % 1009) * 1e-9;
        inv[v] = degree[v] ? 1.0 / degree[v] : 0.0;
    }
    const Update want = baseline::update_ranks(sum, x, inv, 1.7e-7, 0.85, want_y, want_c);
    const Update got = update_ranks(sum, x, inv, 1.7e-7, 0.85, y, c);
    if (!near(got.change, want.change, 1e-12) || !near(got.dangling, want.dangling, 1e-12) || !near(y, want_y, 1e-14) ||
        !near(c, want_c, 1e-14))
        return wrong(task, "the result is not the baseline's");
    auto t = tira::compare([&] { tira::keep(baseline::update_ranks(sum, x, inv, 1.7e-7, 0.85, y, c)); },
                           [&] { tira::keep(update_ranks(sum, x, inv, 1.7e-7, 0.85, y, c)); }, 25);
    return tira::report(task, t, 1.5);
}

bool bench_parallel() {
    const std::string_view task = "task7 parallel pull step";
    // The nodes sorted by in-degree: the first nodes have most of the arcs.
    static const Graph g = relabel(graph(), in_degree_order(graph()));
    static const Graph in = transpose(g);
    static const auto degree = out_degrees(g);
    const auto x = uniform(g.nodes());
    std::vector<double> y(g.nodes()), want(g.nodes());
    const double change = baseline::pull_step(in, degree, x, want, 0.85);
    if (!near(pull_step_parallel(in, degree, x, y, 0.85), change, 1e-9) || !near(y, want, 1e-12))
        return wrong(task, "the result is not the baseline's");
    const int all = omp_get_max_threads();
    auto t = tira::compare(
        [&] {  // your pull_step_parallel on one thread
            omp_set_num_threads(1);
            tira::keep(pull_step_parallel(in, degree, x, y, 0.85));
            omp_set_num_threads(all);
        },
        [&] { tira::keep(pull_step_parallel(in, degree, x, y, 0.85)); }, 15);
    return tira::report(task, t, 2.7);
}

bool bench_order() {
    const std::string_view task = "task8 locality order";
    const Graph& g = graph();
    const auto id = locality_order(g);
    std::vector<Node> sorted = id;
    std::ranges::sort(sorted);
    for (Node i = 0; i < g.nodes(); ++i)
        if (sorted.size() != g.nodes() || sorted[i] != i) return wrong(task, "the order is not a permutation");
    const Graph in = transpose(g), reordered = transpose(relabel(g, id));
    const auto before = static_cast<double>(simulated_misses(in)), after = static_cast<double>(simulated_misses(reordered));
    const double goal = 1.4;
    const bool ok = before >= goal * after;
    std::println("{:<32} cache misses {:10.0f} before, {:10.0f} after: {:5.2f}x fewer  goal {:4.2f}x  {}", task, before, after,
                 before / after, goal, ok ? "ok" : "BELOW GOAL");
    // The time of a pull step before and after, for information.
    const auto degree = out_degrees(g), new_degree = out_degrees(relabel(g, id));
    const auto x = uniform(g.nodes());
    std::vector<double> y(g.nodes()), contrib(g.nodes());
    auto t = tira::compare([&] { tira::keep(pull_step_contrib(in, degree, x, y, contrib, 0.85)); },
                           [&] { tira::keep(pull_step_contrib(reordered, new_degree, x, y, contrib, 0.85)); }, 15);
    std::println("      a pull step on one thread: {:.2f} ms before, {:.2f} ms after, {:.2f}x (no goal)", t.baseline * 1e3, t.yours * 1e3,
                 t.speedup());
    return ok;
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task4", bench_personalized}, {"task5", bench_update}, {"task7", bench_parallel}, {"task8", bench_order}}};
    return b.run(argc, argv);
}
