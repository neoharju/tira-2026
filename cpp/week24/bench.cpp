// Goals for week 24 (tasks 1, 2 and 3 have none). Run in the release build:
// ./w24_bench [task]. The benchmarks first build an index of 100,000 vectors
// with your build (m = 16, ef_construction = 100), which takes a few seconds,
// and task 8 builds another one with your settings.
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <random>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w24;

namespace {

const Vectors& base() {
    static const Vectors b = benchmark_base();
    return b;
}
const Vectors& queries() {
    static const Vectors q = benchmark_queries();
    return q;
}
const Results& truth() {
    static const Results t = ground_truth(base(), queries(), 10);
    return t;
}
const Hnsw& index() {
    static const Hnsw i = [] {
        Hnsw h;
        const double s = tira::seconds([&] { h = build(base(), Params{16, 100, 24}); });
        std::println("index: built in {:.1f} s", s);
        return h;
    }();
    return i;
}

// Makes new queries for a round of a goal: random vectors of the data with a
// small noise. The number of queries is the same as in queries().
Vectors fresh_queries(std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    Vectors q(queries().n, base().dim);
    for (std::size_t j = 0; j < q.n; ++j) {
        const std::uint8_t* v = base()[rng() % base().n];
        for (std::size_t i = 0; i < q.dim; ++i)
            q.values[j * q.dim + i] = static_cast<std::uint8_t>(std::clamp(static_cast<int>(v[i]) + static_cast<int>(rng() % 17) - 8, 0, 255));
    }
    return q;
}

// Measures `base_search` and `your_search` (each: query -> results) with new
// queries in each round. Their results must be the same.
template <class B, class Y>
tira::Timing compare_searches(B base_search, Y your_search, int rounds, std::uint64_t salt) {
    Vectors q;
    Results want, got;
    return tira::compare_fresh(
        [&](std::uint64_t seed) { q = fresh_queries(seed); },
        [&] {
            want.assign(q.n, {});
            for (std::size_t j = 0; j < q.n; ++j) want[j] = base_search(q[j]);
        },
        [&] {
            got.assign(q.n, {});
            for (std::size_t j = 0; j < q.n; ++j) got[j] = your_search(q[j]);
        },
        [&] { return got == want; }, rounds, salt);
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

// The index must be usable: built by your insert (task 3), with links.
bool has_links(const Hnsw& h) {
    std::size_t linked = 0;
    for (Id i = 0; i < h.inserted; ++i) linked += !h.links(i, 0).empty();
    return h.inserted == base().n && h.top >= 0 && linked >= base().n / 2;
}
bool usable(std::string_view task) { return has_links(index()) || wrong(task, "the index has no links: do task 3 first"); }

// Brute force with your distance and a heap of the best k.
std::vector<Neighbor> scan(const Vectors& data, const std::uint8_t* query, std::size_t k) {
    std::vector<Neighbor> heap;
    for (std::size_t i = 0; i < data.n; ++i) {
        const Neighbor c{l2_squared(data[i], query, data.dim), static_cast<Id>(i)};
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

bool bench_search() {
    const std::string_view task = "task4 search, ef 64";
    if (!usable(task)) return false;
    const Hnsw& h = index();
    Workspace work;
    for (std::size_t q = 0; q < queries().n; ++q)
        if (search(h, queries()[q], 10, 64, work) != baseline::search(h, queries()[q], 10, 64)) return wrong(task, "a result is not the baseline's");
    auto t = compare_searches([&](const std::uint8_t* q) { return baseline::search(h, q, 10, 64); },
                              [&](const std::uint8_t* q) { return search(h, q, 10, 64, work); }, 7, 244);
    return tira::report(task, t, 2);
}

bool bench_distance() {
    const std::string_view task = "task5 distances of bytes";
    Vectors data(20000, base().dim);  // 2.5 MB
    std::copy_n(base().values.begin(), data.values.size(), data.values.begin());
    for (std::size_t i = 0; i < data.n; ++i)
        if (l2_squared(data[i], queries()[0], data.dim) != baseline::l2_squared(data[i], queries()[0], data.dim))
            return wrong(task, "a distance is not the baseline's");
    Vectors q;
    std::uint32_t want = 0, got = 0;
    auto run = [&](auto distance, std::uint32_t& s) {
        s = 0;
        for (std::size_t j = 0; j < 16; ++j)
            for (std::size_t i = 0; i < data.n; ++i) s = s * 31 + distance(data[i], q[j], data.dim);  // The sum depends on each distance.
    };
    auto t = tira::compare_fresh([&](std::uint64_t seed) { q = fresh_queries(seed); }, [&] { run(baseline::l2_squared, want); },
                                 [&] { run(l2_squared, got); }, [&] { return got == want; }, 15, 245);
    return tira::report(task, t, 5);
}

bool bench_fast() {
    const std::string_view task = "task6 prefetching, ef 64";
    if (!usable(task)) return false;
    const Hnsw& h = index();
    Workspace work;
    for (std::size_t q = 0; q < queries().n; ++q)
        if (search_fast(h, queries()[q], 10, 64, work) != baseline::search(h, queries()[q], 10, 64)) return wrong(task, "a result is not the baseline's");
    // Against your search of task 4: the same search without prefetching.
    auto t = compare_searches([&](const std::uint8_t* q) { return search(h, q, 10, 64, work); },
                              [&](const std::uint8_t* q) { return search_fast(h, q, 10, 64, work); }, 9, 246);
    return tira::report(task, t, 1.15);
}

bool bench_batch() {
    const std::string_view task = "task7 parallel queries, ef 64";
    if (!usable(task)) return false;
    const Hnsw& h = index();
    const Results got = search_batch(h, queries(), 10, 64);
    for (std::size_t q = 0; q < queries().n; ++q)
        if (got[q] != baseline::search(h, queries()[q], 10, 64)) return wrong(task, "a result is not the baseline's");
    Workspace work;
    Vectors q;
    Results want, mine;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { q = fresh_queries(seed); },
        [&] {  // your search_fast for one query after another, on one thread
            want.assign(q.n, {});
            for (std::size_t j = 0; j < q.n; ++j) want[j] = search_fast(h, q[j], 10, 64, work);
        },
        [&] { mine = search_batch(h, q, 10, 64); }, [&] { return mine == want; }, 9, 247);
    return tira::report(task, t, 2.5);
}

// The goal of task 8 is about work, not time, because the work does not depend
// on the machine: the distances computed per query, counted by running the
// baseline search (which gives exactly your results) on your index.
bool bench_settings() {
    const std::string_view task = "task8 recall and work";
    const Settings s = tuned_settings();
    if (s.params.m < 2 || s.params.m > 64 || s.params.ef_construction > 400 || s.ef < 1)
        return wrong(task, "the settings are outside the allowed range");
    Hnsw h;
    const double build_time = tira::seconds([&] { h = build(base(), s.params); });
    Results got(queries().n);
    baseline::distances_computed() = 0;
    for (std::size_t q = 0; q < queries().n; ++q) got[q] = baseline::search(h, queries()[q], 10, s.ef);
    const double r = recall(got, truth(), 10);
    const double work_per_query = static_cast<double>(baseline::distances_computed()) / static_cast<double>(queries().n);
    const double goal_recall = 0.95, goal_work = 400;
    const bool ok = r >= goal_recall && work_per_query <= goal_work;
    std::println("{:<32} m {}, ef_construction {}, ef {}: recall@10 {:.3f}, {:.0f} distances per query  goal {} and {:.0f}  {}", task,
                 s.params.m, s.params.ef_construction, s.ef, r, work_per_query, goal_recall, goal_work, ok ? "ok" : "BELOW GOAL");
    Workspace work;
    auto t = tira::compare([&] { for (std::size_t q = 0; q < 100; ++q) tira::keep(scan(base(), queries()[q], 10)); },
                           [&] { for (std::size_t q = 0; q < 100; ++q) tira::keep(search_fast(h, queries()[q], 10, s.ef, work)); }, 5);
    std::println("      built in {:.1f} s; your search_fast is {:.0f}x faster than brute force (no goal)", build_time, t.speedup());
    // The recall and the speed for other ef, with the index of the other tasks, for information.
    if (has_links(index())) {
        std::print("      with m 16, ef_construction 100:");
        for (std::size_t ef : {10, 20, 40, 80, 160, 320}) {
            Results res(queries().n);
            const double sec = tira::seconds([&] { for (std::size_t q = 0; q < queries().n; ++q) res[q] = search_fast(index(), queries()[q], 10, ef, work); });
            std::print("  ef {} {:.3f} {:.0f} us", ef, recall(res, truth(), 10), sec / static_cast<double>(queries().n) * 1e6);
        }
        std::println("");
    }
    return ok;
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task4", bench_search}, {"task5", bench_distance}, {"task6", bench_fast}, {"task7", bench_batch}, {"task8", bench_settings}}};
    return b.run(argc, argv);
}
