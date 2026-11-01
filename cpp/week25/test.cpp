// Tests for week 25. Run one task's tests with: ./w25_test -tc="task4*"
// Tasks 2 and 6 use your layout of task 1, and tasks 4, 5, 7 and 8 your tree
// of task 3: do tasks 1 and 3 first.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <random>
#include <string>
#include <vector>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w25;

namespace {

// Sizes from 0 to 70, and larger ones with 1 to 5 levels in the tree.
std::vector<std::size_t> sizes() {
    std::vector<std::size_t> s;
    for (std::size_t n = 0; n <= 70; ++n) s.push_back(n);
    for (std::size_t n : {255, 256, 271, 272, 273, 1000, 4351, 4352, 4353, 20000, 100000}) s.push_back(n);
    return s;
}

// The queries for a set of keys: every key, its neighbours, the ends, and random values.
std::vector<Key> queries_for(std::span<const Key> sorted, std::uint64_t seed) {
    std::vector<Key> q = random_queries(sorted, 200, seed);
    for (std::size_t i = 0; i < sorted.size(); i += 1 + sorted.size() / 300) {
        q.push_back(sorted[i]);
        q.push_back(sorted[i] - 1);
        q.push_back(sorted[i] + 1);
    }
    for (Key x : {std::numeric_limits<Key>::min(), Key{-1}, Key{0}, none - 1, none}) q.push_back(x);
    return q;
}

// The keys of an in-order walk of the implicit tree in e (without recursion).
std::vector<Key> in_order(std::span<const Key> e) {
    const std::size_t n = e.size() - 1;
    std::vector<Key> out;
    std::vector<std::size_t> stack;
    std::size_t k = 1;
    while (k <= n || !stack.empty()) {
        while (k <= n) {
            stack.push_back(k);
            k *= 2;
        }
        k = stack.back();
        stack.pop_back();
        out.push_back(e[k]);
        k = 2 * k + 1;
    }
    return out;
}

// The largest key under node `t` of level `level`, by walking down the last children.
Key largest_under(const StaticBTree& tree, std::size_t level, std::size_t t) {
    while (level > 0) {
        t = std::min(17 * t + 16, tree.nodes[level - 1] - 1);
        --level;
    }
    return tree.node(0, t)[StaticBTree::B - 1];
}

StaticBTree built(std::span<const Key> sorted) {
    StaticBTree t = static_btree_shape(sorted.size());
    build_static_btree(t, sorted);
    return t;
}

}  // namespace

TEST_CASE("task1 the Eytzinger layout") {
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n);
        const Keys e = eytzinger(sorted);
        INFO("n = " << n);
        REQUIRE(e.size() == n + 1);
        CHECK(e[0] == none);
        CHECK(in_order(e) == sorted);
    }
}

TEST_CASE("task2 search in the Eytzinger layout") {
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n + 1);
        const Keys e = eytzinger(sorted);
        for (Key x : queries_for(sorted, n)) {
            INFO("n = " << n << ", x = " << x);
            CHECK(eytzinger_search(e, x) == baseline::lower_bound(sorted, x));
        }
    }
}

TEST_CASE("task3 the static B+ tree") {
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n + 2);
        const StaticBTree t = built(sorted);
        INFO("n = " << n);
        // The leaves: the keys and then the padding.
        const Key* leaves = t.node(0, 0);
        bool leaves_ok = true;
        for (std::size_t i = 0; i < t.nodes[0] * StaticBTree::B; ++i) leaves_ok = leaves_ok && leaves[i] == (i < n ? sorted[i] : none);
        CHECK_MESSAGE(leaves_ok, "the leaves must be the sorted keys followed by none");
        // Every key of an upper level is the largest key under its child.
        bool upper_ok = true;
        for (std::size_t level = 1; level < t.levels(); ++level)
            for (std::size_t node = 0; node < t.nodes[level]; ++node)
                for (std::size_t i = 0; i < StaticBTree::B; ++i) {
                    const std::size_t child = 17 * node + i;
                    const Key want = child < t.nodes[level - 1] ? largest_under(t, level - 1, child) : none;
                    if (t.node(level, node)[i] != want) {
                        upper_ok = false;
                        INFO("level " << level << ", node " << node << ", key " << i);
                        CHECK(t.node(level, node)[i] == want);
                    }
                }
        CHECK(upper_ok);
    }
}

TEST_CASE("task4 search in the static B+ tree with AVX2") {
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n + 3);
        const StaticBTree t = built(sorted);
        for (Key x : queries_for(sorted, n + 3)) {
            INFO("n = " << n << ", x = " << x);
            CHECK(static_btree_search(t, x) == baseline::lower_bound(sorted, x));
        }
    }
}

TEST_CASE("task5 search in the static B+ tree with AVX-512") {
    if (!tira::has_avx512()) {
        MESSAGE("SKIPPED: no AVX-512 on this CPU. Run under Intel SDE: sde64 -- ./w25_test -tc=\"task5*\"");
        return;
    }
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n + 4);
        const StaticBTree t = built(sorted);
        for (Key x : queries_for(sorted, n + 4)) {
            INFO("n = " << n << ", x = " << x);
            CHECK(static_btree_search_avx512(t, x) == baseline::lower_bound(sorted, x));
        }
    }
}

TEST_CASE("task6 search in the Eytzinger layout with prefetching") {
    for (std::size_t n : sizes()) {
        const auto sorted = sorted_keys(n, n + 5);
        const Keys e = eytzinger(sorted);
        for (Key x : queries_for(sorted, n + 5)) {
            INFO("n = " << n << ", x = " << x);
            CHECK(eytzinger_search_prefetch(e, x) == baseline::lower_bound(sorted, x));
        }
    }
}

TEST_CASE("task7 many searches in parallel") {
    const auto sorted = sorted_keys(100000, 70);
    const StaticBTree t = built(sorted);
    const auto queries = random_queries(sorted, 5001, 71);
    std::vector<Key> want(queries.size());
    for (std::size_t i = 0; i < queries.size(); ++i) want[i] = baseline::lower_bound(sorted, queries[i]);
    const int threads = omp_get_max_threads();
    for (int th : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(th);
        std::vector<Key> got(queries.size(), 12345);
        search_batch(t, queries, got);
        INFO("threads = " << th);
        CHECK(got == want);
        search_batch(t, {}, {});
    }
    omp_set_num_threads(threads);
}

TEST_CASE("task8 the parallel build gives the same tree") {
    const int threads = omp_get_max_threads();
    for (int th : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(th);
        for (std::size_t n : {0, 1, 15, 16, 17, 300, 4353, 100000}) {
            const auto sorted = sorted_keys(n, n + 80);
            StaticBTree t = static_btree_shape(n);
            build_static_btree_parallel(t, sorted);
            INFO("threads = " << th << ", n = " << n);
            CHECK(t.keys == built(sorted).keys);
        }
    }
    omp_set_num_threads(threads);
}
