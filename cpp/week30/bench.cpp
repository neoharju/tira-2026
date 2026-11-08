// Speed goals for week 30 (task 3 has none: its tests are the goal; task 4
// prints how many nodes a query reads, with no goal). Run in the release
// build: ./w30_bench [task]. Every benchmark first checks your result: a wrong
// result is not timed. The goals were calibrated with GCC 16 on a 4-core
// machine with AVX-512.
#include <algorithm>
#include <random>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w30;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<34} WRONG: {} (run the tests)", task, what);
    return false;
}

// 16 million pairs of 32-bit coordinates.
const std::vector<std::pair<std::uint32_t, std::uint32_t>>& pairs() {
    static const auto v = [] {
        std::mt19937_64 rng(301);
        std::vector<std::pair<std::uint32_t, std::uint32_t>> p(16'000'000);
        for (auto& [x, y] : p) x = static_cast<std::uint32_t>(rng()), y = static_cast<std::uint32_t>(rng());
        return p;
    }();
    return v;
}

// 4,000,000 points that follow the towns of Finland, their packed Hilbert R-tree,
// and 100,000 query boxes of 1 km around points.
struct Map {
    std::vector<Point> points = finland_points(4'000'000, 302);
    RTree tree = pack(points, hilbert_order(points));
    std::vector<Rect> boxes = boxes_around(points, 100'000, 1'000, 303);
};
const Map& map() {
    static const Map m;
    return m;
}

bool bench1() {
    const std::string_view task = "task1 Morton keys, 16M points";
    const auto& p = pairs();
    for (std::size_t i = 0; i < p.size(); i += 997)
        if (morton_encode(p[i].first, p[i].second) != baseline::morton_encode(p[i].first, p[i].second) || morton_decode(morton_encode(p[i].first, p[i].second)) != p[i])
            return wrong(task, "a key is not the key of the baseline");
    auto run = [&](auto encode, auto decode) {
        std::uint64_t s = 0;
        for (auto [x, y] : p) {
            const std::uint64_t k = encode(x, y);
            s += k + decode(k ^ s).first;  // the decode depends on the sums, so the compiler cannot skip it
        }
        return s;
    };
    const auto t = tira::compare([&] { tira::keep(run(baseline::morton_encode, baseline::morton_decode)); }, [&] { tira::keep(run(morton_encode, morton_decode)); }, 5);
    return tira::report(task, t, 8.0);
}

bool bench2() {
    const std::string_view task = "task2 Hilbert keys, 16M points";
    const auto& p = pairs();
    for (std::size_t i = 0; i < p.size(); i += 997)
        if (hilbert_encode(p[i].first, p[i].second) != baseline::hilbert_encode(p[i].first, p[i].second)) return wrong(task, "a key is not the key of the baseline");
    auto run = [&](auto encode) {
        std::uint64_t s = 0;
        for (auto [x, y] : p) s += encode(x, y);
        return s;
    };
    const auto t = tira::compare([&] { tira::keep(run(baseline::hilbert_encode)); }, [&] { tira::keep(run(hilbert_encode)); }, 5);
    return tira::report(task, t, 10.0);
}

bool bench4() {
    const std::string_view task = "task4 STR bulk load, 4M points";
    const auto& m = map();
    RTree t;
    const double s = tira::seconds([&] { t = str_build(m.points); });
    try {
        validate(t, m.points);
    } catch (const std::exception& e) {
        return wrong(task, e.what());
    }
    // How many nodes do the queries read in trees packed in three orders?
    std::vector<std::uint32_t> shuffled(m.points.size());
    for (std::size_t i = 0; i < shuffled.size(); ++i) shuffled[i] = static_cast<std::uint32_t>(i);
    std::mt19937_64 rng(304);
    std::ranges::shuffle(shuffled, rng);
    const RTree random_tree = pack(m.points, shuffled);
    auto mean_read = [&](const RTree& tree) {
        std::size_t read = 0;
        for (std::size_t i = 0; i < 2000; ++i) read += nodes_read(tree, m.boxes[i]);
        return static_cast<double>(read) / 2000;
    };
    std::println("{:<34} {:.0f} ms (no goal: the tests are the goal)", task, s * 1e3);
    std::println("      nodes read per query of 1 km x 1 km: your STR tree {:.1f}, packed Hilbert tree {:.1f}, points in random order {:.0f}",
                 mean_read(t), mean_read(m.tree), mean_read(random_tree));
    return true;
}

bool bench5() {
    const std::string_view task = "task5 range queries of 1 km";
    const auto& m = map();
    const std::span<const Rect> some(m.boxes.data(), 300);
    std::vector<std::uint32_t> got, want;
    for (const Rect& q : some) {
        got.clear();
        want.clear();
        range_query<ScalarTest>(m.tree, q, got);
        baseline::range_query(m.points, q, want);
        std::ranges::sort(got);
        if (got != want) return wrong(task, "a range query gives other points than the baseline");
    }
    const auto t = tira::compare(
        [&] {
            std::vector<std::uint32_t> out;
            for (const Rect& q : some) baseline::range_query(m.points, q, out);
            tira::keep(out.size());
        },
        [&] {
            std::vector<std::uint32_t> out;
            for (const Rect& q : some) range_query<ScalarTest>(m.tree, q, out);
            tira::keep(out.size());
        },
        3);
    const bool ok = tira::report(task, t, 300.0);
    const std::string_view task2 = "task5 10 nearest points";
    std::mt19937_64 rng(305);
    std::vector<Point> qs;
    for (int i = 0; i < 100; ++i) qs.push_back(m.points[rng() % m.points.size()]);
    for (const Point& q : qs)
        if (knn(m.tree, q, 10) != baseline::knn(m.points, q, 10)) return wrong(task2, "knn gives other points than the baseline");
    const auto u = tira::compare(
        [&] {
            std::size_t s = 0;
            for (const Point& q : qs) s += baseline::knn(m.points, q, 10)[0];
            tira::keep(s);
        },
        [&] {
            std::size_t s = 0;
            for (const Point& q : qs) s += knn(m.tree, q, 10)[0];
            tira::keep(s);
        },
        3);
    return tira::report(task2, u, 300.0) && ok;
}

bool bench6() {
    const std::string_view task = "task6 node tests, 4M of them";
    const auto nodes = random_nodes(4096, 306);
    const auto queries = random_node_queries(nodes, 4'000'000, 307);
    if (sum_masks<SimdTest>(nodes, queries) != sum_masks<ScalarTest>(nodes, queries)) return wrong(task, "intersect_mask_avx2 gives other masks");
    const auto t = tira::compare([&] { tira::keep(sum_masks<ScalarTest>(nodes, queries)); }, [&] { tira::keep(sum_masks<SimdTest>(nodes, queries)); }, 7);
    const bool ok = tira::report(task, t, 4.0);
    const auto& m = map();
    auto queries_with = [&](auto test) {
        std::vector<std::uint32_t> out;
        std::size_t s = 0;
        for (const Rect& q : m.boxes) {
            out.clear();
            range_query<decltype(test)>(m.tree, q, out);
            s += out.size();
        }
        return s;
    };
    if (queries_with(ScalarTest{}) > 0 && queries_with(SimdTest{}) == queries_with(ScalarTest{})) {  // when your range query works
        const auto u = tira::compare([&] { tira::keep(queries_with(ScalarTest{})); }, [&] { tira::keep(queries_with(SimdTest{})); }, 5);
        std::println("      100,000 range queries, SimdTest against ScalarTest: {:.2f}x (no goal)", u.speedup());
    }
    return ok;
}

bool bench7() {
    const std::string_view task = "task7 parallel STR, 4M points";
    const auto& m = map();
    const RTree a = str_build(m.points), b = str_build_parallel(m.points);
    if (a.height == 0) return wrong(task, "your str_build of task 4 does not work yet");
    if (tree_hash(a) != tree_hash(b)) return wrong(task, "the tree is not the tree of your str_build");
    const auto t = tira::compare([&] { tira::keep(str_build(m.points).nodes.size()); }, [&] { tira::keep(str_build_parallel(m.points).nodes.size()); }, 5);
    return tira::report(task, t, 2.2);
}

bool bench8() {
    const std::string_view task = "task8 100,000 range queries";
    const auto& m = map();
    {
        std::vector<std::uint32_t> some;
        for (std::size_t i = 0; i < 100; ++i) range_query<SimdTest>(m.tree, m.boxes[i], some);
        if (some.empty()) return wrong(task, "your range_query of task 5 does not work yet");
    }
    std::vector<std::vector<std::uint32_t>> out;
    range_query_batch(m.tree, m.boxes, out);
    for (std::size_t i = 0; i < m.boxes.size(); i += 97) {
        std::vector<std::uint32_t> want;
        range_query<SimdTest>(m.tree, m.boxes[i], want);
        std::ranges::sort(want);
        std::ranges::sort(out[i]);
        if (out[i] != want) return wrong(task, "a result is not the result of range_query");
    }
    const auto t = tira::compare(
        [&] {
            std::vector<std::vector<std::uint32_t>> one(m.boxes.size());
            for (std::size_t i = 0; i < m.boxes.size(); ++i) range_query<SimdTest>(m.tree, m.boxes[i], one[i]);
            tira::keep(one.back().size());
        },
        [&] {
            std::vector<std::vector<std::uint32_t>> many;
            range_query_batch(m.tree, m.boxes, many);
            tira::keep(many.back().size());
        },
        5);
    return tira::report(task, t, 2.5);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1}, {"task2", bench2}, {"task4", bench4}, {"task5", bench5}, {"task6", bench6}, {"task7", bench7}, {"task8", bench8}}};
    return b.run(argc, argv);
}
