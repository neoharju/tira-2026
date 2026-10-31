// Speed goals for week 19 (tasks 1, 3 and 6 have none). Run in the release
// build: ./w19_bench [task]
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <numeric>
#include <random>
#include <string>

#include "baseline.hpp"
#include "tira.hpp"

using namespace w19;

namespace {

const RoadMap& road() {
    static const RoadMap m = benchmark_map();
    return m;
}

const std::vector<Query>& queries() {
    static const auto q = random_queries(road().graph.nodes(), 60, 21);
    return q;
}

// The right distances of queries(), from the baseline's Dijkstra.
const std::vector<Dist>& query_distances() {
    static const auto want = [] {
        std::vector<Dist> out;
        for (auto [s, t] : queries()) out.push_back(baseline::distances_from(road().graph, s)[t]);
        return out;
    }();
    return want;
}

// Medium-range queries for bidirectional search: the target is the node that
// Dijkstra's algorithm settles as number 32,768 from the source (the target's
// "Dijkstra rank" is 2^15). Random queries are often cut by the map's border.
struct RankQueries {
    std::vector<Query> queries;
    std::vector<Dist> want;  // the right distances
};
const RankQueries& rank_queries() {
    static const auto q = [] {
        const Graph& g = road().graph;
        const std::size_t rank = std::min<std::size_t>(std::size_t{1} << 15, g.nodes() - 1);
        RankQueries out;
        for (Query x : random_queries(g.nodes(), 60, 23)) {
            std::vector<Dist> d = baseline::distances_from(g, x.source);
            std::vector<Node> order(g.nodes());
            std::iota(order.begin(), order.end(), Node{0});
            std::nth_element(order.begin(), order.begin() + static_cast<std::ptrdiff_t>(rank), order.end(),
                             [&](Node a, Node b) { return std::pair(d[a], a) < std::pair(d[b], b); });
            out.queries.push_back({x.source, order[rank]});
            out.want.push_back(d[order[rank]]);
        }
        return out;
    }();
    return q;
}

// True if search(s, t) gives the right distance for every query. Otherwise
// prints the first wrong answer: a wrong result must not be timed.
template <class Search>
bool check(std::string_view task, std::string_view what, const std::vector<Query>& q, const std::vector<Dist>& want,
           Search search) {
    for (std::size_t i = 0; i < q.size(); ++i) {
        Dist got = search(q[i].source, q[i].target);
        if (got != want[i]) {
            auto text = [](Dist d) { return d == INF ? std::string("INF") : std::to_string(d); };
            std::println("{:<32} WRONG: {} gives {} instead of {} from {} to {} (run the tests)", task, what, text(got),
                         text(want[i]), q[i].source, q[i].target);
            return false;
        }
    }
    return true;
}

// Your astar with h = 0 must be right, because it is the baseline of tasks 2 and 4.
bool check_dijkstra(std::string_view task) {
    return check(task, "your astar with h = 0", queries(), query_distances(),
                 [](Node s, Node t) { return dijkstra(road().graph, s, t).distance; });
}

// Your astar with h = 0, for the queries.
void run_dijkstra() {
    for (auto [s, t] : queries()) tira::keep(dijkstra(road().graph, s, t));
}

bool bench_geo() {
    const RoadMap& m = road();
    double scale = geo_scale(m.graph, m.points);
    const std::string_view task = "task2 A*, straight-line bound";
    if (!check_dijkstra(task) || !check(task, "astar with GeoPotential", queries(), query_distances(), [&](Node s, Node t) {
            return astar(m.graph, s, t, GeoPotential{m.points, scale, m.points[t]}).distance;
        }))
        return false;
    auto t = tira::compare(run_dijkstra, [&] {
        for (auto [s, d] : queries()) tira::keep(astar(m.graph, s, d, GeoPotential{m.points, scale, m.points[d]}));
    }, 5);
    return tira::report(task, t, 1.3);
}

bool bench_alt() {
    const RoadMap& m = road();
    static const auto rows = baseline::landmark_rows(m.graph, m.reverse, baseline::farthest_landmarks(m.graph, 8, 0));
    const std::string_view task = "task4 A*, ALT bound";
    if (!check_dijkstra(task) || !check(task, "astar with AltPotential", queries(), query_distances(),
                                        [&](Node s, Node t) { return astar(m.graph, s, t, AltPotential{rows, rows[t]}).distance; }))
        return false;
    auto t = tira::compare(run_dijkstra, [&] {
        for (auto [s, d] : queries()) tira::keep(astar(m.graph, s, d, AltPotential{rows, rows[d]}));
    }, 5);
    return tira::report(task, t, 5.0);
}

bool bench_bidirectional() {
    const RoadMap& m = road();
    const RankQueries& r = rank_queries();
    const std::string_view task = "task5 bidirectional Dijkstra";
    if (!check(task, "your astar with h = 0", r.queries, r.want, [&](Node s, Node t) { return dijkstra(m.graph, s, t).distance; }) ||
        !check(task, "bidirectional", r.queries, r.want, [&](Node s, Node t) { return bidirectional(m.graph, m.reverse, s, t); }))
        return false;
    auto t = tira::compare([&] { for (auto [s, d] : r.queries) tira::keep(dijkstra(m.graph, s, d)); },
                           [&] { for (auto [s, d] : r.queries) tira::keep(bidirectional(m.graph, m.reverse, s, d)); }, 7);
    return tira::report(task, t, 1.25);
}

bool bench_bound16() {
    // 4096 random rows (256 KB, they fit in the L2 cache) and random nodes.
    std::mt19937_64 rng(22);
    std::vector<LandmarkRow16> rows(4096);
    for (auto& r : rows)
        for (int i = 0; i < 16; ++i) r.from[i] = static_cast<std::int32_t>(rng() % 5000000), r.to[i] = static_cast<std::int32_t>(rng() % 5000000);
    std::vector<std::uint32_t> nodes(1 << 20);
    for (auto& v : nodes) v = static_cast<std::uint32_t>(rng() % rows.size());
    const LandmarkRow16 target = rows[17];
    for (std::uint32_t v : nodes) {
        Dist got = alt_bound16(rows[v], target), want = baseline::alt_bound16(rows[v], target);
        if (got != want) {
            std::println("{:<32} WRONG: the bound is {} instead of {} (run the tests)", "task7 ALT bound, 16 landmarks", got, want);
            return false;
        }
    }
    auto run = [&](auto bound) {
        return [&, bound] {
            std::uint64_t sum = 0;
            for (std::uint32_t v : nodes) sum += bound(rows[v], target);
            tira::keep(sum);
        };
    };
    auto t = tira::compare(run([](const LandmarkRow16& a, const LandmarkRow16& b) { return baseline::alt_bound16(a, b); }),
                           run([](const LandmarkRow16& a, const LandmarkRow16& b) { return alt_bound16(a, b); }));
    return tira::report("task7 ALT bound, 16 landmarks", t, 2.5);
}

bool bench_rows() {
    const RoadMap& m = road();
    static const auto landmarks = baseline::farthest_landmarks(m.graph, 8, 0);
    if (landmark_rows(m.graph, m.reverse, landmarks) != baseline::landmark_rows(m.graph, m.reverse, landmarks)) {
        std::println("{:<32} WRONG: the rows are not the baseline's (run the tests)", "task8 landmark rows in parallel");
        return false;
    }
    int all = omp_get_max_threads();
    auto t = tira::compare(
        [&] {  // your landmark_rows on one thread
            omp_set_num_threads(1);
            tira::keep(landmark_rows(m.graph, m.reverse, landmarks));
            omp_set_num_threads(all);
        },
        [&] { tira::keep(landmark_rows(m.graph, m.reverse, landmarks)); }, 3);
    return tira::report("task8 landmark rows in parallel", t, 2.5);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task2", bench_geo},
                        {"task4", bench_alt},
                        {"task5", bench_bidirectional},
                        {"task7", bench_bound16},
                        {"task8", bench_rows}}};
    return b.run(argc, argv);
}
