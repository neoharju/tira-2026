// Speed goals for week 25 (tasks 1 and 3 have none). Run in the release
// build: ./w25_bench [task]. The benchmarks search 2^27 keys (512 MB, more
// than the caches) with 2^19 random queries; building the layouts first takes
// a few seconds. Task 2 searches 2^18 keys (1 MB, in the L2 cache): without
// prefetching, the Eytzinger layout is not much faster than std::lower_bound
// for keys in memory (see the chapter).
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w25;

namespace {

constexpr std::size_t N = std::size_t{1} << 27;

const std::vector<Key>& sorted() {
    static const auto s = sorted_keys(N, 25);
    return s;
}
const std::vector<Key>& queries() {
    static const auto q = random_queries(sorted(), std::size_t{1} << 19, 26);
    return q;
}
const Keys& layout() {
    static const Keys e = eytzinger(sorted());
    return e;
}
// The 2^18 keys of task 2.
const std::vector<Key>& small_sorted() {
    static const auto s = sorted_keys(std::size_t{1} << 18, 24);
    return s;
}
const std::vector<Key>& small_queries() {
    static const auto q = random_queries(small_sorted(), std::size_t{1} << 19, 23);
    return q;
}
const Keys& small_layout() {
    static const Keys e = eytzinger(small_sorted());
    return e;
}

const StaticBTree& tree() {
    static const StaticBTree t = [] {
        StaticBTree s = static_btree_shape(N);
        build_static_btree(s, sorted());
        return s;
    }();
    return t;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

template <class F>
bool correct(F search) {
    for (std::size_t i = 0; i < 2000; ++i)
        if (search(queries()[i]) != baseline::lower_bound(sorted(), queries()[i])) return false;
    return true;
}

// The time of all queries (of the big or the small array) with `search`.
template <class F>
auto all_queries(F search, bool small = false) {
    return [search, small] {
        Key s = 0;
        for (Key x : small ? small_queries() : queries()) s ^= search(x);
        tira::keep(s);
    };
}

const auto std_search = [](Key x) { return baseline::lower_bound(sorted(), x); };

bool bench_eytzinger() {
    const std::string_view task = "task2 Eytzinger search, 1 MB";
    const auto mine = [](Key x) { return eytzinger_search(small_layout(), x); };
    const auto std_small = [](Key x) { return baseline::lower_bound(small_sorted(), x); };
    for (std::size_t i = 0; i < 2000; ++i)
        if (mine(small_queries()[i]) != std_small(small_queries()[i])) return wrong(task, "a result is not the lower bound");
    auto t = tira::compare(all_queries(std_small, true), all_queries(mine, true), 5);
    const bool ok = tira::report(task, t, 2);
    auto b = tira::compare(all_queries(std_small, true),
                           all_queries([](Key x) { return baseline::branchless_lower_bound(small_sorted(), x); }, true), 5);
    std::println("      (the branchless binary search of the baseline: {:.2f}x, no goal)", b.speedup());
    return ok;
}

bool bench_avx2() {
    const std::string_view task = "task4 static B+ tree, AVX2";
    const auto mine = [](Key x) { return static_btree_search(tree(), x); };
    if (!correct(mine)) return wrong(task, "a result is not the lower bound");
    auto t = tira::compare(all_queries(std_search), all_queries(mine), 5);
    return tira::report(task, t, 4);
}

bool bench_avx512() {
    const std::string_view task = "task5 static B+ tree, AVX-512";
    if (!tira::has_avx512()) {
        std::println("task5: SKIPPED, this CPU has no AVX-512 (measure on the course machine)");
        return false;
    }
    const auto mine = [](Key x) { return static_btree_search_avx512(tree(), x); };
    if (!correct(mine)) return wrong(task, "a result is not the lower bound");
    auto t = tira::compare(all_queries(std_search), all_queries(mine), 5);
    const bool ok = tira::report(task, t, 4);
    auto v = tira::compare(all_queries([](Key x) { return static_btree_search(tree(), x); }), all_queries(mine), 5);
    std::println("      compared with your AVX2 search: {:.2f}x (no goal)", v.speedup());
    return ok;
}

bool bench_prefetch() {
    const std::string_view task = "task6 Eytzinger with prefetching";
    const auto mine = [](Key x) { return eytzinger_search_prefetch(layout(), x); };
    if (!correct(mine)) return wrong(task, "a result is not the lower bound");
    // Against your search of task 2: the same search without prefetching.
    auto t = tira::compare(all_queries([](Key x) { return eytzinger_search(layout(), x); }), all_queries(mine), 5);
    return tira::report(task, t, 1.8);
}

bool bench_batch() {
    const std::string_view task = "task7 parallel searches";
    std::vector<Key> got(queries().size());
    search_batch(tree(), queries(), got);
    for (std::size_t i = 0; i < got.size(); i += 97)
        if (got[i] != baseline::lower_bound(sorted(), queries()[i])) return wrong(task, "a result is not the lower bound");
    auto t = tira::compare(
        [&] {  // your search of task 4, one query after another on one thread
            for (std::size_t i = 0; i < queries().size(); ++i) got[i] = static_btree_search(tree(), queries()[i]);
            tira::keep(got[0]);
        },
        [&] { search_batch(tree(), queries(), got), tira::keep(got[0]); }, 7);
    return tira::report(task, t, 2.8);
}

bool bench_build() {
    const std::string_view task = "task8 parallel build";
    {
        StaticBTree p = static_btree_shape(N);
        build_static_btree_parallel(p, sorted());
        if (!(p.keys == tree().keys)) return wrong(task, "the tree is not the tree of your task 3");
    }
    // Every run builds a new tree in new memory, so the first touch is included.
    auto t = tira::compare(
        [] {
            StaticBTree s = static_btree_shape(N);
            build_static_btree(s, sorted());
            tira::keep(s.keys[0]);
        },
        [] {
            StaticBTree s = static_btree_shape(N);
            build_static_btree_parallel(s, sorted());
            tira::keep(s.keys[0]);
        },
        5);
    return tira::report(task, t, 2);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task2", bench_eytzinger},
                        {"task4", bench_avx2},
                        {"task5", bench_avx512},
                        {"task6", bench_prefetch},
                        {"task7", bench_batch},
                        {"task8", bench_build}}};
    return b.run(argc, argv);
}
