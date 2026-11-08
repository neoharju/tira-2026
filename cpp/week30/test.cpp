// Tests for week 30. Run one task's tests with: ./w30_test -tc="task4*"
// The tests of tasks 5, 6 and 8 use packed Hilbert R-trees (pack, given), so
// they do not need your str_build. Tasks 7 and 8 use threads: run their tests
// in the tsan preset too.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <cmath>
#include <random>
#include <set>
#include <string>
#include <vector>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w30;

namespace {

void check_valid(const RTree& t, std::span<const Point> points) {
    try {
        validate(t, points);
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

// Coordinates with many equal values, so that the tie rules matter.
std::vector<Point> grid_points(std::size_t n, std::uint32_t size, std::uint64_t seed) { return uniform_points(n, size, seed); }

std::vector<std::uint32_t> sorted_ids(std::vector<std::uint32_t> v) {
    std::ranges::sort(v);
    return v;
}

// Query boxes of many sizes, and boxes whose edges are exactly on points.
std::vector<Rect> test_boxes(const std::vector<Point>& points, std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Rect> q;
    for (std::size_t i = 0; i < n; ++i) {
        const Point a = points[rng() % points.size()], b = points[rng() % points.size()];
        const float w = static_cast<float>(rng() % 50'000);
        switch (i % 4) {
            case 0: q.push_back({std::min(a.x, b.x), std::min(a.y, b.y), std::max(a.x, b.x), std::max(a.y, b.y)}); break;
            case 1: q.push_back({a.x, a.y, a.x, a.y}); break;  // one point
            case 2: q.push_back({a.x - w, a.y - w, a.x + w, a.y + w}); break;
            default: q.push_back({a.x + 1, a.y + 1, a.x, a.y}); break;  // an empty box
        }
    }
    return q;
}

template <class Test>
void check_ranges(const std::vector<Point>& points, std::uint64_t seed) {
    const RTree t = pack(points, hilbert_order(points));
    std::string error;
    for (const Rect& q : test_boxes(points, 300, seed)) {
        std::vector<std::uint32_t> got, want;
        range_query<Test>(t, q, got);
        baseline::range_query(points, q, want);
        if (sorted_ids(got) != want) {
            error = "range_query gives " + std::to_string(got.size()) + " points, " + std::to_string(want.size()) + " are right (or some ids are wrong)";
            break;
        }
    }
    if (!error.empty()) FAIL(error);
}

const std::vector<std::size_t> sizes = {0, 1, 2, 7, 8, 9, 63, 64, 65, 513, 5000};

}  // namespace

TEST_CASE("task1 Morton keys") {
    std::mt19937_64 rng(1);
    bool same = true;
    std::vector<std::pair<std::uint32_t, std::uint32_t>> xy = {{0, 0}, {~0u, 0}, {0, ~0u}, {~0u, ~0u}, {1, 0}, {0, 1}, {0x8000'0000, 0x8000'0000}};
    for (int i = 0; i < 200'000; ++i) xy.push_back({static_cast<std::uint32_t>(rng()), static_cast<std::uint32_t>(rng())});
    for (auto [x, y] : xy) {
        const std::uint64_t k = morton_encode(x, y);
        if (k != baseline::morton_encode(x, y) || morton_decode(k) != std::pair{x, y}) {
            same = false;
            FAIL("Morton key of (" << x << ", " << y << ") is wrong, or decode does not give it back");
        }
    }
    CHECK(same);
    CHECK(morton_encode(3, 5) == 0b100111);  // x = 011, y = 101: y2 x2 y1 x1 y0 x0 = 1 0 0 1 1 1
}

TEST_CASE("task2 Hilbert keys") {
    std::mt19937_64 rng(2);
    std::vector<std::pair<std::uint32_t, std::uint32_t>> xy = {{0, 0}, {~0u, 0}, {0, ~0u}, {~0u, ~0u}, {1, 0}, {0, 1}, {1, 1}};
    for (std::uint32_t x = 0; x < 64; ++x)
        for (std::uint32_t y = 0; y < 64; ++y) xy.push_back({x, y});
    for (int i = 0; i < 200'000; ++i) xy.push_back({static_cast<std::uint32_t>(rng()), static_cast<std::uint32_t>(rng() >> (i % 33))});
    for (auto [x, y] : xy)
        if (hilbert_encode(x, y) != baseline::hilbert_encode(x, y)) FAIL("the Hilbert key of (" << x << ", " << y << ") is wrong");
    // the curve: neighbours on the curve are neighbours on the grid
    std::vector<std::pair<std::uint64_t, std::pair<std::uint32_t, std::uint32_t>>> curve;
    for (std::uint32_t x = 0; x < 32; ++x)
        for (std::uint32_t y = 0; y < 32; ++y) curve.push_back({hilbert_encode(x, y), {x, y}});
    std::ranges::sort(curve);
    bool steps = true;
    for (std::size_t i = 1; i < curve.size(); ++i) {
        const auto [a, b] = curve[i - 1].second;
        const auto [c, d] = curve[i].second;
        steps = steps && (a > c ? a - c : c - a) + (b > d ? b - d : d - b) == 1;
    }
    CHECK_MESSAGE(steps, "on the Hilbert curve, each next point should be a neighbour on the grid");
}

TEST_CASE("task3 cells") {
    SUBCASE("geohash") {
        CHECK(geohash(57.64911, 10.40744, 11) == "u4pruydqqvj");
        CHECK(geohash(42.605, -5.603, 5) == "ezs42");
        CHECK(geohash(0, 0, 1) == "s");
        CHECK(geohash(-90, -180, 3) == "000");
        CHECK(geohash(90, 180, 3) == "zzz");
        std::mt19937_64 rng(3);
        std::uniform_real_distribution<double> lat(-90, 90), lon(-180, 180);
        for (int i = 0; i < 20'000; ++i) {
            const double a = lat(rng), b = lon(rng);
            const int chars = 1 + i % 12;
            if (geohash(a, b, chars) != baseline::geohash(a, b, chars)) FAIL("geohash(" << a << ", " << b << ", " << chars << ") is wrong");
        }
    }
    SUBCASE("the hexagon of a point") {
        std::mt19937_64 rng(4);
        std::uniform_real_distribution<double> u(-50'000, 50'000);
        for (double size : {1.0, 7.5, 100.0, 1234.5}) {
            for (int i = 0; i < 20'000; ++i) {
                const double x = u(rng), y = u(rng);
                const Hex c = hex_of(x, y, size);
                const auto dist = [&](Hex h) {
                    const double cx = size * std::sqrt(3.0) * (h.q + h.r / 2.0), cy = size * 1.5 * h.r;
                    return std::hypot(cx - x, cy - y);
                };
                for (int dq = -2; dq <= 2; ++dq)
                    for (int dr = -2; dr <= 2; ++dr)
                        if (dist({c.q + dq, c.r + dr}) < dist(c) - 1e-9 * size)
                            FAIL("hex_of(" << x << ", " << y << ", " << size << ") gives (" << c.q << ", " << c.r << "), but (" << c.q + dq << ", " << c.r + dr << ") has a nearer centre");
            }
        }
    }
    SUBCASE("hexagons near a hexagon") {
        for (Hex c : {Hex{0, 0}, Hex{5, -3}, Hex{-100, 40}})
            for (int k = 0; k <= 6; ++k) {
                const auto d = hex_disk(c, k);
                const std::set<Hex> unique(d.begin(), d.end());
                CHECK(d.size() == static_cast<std::size_t>(1 + 3 * k * (k + 1)));
                CHECK(unique.size() == d.size());
                bool near = true;
                for (Hex h : d) {
                    const int dq = h.q - c.q, dr = h.r - c.r;
                    near = near && (std::abs(dq) + std::abs(dr) + std::abs(dq + dr)) / 2 <= k;  // the number of steps
                }
                CHECK(near);
            }
    }
}

TEST_CASE("task4 STR bulk load") {
    for (std::size_t n : sizes) {
        CAPTURE(n);
        const auto p = finland_points(n, n + 4);
        const RTree t = str_build(p);
        check_valid(t, p);
        const auto g = grid_points(n, 8, n + 5);  // many equal points: the ids decide
        check_valid(str_build(g), g);
    }
    SUBCASE("exactly the tree of the rules") {
        // tree_hash of the STR trees of these inputs, computed with the rules of rtree.hpp
        CHECK(tree_hash(str_build(uniform_points(1000, 1'000'000, 1))) == 0xa0b279c5b31b2146ULL);
        CHECK(tree_hash(str_build(uniform_points(100'000, 800'000, 2))) == 0x123fbee8abbc232ULL);
        CHECK(tree_hash(str_build(grid_points(3000, 16, 3))) == 0x78385d56061cef14ULL);  // many equal points
        CHECK(tree_hash(str_build(grid_points(30, 4, 4))) == 0x770aa01e6a277320ULL);
    }
}

TEST_CASE("task5 range and nearest-neighbour queries") {
    SUBCASE("an empty tree") {
        std::vector<std::uint32_t> out;
        range_query<ScalarTest>(RTree{}, {0, 0, 1e6f, 1e6f}, out);
        CHECK(out.empty());
        CHECK(knn(RTree{}, {0, 0}, 5).empty());
    }
    for (std::size_t n : {1, 9, 65, 5000, 30'000}) {
        CAPTURE(n);
        check_ranges<ScalarTest>(finland_points(n, n + 6), n);
        check_ranges<ScalarTest>(grid_points(n, 64, n + 7), n);
    }
    for (std::size_t n : {1, 9, 65, 5000, 20'000}) {
        for (int kind = 0; kind < 2; ++kind) {
            CAPTURE(n);
            CAPTURE(kind);
            const auto p = kind ? grid_points(n, 64, n + 9) : finland_points(n, n + 8);
            const RTree t = pack(p, hilbert_order(p));
            std::mt19937_64 rng(n);
            for (std::size_t k : {0, 1, 2, 10, 100}) {
                for (int i = 0; i < 20; ++i) {
                    const Point q = i % 2 ? p[rng() % n] : Point{static_cast<float>(rng() % 800'000), static_cast<float>(rng() % 1'200'000)};
                    const auto got = knn(t, q, k);
                    if (got != baseline::knn(p, q, k)) FAIL("knn gives other points, or another order, than the baseline (k = " << k << ")");
                }
            }
        }
    }
}

TEST_CASE("task6 node test with AVX2") {
    SUBCASE("the same masks as ScalarTest") {
        const auto nodes = random_nodes(2000, 6);
        std::mt19937_64 rng(6);
        bool same = true;
        for (const Node& n : nodes)
            for (int i = 0; i < 50 && same; ++i) {
                // queries whose edges are exactly the edges of the boxes, too
                const unsigned s = static_cast<unsigned>(rng() % n.count);
                Rect q{n.max_x[s], n.max_y[s], n.max_x[s] + 1000, n.max_y[s] + 1000};
                if (i % 3 == 1) q = {n.min_x[s] - 500, n.min_y[s] - 500, n.min_x[s], n.min_y[s]};
                if (i % 3 == 2) q = {static_cast<float>(rng() % 12'000), static_cast<float>(rng() % 12'000), 0, 0}, q.max_x = q.min_x + 2000, q.max_y = q.min_y + 2000;
                same = intersect_mask_avx2(n, q) == ScalarTest::mask(n, q);
                if (!same) FAIL("intersect_mask_avx2 gives another mask than ScalarTest::mask");
            }
        CHECK(same);
    }
    SUBCASE("range queries with SimdTest") {
        for (std::size_t n : {1, 65, 5000, 30'000}) {
            CAPTURE(n);
            check_ranges<SimdTest>(finland_points(n, n + 10), n);
        }
    }
}

TEST_CASE("task7 parallel STR") {
    for (int threads : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(threads);
        CAPTURE(threads);
        for (std::size_t n : {0, 1, 9, 1000, 100'000, 300'000}) {
            CAPTURE(n);
            const auto p = n % 2 ? finland_points(n, n + threads) : grid_points(n, 200, n + threads);
            const RTree got = str_build_parallel(p);
            check_valid(got, p);
            CHECK_MESSAGE(tree_hash(got) == tree_hash(str_build(p)), "the tree is not the tree of your str_build");
        }
    }
    omp_set_num_threads(static_cast<int>(tira::threads()));
}

TEST_CASE("task8 batches of range queries") {
    const auto p = finland_points(50'000, 12);
    const RTree t = pack(p, hilbert_order(p));
    const auto queries = test_boxes(p, 1000, 13);
    std::vector<std::vector<std::uint32_t>> want(queries.size());
    for (std::size_t i = 0; i < queries.size(); ++i) baseline::range_query(p, queries[i], want[i]);
    for (int threads : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(threads);
        CAPTURE(threads);
        std::vector<std::vector<std::uint32_t>> out(5, {42});  // old contents must go
        range_query_batch(t, queries, out);
        REQUIRE(out.size() == queries.size());
        bool right = true;
        for (std::size_t i = 0; i < queries.size() && right; ++i) right = sorted_ids(out[i]) == want[i];
        CHECK_MESSAGE(right, "a result is not the result of the range query");
    }
    omp_set_num_threads(static_cast<int>(tira::threads()));
}
