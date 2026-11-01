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

// Times only `work`, after `setup`, in turns; the medians, as tira::compare.
template <class S1, class W1, class S2, class W2>
tira::Timing compare_after_setup(S1 setup_a, W1 work_a, S2 setup_b, W2 work_b, int rounds) {
    std::vector<double> a, b;
    for (int r = 0; r < rounds; ++r) {
        auto x = setup_a();
        a.push_back(tira::seconds([&] { work_a(x); }));
        auto y = setup_b();
        b.push_back(tira::seconds([&] { work_b(y); }));
    }
    std::ranges::sort(a);
    std::ranges::sort(b);
    return {a[a.size() / 2], b[b.size() / 2]};
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
    auto t = tira::compare(
        [] {
            Value s = 0;
            for (Key k : shuffled()) s ^= model().find(k)->second;
            tira::keep(s);
        },
        [] {
            Value s = 0;
            for (Key k : shuffled()) s ^= *loaded().find(k);
            tira::keep(s);
        },
        7);
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
    auto t = tira::compare(
        [] {
            std::map<Key, Value> m;
            for (Key k : shuffled()) m.insert_or_assign(k, k ^ 0x5555);
            tira::keep(m.size());
        },
        [] {
            BPlusTree tree;
            for (Key k : shuffled()) tree.insert(k, k ^ 0x5555);
            tira::keep(tree.size());
        },
        5);
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
    auto t = tira::compare(
        [&] {
            for (Key lo : lows) {
                want.clear();
                for (auto it = model().lower_bound(lo); it != model().end() && it->first <= lo + span; ++it) want.push_back(*it);
            }
            tira::keep(want.size());
        },
        [&] {
            for (Key lo : lows) {
                got.clear();
                loaded().scan(lo, lo + span, got);
            }
            tira::keep(got.size());
        },
        5);
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
    auto t = compare_after_setup([] { return model(); },
                                 [](std::map<Key, Value>& m) {
                                     for (Key k : shuffled()) m.erase(k);
                                     tira::keep(m.size());
                                 },
                                 [] { return loaded(); },
                                 [](BPlusTree& b) {
                                     for (Key k : shuffled()) b.erase(k);
                                     tira::keep(b.size());
                                 },
                                 5);
    return tira::report(task, t, 2);
}

// 4096 nodes of 64 random sorted keys (2 MB) and one million searches in them.
struct Nodes {
    std::vector<Key> keys;
    std::vector<std::pair<std::uint32_t, Key>> queries;
};
const Nodes& nodes() {
    static const Nodes n = [] {
        Nodes s;
        std::mt19937_64 rng(29);
        s.keys.resize(4096 * 64);
        for (std::size_t i = 0; i < 4096; ++i) {
            for (std::size_t j = 0; j < 64; ++j) s.keys[i * 64 + j] = rng();
            std::sort(s.keys.begin() + static_cast<std::ptrdiff_t>(i * 64), s.keys.begin() + static_cast<std::ptrdiff_t>(i * 64 + 64));
        }
        for (int q = 0; q < 1'000'000; ++q) s.queries.emplace_back(static_cast<std::uint32_t>(rng() % 4096), rng());
        return s;
    }();
    return n;
}

auto node_searches(NodeSearch f) {
    return [f] {
        std::size_t s = 0;
        for (const auto& [node, x] : nodes().queries) s += f(nodes().keys.data() + node * 64, 64, x);
        tira::keep(s);
    };
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
    auto t = tira::compare(node_searches(baseline::node_lower_bound), node_searches(node_lower_bound_avx2), 9);
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
    auto t = tira::compare(node_searches(baseline::node_lower_bound), node_searches(node_lower_bound_avx512), 9);
    const bool ok = tira::report(task, t, 2.6);
    auto v = tira::compare(node_searches(node_lower_bound_avx2), node_searches(node_lower_bound_avx512), 9);
    std::println("      compared with your AVX2 node search: {:.2f}x (no goal)", v.speedup());
    tree_with(node_lower_bound_avx512, "the AVX-512");
    return ok;
}

bool bench_bulk() {
    const std::string_view task = "task8 parallel bulk load, 16M";
    const Pairs big = random_pairs(16'000'000, 30);
    {
        const BPlusTree a = bulk_load(big), b = bulk_load_parallel(big);
        bool same = a.root == b.root && a.height == b.height && a.size() == b.size() && a.leaves.size() == b.leaves.size() &&
                    a.inners.size() == b.inners.size();
        for (std::size_t p = 0; same && p < a.leaves.size(); p += 97)
            same = a.leaves[p].count == b.leaves[p].count && a.leaves[p].next == b.leaves[p].next &&
                   std::equal(a.leaves[p].keys, a.leaves[p].keys + a.leaves[p].count, b.leaves[p].keys);
        if (!same) return wrong(task, "the tree is not the tree of bulk_load");
    }
    auto t = tira::compare([&] { tira::keep(bulk_load(big).size()); }, [&] { tira::keep(bulk_load_parallel(big).size()); }, 5);
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
