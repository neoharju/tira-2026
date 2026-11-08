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
const std::vector<Key>& lookups() {
    static const auto keys = [] {
        std::mt19937_64 rng(292);
        std::vector<Key> k;
        for (std::size_t i = 0; i < 2'000'000; ++i) k.push_back(i % 2 ? rng() : million()[rng() % million().size()].key);
        return k;
    }();
    return keys;
}

std::map<Key, Value> to_map(const std::vector<Item>& items) {
    std::map<Key, Value> m;
    for (const Item& x : items) m.emplace(x.key, x.value);
    return m;
}

template <class Map>
std::uint64_t find_all(const Map& m) {
    std::uint64_t s = 0;
    for (Key k : lookups()) {
        if constexpr (requires { m.find(k)->second; }) {  // std::map, std::unordered_map
            const auto it = m.find(k);
            if (it != m.end()) s += it->second;
        } else if (const auto v = m.find(k)) {
            s += *v;
        }
    }
    return s;
}

bool bench1() {
    const std::string_view task = "task1 find, 1M random keys";
    const auto t = bulk_build<ScalarSearch>(sorted(million()));
    const std::map<Key, Value> m = to_map(million());
    if (find_all(t) != find_all(m)) return wrong(task, "find gives other results than std::map");
    const auto r = tira::compare([&] { tira::keep(find_all(m)); }, [&] { tira::keep(find_all(t)); }, 5);
    const bool ok = tira::report(task, r, 4.0);
    std::unordered_map<Key, Value> h;
    for (const Item& x : million()) h.emplace(x.key, x.value);
    const auto u = tira::compare([&] { tira::keep(find_all(h)); }, [&] { tira::keep(find_all(t)); }, 3);
    std::println("      against std::unordered_map: {:.2f}x (no goal)", u.speedup());
    return ok;
}

bool bench2() {
    const std::string_view task = "task2 insert, 1M random keys";
    auto art_insert = [] {
        Art<ScalarSearch> t;
        for (const Item& x : million()) t.insert(x.key, x.value);
        return t;
    };
    {
        const auto t = art_insert();
        if (t.size() != million().size() || shape(t.root) != shape(bulk_build<ScalarSearch>(sorted(million())).root))
            return wrong(task, "the tree is not the tree of bulk_build");
    }
    const auto r = tira::compare(
        [] {
            std::map<Key, Value> m;
            for (const Item& x : million()) m.insert_or_assign(x.key, x.value);
            tira::keep(m.size());
        },
        [&] { tira::keep(art_insert().size()); }, 3);
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
    std::vector<Node16> nodes = random_node16s(4096, 294);
    std::vector<Query16> queries = random_queries16(nodes, 4'000'000, 295);
};
const Node16Data& node16_data() {
    static const Node16Data d;
    return d;
}

bool bench4() {
    const std::string_view task = "task4 find16, 4 million searches";
    const auto& d = node16_data();
    if (sum_find16<SimdSearch>(d.nodes, d.queries) != sum_find16<ScalarSearch>(d.nodes, d.queries)) return wrong(task, "find16_sse gives other results");
    const auto r = tira::compare([&] { tira::keep(sum_find16<ScalarSearch>(d.nodes, d.queries)); }, [&] { tira::keep(sum_find16<SimdSearch>(d.nodes, d.queries)); }, 7);
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
    const auto r = tira::compare([&] { tira::keep(sum_lower16<ScalarSearch>(d.nodes, d.queries)); }, [&] { tira::keep(sum_lower16<SimdSearch>(d.nodes, d.queries)); }, 7);
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
    const auto addresses = lookup_addresses(routes, 4'000'000, 297);
    const BinaryTrie trie(routes);
    const Lpm lpm(routes);
    for (std::size_t i = 0; i < addresses.size(); i += 7)
        if (lpm.lookup(addresses[i]) != trie.lookup(addresses[i])) return wrong(task, "a lookup gives another hop than the binary trie");
    auto all = [&](const auto& t) {
        std::uint64_t s = 0;
        for (std::uint32_t a : addresses) s += t.lookup(a);
        return s;
    };
    const auto r = tira::compare([&] { tira::keep(all(trie)); }, [&] { tira::keep(all(lpm)); }, 5);
    const bool ok = tira::report(task, r, 12.0);
    std::println("      memory: binary trie {:.1f} MB, yours {:.1f} MB", static_cast<double>(trie.bytes()) / 1e6, static_cast<double>(lpm.bytes()) / 1e6);
    return ok;
}

// Times builds without the time to free the trees.
template <class B, class Y>
tira::Timing compare_builds(B&& base, Y&& yours, int rounds) {
    auto once = [](auto&& build) {
        Art<SimdSearch> t;
        const double s = tira::seconds([&] { t = build(); });
        return s;  // t is freed here, after the time was taken
    };
    once(base);
    once(yours);
    std::vector<double> tb, ty;
    for (int i = 0; i < rounds; ++i) {
        tb.push_back(once(base));
        ty.push_back(once(yours));
    }
    std::ranges::sort(tb);
    std::ranges::sort(ty);
    return {tb[tb.size() / 2], ty[ty.size() / 2]};
}

bool bench_build(std::string_view task, const std::vector<Item>& items, double goal) {
    {
        const std::vector<Item> part(items.begin(), items.begin() + static_cast<std::ptrdiff_t>(items.size() / 10));
        if (shape(build_parallel<SimdSearch>(part).root) != shape(baseline::build<SimdSearch>(part).root)) return wrong(task, "the tree is not the tree of baseline::build");
    }
    const auto r = compare_builds([&] { return baseline::build<SimdSearch>(items); }, [&] { return build_parallel<SimdSearch>(items); }, 5);
    return tira::report(task, r, goal);
}

bool bench7() { return bench_build("task7 parallel build, random keys", random_items(4'000'000, 298), 2.0); }
bool bench8() { return bench_build("task8 parallel build, skewed keys", skewed_items(4'000'000, 299), 2.0); }

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1}, {"task2", bench2}, {"task3", bench3}, {"task4", bench4}, {"task5", bench5}, {"task6", bench6}, {"task7", bench7}, {"task8", bench8}}};
    return b.run(argc, argv);
}
