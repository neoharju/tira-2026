// Speed goals for week 23. Run in the release build: ./w23_bench [task]
// The data are 200,000 vectors of 128 values and 1000 queries (see
// benchmark_base in vectors.hpp). Tasks 5-7 first train their quantizers
// with your kmeans of task 4, which takes a few seconds.
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <cmath>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w23;

namespace {

const Dataset& base() {
    static const Dataset b = benchmark_base();
    return b;
}
const Dataset& queries() {
    static const Dataset q = benchmark_queries();
    return q;
}
// The first `count` queries.
Dataset first_queries(std::size_t count) {
    Dataset q(count, queries().dim);
    std::copy_n(queries().values.begin(), count * q.dim, q.values.begin());
    return q;
}
// The true 10 nearest neighbours of the first 200 queries.
const Results& truth() {
    static const Results t = ground_truth(base(), first_queries(200), 10);
    return t;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

// Rounds the centroids to whole numbers: then all distances to them are exact
// too, and your lists can be compared with the baseline's.
Dataset rounded(Dataset c) {
    for (float& v : c.values) v = std::round(v);
    return c;
}

// Brute force with a heap of the best k (and the scalar distance): the fair
// comparison for the k-d tree, because the baseline knn sorts all distances.
std::vector<Neighbor> scan(const Dataset& points, const float* query, std::size_t k) {
    std::vector<Neighbor> heap;
    for (std::size_t i = 0; i < points.n; ++i) {
        const Neighbor c{baseline::l2_squared(points[i], query, points.dim), static_cast<Id>(i)};
        if (heap.size() < k) {
            heap.push_back(c);
            std::ranges::push_heap(heap);
        } else if (c < heap.front()) {
            std::ranges::pop_heap(heap);
            heap.back() = c;
            std::ranges::push_heap(heap);
        }
    }
    std::ranges::sort_heap(heap);
    return heap;
}

bool bench_distance() {
    const std::string_view task = "task1 distances";
    const Dataset data = every(base(), 100);  // 2000 vectors, 1 MB: they stay in the L2 cache
    const Dataset q = first_queries(16);
    for (std::size_t i = 0; i < data.n; ++i)
        if (l2_squared(data[i], q[0], data.dim) != baseline::l2_squared(data[i], q[0], data.dim) ||
            inner_product(data[i], q[0], data.dim) != baseline::inner_product(data[i], q[0], data.dim))
            return wrong(task, "a distance is not the baseline's");
    auto run = [&](auto distance) {
        float s = 0;
        for (std::size_t j = 0; j < q.n; ++j)
            for (std::size_t i = 0; i < data.n; ++i) s += distance(data[i], q[j], data.dim);
        tira::keep(s);
    };
    auto t = tira::compare([&] { run(baseline::l2_squared); }, [&] { run(l2_squared); }, 15);
    return tira::report(task, t, 5);
}

bool bench_knn() {
    const std::string_view task = "task2 brute force, top 10";
    const Dataset q = first_queries(10);
    for (std::size_t j = 0; j < q.n; ++j)
        if (knn(base(), q[j], 10) != baseline::knn(base(), q[j], 10)) return wrong(task, "a result is not the baseline's");
    auto t = tira::compare([&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(baseline::knn(base(), q[j], 10)); },
                           [&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(knn(base(), q[j], 10)); }, 5);
    return tira::report(task, t, 3);
}

bool bench_kdtree() {
    const std::string_view task = "task3 k-d tree in 3 dimensions";
    // Coordinates below 1000: the squared distances are exact in a float.
    const Dataset points = uniform_points(200000, 3, 1000, 31), q = uniform_points(1000, 3, 1000, 32);
    const KdTree tree = build_kdtree(points, 8);
    for (std::size_t j = 0; j < 100; ++j)
        if (kdtree_knn(tree, q[j], 10) != scan(points, q[j], 10)) return wrong(task, "a result is not exact");
    auto t = tira::compare([&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(scan(points, q[j], 10)); },
                           [&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(kdtree_knn(tree, q[j], 10)); }, 3);
    const bool ok = tira::report(task, t, 50);
    // The same in 128 dimensions, for information.
    const Dataset data = every(base(), 4);
    const KdTree tree128 = build_kdtree(data, 8);
    const Dataset q128 = first_queries(20);
    auto t128 = tira::compare([&] { for (std::size_t j = 0; j < q128.n; ++j) tira::keep(knn(data, q128[j], 10)); },
                              [&] { for (std::size_t j = 0; j < q128.n; ++j) tira::keep(kdtree_knn(tree128, q128[j], 10)); }, 3);
    std::println("      in 128 dimensions (50,000 vectors): {:.2f}x faster than your knn (no goal)", t128.speedup());
    return ok;
}

bool bench_kmeans() {
    const std::string_view task = "task4 k-means, 256 centroids";
    const Dataset sample = every(base(), 20);  // 10,000 vectors
    const Dataset start = initial_centroids(sample, 256, 41);
    auto objective = [&](const Dataset& c) {
        double total = 0;
        for (std::size_t i = 0; i < sample.n; ++i) {
            float best = INFINITY;
            for (std::size_t j = 0; j < c.n; ++j) best = std::min(best, baseline::l2_squared(sample[i], c[j], sample.dim));
            total += best;
        }
        return total;
    };
    const double want = objective(baseline::kmeans(sample, start, 2)), got = objective(kmeans(sample, start, 2));
    if (std::abs(got - want) > 1e-4 * want) return wrong(task, "the clustering is not as good as the baseline's");
    auto t = tira::compare([&] { tira::keep(baseline::kmeans(sample, start, 2)); }, [&] { tira::keep(kmeans(sample, start, 2)); }, 3);
    return tira::report(task, t, 4);
}

bool bench_ivf() {
    const std::string_view task = "task5 IVF search, nprobe 16";
    const Dataset centroids = rounded(kmeans(every(base(), 10), initial_centroids(every(base(), 10), 512, 51), 4));
    const Dataset part = every(base(), 10);
    const Ivf small = build_ivf(part, centroids), want = baseline::build_ivf(part, centroids);
    if (small.offset != want.offset || small.ids != want.ids || small.vectors != want.vectors)
        return wrong(task, "the lists are not the baseline's");
    const Ivf ivf = build_ivf(base(), centroids);
    const Dataset q = first_queries(200);
    for (std::size_t j = 0; j < q.n; ++j)
        if (search_ivf(ivf, q[j], 10, 16) != baseline::search_ivf(ivf, q[j], 10, 16)) return wrong(task, "a result is not the baseline's");
    auto t = tira::compare([&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(baseline::search_ivf(ivf, q[j], 10, 16)); },
                           [&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(search_ivf(ivf, q[j], 10, 16)); }, 5);
    const bool ok = tira::report(task, t, 3);
    // Recall and speed against brute force, for information.
    std::print("      recall@10 and speed against your knn:");
    const double brute = tira::seconds([&] { for (std::size_t j = 0; j < 20; ++j) tira::keep(knn(base(), q[j], 10)); }) / 20;
    for (std::size_t nprobe : {1, 4, 16, 64}) {
        Results r(q.n);
        const double s = tira::seconds([&] { for (std::size_t j = 0; j < q.n; ++j) r[j] = search_ivf(ivf, q[j], 10, nprobe); }) / q.n;
        std::print("  nprobe {} {:.3f} {:.0f}x", nprobe, recall(r, truth(), 10), brute / s);
    }
    std::println("");
    return ok;
}

bool bench_pq() {
    const std::string_view task = "task6 PQ search (16 bytes)";
    const Dataset sample = every(base(), 10);
    ProductQuantizer pq = train_pq(sample, 16, 256, 4, 61);
    for (float& v : pq.centroids) v = std::round(v);
    const Dataset check = every(base(), 100);
    if (pq_encode(pq, check) != baseline::pq_encode(pq, check)) return wrong(task, "a code is not the baseline's");
    const std::vector<std::uint8_t> codes = pq_encode(pq, base());
    const Dataset q = first_queries(50);
    std::vector<std::vector<float>> tables(q.n);
    for (std::size_t j = 0; j < q.n; ++j) {
        tables[j] = pq_table(pq, q[j]);
        if (tables[j] != baseline::pq_table(pq, q[j])) return wrong(task, "a distance table is not the baseline's");
        if (pq_search(pq, codes, tables[j], 100) != baseline::pq_search(pq, codes, tables[j], 100))
            return wrong(task, "a result is not the baseline's");
    }
    auto t = tira::compare([&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(baseline::pq_search(pq, codes, tables[j], 10)); },
                           [&] { for (std::size_t j = 0; j < q.n; ++j) tira::keep(pq_search(pq, codes, tables[j], 10)); }, 5);
    const bool ok = tira::report(task, t, 6);
    const Dataset q200 = first_queries(200);
    Results alone(q200.n), reranked(q200.n);
    for (std::size_t j = 0; j < q200.n; ++j) {
        const auto table = pq_table(pq, q200[j]);
        const auto candidates = pq_search(pq, codes, table, 100);
        alone[j].assign(candidates.begin(), candidates.begin() + 10);
        reranked[j] = rerank(base(), q200[j], candidates, 10);
    }
    std::println("      recall@10: {:.3f}; re-ranking the best 100 by exact distance: {:.3f} (no goal)", recall(alone, truth(), 10),
                 recall(reranked, truth(), 10));
    return ok;
}

bool bench_fast_scan() {
    const std::string_view task = "task7 fast scan (4-bit codes)";
    const ProductQuantizer pq = train_pq(every(base(), 10), 32, 16, 6, 71);
    const PackedCodes packed = pack_codes(pq_encode(pq, base()), base().n, pq.m);
    const Dataset q = first_queries(200);
    std::vector<QuantizedTable> tables;
    for (std::size_t j = 0; j < q.n; ++j) tables.push_back(quantize_table(pq_table(pq, q[j]), pq.m));
    std::vector<std::uint16_t> sums(32 * packed.blocks()), want(sums.size());
    for (std::size_t j = 0; j < 20; ++j) {
        fast_scan(packed, tables[j], sums);
        baseline::fast_scan(packed, tables[j], want);
        if (sums != want) return wrong(task, "a sum is not the baseline's");
    }
    auto t = tira::compare([&] { for (std::size_t j = 0; j < 20; ++j) baseline::fast_scan(packed, tables[j], want), tira::keep(want[0]); },
                           [&] { for (std::size_t j = 0; j < 20; ++j) fast_scan(packed, tables[j], sums), tira::keep(sums[0]); }, 9);
    const bool ok = tira::report(task, t, 6);
    // Recall: the best 100 or 1000 by the sums, re-ranked by exact distance.
    Results best100(q.n), best1000(q.n);
    std::vector<Neighbor> all(base().n);
    for (std::size_t j = 0; j < q.n; ++j) {
        fast_scan(packed, tables[j], sums);
        for (std::size_t i = 0; i < base().n; ++i) all[i] = {static_cast<float>(sums[i]), static_cast<Id>(i)};
        std::ranges::partial_sort(all, all.begin() + 1000);
        best100[j] = rerank(base(), q[j], std::span(all).first(100), 10);
        best1000[j] = rerank(base(), q[j], std::span(all).first(1000), 10);
    }
    std::println("      recall@10, re-ranking the best 100 by exact distance: {:.3f}, the best 1000: {:.3f} (no goal)",
                 recall(best100, truth(), 10), recall(best1000, truth(), 10));
    return ok;
}

bool bench_batch() {
    const std::string_view task = "task8 parallel batch of queries";
    const Dataset q = first_queries(100);
    const Results got = knn_batch(base(), q, 10);
    for (std::size_t j = 0; j < q.n; ++j)
        if (got[j] != knn(base(), q[j], 10)) return wrong(task, "a result is not the result of your knn");
    auto t = tira::compare(
        [&] {  // your knn for one query after another, on one thread
            Results r(q.n);
            for (std::size_t j = 0; j < q.n; ++j) r[j] = knn(base(), q[j], 10);
            tira::keep(r);
        },
        [&] { tira::keep(knn_batch(base(), q, 10)); }, 5);
    return tira::report(task, t, 3);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench_distance},
                        {"task2", bench_knn},
                        {"task3", bench_kdtree},
                        {"task4", bench_kmeans},
                        {"task5", bench_ivf},
                        {"task6", bench_pq},
                        {"task7", bench_fast_scan},
                        {"task8", bench_batch}}};
    return b.run(argc, argv);
}
