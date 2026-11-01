// Tests for week 26. Run one task's tests with: ./w26_test -tc="task4*"
// The tests of tasks 1, 3 and 4 start from trees made by bulk_load (given),
// so they do not need your insert; validate() checks the rules of the tree.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <map>
#include <random>
#include <set>
#include <string>
#include <vector>

#include "mutants.hpp"
#include "task5_fuzz.hpp"
#include "tasks.hpp"
#include "tira.hpp"

using namespace w26;

namespace {

using Pairs = std::vector<std::pair<Key, Value>>;

// n different random keys, sorted, with the extreme keys 0 and 2^64 - 1
// among them when n >= 2; the value of a key is derived from it.
Pairs random_pairs(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::set<Key> keys;
    if (n >= 2) keys = {0, ~Key{0}};
    while (keys.size() < n) keys.insert(rng());
    Pairs p;
    for (Key k : keys) p.emplace_back(k, k * 31 + 7);
    return p;
}

// The pairs of the tree, read from the pages: down the first children, then
// along the leaf links.
Pairs contents(const BPlusTree& t) {
    PageId page = t.root;
    for (int depth = 1; depth < t.height; ++depth) page = t.inners[page].children[0];
    Pairs out;
    for (; page != no_page; page = t.leaves[page].next)
        for (std::size_t i = 0; i < t.leaves[page].count; ++i) out.emplace_back(t.leaves[page].keys[i], t.leaves[page].values[i]);
    return out;
}

Pairs contents(const std::map<Key, Value>& m) { return {m.begin(), m.end()}; }

void check_valid(const BPlusTree& t) {
    try {
        t.validate();
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

// Two trees with the same pages (only the parts in use are compared).
bool same_pages(const BPlusTree& a, const BPlusTree& b) {
    if (a.root != b.root || a.height != b.height || a.size() != b.size() || a.leaves.size() != b.leaves.size() ||
        a.inners.size() != b.inners.size())
        return false;
    for (std::size_t p = 0; p < a.leaves.size(); ++p) {
        const Leaf &x = a.leaves[p], &y = b.leaves[p];
        if (x.count != y.count || x.prev != y.prev || x.next != y.next || !std::equal(x.keys, x.keys + x.count, y.keys) ||
            !std::equal(x.values, x.values + x.count, y.values))
            return false;
    }
    for (std::size_t p = 0; p < a.inners.size(); ++p) {
        const Inner &x = a.inners[p], &y = b.inners[p];
        if (x.count != y.count || !std::equal(x.keys, x.keys + x.count, y.keys) || !std::equal(x.children, x.children + x.count + 1, y.children))
            return false;
    }
    return true;
}

const std::vector<std::size_t> tree_sizes{0, 1, 2, 31, 32, 63, 64, 65, 96, 97, 4160, 4161, 4225, 20000, 100000};

}  // namespace

TEST_CASE("task1 find in trees made by bulk_load") {
    for (std::size_t n : tree_sizes) {
        const Pairs pairs = random_pairs(n, n + 1);
        const BPlusTree t = bulk_load(pairs);
        INFO("n = " << n);
        bool all = true;
        for (const auto& [k, v] : pairs) all = all && t.find(k) == v;
        CHECK_MESSAGE(all, "a key of the tree was not found or had a wrong value");
        std::mt19937_64 rng(n);
        bool none = true;
        for (std::size_t i = 0; i < pairs.size() + 100; ++i) {
            const Key k = i < pairs.size() ? pairs[i].first + 1 : rng();  // mostly keys that are not there
            const bool there = std::ranges::binary_search(pairs, k, {}, &std::pair<Key, Value>::first);
            if (!there) none = none && !t.find(k).has_value();
        }
        CHECK_MESSAGE(none, "find found a key that is not in the tree");
    }
}

TEST_CASE("task2 insert") {
    struct Pattern {
        std::string name;
        std::size_t ops;
        std::uint64_t range;  // 0: all 64-bit keys
        int order;            // 0 random, 1 increasing, -1 decreasing
    };
    for (const Pattern& p : {Pattern{"random keys", 20000, 0, 0}, Pattern{"few keys, many replaced", 20000, 500, 0},
                             Pattern{"increasing keys", 10000, 0, 1}, Pattern{"decreasing keys", 10000, 0, -1},
                             Pattern{"keys near 2^63 and 2^64", 10000, 3000, 2}}) {
        BPlusTree t;
        std::map<Key, Value> want;
        std::mt19937_64 rng(p.ops + p.range);
        bool results = true;
        for (std::size_t i = 0; i < p.ops; ++i) {
            Key k = p.range ? rng() % p.range : rng();
            if (p.order == 1) k = i * 1000003;
            if (p.order == -1) k = ~Key{0} - i * 1000003;
            if (p.order == 2) k = (i % 2 ? Key{1} << 63 : ~Key{0} - 1500) + rng() % 3000 - 1500;
            const Value v = rng();
            results = results && t.insert(k, v) == want.insert_or_assign(k, v).second;
            if (i % 2500 == 0) check_valid(t);
        }
        INFO(p.name);
        CHECK_MESSAGE(results, "insert returned a wrong result (true for a new key, false for a replaced value)");
        check_valid(t);
        CHECK(t.size() == want.size());
        CHECK(contents(t) == contents(want));
    }
}

TEST_CASE("task3 scan") {
    for (std::size_t n : tree_sizes) {
        const Pairs pairs = random_pairs(n, n + 3);
        const BPlusTree t = bulk_load(pairs);
        std::map<Key, Value> want(pairs.begin(), pairs.end());
        std::mt19937_64 rng(n + 3);
        for (int q = 0; q < 300; ++q) {
            Key lo, hi;
            if (q % 3 == 0 && n > 0) {  // around keys of the tree
                lo = pairs[rng() % n].first - rng() % 2;
                hi = pairs[rng() % n].first + rng() % 2;
            } else {
                lo = rng();
                hi = q % 5 == 0 ? lo + rng() % (Key{1} << 58) : rng();
            }
            if (q == 1) lo = 0, hi = ~Key{0};
            Pairs got{{1, 2}}, expect{{1, 2}};  // scan appends to what is there
            t.scan(lo, hi, got);
            if (lo <= hi)
                for (auto it = want.lower_bound(lo); it != want.end() && it->first <= hi; ++it) expect.push_back(*it);
            INFO("n = " << n << ", lo = " << lo << ", hi = " << hi);
            CHECK(got == expect);
        }
    }
}

TEST_CASE("task4 erase from trees made by bulk_load") {
    for (std::size_t n : tree_sizes) {
        const Pairs pairs = random_pairs(n, n + 4);
        BPlusTree t = bulk_load(pairs);
        std::map<Key, Value> want(pairs.begin(), pairs.end());
        std::vector<Key> order;
        for (const auto& [k, v] : pairs) order.push_back(k), order.push_back(k + 1);  // also keys that are not there
        std::mt19937_64 rng(n);
        std::ranges::shuffle(order, rng);
        bool results = true;
        for (std::size_t i = 0; i < order.size(); ++i) {
            results = results && t.erase(order[i]) == (want.erase(order[i]) == 1);
            if (i % 997 == 0 || i + 1 == order.size() || order.size() < 300) {
                check_valid(t);
                if (i % 9973 == 0) CHECK(contents(t) == contents(want));
            }
        }
        INFO("n = " << n);
        CHECK_MESSAGE(results, "erase returned a wrong result");
        CHECK(t.size() == 0);
        CHECK(t.height == 1);
        CHECK(contents(t).empty());
    }
}

TEST_CASE("task5 the fuzz harness catches the bugs") {
    // Random inputs of 0 to 1024 bytes.
    std::vector<std::vector<std::uint8_t>> inputs;
    std::mt19937_64 rng(5);
    for (int i = 0; i < 1000; ++i) {
        std::vector<std::uint8_t> in(rng() % 1025);
        for (auto& b : in) b = static_cast<std::uint8_t>(rng());
        inputs.push_back(std::move(in));
    }
    auto caught = [&]<class Map>() {
        for (const auto& in : inputs) {
            Map m;
            if (!differential(std::span<const std::uint8_t>(in), m)) return true;
        }
        return false;
    };
    SUBCASE("a correct map passes every input") {
        bool all = true;
        for (std::size_t i = 0; i < 300; ++i) {
            SortedVectorMap m;
            all = all && differential(std::span<const std::uint8_t>(inputs[i]), m);
        }
        CHECK_MESSAGE(all, "your harness reported a difference for a correct map");
        SortedVectorMap m;
        CHECK(differential(std::span<const std::uint8_t>(), m));
    }
    SUBCASE("every mutant is caught") {
        CHECK_MESSAGE(caught.operator()<MutantKeepsOldValue>(), "not caught: insert keeps the old value");
        CHECK_MESSAGE(caught.operator()<MutantEraseSaysYes>(), "not caught: erase of a missing key returns true");
        CHECK_MESSAGE(caught.operator()<MutantScanWithoutHi>(), "not caught: the scan leaves out hi");
        CHECK_MESSAGE(caught.operator()<MutantSizeCountsReplace>(), "not caught: the size counts a replaced key");
        CHECK_MESSAGE(caught.operator()<MutantLosesKeyOnSplit>(), "not caught: a key is lost when the map gets its 65th key");
        CHECK_MESSAGE(caught.operator()<MutantSignedOrder>(), "not caught: the keys are ordered as signed numbers");
        CHECK_MESSAGE(caught.operator()<MutantFindMissesFirst>(), "not caught: find misses the smallest key");
    }
}

namespace {

void check_kernel(std::size_t (*search)(const Key*, std::size_t, Key)) {
    std::mt19937_64 rng(6);
    const std::vector<Key> special{0, 1, 2, (Key{1} << 63) - 1, Key{1} << 63, (Key{1} << 63) + 1, ~Key{0} - 1, ~Key{0}};
    for (std::size_t count = 0; count <= 64; ++count) {
        for (int rep = 0; rep < 20; ++rep) {
            std::vector<Key> keys;  // exactly count keys: AddressSanitizer reports reads past the end
            for (std::size_t i = 0; i < count; ++i) keys.push_back(rep % 3 == 0 && i < special.size() ? special[i] : rng() >> (rep % 4 * 16));
            std::ranges::sort(keys);
            keys.erase(std::unique(keys.begin(), keys.end()), keys.end());
            keys = std::vector<Key>(keys.begin(), keys.end());  // capacity == size
            std::vector<Key> xs = special;
            for (Key k : keys) xs.insert(xs.end(), {k, k - 1, k + 1});
            for (int i = 0; i < 10; ++i) xs.push_back(rng());
            for (Key x : xs) {
                const std::size_t want = baseline::node_lower_bound(keys.data(), keys.size(), x);
                const std::size_t got = search(keys.data(), keys.size(), x);
                if (got != want) {
                    INFO("count = " << keys.size() << ", x = " << x);
                    CHECK(got == want);
                    return;
                }
            }
        }
    }
}

}  // namespace

TEST_CASE("task6 node search with AVX2") { check_kernel(node_lower_bound_avx2); }

TEST_CASE("task7 node search with AVX-512") {
    if (!tira::has_avx512()) {
        MESSAGE("SKIPPED: no AVX-512 on this CPU. Run under Intel SDE: sde64 -- ./w26_test -tc=\"task7*\"");
        return;
    }
    check_kernel(node_lower_bound_avx512);
}

TEST_CASE("task8 parallel bulk load") {
    const int threads = omp_get_max_threads();
    for (int th : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(th);
        for (std::size_t n : tree_sizes) {
            const Pairs pairs = random_pairs(n, n + 8);
            const BPlusTree got = bulk_load_parallel(pairs);
            INFO("threads = " << th << ", n = " << n);
            CHECK(same_pages(got, bulk_load(pairs)));
            check_valid(got);
        }
    }
    omp_set_num_threads(threads);
}
