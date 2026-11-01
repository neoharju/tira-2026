// Tests for week 23. Run one task's tests with: ./w23_test -tc="task4*"
//
// Most tests use whole numbers. Then every distance is exact (a sum of whole
// numbers below 2^24 has no rounding error, in any order), so the results can
// be compared exactly, and equal distances happen often: they must be broken
// by the smaller id.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>
#include <string>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w23;

namespace {

Dataset random_integers(std::size_t n, std::size_t dim, int lo, int hi, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    Dataset x(n, dim);
    for (float& v : x.values) v = static_cast<float>(lo + static_cast<int>(rng() % static_cast<std::uint64_t>(hi - lo + 1)));
    return x;
}

std::vector<float> random_reals(std::size_t n, std::mt19937_64& rng) {
    std::vector<float> v(n);
    for (float& x : v) x = static_cast<float>(static_cast<double>(rng() >> 11) * 0x1.0p-52 - 1);
    return v;
}

std::string show(const std::vector<Neighbor>& v) {
    std::string s = std::to_string(v.size()) + " results:";
    for (std::size_t i = 0; i < v.size() && i < 12; ++i) s += " (" + std::to_string(v[i].id) + ", " + std::to_string(v[i].distance) + ")";
    return s;
}

#define CHECK_RESULTS(got, want)                    \
    do {                                            \
        const auto g_ = (got);                      \
        const auto w_ = (want);                     \
        INFO("got " << show(g_) << "\nwant " << show(w_)); \
        CHECK(g_ == w_);                            \
    } while (false)

double objective(const Dataset& data, const Dataset& centroids) {
    double total = 0;
    for (std::size_t i = 0; i < data.n; ++i) {
        double best = INFINITY;
        for (std::size_t c = 0; c < centroids.n; ++c) {
            double s = 0;
            for (std::size_t d = 0; d < data.dim; ++d) s += (static_cast<double>(data[i][d]) - centroids[c][d]) * (static_cast<double>(data[i][d]) - centroids[c][d]);
            best = std::min(best, s);
        }
        total += best;
    }
    return total;
}

// A product quantizer whose centroids are parts of random vectors of the data:
// whole numbers, so all its distances are exact.
ProductQuantizer integer_pq(const Dataset& data, std::size_t m, std::size_t ksub, std::uint64_t seed) {
    ProductQuantizer pq{data.dim, m, ksub, std::vector<float>(data.dim * ksub)};
    std::mt19937_64 rng(seed);
    const std::size_t sd = pq.sub_dim();
    for (std::size_t j = 0; j < m; ++j)
        for (std::size_t c = 0; c < ksub; ++c)
            std::copy_n(data[rng() % data.n] + j * sd, sd, pq.centroids.begin() + static_cast<std::ptrdiff_t>((j * ksub + c) * sd));
    return pq;
}

// Checks that the tree has the input points and is split as tasks.hpp says.
bool check_split(const KdTree& t, std::size_t lo, std::size_t hi, std::size_t depth) {
    if (hi - lo <= t.leaf_size) return true;
    const std::size_t axis = depth % t.points.dim, mid = lo + (hi - lo) / 2;
    const float median = t.points[mid][axis];
    for (std::size_t i = lo; i < mid; ++i)
        if (t.points[i][axis] > median) return false;
    for (std::size_t i = mid + 1; i < hi; ++i)
        if (t.points[i][axis] < median) return false;
    return check_split(t, lo, mid, depth + 1) && check_split(t, mid + 1, hi, depth + 1);
}

void check_tree(const KdTree& t, const Dataset& input, std::size_t leaf_size) {
    REQUIRE(t.points.n == input.n);
    REQUIRE(t.points.dim == input.dim);
    REQUIRE(t.ids.size() == input.n);
    CHECK(t.leaf_size == leaf_size);
    std::vector<Id> sorted = t.ids;
    std::ranges::sort(sorted);
    bool permutation = true, same = true;
    for (std::size_t i = 0; i < input.n; ++i) {
        permutation = permutation && sorted[i] == i;
        same = same && std::equal(t.points[i], t.points[i] + input.dim, input[t.ids[i]]);
    }
    CHECK_MESSAGE(permutation, "ids must be a permutation of 0 ... n - 1");
    CHECK_MESSAGE(same, "points[i] must be the input point ids[i]");
    CHECK_MESSAGE(check_split(t, 0, t.points.n, 0), "the tree is not split at the medians as tasks.hpp describes");
}

}  // namespace

TEST_CASE("task1 distances of whole numbers are exact") {
    // Separate arrays of exactly dim values: AddressSanitizer reports a read
    // past the end, for example a full 8-value load for the last values.
    std::mt19937_64 rng(1);
    for (std::size_t dim = 0; dim <= 300; dim += dim < 70 ? 1 : 23) {
        const int hi = dim <= 128 ? 255 : 127;  // keeps the sums below 2^24
        std::vector<float> a(dim), b(dim);
        for (std::size_t i = 0; i < dim; ++i) a[i] = static_cast<float>(rng() % (hi + 1)), b[i] = static_cast<float>(rng() % (hi + 1));
        INFO("dim = " << dim);
        CHECK(l2_squared(a.data(), b.data(), dim) == baseline::l2_squared(a.data(), b.data(), dim));
        CHECK(inner_product(a.data(), b.data(), dim) == baseline::inner_product(a.data(), b.data(), dim));
    }
}

TEST_CASE("task1 distances of real numbers") {
    std::mt19937_64 rng(2);
    for (std::size_t dim : {0, 1, 2, 3, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 100, 127, 128, 129, 384, 960, 1000}) {
        for (int rep = 0; rep < 5; ++rep) {
            const auto a = random_reals(dim, rng), b = random_reals(dim, rng);
            double l2 = 0, ip = 0, size = 0;
            for (std::size_t i = 0; i < dim; ++i) {
                l2 += (static_cast<double>(a[i]) - b[i]) * (static_cast<double>(a[i]) - b[i]);
                ip += static_cast<double>(a[i]) * b[i];
                size += std::abs(static_cast<double>(a[i]) * b[i]);
            }
            INFO("dim = " << dim);
            CHECK(std::abs(l2_squared(a.data(), b.data(), dim) - l2) <= 1e-5 * l2 + 1e-30);
            CHECK(std::abs(inner_product(a.data(), b.data(), dim) - ip) <= 1e-5 * size + 1e-30);
        }
    }
}

TEST_CASE("task2 knn is exact, also with equal distances") {
    std::uint64_t seed = 10;
    for (std::size_t n : {0, 1, 2, 7, 64, 300}) {
        for (std::size_t dim : {1, 3, 8, 13, 64}) {
            const Dataset data = random_integers(n, dim, 0, 3, ++seed);  // few values: many equal distances
            const Dataset queries = random_integers(5, dim, 0, 3, ++seed);
            for (std::size_t q = 0; q < queries.n; ++q)
                for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{3}, std::size_t{10}, n, n + 3}) {
                    INFO("n = " << n << ", dim = " << dim << ", k = " << k);
                    CHECK_RESULTS(knn(data, queries[q], k), baseline::knn(data, queries[q], k));
                }
        }
    }
    const Dataset data = sift_like(3000, 5), queries = sift_like(20, 6);
    for (std::size_t q = 0; q < queries.n; ++q)
        for (std::size_t k : {1, 10, 100}) CHECK_RESULTS(knn(data, queries[q], k), baseline::knn(data, queries[q], k));
}

TEST_CASE("task3 the k-d tree is split at the medians") {
    std::uint64_t seed = 30;
    for (std::size_t n : {0, 1, 2, 3, 9, 10, 100, 1000}) {
        for (std::size_t dim : {1, 2, 3, 4}) {
            for (std::size_t leaf : {1, 2, 5, 8, 64}) {
                const Dataset points = uniform_points(n, dim, n < 50 ? 4 : 20, ++seed);  // repeated values
                INFO("n = " << n << ", dim = " << dim << ", leaf_size = " << leaf);
                check_tree(build_kdtree(points, leaf), points, leaf);
            }
        }
    }
}

TEST_CASE("task3 kdtree_knn finds the exact neighbours") {
    std::uint64_t seed = 40;
    for (std::size_t n : {0, 1, 2, 9, 100, 2000}) {
        for (std::size_t dim : {1, 2, 3, 4}) {
            for (std::size_t leaf : {1, 3, 8, 32}) {
                const Dataset points = uniform_points(n, dim, n < 50 ? 5 : 30, ++seed);
                const KdTree tree = build_kdtree(points, leaf);
                const Dataset queries = uniform_points(6, dim, n < 50 ? 5 : 30, ++seed);
                for (std::size_t q = 0; q < queries.n + std::min<std::size_t>(n, 3); ++q) {
                    const float* query = q < queries.n ? queries[q] : points[q - queries.n];  // also points of the tree
                    for (std::size_t k : {std::size_t{1}, std::size_t{2}, std::size_t{10}, n, n + 1}) {
                        INFO("n = " << n << ", dim = " << dim << ", leaf_size = " << leaf << ", k = " << k);
                        CHECK_RESULTS(kdtree_knn(tree, query, k), baseline::knn(points, query, k));
                    }
                }
            }
        }
    }
}

TEST_CASE("task4 k-means agrees with the baseline on clear clusters") {
    // 6 clusters far apart, and one initial centroid in each: every vector has
    // one clearly nearest centroid in every round.
    std::mt19937_64 rng(50);
    const std::size_t k = 6, dim = 5, per = 40;
    Dataset data(k * per, dim), start(k, dim);
    for (std::size_t c = 0; c < k; ++c)
        for (std::size_t i = 0; i < per; ++i)
            for (std::size_t d = 0; d < dim; ++d)
                data[c * per + i][d] = static_cast<float>(1000 * ((c + d) % k) + rng() % 21);
    for (std::size_t c = 0; c < k; ++c) std::copy_n(data[c * per + c], dim, start[c]);
    for (int iterations : {0, 1, 2, 5}) {
        const Dataset got = kmeans(data, start, iterations), want = baseline::kmeans(data, start, iterations);
        REQUIRE(got.n == want.n);
        REQUIRE(got.dim == want.dim);
        for (std::size_t i = 0; i < got.values.size(); ++i) CHECK(got.values[i] == doctest::Approx(want.values[i]).epsilon(1e-5));
    }
}

TEST_CASE("task4 k-means: ties, empty clusters, one centroid") {
    const Dataset data = random_integers(200, 3, 0, 9, 51);
    SUBCASE("two equal centroids: the first gets the vectors, the second stays") {
        Dataset start(2, 3);
        std::ranges::fill(start.values, 4.0f);
        const Dataset got = kmeans(data, start, 1);
        CHECK(std::equal(got[1], got[1] + 3, start[1]));
        CHECK(std::equal(got[0], got[0] + 3, baseline::kmeans(data, start, 1)[0]));
    }
    SUBCASE("a centroid far away gets no vectors and stays") {
        Dataset start = initial_centroids(data, 3, 52);
        std::ranges::fill(start[2], start[2] + 3, 1e6f);
        const Dataset got = kmeans(data, start, 3);
        CHECK(std::equal(got[2], got[2] + 3, start[2]));
    }
    SUBCASE("one centroid moves to the mean") {
        Dataset start(1, 3);
        const Dataset got = kmeans(data, start, 1);
        for (std::size_t d = 0; d < 3; ++d) {
            double mean = 0;
            for (std::size_t i = 0; i < data.n; ++i) mean += data[i][d];
            CHECK(got[0][d] == doctest::Approx(mean / static_cast<double>(data.n)).epsilon(1e-6));
        }
    }
    SUBCASE("SIFT-like vectors: as good as the baseline") {
        const Dataset sift = sift_like(2000, 53);
        const Dataset start = initial_centroids(sift, 16, 54);
        CHECK(objective(sift, kmeans(sift, start, 3)) == doctest::Approx(objective(sift, baseline::kmeans(sift, start, 3))).epsilon(1e-3));
    }
}

TEST_CASE("task5 build_ivf makes the lists of the baseline") {
    std::uint64_t seed = 60;
    for (std::size_t n : {0, 1, 5, 100, 1000}) {
        for (std::size_t nlist : {1, 2, 7, 64}) {
            const Dataset data = random_integers(n, 6, 0, 4, ++seed);
            Dataset centroids = random_integers(nlist, 6, 0, 4, ++seed);  // equal centroids happen
            const Ivf got = build_ivf(data, centroids), want = baseline::build_ivf(data, centroids);
            INFO("n = " << n << ", nlist = " << nlist);
            CHECK(got.centroids == want.centroids);
            CHECK(got.offset == want.offset);
            CHECK(got.ids == want.ids);
            CHECK(got.vectors == want.vectors);
        }
    }
}

TEST_CASE("task5 search_ivf searches the nprobe nearest lists") {
    const Dataset data = sift_like(3000, 61), queries = sift_like(10, 62);
    for (std::size_t nlist : {1, 3, 40}) {
        const Ivf ivf = baseline::build_ivf(data, initial_centroids(data, nlist, 63));
        for (std::size_t q = 0; q < queries.n; ++q)
            for (std::size_t nprobe : {std::size_t{0}, std::size_t{1}, std::size_t{2}, std::size_t{5}, nlist, nlist + 3})
                for (std::size_t k : {1, 10, 50}) {
                    INFO("nlist = " << nlist << ", nprobe = " << nprobe << ", k = " << k);
                    CHECK_RESULTS(search_ivf(ivf, queries[q], k, nprobe), baseline::search_ivf(ivf, queries[q], k, nprobe));
                }
    }
    // Small whole numbers: equal distances to centroids and to vectors.
    const Dataset small = random_integers(500, 4, 0, 3, 64), centroids = random_integers(20, 4, 0, 3, 65), q = random_integers(20, 4, 0, 3, 66);
    const Ivf ivf = baseline::build_ivf(small, centroids);
    for (std::size_t i = 0; i < q.n; ++i)
        for (std::size_t nprobe : {1, 3, 20})
            for (std::size_t k : {1, 5, 40}) CHECK_RESULTS(search_ivf(ivf, q[i], k, nprobe), baseline::search_ivf(ivf, q[i], k, nprobe));
}

TEST_CASE("task6 pq_encode and pq_table") {
    std::uint64_t seed = 70;
    for (std::size_t dim : {8, 16, 32}) {
        for (std::size_t m : {1, 2, 4, 8}) {
            for (std::size_t ksub : {1, 16, 256}) {
                const Dataset data = random_integers(300, dim, 0, ksub == 256 ? 255 : 6, ++seed);
                const ProductQuantizer pq = integer_pq(data, m, ksub, ++seed);  // equal centroids happen
                INFO("dim = " << dim << ", m = " << m << ", ksub = " << ksub);
                CHECK(pq_encode(pq, data) == baseline::pq_encode(pq, data));
                CHECK(pq_table(pq, data[7]) == baseline::pq_table(pq, data[7]));
            }
        }
    }
}

TEST_CASE("task6 pq_search finds the k smallest sums") {
    // Tables of whole numbers: the sums are exact in any order.
    std::mt19937_64 rng(80);
    for (std::size_t m : {1, 3, 8, 16}) {
        for (std::size_t ksub : {16, 256}) {
            for (std::size_t n : {0, 1, 3, 4, 5, 100, 1001}) {
                const ProductQuantizer pq{m * 2, m, ksub, std::vector<float>(m * 2 * ksub)};
                std::vector<std::uint8_t> codes(n * m);
                for (auto& c : codes) c = static_cast<std::uint8_t>(rng() % ksub);
                std::vector<float> table(m * ksub);
                for (float& t : table) t = static_cast<float>(rng() % (n < 50 ? 4 : 1000));
                for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{10}, n, n + 1}) {
                    INFO("m = " << m << ", ksub = " << ksub << ", n = " << n << ", k = " << k);
                    CHECK_RESULTS(pq_search(pq, codes, table, k), baseline::pq_search(pq, codes, table, k));
                }
            }
        }
    }
}

TEST_CASE("task7 fast_scan adds up the table bytes") {
    std::mt19937_64 rng(90);
    for (std::size_t m : {1, 2, 3, 4, 7, 8, 16, 31, 32, 33, 64, 257}) {
        for (std::size_t n : {1, 15, 16, 31, 32, 33, 100, 1000}) {
            std::vector<std::uint8_t> codes(n * m);
            for (auto& c : codes) c = static_cast<std::uint8_t>(rng() % 16);
            const PackedCodes packed = pack_codes(codes, n, m);
            QuantizedTable table{m, std::vector<std::uint8_t>(m * 16), 1, 0};
            for (auto& v : table.lut) v = static_cast<std::uint8_t>(m == 257 ? 255 - rng() % 2 : rng() % 256);
            std::vector<std::uint16_t> got(32 * packed.blocks(), 1), want(32 * packed.blocks(), 2);
            fast_scan(packed, table, got);
            baseline::fast_scan(packed, table, want);
            INFO("m = " << m << ", n = " << n);
            CHECK(got == want);
        }
    }
}

TEST_CASE("task8 knn_batch gives the results of knn") {
    const Dataset data = sift_like(2000, 100), queries = sift_like(37, 101);
    Results want(queries.n);
    for (std::size_t q = 0; q < queries.n; ++q) want[q] = baseline::knn(data, queries[q], 10);
    const int threads = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(t);
        INFO("threads = " << t);
        CHECK(knn_batch(data, queries, 10) == want);
        CHECK(knn_batch(data, Dataset(0, 128), 10).empty());
        CHECK(knn_batch(Dataset(0, 128), queries, 10) == Results(queries.n));
        CHECK(knn_batch(data, queries, 0) == Results(queries.n));
    }
    omp_set_num_threads(threads);
}
