// Speed goals for week 28 (tasks 2, 3 and 8 have none: their tests are the
// goal; tasks 2 and 3 print the speed against std::unordered_map). Run in
// the release build: ./w28_bench [task]. Every benchmark first checks your
// result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <memory>
#include <random>
#include <unordered_map>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w28;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

// Tasks 4, 5 and 7 measure your Swiss table of tasks 2 and 3: check that it works.
bool swiss_works(std::string_view task) {
    SwissMap<SseGroup> m(16, 1);
    bool ok = true;
    for (Key k = 0; k < 1000; ++k) ok = ok && m.insert(k * 7919, k);
    for (Key k = 0; k < 1000; ++k) ok = ok && m.find(k * 7919) == k && !m.find(k * 7919 + 1).has_value();
    for (Key k = 0; k < 1000; k += 2) ok = ok && m.erase(k * 7919);
    if (!ok) std::println("{}: your Swiss table of tasks 2 and 3 does not work yet, so it is not measured", task.substr(0, 5));
    return ok;
}

std::vector<Key> random_keys(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Key> k(n);
    for (Key& x : k) x = rng();
    return k;
}

// Random keys whose values form one random cycle: the value of a key is the
// index of the next key. Following the cycle, every lookup needs the result
// of the one before.
struct Cycle {
    std::vector<Key> keys;
    std::vector<std::uint32_t> next;
};
Cycle make_cycle(std::size_t n, std::uint64_t seed) {
    Cycle s;
    s.keys = random_keys(n, seed);
    s.next.resize(n);
    std::vector<std::uint32_t> order(n);
    for (std::size_t i = 0; i < n; ++i) order[i] = static_cast<std::uint32_t>(i);
    std::mt19937_64 rng(seed + 1);
    std::ranges::shuffle(order, rng);
    for (std::size_t i = 0; i < n; ++i) s.next[order[i]] = order[(i + 1) % n];
    return s;
}
// A map of 1,000,000 keys, built and then followed for 1,000,000 lookups.
const Cycle& cycle() {
    static const Cycle c = make_cycle(1'000'000, 28);
    return c;
}

template <class Map>
std::uint64_t build_and_chase(const Cycle& c = cycle()) {
    std::uint32_t at = 0;
    if constexpr (requires(Map m) { m.find(Key{})->second; }) {  // std::unordered_map
        Map m;
        for (std::size_t i = 0; i < c.keys.size(); ++i) m.insert({c.keys[i], c.next[i]});
        for (std::size_t step = 0; step < c.keys.size(); ++step) {
            const auto it = m.find(c.keys[at]);
            if (it == m.end()) return UINT64_MAX;
            at = static_cast<std::uint32_t>(it->second);
        }
    } else {
        Map m(16, 1);
        for (std::size_t i = 0; i < c.keys.size(); ++i) m.insert(c.keys[i], c.next[i]);
        for (std::size_t step = 0; step < c.keys.size(); ++step) {
            const auto v = m.find(c.keys[at]);
            if (!v) return UINT64_MAX;
            at = static_cast<std::uint32_t>(*v);
        }
    }
    return at;
}

// Building and dependent lookups, against std::unordered_map.
template <class Map>
bool bench_build(std::string_view task, double goal) {
    if (build_and_chase<Map>() != build_and_chase<std::unordered_map<Key, Value>>()) return wrong(task, "a lookup did not find its key or its value");
    Cycle c;  // Each round has a new cycle of new keys.
    std::uint64_t want = 0, got = 0;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { c = make_cycle(1'000'000, seed); },
                                 [&] { want = build_and_chase<std::unordered_map<Key, Value>>(c); },
                                 [&] { got = build_and_chase<Map>(c); }, [&] { return got == want; }, 3, 281);
    if (goal == 0) {
        std::println("{:<32} std {:8.2f} ms  yours {:8.2f} ms  {:.2f}x (no goal: the tests are the goal)", task, t.baseline * 1e3, t.yours * 1e3, t.speedup());
        return true;
    }
    return tira::report(task, t, goal);
}

template <class Map>
Map filled_ours(const std::vector<Key>& keys) {
    Map m(16, 1);
    for (Key k : keys) m.insert(k, k);
    return m;
}

// Erase and insert in turns, with a size of 500,000 keys, and lookups.
template <class Map>
bool bench_churn(std::string_view task, double goal) {
    auto keys = random_keys(2'500'000, 31);
    auto run = [&](auto& m, auto&& insert, auto&& erase, auto&& find) {
        std::size_t s = 0;
        for (std::size_t i = 0; i < 500'000; ++i) insert(m, keys[i]);
        for (std::size_t i = 500'000; i < keys.size(); ++i) {
            s += erase(m, keys[i - 500'000]);
            insert(m, keys[i]);
            s += find(m, keys[i - 250'000]);
        }
        return s;
    };
    auto std_run = [&] {
        std::unordered_map<Key, Value> m;
        return run(m, [](auto& x, Key k) { x.insert({k, k}); }, [](auto& x, Key k) { return x.erase(k); }, [](auto& x, Key k) { return std::size_t{x.contains(k)}; });
    };
    auto my_run = [&] {
        Map m(16, 1);
        return run(m, [](auto& x, Key k) { x.insert(k, k); }, [](auto& x, Key k) { return std::size_t{x.erase(k)}; }, [](auto& x, Key k) { return std::size_t{x.find(k).has_value()}; });
    };
    if (std_run() != my_run()) return wrong(task, "erase or find gave other results than std::unordered_map");
    std::size_t want = 0, got = 0;  // Each round has new keys.
    auto t = tira::compare_fresh([&](std::uint64_t seed) { keys = random_keys(2'500'000, seed); }, [&] { want = std_run(); },
                                 [&] { got = my_run(); }, [&] { return got == want; }, 3, 282);
    if (goal == 0) {
        std::println("{:<32} std {:8.2f} ms  yours {:8.2f} ms  {:.2f}x (no goal: the tests are the goal)", task, t.baseline * 1e3, t.yours * 1e3, t.speedup());
        return true;
    }
    return tira::report(task, t, goal);
}

bool bench1() {
    const bool build = bench_build<RobinHoodMap>("task1 Robin Hood build and find", 1.4);
    return bench_churn<RobinHoodMap>("task1 Robin Hood erase and insert", 1.3) && build;
}
bool bench2() { return bench_build<SwissMap<ScalarGroup>>("task2 Swiss table build and find", 0); }
bool bench3() { return bench_churn<SwissMap<ScalarGroup>>("task3 Swiss table erase and insert", 0); }

bool bench4() {
    const std::string_view task = "task4 SSE2 groups, 4 MB table";
    if (!swiss_works(task)) return false;
    // A table that fits in the L2 and L3 caches: the instructions decide.
    const auto keys = random_keys(150'000, 32);
    auto queries = random_keys(2'000'000, 33);
    for (std::size_t i = 0; i < queries.size(); i += 2) queries[i] = keys[i % keys.size()];
    const auto scalar = filled_ours<SwissMap<ScalarGroup>>(keys);
    const auto sse = filled_ours<SwissMap<SseGroup>>(keys);
    for (std::size_t i = 0; i < 100000; ++i)
        if (sse.find(queries[i]) != scalar.find(queries[i])) return wrong(task, "SseGroup gives other results than ScalarGroup");
    auto lookup = [&](const auto& m) {
        Value s = 0;
        for (Key k : queries)
            if (const auto v = m.find(k)) s = s * 31 + *v;
        return s;
    };
    // Each round has new queries. Half of them are keys of the table.
    Value want = 0, got = 0;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            std::mt19937_64 rng(seed);
            for (std::size_t i = 0; i < queries.size(); ++i) queries[i] = i % 2 == 0 ? keys[rng() % keys.size()] : rng();
        },
        [&] { want = lookup(scalar); }, [&] { got = lookup(sse); }, [&] { return got == want; }, 7, 284);
    const bool ok = tira::report(task, t, 1.5);
    auto s = tira::compare([] { tira::keep(build_and_chase<std::unordered_map<Key, Value>>()); }, [] { tira::keep(build_and_chase<SwissMap<SseGroup>>()); }, 3);
    std::println("      your Swiss table with SSE2 against std::unordered_map, build and find: {:.2f}x (no goal)", s.speedup());
    return ok;
}

bool bench5() {
    const std::string_view task = "task5 batches, 128 MB table";
    if (!swiss_works(task)) return false;
    const auto keys = random_keys(4'000'000, 34);
    auto queries = random_keys(4'000'000, 35);
    std::mt19937_64 rng(36);
    for (std::size_t i = 0; i < queries.size(); i += 2) queries[i] = keys[rng() % keys.size()];
    const auto m = filled_ours<SwissMap<SseGroup>>(keys);
    std::vector<std::optional<Value>> out(queries.size()), want(queries.size());
    m.find_batch(queries, out);
    for (std::size_t i = 0; i < queries.size(); i += 101)
        if (out[i] != m.find(queries[i])) return wrong(task, "a result of find_batch is not the result of find");
    // Each round has new queries. Half of them are keys of the table.
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            std::mt19937_64 g(seed);
            for (std::size_t i = 0; i < queries.size(); ++i) queries[i] = i % 2 == 0 ? keys[g() % keys.size()] : g();
        },
        [&] {
            for (std::size_t i = 0; i < queries.size(); ++i) want[i] = m.find(queries[i]);
        },
        [&] { m.find_batch(queries, out); }, [&] { return out == want; }, 5, 285);
    return tira::report(task, t, 1.3);
}

// Follows a cycle of `steps` dependent lookups through a map that has the
// keys of c. It starts from the key at index `start`.
template <class Map>
std::uint64_t chase(const Map& m, const Cycle& c, std::size_t steps, std::uint32_t start = 0) {
    std::uint32_t at = start;
    for (std::size_t step = 0; step < steps; ++step) {
        if constexpr (requires { m.find(Key{})->second; }) {  // std::unordered_map
            const auto it = m.find(c.keys[at]);
            if (it == m.end()) return UINT64_MAX;
            at = static_cast<std::uint32_t>(it->second);
        } else {
            const auto v = m.find(c.keys[at]);
            if (!v) return UINT64_MAX;
            at = static_cast<std::uint32_t>(*v);
        }
    }
    return at;
}

bool bench6() {
    const std::string_view task = "task6 cuckoo, dependent lookups";
    // 3,700,000 keys: the table ends with 2^20 buckets (64 MB), 88 % full.
    const Cycle c = make_cycle(3'700'000, 38);
    const std::size_t steps = 2'000'000;
    CuckooMap cuckoo(4, 1);
    for (std::size_t i = 0; i < c.keys.size(); ++i) cuckoo.insert(c.keys[i], c.next[i]);
    if (cuckoo.size() != c.keys.size()) return wrong(task, "size() is not the number of keys");
    std::unordered_map<Key, Value> std_map;
    for (std::size_t i = 0; i < c.keys.size(); ++i) std_map.insert({c.keys[i], c.next[i]});
    if (chase(cuckoo, c, steps) != chase(std_map, c, steps)) return wrong(task, "a lookup did not find its key or its value");
    // Each round has a new random start on the cycle.
    std::uint32_t start = 0;
    std::uint64_t want = 0, got = 0;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { start = static_cast<std::uint32_t>(seed % c.keys.size()); },
                                 [&] { want = chase(std_map, c, steps, start); }, [&] { got = chase(cuckoo, c, steps, start); },
                                 [&] { return got == want; }, 5, 286);
    const bool ok = tira::report(task, t, 1.7);
    std::println("      {} keys in {} buckets of 4 slots: {:.1f} % full", cuckoo.size(), cuckoo.bucket_count(),
                 100.0 * static_cast<double>(cuckoo.size()) / static_cast<double>(cuckoo.capacity()));
    if (swiss_works(task)) {
        SwissMap<SseGroup> s(16, 1);
        for (std::size_t i = 0; i < c.keys.size(); ++i) s.insert(c.keys[i], c.next[i]);
        if (chase(s, c, steps) == chase(cuckoo, c, steps)) {
            auto u = tira::compare([&] { tira::keep(chase(s, c, steps)); }, [&] { tira::keep(chase(cuckoo, c, steps)); }, 3);
            std::println("      your cuckoo table against your Swiss table with SSE2: {:.2f}x (no goal)", u.speedup());
        }
    }
    return ok;
}

bool bench7() {
    const std::string_view task = "task7 sharded map, 4 threads";
    if (!swiss_works(task)) return false;
    auto keys = random_keys(1'000'000, 37);
    {
        ShardedMap m(64, 1);
        if (m.shards.size() != 64) return wrong(task, "the map does not have 64 shards");
    }
    // Every thread: lookups (90 %) and inserts of keys from the same set.
    auto work = [&](auto& m) {
        std::size_t s = 0;
#pragma omp parallel reduction(+ : s)
        {
            std::mt19937_64 rng(static_cast<std::uint64_t>(omp_get_thread_num()));
            for (int i = 0; i < 500'000; ++i) {
                const Key k = keys[rng() % keys.size()];
                if (rng() % 10 == 0)
                    m.insert(k, k);
                else
                    s += m.find(k).has_value();
            }
        }
        return s;
    };
    {
        ShardedMap m(64, 1);
        work(m);
        bool right = true;
        for (std::size_t i = 0; i < keys.size(); i += 7) right = right && (!m.find(keys[i]) || *m.find(keys[i]) == keys[i]);
        if (!right) return wrong(task, "a value is wrong");
    }
    // Each round has new keys. After the round, each key of the round in the
    // map must have its own value. This check has no time measurement.
    std::unique_ptr<ShardedMap> mine;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            mine.reset();
            keys = random_keys(1'000'000, seed);
        },
        [&] {
            baseline::LockedMap m(1);
            tira::keep(work(m));
        },
        [&] {
            mine = std::make_unique<ShardedMap>(64, 1);
            tira::keep(work(*mine));
        },
        [&] {
            bool right = true;
            for (std::size_t i = 0; i < keys.size(); i += 7) right = right && (!mine->find(keys[i]) || *mine->find(keys[i]) == keys[i]);
            return right;
        },
        5, 287);
    return tira::report(task, t, 3);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1}, {"task2", bench2}, {"task3", bench3}, {"task4", bench4}, {"task5", bench5}, {"task6", bench6}, {"task7", bench7}}};
    return b.run(argc, argv);
}
