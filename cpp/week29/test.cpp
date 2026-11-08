// Tests for week 29. Run one task's tests with: ./w29_test -tc="task2*"
// The tests of tasks 1 and 3 use trees made by bulk_build (given), so they do
// not need your insert. Tasks 7 and 8 use threads: run their tests in the
// tsan preset too.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <array>
#include <map>
#include <random>
#include <set>
#include <string>
#include <vector>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w29;

namespace {

template <class Tree>
void check_valid(const Tree& t) {
    try {
        t.validate();
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

// Sets of n different keys of several shapes, in random order.
//  0: random keys
//  1: dense keys: base, base + 1, ... (long compressed paths above them)
//  2: clusters: random 16-bit cluster numbers in the top bits, small offsets below
//  3: keys that differ only in bytes 3 and 7
//  4: the bytes 0x00, 0x01, 0x7F, 0x80, 0xFE and 0xFF in every place, where
//     signed and unsigned order differ
//  5: the extreme keys 0, 1, 2^63 - 1, 2^63, 2^64 - 1 and random keys near them
std::vector<Key> key_set(int shape, std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::set<Key> keys;
    const Key base = rng() & 0xFFFF'FF00'0000'0000ULL;
    constexpr std::array<std::uint8_t, 6> edge = {0x00, 0x01, 0x7F, 0x80, 0xFE, 0xFF};
    if (shape == 5)
        for (Key k : {Key{0}, Key{1}, (Key{1} << 63) - 1, Key{1} << 63, ~Key{0}})
            if (keys.size() < n) keys.insert(k);
    for (std::size_t tries = 0; keys.size() < n && tries < 100 * n + 1000; ++tries) {
        Key k = 0;
        switch (shape) {
            case 0: k = rng(); break;
            case 1: k = base + keys.size(); break;
            case 2: k = (rng() % 64) << 48 | rng() % 4096; break;
            case 3: k = 0x1122'3300'5566'7700ULL | (rng() % 256) << 32 | rng() % 256; break;
            case 4:
                for (unsigned i = 0; i < key_bytes; ++i) k = k << 8 | edge[rng() % edge.size()];
                break;
            default: {
                const Key r = rng() % 100'000;
                const Key near[] = {r, (Key{1} << 63) - r, (Key{1} << 63) + r, ~Key{0} - r};
                k = near[rng() % 4];
            }
        }
        keys.insert(k);
    }
    std::vector<Key> v(keys.begin(), keys.end());
    std::ranges::shuffle(v, rng);
    return v;
}

std::vector<Item> items_of(const std::vector<Key>& keys, std::uint64_t salt = 0) {
    std::vector<Item> items;
    for (Key k : keys) items.push_back({k, k * 31 + 7 + salt});
    return items;
}

const std::vector<std::size_t> sizes = {1, 2, 3, 4, 5, 16, 17, 48, 49, 256, 257, 1000, 20000};

std::string name(int shape, std::size_t n) { return "key shape " + std::to_string(shape) + ", " + std::to_string(n) + " keys"; }

// Keys that are not in the set but close to its keys: neighbours, and keys
// with one byte changed (they leave the tree inside a compressed path or at a
// node).
std::vector<Key> probes(const std::vector<Key>& keys, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Key> p;
    for (std::size_t i = 0; i < keys.size() && i < 3000; ++i) {
        const Key k = keys[i];
        p.insert(p.end(), {k, k + 1, k - 1, rng()});
        const unsigned byte = static_cast<unsigned>(rng() % key_bytes);
        p.push_back(k ^ (Key{1 + rng() % 255} << (56 - 8 * byte)));
    }
    return p;
}

template <class Search>
Art<Search> inserted(const std::vector<Item>& items, std::string& error) {
    Art<Search> t;
    for (std::size_t i = 0; i < items.size() && error.empty(); ++i) {
        if (!t.insert(items[i].key, items[i].value)) error = "insert of a new key " + std::to_string(items[i].key) + " returned false";
        if (error.empty() && t.size() != i + 1) error = "size() is wrong after an insert";
        if (error.empty() && (i < 300 || i % 5000 == 0)) {
            try {
                t.validate();
            } catch (const std::exception& e) {
                error = "after inserting " + std::to_string(i + 1) + " keys: " + e.what();
            }
        }
    }
    return t;
}

template <class Search>
void check_find(const std::vector<Key>& keys) {
    const auto items = items_of(keys);
    const auto t = bulk_build<Search>(sorted(items));
    const std::set<Key> in(keys.begin(), keys.end());
    std::string error;
    for (const Item& x : items)
        if (error.empty() && t.find(x.key) != x.value) error = "the key " + std::to_string(x.key) + " was not found or had a wrong value";
    for (Key k : probes(keys, keys.size()))
        if (error.empty() && t.find(k).has_value() != in.contains(k)) error = "find(" + std::to_string(k) + ") is wrong";
    if (!error.empty()) FAIL(error);
}

template <class Search>
void check_insert(const std::vector<Key>& keys) {
    const auto items = items_of(keys);
    std::string error;
    const Art<Search> t = inserted<Search>(items, error);
    if (!error.empty()) FAIL(error);
    check_valid(t);
    const auto want = bulk_build<ScalarSearch>(sorted(items));
    CHECK_MESSAGE(shape(t.root) == shape(want.root), "the tree is not the tree of bulk_build of the same keys");
}

template <class Search>
void check_scan(const std::vector<Key>& keys, std::uint64_t seed) {
    const auto items = items_of(keys);
    const auto t = bulk_build<Search>(sorted(items));
    std::map<Key, Value> model;
    for (const Item& x : items) model[x.key] = x.value;
    std::mt19937_64 rng(seed);
    std::vector<std::pair<Key, Key>> ranges = {{0, ~Key{0}}, {5, 4}, {~Key{0}, ~Key{0}}, {0, 0}};
    for (int i = 0; i < (keys.size() >= 1000 ? 40 : 200); ++i) {
        const Key a = keys[rng() % keys.size()], b = keys[rng() % keys.size()];
        const Key small = rng() % 1000;
        ranges.insert(ranges.end(), {{std::min(a, b), std::max(a, b)}, {a, a}, {a + 1, a + small}, {a - small, a}, {rng(), rng()}, {a > b ? b : a, a > b ? a : b}});
        const unsigned byte = static_cast<unsigned>(rng() % key_bytes);
        const Key low = a & prefix_mask(byte), high = a | ~prefix_mask(byte);  // all keys with the first bytes of a
        ranges.insert(ranges.end(), {{low, high}, {low - 1, high + 1}, {high, high + 1}});
    }
    std::string error;
    for (auto [lo, hi] : ranges) {
        std::vector<Item> got, want;
        t.scan(lo, hi, got);
        if (lo <= hi)
            for (auto it = model.lower_bound(lo); it != model.end() && it->first <= hi; ++it) want.push_back({it->first, it->second});
        if (got != want) {
            error = "scan(" + std::to_string(lo) + ", " + std::to_string(hi) + ") gave " + std::to_string(got.size()) + " pairs, " +
                    std::to_string(want.size()) + " are right (or their order or values are wrong)";
            break;
        }
    }
    if (!error.empty()) FAIL(error);
}

// Node16s with count 0 ... 16, the special bytes of shape 4, and other bytes
// after count that the search must ignore.
std::vector<Node16> test_nodes(std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Node16> nodes;
    for (int t = 0; t < 3000; ++t) {
        Node16 m{};
        m.kind = Kind::node16;
        m.count = static_cast<std::uint16_t>(t % 17);
        std::set<std::uint8_t> bytes;
        constexpr std::array<std::uint8_t, 8> special = {0, 1, 0x7F, 0x80, 0x81, 0xFE, 0xFF, 0x40};
        while (bytes.size() < m.count) bytes.insert(t % 3 == 0 && rng() % 2 ? special[rng() % 8] : static_cast<std::uint8_t>(rng()));
        std::copy(bytes.begin(), bytes.end(), m.keys);
        for (unsigned i = m.count; i < 16; ++i) m.keys[i] = static_cast<std::uint8_t>(t % 2 ? rng() : 0xFF);
        nodes.push_back(m);
    }
    return nodes;
}

}  // namespace

TEST_CASE("task1 find in trees made by bulk_build") {
    SUBCASE("an empty tree and a tree of one key") {
        Art<ScalarSearch> empty;
        CHECK_FALSE(empty.find(0).has_value());
        CHECK_FALSE(empty.find(42).has_value());
        const std::vector<Item> one = {{42, 7}};
        const auto t = bulk_build<ScalarSearch>(one);
        CHECK(t.find(42) == Value{7});
        CHECK_FALSE(t.find(43).has_value());
        CHECK_FALSE(t.find(42 | Key{1} << 60).has_value());
    }
    for (int s = 0; s < 6; ++s)
        for (std::size_t n : sizes) {
            const auto keys = key_set(s, n, 100 * s + n);
            if (keys.size() < n && n > 64) continue;
            CAPTURE(name(s, keys.size()));
            check_find<ScalarSearch>(keys);
        }
}

TEST_CASE("task2 insert") {
    SUBCASE("simple cases") {
        Art<ScalarSearch> t;
        CHECK(t.insert(5, 50));
        REQUIRE(t.root != nullptr);
        CHECK(t.root->kind == Kind::leaf);
        CHECK_FALSE(t.insert(5, 51));
        CHECK(t.size() == 1);
        CHECK(static_cast<const Leaf*>(t.root)->value == 51);
        CHECK(t.insert(6, 60));  // differ in byte 7: a Node4 at depth 7
        REQUIRE(t.root->kind == Kind::node4);
        CHECK(static_cast<const Inner*>(t.root)->depth == 7);
        CHECK(t.insert(Key{1} << 40, 70));  // leaves the path at byte 2: a new Node4 above
        REQUIRE(t.root->kind == Kind::node4);
        CHECK(static_cast<const Inner*>(t.root)->depth == 2);
        check_valid(t);
    }
    SUBCASE("a node grows from Node4 to Node256") {
        Art<ScalarSearch> t;
        std::vector<unsigned> bytes(256);
        for (unsigned b = 0; b < 256; ++b) bytes[b] = b;
        std::mt19937_64 rng(3);
        std::ranges::shuffle(bytes, rng);
        for (std::size_t i = 0; i < 256; ++i) {
            t.insert(Key{bytes[i]} << 56 | 12345, i);
            REQUIRE(t.root != nullptr);
            if (i == 0) continue;
            const std::size_t c = i + 1;
            const Kind want = c <= 4 ? Kind::node4 : c <= 16 ? Kind::node16 : c <= 48 ? Kind::node48 : Kind::node256;
            REQUIRE_MESSAGE(t.root->kind == want, "the root has the wrong kind after " << c << " children");
        }
        check_valid(t);
    }
    for (int s = 0; s < 6; ++s)
        for (std::size_t n : sizes) {
            const auto keys = key_set(s, n, 200 * s + n);
            if (keys.size() < n && n > 64) continue;
            CAPTURE(name(s, keys.size()));
            check_insert<ScalarSearch>(keys);
        }
    SUBCASE("increasing and decreasing keys") {
        auto keys = key_set(2, 20000, 9);
        std::ranges::sort(keys);
        check_insert<ScalarSearch>(keys);
        std::ranges::reverse(keys);
        check_insert<ScalarSearch>(keys);
    }
    SUBCASE("replacing values") {
        const auto keys = key_set(0, 5000, 10);
        auto items = items_of(keys);
        std::string error;
        Art<ScalarSearch> t = inserted<ScalarSearch>(items, error);
        if (!error.empty()) FAIL(error);
        for (Item& x : items) {
            x.value += 1000;
            if (t.insert(x.key, x.value)) error = "insert of a key that is there returned true";
        }
        if (!error.empty()) FAIL(error);
        CHECK(t.size() == keys.size());
        CHECK(shape(t.root) == shape(bulk_build<ScalarSearch>(sorted(items)).root));
    }
}

TEST_CASE("task3 scan in trees made by bulk_build") {
    SUBCASE("an empty tree") {
        Art<ScalarSearch> t;
        std::vector<Item> out;
        t.scan(0, ~Key{0}, out);
        CHECK(out.empty());
    }
    for (int s = 0; s < 6; ++s)
        for (std::size_t n : sizes) {
            const auto keys = key_set(s, n, 300 * s + n);
            if (keys.size() < n && n > 64) continue;
            CAPTURE(name(s, keys.size()));
            check_scan<ScalarSearch>(keys, s + n);
        }
    SUBCASE("appends to out") {
        const auto items = items_of(key_set(0, 100, 4));
        const auto t = bulk_build<ScalarSearch>(sorted(items));
        std::vector<Item> out = {{1, 2}};
        t.scan(0, ~Key{0}, out);
        CHECK(out.size() == 101);
        CHECK(out[0] == Item{1, 2});
    }
}

TEST_CASE("task4 find16 with SSE2") {
    SUBCASE("the same answers as ScalarSearch::find16") {
        bool same = true;
        for (const Node16& m : test_nodes(4))
            for (unsigned b = 0; b < 256 && same; ++b) {
                same = find16_sse(m, static_cast<std::uint8_t>(b)) == ScalarSearch::find16(m, static_cast<std::uint8_t>(b));
                if (!same) FAIL("find16_sse is wrong for byte " << b << " in a node with " << m.count << " keys");
            }
        CHECK(same);
    }
    SUBCASE("find in a tree with SimdSearch") {
        for (int s : {0, 2, 4})
            for (std::size_t n : {1000, 20000}) {
                CAPTURE(name(s, n));
                check_find<SimdSearch>(key_set(s, n, 400 * s + n));
            }
    }
}

TEST_CASE("task5 lower16 with SSE2") {
    SUBCASE("the same answers as ScalarSearch::lower16") {
        bool same = true;
        for (const Node16& m : test_nodes(5))
            for (unsigned b = 0; b < 256 && same; ++b) {
                same = lower16_sse(m, static_cast<std::uint8_t>(b)) == ScalarSearch::lower16(m, static_cast<std::uint8_t>(b));
                if (!same) FAIL("lower16_sse is wrong for byte " << b << " in a node with " << m.count << " keys");
            }
        CHECK(same);
    }
    SUBCASE("insert and scan in a tree with SimdSearch") {
        for (int s : {0, 2, 4})
            for (std::size_t n : {1000, 20000}) {
                CAPTURE(name(s, n));
                const auto keys = key_set(s, n, 500 * s + n);
                check_insert<SimdSearch>(keys);
                check_scan<SimdSearch>(keys, s + n);
            }
    }
}

TEST_CASE("task6 longest-prefix match") {
    auto check = [](const std::vector<Route>& routes, std::uint64_t seed) {
        const BinaryTrie want(routes);
        const Lpm got(routes);
        std::vector<std::uint32_t> addresses = lookup_addresses(routes, 20000, seed);
        for (const Route& r : routes) {
            const std::uint32_t host = r.length == 0 ? ~std::uint32_t{0} : r.length == 32 ? 0 : ~std::uint32_t{0} >> r.length;
            addresses.insert(addresses.end(), {r.prefix, r.prefix | host, r.prefix - 1, (r.prefix | host) + 1});
        }
        addresses.insert(addresses.end(), {0, 1, 0xFFFF'FFFF, 0x7FFF'FFFF, 0x8000'0000});
        for (std::uint32_t a : addresses)
            if (got.lookup(a) != want.lookup(a)) {
                FAIL("lookup(" << (a >> 24) << "." << (a >> 16 & 255) << "." << (a >> 8 & 255) << "." << (a & 255) << ") is " << got.lookup(a)
                               << ", but the longest matching prefix has the hop " << want.lookup(a));
                return;
            }
    };
    SUBCASE("an empty table") {
        const Lpm t(std::vector<Route>{});
        CHECK(t.lookup(0x0A00'0001) == no_route);
    }
    SUBCASE("nested prefixes") {
        // 0.0.0.0/0, 10.0.0.0/8, 10.1.0.0/16, 10.1.2.0/24, 10.1.2.128/25, 10.1.2.200/30, 10.1.2.203/32
        const std::vector<Route> routes = {{0, 0, 1},           {0x0A00'0000, 8, 2},   {0x0A01'0000, 16, 3},  {0x0A01'0200, 24, 4},
                                           {0x0A01'0280, 25, 5}, {0x0A01'02C8, 30, 6}, {0x0A01'02CB, 32, 7}};
        const Lpm t(routes);
        CHECK(t.lookup(0x0B00'0000) == 1);
        CHECK(t.lookup(0x0A02'0000) == 2);
        CHECK(t.lookup(0x0A01'0300) == 3);
        CHECK(t.lookup(0x0A01'0201) == 4);
        CHECK(t.lookup(0x0A01'0281) == 5);
        CHECK(t.lookup(0x0A01'02C9) == 6);
        CHECK(t.lookup(0x0A01'02CB) == 7);
        check(routes, 1);
    }
    SUBCASE("every length at one address") {
        std::vector<Route> routes;
        for (unsigned len = 0; len <= 32; len += 1) {
            const std::uint32_t a = 0xC0A8'0137;  // 192.168.1.55
            routes.push_back({len == 0 ? 0 : a & ~std::uint32_t{0} << (32 - len), static_cast<std::uint8_t>(len), 100 + len});
        }
        std::mt19937_64 rng(2);
        std::ranges::shuffle(routes, rng);  // the order of the routes must not matter
        check(routes, 2);
    }
    SUBCASE("many long prefixes in a few /24") {
        std::vector<Route> routes = {{0x0A00'0000, 8, 9}};
        std::mt19937_64 rng(3);
        std::set<std::pair<std::uint32_t, unsigned>> seen;
        while (routes.size() < 3000) {
            const unsigned len = 24 + static_cast<unsigned>(rng() % 9);
            const std::uint32_t a = 0x0A00'0000 | static_cast<std::uint32_t>(rng() % 8) << 8 | static_cast<std::uint32_t>(rng() & 255);
            const std::uint32_t p = a & ~std::uint32_t{0} << (32 - len);
            if (seen.insert({p, len}).second) routes.push_back({p, static_cast<std::uint8_t>(len), static_cast<Hop>(rng() % 1000)});
        }
        check(routes, 3);
    }
    SUBCASE("tables like the BGP table") {
        for (std::uint64_t seed = 1; seed <= 3; ++seed) check(bgp_like_table(seed == 1 ? 200'000 : 20'000, seed), seed);
    }
}

TEST_CASE("task7 parallel build") {
    for (int threads : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(threads);
        CAPTURE(threads);
        for (std::size_t n : {0, 1, 2, 1000, 100'000, 250'000}) {
            CAPTURE(n);
            const auto items = random_items(n, n + threads);
            const auto got = build_parallel<ScalarSearch>(items);
            const auto want = baseline::build<ScalarSearch>(items);
            REQUIRE(got.size() == n);
            check_valid(got);
            CHECK_MESSAGE(shape(got.root) == shape(want.root), "the tree is not the tree of baseline::build");
        }
    }
    omp_set_num_threads(static_cast<int>(tira::threads()));
}

TEST_CASE("task8 parallel build of skewed keys") {
    for (int threads : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(threads);
        CAPTURE(threads);
        for (int kind = 0; kind < 3; ++kind) {
            CAPTURE(kind);
            const std::size_t n = 200'000;
            const auto items = kind == 0 ? skewed_items(n, threads) : kind == 1 ? dense_items(n, 0, threads) : dense_items(n, Key{0xABCD} << 40, threads);
            const auto got = build_parallel<ScalarSearch>(items);
            const auto want = baseline::build<ScalarSearch>(items);
            REQUIRE(got.size() == n);
            check_valid(got);
            CHECK_MESSAGE(shape(got.root) == shape(want.root), "the tree is not the tree of baseline::build");
        }
    }
    omp_set_num_threads(static_cast<int>(tira::threads()));
}
