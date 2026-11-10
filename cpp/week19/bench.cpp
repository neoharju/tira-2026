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
RankQueries make_rank_queries(std::uint64_t seed) {
    const Graph& g = road().graph;
    const std::size_t rank = std::min<std::size_t>(std::size_t{1} << 15, g.nodes() - 1);
    const std::vector<Query> random = random_queries(g.nodes(), 60, seed);
    RankQueries out;
    out.queries.resize(random.size());
    out.want.resize(random.size());
#pragma omp parallel for schedule(dynamic, 1)
    for (std::size_t i = 0; i < random.size(); ++i) {
        std::vector<Dist> d = baseline::distances_from(g, random[i].source);
        std::vector<Node> order(g.nodes());
        std::iota(order.begin(), order.end(), Node{0});
        std::nth_element(order.begin(), order.begin() + static_cast<std::ptrdiff_t>(rank), order.end(),
                         [&](Node a, Node b) { return std::pair(d[a], a) < std::pair(d[b], b); });
        out.queries[i] = {random[i].source, order[rank]};
        out.want[i] = d[order[rank]];
    }
    return out;
}
const RankQueries& rank_queries() {
    static const auto q = make_rank_queries(23);
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

// Measures your astar with h = 0 (the baseline) against `search`, with new
// random queries in each round. The two must give the same distances.
template <class Search>
tira::Timing compare_with_dijkstra(Search search, std::uint64_t salt) {
    std::vector<Query> q;
    std::vector<Dist> want, got;
    return tira::compare_fresh(
        [&](std::uint64_t seed) { q = random_queries(road().graph.nodes(), 60, seed); },
        [&] {
            want.clear();
            for (auto [s, t] : q) want.push_back(dijkstra(road().graph, s, t).distance);
        },
        [&] {
            got.clear();
            for (auto [s, t] : q) got.push_back(search(s, t));
        },
        [&] { return got == want; }, 5, salt);
}

bool bench_geo() {
    const RoadMap& m = road();
    double scale = geo_scale(m.graph, m.points);
    const std::string_view task = "task2 A*, straight-line bound";
    if (!check_dijkstra(task) || !check(task, "astar with GeoPotential", queries(), query_distances(), [&](Node s, Node t) {
            return astar(m.graph, s, t, GeoPotential{m.points, scale, m.points[t]}).distance;
        }))
        return false;
    auto t = compare_with_dijkstra(
        [&](Node s, Node d) { return astar(m.graph, s, d, GeoPotential{m.points, scale, m.points[d]}).distance; }, 192);
    return tira::report(task, t, 1.3);
}

bool bench_alt() {
    const RoadMap& m = road();
    static const auto rows = baseline::landmark_rows(m.graph, m.reverse, baseline::farthest_landmarks(m.graph, 8, 0));
    const std::string_view task = "task4 A*, ALT bound";
    if (!check_dijkstra(task) || !check(task, "astar with AltPotential", queries(), query_distances(),
                                        [&](Node s, Node t) { return astar(m.graph, s, t, AltPotential{rows, rows[t]}).distance; }))
        return false;
    auto t = compare_with_dijkstra([&](Node s, Node d) { return astar(m.graph, s, d, AltPotential{rows, rows[d]}).distance; },
                                   194);
    return tira::report(task, t, 5.0);
}

bool bench_bidirectional() {
    const RoadMap& m = road();
    const RankQueries& r = rank_queries();
    const std::string_view task = "task5 bidirectional Dijkstra";
    if (!check(task, "your astar with h = 0", r.queries, r.want, [&](Node s, Node t) { return dijkstra(m.graph, s, t).distance; }) ||
        !check(task, "bidirectional", r.queries, r.want, [&](Node s, Node t) { return bidirectional(m.graph, m.reverse, s, t); }))
        return false;
    // Each round has new medium-range queries. To make a query takes about one
    // Dijkstra search. This step has no time measurement.
    RankQueries round;
    std::vector<Dist> base, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { round = make_rank_queries(seed); },
        [&] {
            base.clear();
            for (auto [s, d] : round.queries) base.push_back(dijkstra(m.graph, s, d).distance);
        },
        [&] {
            got.clear();
            for (auto [s, d] : round.queries) got.push_back(bidirectional(m.graph, m.reverse, s, d));
        },
        [&] { return got == round.want && base == round.want; }, 7, 195);
    return tira::report(task, t, 1.25);
}

bool bench_bound16() {
    // 4096 random rows (256 KB, they fit in the L2 cache) and random nodes.
    std::vector<LandmarkRow16> rows(4096);
    std::vector<std::uint32_t> nodes(1 << 20);
    LandmarkRow16 target{};
    auto make = [&](std::uint64_t seed) {
        std::mt19937_64 rng(seed);
        for (auto& r : rows)
            for (int i = 0; i < 16; ++i)
                r.from[i] = static_cast<std::int32_t>(rng() % 5000000), r.to[i] = static_cast<std::int32_t>(rng() % 5000000);
        for (auto& v : nodes) v = static_cast<std::uint32_t>(rng() % rows.size());
        target = rows[rng() % rows.size()];
    };
    make(22);
    for (std::uint32_t v : nodes) {
        Dist got = alt_bound16(rows[v], target), want = baseline::alt_bound16(rows[v], target);
        if (got != want) {
            std::println("{:<32} WRONG: the bound is {} instead of {} (run the tests)", "task7 ALT bound, 16 landmarks", got, want);
            return false;
        }
    }
    std::uint64_t want = 0, got = 0;
    auto run = [&](auto bound, std::uint64_t& sum) {
        return [&, bound] {
            sum = 0;
            for (std::uint32_t v : nodes) sum = sum * 31 + bound(rows[v], target);  // The sum depends on each bound.
        };
    };
    auto t = tira::compare_fresh(make, run([](const LandmarkRow16& a, const LandmarkRow16& b) { return baseline::alt_bound16(a, b); }, want),
                                 run([](const LandmarkRow16& a, const LandmarkRow16& b) { return alt_bound16(a, b); }, got),
                                 [&] { return got == want; }, 9, 197);
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
    // Each round has new random landmarks.
    std::vector<Node> round(landmarks.size());
    std::vector<LandmarkRow> want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            std::mt19937_64 rng(seed);
            for (Node& v : round) v = static_cast<Node>(rng() % m.graph.nodes());
        },
        [&] {  // your landmark_rows on one thread
            omp_set_num_threads(1);
            want = landmark_rows(m.graph, m.reverse, round);
            omp_set_num_threads(all);
        },
        [&] { got = landmark_rows(m.graph, m.reverse, round); }, [&] { return got == want; }, 3, 198);
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
