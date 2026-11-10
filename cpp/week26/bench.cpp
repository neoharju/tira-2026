// Speed goals for week 26 (task 5 has none: its tests are its goal). Run in
// the release build: ./w26_bench [task]. Tasks 1-4 use 1,000,000 random 64-bit
// keys and compare with std::map; task 8 loads 16,000,000 keys.
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <map>
#include <random>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w26;

namespace {

using Pairs = std::vector<std::pair<Key, Value>>;

Pairs random_pairs(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Key> keys(n);
    for (Key& k : keys) k = rng();
    std::ranges::sort(keys);
    keys.erase(std::unique(keys.begin(), keys.end()), keys.end());
    Pairs p(keys.size());
    for (std::size_t i = 0; i < keys.size(); ++i) p[i] = {keys[i], keys[i] ^ 0x5555};
    return p;
}

const Pairs& pairs() {
    static const Pairs p = random_pairs(1'000'000, 26);
    return p;
}
const std::vector<Key>& shuffled() {
    static const auto s = [] {
        std::vector<Key> k;
        for (const auto& [key, value] : pairs()) k.push_back(key);
        std::mt19937_64 rng(27);
        std::ranges::shuffle(k, rng);
        return k;
    }();
    return s;
}
const std::map<Key, Value>& model() {
    static const std::map<Key, Value> m(pairs().begin(), pairs().end());
    return m;
}
const BPlusTree& loaded() {
    static const BPlusTree t = bulk_load(pairs());
    return t;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

// The input of one round of a goal: new keys in a new random order, in a
// std::map and in a bulk-loaded tree.
struct Round {
    Pairs pairs;
    std::vector<Key> shuffled;
    std::map<Key, Value> model;
    BPlusTree tree;
};
void new_round(Round& r, std::uint64_t seed, bool with_maps = true) {
    r = {};
    r.pairs = random_pairs(1'000'000, seed);
    for (const auto& [key, value] : r.pairs) r.shuffled.push_back(key);
    std::ranges::shuffle(r.shuffled, std::mt19937_64(seed + 1));
    if (with_maps) {
        r.model = std::map<Key, Value>(r.pairs.begin(), r.pairs.end());
        r.tree = bulk_load(r.pairs);
    }
}

double tree_find_seconds(const BPlusTree& t) {
    return tira::seconds([&] {
        Value s = 0;
        for (Key k : shuffled()) s ^= *t.find(k);
        tira::keep(s);
    });
}

bool bench_find() {
    const std::string_view task = "task1 find, 1M keys";
    for (std::size_t i = 0; i < 20000; ++i)
        if (loaded().find(shuffled()[i]) != model().at(shuffled()[i]) || loaded().find(shuffled()[i] + 1).has_value() != model().contains(shuffled()[i] + 1))
            return wrong(task, "a result is not the result of std::map");
    Round r;
    std::vector<Value> want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { new_round(r, seed); },
        [&] {
            want.clear();
            for (Key k : r.shuffled) want.push_back(r.model.find(k)->second);
        },
        [&] {
            got.clear();
            for (Key k : r.shuffled) got.push_back(*r.tree.find(k));
        },
        [&] { return got == want; }, 7, 261);
    return tira::report(task, t, 3);
}

bool bench_insert() {
    const std::string_view task = "task2 insert, 1M keys";
    {
        BPlusTree t;
        for (Key k : shuffled()) t.insert(k, k ^ 0x5555);
        try {
            t.validate();
        } catch (const std::exception& e) {
            return wrong(task, e.what());
        }
        if (t.size() != pairs().size()) return wrong(task, "the size is wrong");
        for (std::size_t i = 0; i < 20000; ++i)
            if (t.find(shuffled()[i]) != (shuffled()[i] ^ 0x5555)) return wrong(task, "a key was lost");
    }
    Round r;
    std::map<Key, Value> m;
    BPlusTree tree;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            new_round(r, seed, false);
            m = {}, tree = {};
        },
        [&] {
            for (Key k : r.shuffled) m.insert_or_assign(k, k ^ 0x5555);
        },
        [&] {
            for (Key k : r.shuffled) tree.insert(k, k ^ 0x5555);
        },
        [&] {
            if (tree.size() != m.size()) return false;
            for (std::size_t i = 0; i < r.shuffled.size(); i += 101)
                if (tree.find(r.shuffled[i]) != (r.shuffled[i] ^ 0x5555)) return false;
            return true;
        },
        5, 262);
    return tira::report(task, t, 1.7);
}

bool bench_scan() {
    const std::string_view task = "task3 scans of ~100 keys";
    constexpr Key span = ~Key{0} / 1'000'000 * 100;  // about 100 keys
    std::mt19937_64 rng(28);
    std::vector<Key> lows(100'000);
    for (Key& k : lows) k = rng() % (~Key{0} - span);
    std::vector<std::pair<Key, Value>> got, want;
    for (std::size_t i = 0; i < 1000; ++i) {
        got.clear();
        want.clear();
        loaded().scan(lows[i], lows[i] + span, got);
        for (auto it = model().lower_bound(lows[i]); it != model().end() && it->first <= lows[i] + span; ++it) want.push_back(*it);
        if (got != want) return wrong(task, "a scan is not the scan of std::map");
    }
    // Each round has new ranges. The benchmark keeps and compares the results
    // of 1000 scans. It selects them at random, without a time measurement.
    std::vector<std::uint8_t> keep(lows.size());
    Pairs kept_want, kept_got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            std::mt19937_64 g(seed);
            for (Key& k : lows) k = g() % (~Key{0} - span);
            std::ranges::fill(keep, 0);
            for (int i = 0; i < 1000; ++i) keep[g() % keep.size()] = 1;
            kept_want.clear(), kept_got.clear();
        },
        [&] {
            for (std::size_t i = 0; i < lows.size(); ++i) {
                want.clear();
                for (auto it = model().lower_bound(lows[i]); it != model().end() && it->first <= lows[i] + span; ++it) want.push_back(*it);
                if (keep[i]) kept_want.insert(kept_want.end(), want.begin(), want.end());
            }
        },
        [&] {
            for (std::size_t i = 0; i < lows.size(); ++i) {
                got.clear();
                loaded().scan(lows[i], lows[i] + span, got);
                if (keep[i]) kept_got.insert(kept_got.end(), got.begin(), got.end());
            }
        },
        [&] { return kept_got == kept_want; }, 5, 263);
    return tira::report(task, t, 3);
}

bool bench_erase() {
    const std::string_view task = "task4 erase, 1M keys";
    {
        BPlusTree t = loaded();
        for (Key k : shuffled())
            if (!t.erase(k)) return wrong(task, "a key was not found");
        try {
            t.validate();
        } catch (const std::exception& e) {
            return wrong(task, e.what());
        }
        if (t.size() != 0) return wrong(task, "the tree is not empty");
    }
    Round r;
    std::size_t erased_m = 0, erased_t = 0;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { new_round(r, seed); },
        [&] {
            erased_m = 0;
            for (Key k : r.shuffled) erased_m += r.model.erase(k);
        },
        [&] {
            erased_t = 0;
            for (Key k : r.shuffled) erased_t += r.tree.erase(k);
        },
        [&] { return erased_t == erased_m && r.tree.size() == 0; }, 5, 264);
    return tira::report(task, t, 2);
}

// 4096 nodes of 64 random sorted keys (2 MB) and one million searches in them.
struct Nodes {
    std::vector<Key> keys;
    std::vector<std::pair<std::uint32_t, Key>> queries;
};
Nodes make_nodes(std::uint64_t seed) {
    Nodes s;
    std::mt19937_64 rng(seed);
    s.keys.resize(4096 * 64);
    for (std::size_t i = 0; i < 4096; ++i) {
        for (std::size_t j = 0; j < 64; ++j) s.keys[i * 64 + j] = rng();
        std::sort(s.keys.begin() + static_cast<std::ptrdiff_t>(i * 64), s.keys.begin() + static_cast<std::ptrdiff_t>(i * 64 + 64));
    }
    for (int q = 0; q < 1'000'000; ++q) s.queries.emplace_back(static_cast<std::uint32_t>(rng() % 4096), rng());
    return s;
}
const Nodes& nodes() {
    static const Nodes n = make_nodes(29);
    return n;
}

auto node_searches(NodeSearch f) {
    return [f] {
        std::size_t s = 0;
        for (const auto& [node, x] : nodes().queries) s += f(nodes().keys.data() + node * 64, 64, x);
        tira::keep(s);
    };
}

// Measures a goal: the baseline node search against `f`, with new nodes and
// queries in each round. The answers go into a checksum that depends on all
// of them.
tira::Timing compare_node_searches(NodeSearch f, std::uint64_t salt) {
    Nodes n;
    std::size_t want = 0, got = 0;
    auto run = [&](NodeSearch g, std::size_t& s) {
        s = 0;
        for (const auto& [node, x] : n.queries) s = s * 31 + g(n.keys.data() + node * 64, 64, x);
    };
    return tira::compare_fresh([&](std::uint64_t seed) { n = make_nodes(seed); }, [&] { run(baseline::node_lower_bound, want); },
                               [&] { run(f, got); }, [&] { return got == want; }, 9, salt);
}

bool kernel_correct(NodeSearch f) {
    for (std::size_t q = 0; q < 100000; ++q) {
        const auto& [node, x] = nodes().queries[q];
        const std::size_t count = q % 65;
        if (f(nodes().keys.data() + node * 64, count, x) != baseline::node_lower_bound(nodes().keys.data() + node * 64, count, x)) return false;
    }
    return true;
}

void tree_with(NodeSearch f, std::string_view name) {
    const NodeSearch old = node_search;
    node_search = f;
    bool works = true;
    for (std::size_t i = 0; i < 1000; ++i) works = works && loaded().find(shuffled()[i]) == (shuffled()[i] ^ 0x5555);
    node_search = old;
    if (!works) {
        std::println("      (your find of task 1 does not work yet, so the tree is not timed)");
        return;
    }
    auto t = tira::compare([] { tira::keep(tree_find_seconds(loaded())); },
                           [&] {
                               node_search = f;
                               tira::keep(tree_find_seconds(loaded()));
                               node_search = old;
                           },
                           5);
    node_search = old;
    std::println("      your find with {} node search: {:.2f}x faster than with the baseline (no goal)", name, t.speedup());
}

bool bench_avx2() {
    const std::string_view task = "task6 node search, AVX2";
    if (!kernel_correct(node_lower_bound_avx2)) return wrong(task, "a result is not the result of the baseline");
    auto t = compare_node_searches(node_lower_bound_avx2, 266);
    const bool ok = tira::report(task, t, 2.2);
    tree_with(node_lower_bound_avx2, "the AVX2");
    return ok;
}

bool bench_avx512() {
    const std::string_view task = "task7 node search, AVX-512";
    if (!tira::has_avx512()) {
        std::println("task7: SKIPPED, this CPU has no AVX-512 (measure on the course machine)");
        return false;
    }
    if (!kernel_correct(node_lower_bound_avx512)) return wrong(task, "a result is not the result of the baseline");
    auto t = compare_node_searches(node_lower_bound_avx512, 267);
    const bool ok = tira::report(task, t, 2.6);
    auto v = tira::compare(node_searches(node_lower_bound_avx2), node_searches(node_lower_bound_avx512), 9);
    std::println("      compared with your AVX2 node search: {:.2f}x (no goal)", v.speedup());
    tree_with(node_lower_bound_avx512, "the AVX-512");
    return ok;
}

bool bench_bulk() {
    const std::string_view task = "task8 parallel bulk load, 16M";
    Pairs big = random_pairs(16'000'000, 30);
    auto same = [](const BPlusTree& a, const BPlusTree& b) {
        bool equal = a.root == b.root && a.height == b.height && a.size() == b.size() && a.leaves.size() == b.leaves.size() &&
                    a.inners.size() == b.inners.size();
        for (std::size_t p = 0; equal && p < a.leaves.size(); p += 97)
            equal = a.leaves[p].count == b.leaves[p].count && a.leaves[p].next == b.leaves[p].next &&
                    std::equal(a.leaves[p].keys, a.leaves[p].keys + a.leaves[p].count, b.leaves[p].keys);
        return equal;
    };
    if (!same(bulk_load(big), bulk_load_parallel(big))) return wrong(task, "the tree is not the tree of bulk_load");
    // Each round has new keys. The step that makes them has no time measurement.
    BPlusTree want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            want = {}, got = {};
            big = random_pairs(16'000'000, seed);
        },
        [&] { want = bulk_load(big); }, [&] { got = bulk_load_parallel(big); }, [&] { return same(got, want); }, 5, 268);
    return tira::report(task, t, 1.8);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench_find},
                        {"task2", bench_insert},
                        {"task3", bench_scan},
                        {"task4", bench_erase},
                        {"task6", bench_avx2},
                        {"task7", bench_avx512},
                        {"task8", bench_bulk}}};
    return b.run(argc, argv);
}
