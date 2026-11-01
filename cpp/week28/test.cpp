// Tests for week 28. Run one task's tests with: ./w28_test -tc="task4*"
// Task 7 uses threads: run its tests in the tsan preset too.
#include <doctest/doctest.h>

#include <algorithm>
#include <atomic>
#include <random>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "tasks.hpp"

using namespace w28;

namespace {

template <class Map>
void check_valid(const Map& m) {
    try {
        m.validate();
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

// Random operations on a map and on std::unordered_map, compared after each
// operation; validate() now and then. `range` limits the keys (0: any key),
// `erases` is the share of erases in percent.
template <class Map>
void random_operations(Map& m, std::size_t ops, std::uint64_t range, unsigned erases, std::uint64_t seed) {
    std::unordered_map<Key, Value> model;
    std::mt19937_64 rng(seed);
    std::string error;
    for (std::size_t i = 0; i < ops && error.empty(); ++i) {
        const Key k = range ? rng() % range : rng();
        const auto op = rng() % 100;
        const std::string where = "operation " + std::to_string(i) + ", key " + std::to_string(k) + ": ";
        if (op < erases) {
            if constexpr (requires { m.erase(k); }) {
                if (m.erase(k) != (model.erase(k) == 1)) error = where + "erase returned a wrong result";
            }
        } else if (op < erases + 30) {
            const auto it = model.find(k);
            const auto got = m.find(k);
            if (got.has_value() != (it != model.end()) || (got && *got != it->second)) error = where + "find returned a wrong result";
        } else {
            const Value v = rng();
            if (m.insert(k, v) != model.insert_or_assign(k, v).second) error = where + "insert returned a wrong result";
        }
        if (error.empty() && m.size() != model.size()) error = where + "size() is wrong";
        if (error.empty() && (i % 1000 == 0 || i + 1 == ops)) {
            try {
                m.validate();
            } catch (const std::exception& e) {
                error = where + e.what();
            }
        }
    }
    if (!error.empty()) FAIL(error);
    bool all = true;
    for (const auto& [k, v] : model) all = all && m.find(k) == v;
    CHECK_MESSAGE(all, "a key of the map was not found, or had a wrong value");
}

}  // namespace

TEST_CASE("task1 Robin Hood find and insert") {
    SUBCASE("simple cases and growth") {
        RobinHoodMap m;
        CHECK_FALSE(m.find(1).has_value());
        CHECK(m.insert(1, 10));
        CHECK_FALSE(m.insert(1, 11));
        CHECK(m.find(1) == Value{11});
        for (Key k = 2; k <= 14; ++k) CHECK(m.insert(k, k));
        CHECK(m.capacity() == 16);  // 14 keys = 7/8 of 16
        CHECK(m.insert(15, 15));
        CHECK(m.capacity() == 32);
        check_valid(m);
    }
    SUBCASE("random keys") {
        RobinHoodMap m(16, 1);
        random_operations(m, 60000, 0, 0, 1);
    }
    SUBCASE("few keys, many replaced") {
        RobinHoodMap m(16, 2);
        random_operations(m, 30000, 500, 0, 2);
    }
    SUBCASE("keys that would collide without a good hash") {
        RobinHoodMap m(16, 3);
        bool ok = true;
        for (Key i = 0; i < 20000; ++i) ok = ok && m.insert(i << 20, i);
        for (Key i = 0; i < 20000; ++i) ok = ok && m.find(i << 20) == i && !m.find((i << 20) + 1).has_value();
        CHECK(ok);
        check_valid(m);
    }
}

TEST_CASE("task2 Robin Hood erase") {
    SUBCASE("simple cases") {
        RobinHoodMap m;
        for (Key k = 0; k < 10; ++k) m.insert(k, k);
        CHECK(m.erase(3));
        CHECK_FALSE(m.erase(3));
        CHECK_FALSE(m.find(3).has_value());
        CHECK(m.size() == 9);
        check_valid(m);
        for (Key k = 0; k < 10; ++k) m.erase(k);
        CHECK(m.size() == 0);
        CHECK(std::ranges::all_of(m.slots, [](const auto& s) { return s.dist == 0; }));
    }
    SUBCASE("random operations") {
        for (std::uint64_t seed = 1; seed <= 3; ++seed) {
            RobinHoodMap m(16, seed);
            random_operations(m, 60000, seed == 1 ? 0 : 3000, 30, seed);
        }
    }
}

TEST_CASE("task3 Swiss table find and insert") {
    SUBCASE("simple cases and growth") {
        SwissMap<ScalarGroup> m;
        CHECK(m.insert(1, 10));
        CHECK_FALSE(m.insert(1, 11));
        CHECK(m.find(1) == Value{11});
        CHECK_FALSE(m.find(2).has_value());
        for (Key k = 2; k <= 14; ++k) m.insert(k, k);
        CHECK(m.capacity() == 16);
        CHECK(m.growth_left == 0);
        CHECK(m.insert(15, 15));
        CHECK(m.capacity() == 32);
        CHECK(m.growth_left == 28 - 15);
        check_valid(m);
    }
    SUBCASE("random keys") {
        SwissMap<ScalarGroup> m(16, 1);
        random_operations(m, 60000, 0, 0, 1);
    }
    SUBCASE("few keys, many replaced") {
        SwissMap<ScalarGroup> m(16, 2);
        random_operations(m, 30000, 500, 0, 2);
    }
}

TEST_CASE("task4 Swiss table erase") {
    SUBCASE("simple cases") {
        SwissMap<ScalarGroup> m;
        for (Key k = 0; k < 10; ++k) m.insert(k, k);
        CHECK(m.erase(4));
        CHECK_FALSE(m.erase(4));
        CHECK_FALSE(m.find(4).has_value());
        CHECK(m.tombstones == 0);  // the only group has empty slots
        check_valid(m);
    }
    SUBCASE("random operations") {
        for (std::uint64_t seed = 1; seed <= 3; ++seed) {
            SwissMap<ScalarGroup> m(16, seed);
            random_operations(m, 60000, seed == 1 ? 0 : 3000, 30, seed);
        }
    }
    SUBCASE("tombstones do not make the table grow forever") {
        SwissMap<ScalarGroup> m(16, 9);
        std::mt19937_64 rng(9);
        std::vector<Key> live;
        for (int i = 0; i < 1000; ++i) live.push_back(rng()), m.insert(live.back(), 1);
        for (int i = 0; i < 200000; ++i) {  // erase one, insert another: the size stays 1000
            const std::size_t j = rng() % live.size();
            m.erase(live[j]);
            live[j] = rng();
            m.insert(live[j], 2);
        }
        CHECK(m.size() == 1000);
        CHECK(m.capacity() <= 4096);
        check_valid(m);
        bool all = true;
        for (Key k : live) all = all && m.find(k) == Value{2};
        CHECK(all);
    }
}

TEST_CASE("task5 SSE2 group probe") {
    SUBCASE("the same masks as the scalar functions") {
        std::mt19937_64 rng(5);
        alignas(16) std::int8_t ctrl[group_size];
        bool same = true;
        for (int t = 0; t < 20000 && same; ++t) {
            for (auto& c : ctrl) {
                const auto r = rng() % 10;
                c = r == 0 ? kEmpty : r == 1 ? kDeleted : static_cast<std::int8_t>(rng() % (t % 2 ? 4 : 128));
            }
            const auto h2 = static_cast<std::int8_t>(rng() % 4);
            same = SseGroup::match(ctrl, h2) == ScalarGroup::match(ctrl, h2) && SseGroup::match_empty(ctrl) == ScalarGroup::match_empty(ctrl) &&
                   SseGroup::match_empty_or_deleted(ctrl) == ScalarGroup::match_empty_or_deleted(ctrl);
        }
        CHECK(same);
    }
    SUBCASE("the Swiss table with SseGroup") {
        SwissMap<SseGroup> m(16, 5);
        random_operations(m, 60000, 4000, 25, 5);
    }
}

TEST_CASE("task6 batches of lookups") {
    for (const std::size_t n : {0, 1, 15, 16, 17, 1000, 50000}) {
        SwissMap<SseGroup> m(16, n);
        std::mt19937_64 rng(n);
        std::vector<Key> keys;
        for (std::size_t i = 0; i < n; ++i) keys.push_back(rng() % (4 * n + 1)), m.insert(keys.back(), keys.back() * 3);
        for (std::size_t i = 0; i < n / 3; ++i) m.erase(keys[i]);  // some tombstones
        for (std::size_t i = 0; i < n; ++i) keys.push_back(rng() % (4 * n + 1));  // also keys that are not there
        std::vector<std::optional<Value>> out(keys.size(), Value{12345});
        m.find_batch(keys, out);
        bool same = true;
        for (std::size_t i = 0; i < keys.size(); ++i) same = same && out[i] == m.find(keys[i]);
        INFO(n << " keys");
        CHECK_MESSAGE(same, "a result of find_batch is not the result of find");
        SwissMap<ScalarGroup> s(16, n);
        for (Key k : keys) s.insert(k, k);
        s.find_batch(keys, out);
        bool scalar = true;
        for (std::size_t i = 0; i < keys.size(); ++i) scalar = scalar && out[i] == keys[i];
        CHECK(scalar);
    }
}

TEST_CASE("task7 sharded map") {
    SUBCASE("the shards") {
        ShardedMap m(16, 7);
        REQUIRE(m.shards.size() == 16);
        for (Key k = 0; k < 1000; ++k) m.insert(k, k);
        std::size_t n = 0;
        for (const auto& sh : m.shards) {
            n += sh->map.size();
            CHECK(sh->map.size() > 20);  // the keys are spread over the shards
        }
        CHECK(n == 1000);
        bool right = true;
        for (Key k = 0; k < 1000; ++k) right = right && m.shards[m.shard_of(k)]->map.find(k) == k;
        CHECK_MESSAGE(right, "a key is not in the shard of shard_of(key)");
    }
    for (const int threads : {2, 4, 7}) {
        ShardedMap m(8, 11);
        for (Key k = 0; k < 2000; ++k) m.insert(k, 0);  // shared keys, only read
        std::atomic<int> errors{0};
        {
            std::vector<std::jthread> workers;
            for (int t = 0; t < threads; ++t)
                workers.emplace_back([&, t] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(t));
                    const Key base = (static_cast<Key>(t) + 1) << 40;  // this thread's own keys
                    for (Key i = 0; i < 4000; ++i) {
                        if (!m.insert(base + i, i)) ++errors;
                        if (m.find(rng() % 2000) != Value{0}) ++errors;
                        if (i % 3 == 0 && !m.erase(base + i / 2)) ++errors;  // keys i/2 that are multiples of... erased once each
                    }
                });
        }
        INFO(threads << " threads");
        CHECK(errors == 0);
        std::size_t want = 2000;
        bool all = true;
        for (int t = 0; t < threads; ++t) {
            const Key base = (static_cast<Key>(t) + 1) << 40;
            std::vector<bool> erased(4000, false);
            for (Key i = 0; i < 4000; i += 3) erased[i / 2] = true;
            for (Key i = 0; i < 4000; ++i) {
                want += !erased[i];
                all = all && m.find(base + i).has_value() == !erased[i];
            }
        }
        CHECK(m.size() == want);
        CHECK(all);
    }
}

TEST_CASE("task8 consistent hashing") {
    SUBCASE("the owner is the node of the first token at or after the hash") {
        HashRing r(3);
        for (std::uint32_t n = 0; n < 7; ++n) r.add_node(n * 10, 5 + n);
        REQUIRE(r.tokens.size() == 5 + 6 + 7 + 8 + 9 + 10 + 11);
        CHECK(std::ranges::is_sorted(r.tokens));
        std::mt19937_64 rng(3);
        bool right = true;
        for (int i = 0; i < 20000; ++i) {
            const Key k = rng();
            const std::uint64_t h = hash_key(k, r.seed);
            std::uint32_t want = r.tokens.front().second;
            for (const auto& [t, n] : r.tokens)
                if (t >= h) {
                    want = n;
                    break;
                }
            right = right && r.owner(k) == want;
        }
        CHECK(right);
        r.remove_node(30);
        CHECK(r.tokens.size() == 5 + 6 + 7 + 9 + 10 + 11);
        CHECK(std::ranges::none_of(r.tokens, [](const auto& t) { return t.second == 30; }));
    }
    SUBCASE("balance, and few keys move") {
        HashRing r(7);
        for (std::uint32_t n = 0; n < 20; ++n) r.add_node(n, 200);
        std::vector<Key> keys(200000);
        std::mt19937_64 rng(1);
        for (Key& k : keys) k = rng();
        std::vector<std::uint32_t> before;
        std::vector<int> load(20, 0);
        for (Key k : keys) before.push_back(r.owner(k)), ++load[before.back()];
        CHECK(*std::ranges::max_element(load) <= 13000);  // the mean is 10,000
        r.add_node(20, 200);
        std::size_t moved = 0, elsewhere = 0;
        for (std::size_t i = 0; i < keys.size(); ++i) {
            const std::uint32_t now = r.owner(keys[i]);
            moved += now != before[i];
            elsewhere += now != before[i] && now != 20;
        }
        CHECK(elsewhere == 0);  // keys move only to the new node
        CHECK(moved < keys.size() * 3 / 2 / 21);
        r.remove_node(20);
        bool back = true;
        for (std::size_t i = 0; i < keys.size(); ++i) back = back && r.owner(keys[i]) == before[i];
        CHECK(back);
    }
    SUBCASE("jump consistent hash") {
        std::uint64_t sum = 0;
        for (const std::uint64_t k : {0ULL, 1ULL, 2ULL, 0xDEADBEEFULL, 1ULL << 63, ~0ULL, 123456789ULL})
            for (const std::int32_t b : {1, 2, 3, 10, 1000, 65536, 2147483647}) sum = sum * 1000003 + static_cast<std::uint64_t>(jump_hash(k, b));
        CHECK_MESSAGE(sum == 17797010517349531419ULL, "jump_hash differs from the algorithm of Lamping and Veach");
        std::mt19937_64 rng(8);
        bool monotone = true;
        std::vector<int> load(20, 0);
        for (int i = 0; i < 100000; ++i) {
            const std::uint64_t k = rng();
            const std::int32_t a = jump_hash(k, 19), b = jump_hash(k, 20);
            monotone = monotone && (a == b || b == 19);
            ++load[b];
        }
        CHECK(monotone);
        CHECK(*std::ranges::max_element(load) <= 5500);  // the mean is 5,000
    }
}
