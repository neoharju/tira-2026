// Speed goals for week 29 (task 3 has none: its tests are the goal, and it
// prints the speed against std::map). Run in the release build:
// ./w29_bench [task]. Every benchmark first checks your result: a wrong
// result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <filesystem>
#include <map>
#include <optional>
#include <random>
#include <unordered_map>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w29;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<34} WRONG: {} (run the tests)", task, what);
    return false;
}

// One million random keys, and two million lookups: half of them for keys in
// the tree, in random order, and half for random keys.
const std::vector<Item>& million() {
    static const auto items = random_items(1'000'000, 291);
    return items;
}
std::vector<Key> make_lookups(std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Key> k;
    for (std::size_t i = 0; i < 2'000'000; ++i) k.push_back(i % 2 ? rng() : million()[rng() % million().size()].key);
    return k;
}
const std::vector<Key>& lookups() {
    static const auto keys = make_lookups(292);
    return keys;
}

std::map<Key, Value> to_map(const std::vector<Item>& items) {
    std::map<Key, Value> m;
    for (const Item& x : items) m.emplace(x.key, x.value);
    return m;
}

template <class Map>
std::uint64_t find_all(const Map& m, const std::vector<Key>& keys = lookups()) {
    std::uint64_t s = 0;
    for (Key k : keys) {
        if constexpr (requires { m.find(k)->second; }) {  // std::map, std::unordered_map
            const auto it = m.find(k);
            s = s * 31 + (it != m.end() ? it->second : 1);
        } else {
            const auto v = m.find(k);
            s = s * 31 + (v ? *v : 1);
        }
    }
    return s;
}

bool bench1() {
    const std::string_view task = "task1 find, 1M random keys";
    const auto t = bulk_build<ScalarSearch>(sorted(million()));
    const std::map<Key, Value> m = to_map(million());
    if (find_all(t) != find_all(m)) return wrong(task, "find gives other results than std::map");
    std::vector<Key> keys;  // Each round has new lookups.
    std::uint64_t want = 0, got = 0;
    const auto r = tira::compare_fresh([&](std::uint64_t seed) { keys = make_lookups(seed); }, [&] { want = find_all(m, keys); },
                                       [&] { got = find_all(t, keys); }, [&] { return got == want; }, 5, 291);
    const bool ok = tira::report(task, r, 4.0);
    std::unordered_map<Key, Value> h;
    for (const Item& x : million()) h.emplace(x.key, x.value);
    const auto u = tira::compare([&] { tira::keep(find_all(h)); }, [&] { tira::keep(find_all(t)); }, 3);
    std::println("      against std::unordered_map: {:.2f}x (no goal)", u.speedup());
    return ok;
}

bool bench2() {
    const std::string_view task = "task2 insert, 1M random keys";
    auto art_insert = [](const std::vector<Item>& items) {
        Art<ScalarSearch> t;
        for (const Item& x : items) t.insert(x.key, x.value);
        return t;
    };
    {
        const auto t = art_insert(million());
        if (t.size() != million().size() || shape(t.root) != shape(bulk_build<ScalarSearch>(sorted(million())).root))
            return wrong(task, "the tree is not the tree of bulk_build");
    }
    // Each round has new keys. The trees are released before the next round, without a time measurement.
    std::vector<Item> items;
    std::map<Key, Value> m;
    Art<ScalarSearch> got;
    const auto r = tira::compare_fresh(
        [&](std::uint64_t seed) {
            m = {}, got = {};
            items = random_items(1'000'000, seed);
        },
        [&] {
            for (const Item& x : items) m.insert_or_assign(x.key, x.value);
        },
        [&] { got = art_insert(items); },
        [&] {
            if (got.size() != m.size()) return false;
            for (std::size_t i = 0; i < items.size(); i += 101)
                if (got.find(items[i].key) != m.at(items[i].key)) return false;
            return true;
        },
        3, 292);
    return tira::report(task, r, 1.8);
}

bool bench3() {
    const std::string_view task = "task3 scans of about 100 keys";
    const auto items = sorted(million());
    const auto t = bulk_build<ScalarSearch>(items);
    const std::map<Key, Value> m = to_map(items);
    // 100,000 ranges from a random key of the tree, as wide as 100 keys on average.
    const Key width = 100 * (~Key{0} / items.size());
    std::mt19937_64 rng(293);
    std::vector<std::pair<Key, Key>> ranges;
    for (int i = 0; i < 100'000; ++i) {
        const Key lo = items[rng() % items.size()].key;
        ranges.push_back({lo, lo > ~Key{0} - width ? ~Key{0} : lo + width});
    }
    auto art_scans = [&] {
        std::vector<Item> out;
        std::uint64_t s = 0;
        for (auto [lo, hi] : ranges) {
            out.clear();
            t.scan(lo, hi, out);
            for (const Item& x : out) s += x.value;
        }
        return s;
    };
    auto map_scans = [&] {
        std::vector<Item> out;
        std::uint64_t s = 0;
        for (auto [lo, hi] : ranges) {
            out.clear();
            for (auto it = m.lower_bound(lo); it != m.end() && it->first <= hi; ++it) out.push_back({it->first, it->second});
            for (const Item& x : out) s += x.value;
        }
        return s;
    };
    if (art_scans() != map_scans()) return wrong(task, "scan gives other results than std::map");
    const auto r = tira::compare([&] { tira::keep(map_scans()); }, [&] { tira::keep(art_scans()); }, 5);
    std::println("{:<34} std::map {:8.2f} ms  yours {:8.2f} ms  {:.2f}x (no goal: the tests are the goal)", task, r.baseline * 1e3, r.yours * 1e3, r.speedup());
    return true;
}

// Searches in 4096 Node16s (640 KB, in the L2 cache), 4 million of them.
struct Node16Data {
    std::vector<Node16> nodes;
    std::vector<Query16> queries;
};
Node16Data make_node16_data(std::uint64_t seed) {
    Node16Data d;
    d.nodes = random_node16s(4096, seed);
    d.queries = random_queries16(d.nodes, 4'000'000, seed + 1);
    return d;
}
const Node16Data& node16_data() {
    static const Node16Data d = make_node16_data(294);
    return d;
}

bool bench4() {
    const std::string_view task = "task4 find16, 4 million searches";
    const auto& d = node16_data();
    if (sum_find16<SimdSearch>(d.nodes, d.queries) != sum_find16<ScalarSearch>(d.nodes, d.queries)) return wrong(task, "find16_sse gives other results");
    Node16Data n;  // Each round has new nodes and searches.
    std::uint64_t want = 0, got = 0;
    const auto r = tira::compare_fresh([&](std::uint64_t seed) { n = make_node16_data(seed); },
                                       [&] { want = sum_find16<ScalarSearch>(n.nodes, n.queries); },
                                       [&] { got = sum_find16<SimdSearch>(n.nodes, n.queries); }, [&] { return got == want; }, 7, 294);
    const bool ok = tira::report(task, r, 4.0);
    const auto scalar = bulk_build<ScalarSearch>(sorted(million()));
    const auto simd = bulk_build<SimdSearch>(sorted(million()));
    if (scalar.find(million()[0].key) == million()[0].value && find_all(simd) == find_all(scalar)) {  // when your find works
        const auto w = tira::compare([&] { tira::keep(find_all(scalar)); }, [&] { tira::keep(find_all(simd)); }, 5);
        std::println("      find in the tree of 1M keys, SimdSearch against ScalarSearch: {:.2f}x (no goal)", w.speedup());
    }
    return ok;
}

bool bench5() {
    const std::string_view task = "task5 lower16, 4 million searches";
    const auto& d = node16_data();
    if (sum_lower16<SimdSearch>(d.nodes, d.queries) != sum_lower16<ScalarSearch>(d.nodes, d.queries)) return wrong(task, "lower16_sse gives other results");
    Node16Data n;  // Each round has new nodes and searches.
    std::uint64_t want = 0, got = 0;
    const auto r = tira::compare_fresh([&](std::uint64_t seed) { n = make_node16_data(seed); },
                                       [&] { want = sum_lower16<ScalarSearch>(n.nodes, n.queries); },
                                       [&] { got = sum_lower16<SimdSearch>(n.nodes, n.queries); }, [&] { return got == want; }, 7, 295);
    const bool ok = tira::report(task, r, 4.0);
    auto build = [](auto search) {
        Art<decltype(search)> t;
        for (const Item& x : million()) t.insert(x.key, x.value);
        return t;
    };
    if (build(ScalarSearch{}).size() == million().size() && shape(build(SimdSearch{}).root) == shape(build(ScalarSearch{}).root)) {  // when your insert works
        const auto w = tira::compare([&] { tira::keep(build(ScalarSearch{}).size()); }, [&] { tira::keep(build(SimdSearch{}).size()); }, 3);
        std::println("      insert of 1M keys, SimdSearch against ScalarSearch: {:.2f}x (no goal)", w.speedup());
    }
    return ok;
}

bool bench6() {
    const std::string_view task = "task6 longest-prefix match";
    const std::string path = "data/bgp-table.txt";
    std::vector<Route> routes;
    if (std::filesystem::exists(path)) {
        routes = read_table(path);
        std::println("table: {} routes from {}", routes.size(), path);
    } else {
        routes = bgp_like_table(1'000'000, 296);
        std::println("table: bgp_like_table(1000000, 296) (download a real table with tools/download_bgp.sh)");
    }
    auto addresses = lookup_addresses(routes, 4'000'000, 297);
    const BinaryTrie trie(routes);
    const Lpm lpm(routes);
    for (std::size_t i = 0; i < addresses.size(); i += 7)
        if (lpm.lookup(addresses[i]) != trie.lookup(addresses[i])) return wrong(task, "a lookup gives another hop than the binary trie");
    auto all = [&](const auto& t) {
        std::uint64_t s = 0;
        for (std::uint32_t a : addresses) s = s * 31 + t.lookup(a);  // The sum depends on each hop.
        return s;
    };
    std::uint64_t want = 0, got = 0;  // Each round has new addresses.
    const auto r = tira::compare_fresh([&](std::uint64_t seed) { addresses = lookup_addresses(routes, 4'000'000, seed); },
                                       [&] { want = all(trie); }, [&] { got = all(lpm); }, [&] { return got == want; }, 5, 296);
    const bool ok = tira::report(task, r, 12.0);
    std::println("      memory: binary trie {:.1f} MB, yours {:.1f} MB", static_cast<double>(trie.bytes()) / 1e6, static_cast<double>(lpm.bytes()) / 1e6);
    return ok;
}

// Measures builds with new keys in each round. `make` makes the keys. The
// measurement does not include the time to make the keys or to release the
// trees.
template <class M>
bool bench_build(std::string_view task, M make, double goal, std::uint64_t salt) {
    std::vector<Item> items = make(4'000'000, salt);
    {
        const std::vector<Item> part(items.begin(), items.begin() + static_cast<std::ptrdiff_t>(items.size() / 10));
        if (shape(build_parallel<SimdSearch>(part).root) != shape(baseline::build<SimdSearch>(part).root)) return wrong(task, "the tree is not the tree of baseline::build");
    }
    Art<SimdSearch> want, got;
    const auto r = tira::compare_fresh(
        [&](std::uint64_t seed) {
            want = {}, got = {};
            items = make(4'000'000, seed);
        },
        [&] { want = baseline::build<SimdSearch>(items); }, [&] { got = build_parallel<SimdSearch>(items); },
        [&] { return shape(got.root) == shape(want.root); }, 5, salt);
    return tira::report(task, r, goal);
}

bool bench7() { return bench_build("task7 parallel build, random keys", random_items, 2.0, 298); }
bool bench8() { return bench_build("task8 parallel build, skewed keys", skewed_items, 2.0, 299); }

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1}, {"task2", bench2}, {"task3", bench3}, {"task4", bench4}, {"task5", bench5}, {"task6", bench6}, {"task7", bench7}, {"task8", bench8}}};
    return b.run(argc, argv);
}
