// Speed goals for week 20 (tasks 1, 2, 5 and 7 have none). Run in the release
// build: ./w20_bench [task]
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include "baseline.hpp"
#include "query.hpp"
#include "table.hpp"
#include "tira.hpp"

using namespace w20;

namespace {

// A small road network for the contraction benchmarks, and a larger one for
// the queries and the tables.
const Graph& small_grid() {
    static const Graph g = road_grid(160, 160, 41);
    return g;
}
const std::vector<Node>& small_order() {
    static const auto order = baseline::node_order(small_grid());
    return order;
}
const Graph& large_grid() {
    static const Graph g = road_grid(200, 200, 42);
    return g;
}
// The hierarchy of the queries and the tables comes from the baseline, so
// tasks 4 and 6 do not depend on your contract.
const Hierarchy& large_hierarchy() {
    static const Hierarchy h = baseline::contract(large_grid(), baseline::node_order(large_grid()));
    return h;
}

// A quick check that two hierarchies are the same (the tests check more).
bool same(const Hierarchy& a, const Hierarchy& b) {
    return a.rank == b.rank && a.shortcuts == b.shortcuts && a.up.target.size() == b.up.target.size() &&
           a.down.target.size() == b.down.target.size();
}

// Makes a new grid of the same size as small_grid, and its node order, for
// each round of the contraction benchmarks.
struct Contraction {
    Graph g;
    std::vector<Node> order;
};
Contraction new_contraction(std::uint64_t seed) {
    Contraction c{road_grid(160, 160, seed), {}};
    c.order = baseline::node_order(c.g);
    return c;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

bool bench_contract() {
    const std::string_view task = "task3 contraction";
    if (!same(contract(small_grid(), small_order()), baseline::contract(small_grid(), small_order())))
        return wrong(task, "your hierarchy is not the baseline's");
    Contraction c;
    Hierarchy want, got;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { c = new_contraction(seed); },
                                 [&] { want = baseline::contract(c.g, c.order); }, [&] { got = contract(c.g, c.order); },
                                 [&] { return same(got, want); }, 3, 203);
    return tira::report(task, t, 1.8);
}

bool bench_query() {
    const Graph& g = large_grid();
    const Hierarchy& h = large_hierarchy();
    auto queries = random_queries(g.nodes(), 200, 43);
    CHQuery q(h);
    for (auto x : queries)
        if (q.distance(x.source, x.target) != baseline::dijkstra(g, x.source, x.target))
            return wrong("task4 CH query vs Dijkstra", "a distance is not the same as with Dijkstra");
    std::vector<Dist> want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { queries = random_queries(g.nodes(), 200, seed); },
        [&] {
            want.clear();
            for (auto x : queries) want.push_back(baseline::dijkstra(g, x.source, x.target));
        },
        [&] {
            got.clear();
            for (auto x : queries) got.push_back(q.distance(x.source, x.target));
        },
        [&] { return got == want; }, 5, 204);
    return tira::report("task4 CH query vs Dijkstra", t, 10.0);
}

bool bench_table() {
    const Hierarchy& h = large_hierarchy();
    // Each round has new sources and targets. table_input does their searches
    // without a time measurement. The benchmark measures the min-plus rows.
    auto make = [&](std::uint64_t seed) {
        std::vector<Node> sources, targets;
        for (auto x : random_queries(large_grid().nodes(), 256, seed)) sources.push_back(x.source), targets.push_back(x.target);
        return table_input(h, sources, targets);
    };
    TableInput in = make(44);
    if (distance_table(in, min_plus_row) != distance_table(in, baseline::min_plus_row))
        return wrong("task6 256 x 256 distance table", "the table is not the baseline's");
    std::vector<Dist> want, got;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { in = make(seed); },
                                 [&] { want = distance_table(in, baseline::min_plus_row); },
                                 [&] { got = distance_table(in, min_plus_row); }, [&] { return got == want; }, 9, 206);
    return tira::report("task6 256 x 256 distance table", t, 3.0);
}

bool bench_parallel() {
    if (!same(contract_parallel(small_grid(), small_order()), baseline::contract_parallel(small_grid(), small_order())))
        return wrong("task8 parallel contraction", "your hierarchy is not the baseline's");
    int all = omp_get_max_threads();
    Contraction c;
    Hierarchy want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { c = new_contraction(seed); },
        [&] {  // your contract_parallel on one thread
            omp_set_num_threads(1);
            want = contract_parallel(c.g, c.order);
            omp_set_num_threads(all);
        },
        [&] { got = contract_parallel(c.g, c.order); }, [&] { return same(got, want); }, 3, 208);
    return tira::report("task8 parallel contraction", t, 1.3);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task3", bench_contract}, {"task4", bench_query}, {"task6", bench_table}, {"task8", bench_parallel}}};
    return b.run(argc, argv);
}
