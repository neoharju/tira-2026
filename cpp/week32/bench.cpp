// Speed goals for week 32. Only task 4 has a goal; the tests are the goal of
// the other tasks, and their benchmarks print speeds to compare. Run in the release build:
// ./w32_bench [task]. Every benchmark first checks your result: a wrong result
// is not timed. The parallel benchmarks use as many threads as OpenMP does
// (OMP_NUM_THREADS). The goals were calibrated with GCC 16 on a 4-core machine.
#include <algorithm>
#include <random>
#include <thread>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w32;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<34} WRONG: {} (run the tests)", task, what);
    return false;
}

const int T = static_cast<int>(tira::threads());

// Runs f(thread) on T threads at the same time.
template <class F>
void in_threads(F f) {
    std::vector<std::jthread> threads;
    for (int i = 0; i < T; ++i) threads.emplace_back(f, i);
}

std::vector<Key> random_keys(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Key> v(n);
    for (auto& k : v) k = rng();
    return v;
}

double median(std::vector<double> v) {
    std::ranges::sort(v);
    return v[v.size() / 2];
}

bool bench1() {
    const std::string_view task = "task1 finds, 1M keys";
    const auto keys = random_keys(1'000'000, 321);
    ConcurrentTree tree;
    baseline::LockedTree locked;
    for (const Key k : keys) tree.insert_plain(k, k ^ 1), locked.insert(k, k ^ 1);
    for (std::size_t i = 0; i < 1000; ++i)
        if (tree.find(keys[i * 997]) != (keys[i * 997] ^ 1)) return wrong(task, "find gives a wrong value");
    auto run = [&](auto find) {
        in_threads([&](int th) {
            std::mt19937_64 rng(static_cast<std::uint64_t>(th));
            std::size_t found = 0;
            for (int i = 0; i < 1'000'000; ++i) found += find(keys[rng() % keys.size()]).has_value();
            tira::keep(found);
        });
    };
    const auto t = tira::compare([&] { run([&](Key k) { return locked.find(k); }); }, [&] { run([&](Key k) { return tree.find(k); }); }, 5);
    const double plain = tira::seconds([&] { run([&](Key k) { return tree.find_plain(k); }); });
    std::println("{:<34} {} threads: latch coupling {:.0f} ms, one shared lock {:.0f} ms, no latches at all {:.0f} ms (no goal)", task, T, t.yours * 1e3,
                 t.baseline * 1e3, plain * 1e3);
    return true;
}

bool bench2() {
    const std::string_view task = "task2 inserts in threads";
    const auto keys = random_keys(static_cast<std::size_t>(T) * 400'000, 322);
    {
        ConcurrentTree t;
        for (std::size_t i = 0; i < 10'000; ++i) t.insert(keys[i], 1);
        if (t.size() != 10'000) return wrong(task, "insert loses keys");
    }
    auto run = [&](int how) {  // 0: one lock, 1: insert_coarse, 2: your insert
        ConcurrentTree tree;
        baseline::LockedTree locked;
        const double s = tira::seconds([&] {
            in_threads([&](int th) {
                for (std::size_t i = static_cast<std::size_t>(th); i < keys.size(); i += static_cast<std::size_t>(T)) {
                    if (how == 0) locked.insert(keys[i], i);
                    else if (how == 1) tree.insert_coarse(keys[i], i);
                    else tree.insert(keys[i], i);
                }
            });
        });
        return how == 0 || tree.size() == keys.size() ? s : -1.0;
    };
    std::vector<double> lock, coarse, yours;
    for (int r = 0; r < 3; ++r) lock.push_back(run(0)), coarse.push_back(run(1)), yours.push_back(run(2));
    if (std::ranges::min(yours) < 0) return wrong(task, "insert loses keys in threads");
    std::println("{:<34} {} threads, {} keys: one lock {:.0f} ms, insert_coarse {:.0f} ms, your insert {:.0f} ms (no goal: the tests are the goal)", task, T,
                 keys.size(), median(lock) * 1e3, median(coarse) * 1e3, median(yours) * 1e3);
    return true;
}

bool bench3() {
    const std::string_view task = "task3 optimistic inserts";
    const auto old_keys = random_keys(1'000'000, 323), new_keys = random_keys(static_cast<std::size_t>(T) * 250'000, 324);
    auto run = [&](bool optimistic) {
        ConcurrentTree tree;
        baseline::LockedTree locked;
        for (const Key k : old_keys) optimistic ? (void)tree.insert_plain(k, 1) : (void)locked.insert(k, 1);
        return tira::seconds([&] {
            in_threads([&](int th) {
                for (std::size_t i = static_cast<std::size_t>(th); i < new_keys.size(); i += static_cast<std::size_t>(T))
                    optimistic ? tree.insert_optimistic(new_keys[i], i) : locked.insert(new_keys[i], i);
            });
        });
    };
    {
        ConcurrentTree t(8);
        for (std::size_t i = 0; i < 20'000; ++i) t.insert_optimistic(new_keys[i], 1);
        if (t.size() != 20'000) return wrong(task, "insert_optimistic loses keys");
    }
    std::vector<double> a, b;
    for (int r = 0; r < 3; ++r) a.push_back(run(false)), b.push_back(run(true));
    std::println("{:<34} {} threads, 1M new keys in a tree of 1M: one lock {:.0f} ms, insert_optimistic {:.0f} ms (no goal: the tests are the goal)", task, T,
                 median(a) * 1e3, median(b) * 1e3);
    return true;
}

// 100,000 keys with 3 versions each, made by hand (no task 5 needed).
void fill(MvccStore& s, Key keys) {
    for (Key k = 0; k < keys; ++k) {
        std::unique_ptr<Version> head;
        for (Ts c = 1; c <= 3; ++c) {
            head = std::make_unique<Version>(k * 10 + c, false, c, std::move(head));
            head->commit = 10 * c;
        }
        s.shard_of(k).chains[k] = std::move(head);
    }
}

bool bench4() {
    const std::string_view task = "task4 snapshot reads in threads";
    const Key keys = 100'000;
    MvccStore store;
    fill(store, keys);
    CopyStore<> copies;
    {
        auto t = copies.begin();
        for (Key k = 0; k < keys; ++k) copies.put(t, k, k * 10 + 3);
        copies.commit(t);
    }
    Txn reader;
    reader.id = 1000;
    reader.snapshot = 25;
    for (Key k = 0; k < 1000; ++k)
        if (store.get(reader, k) != k * 10 + 2) return wrong(task, "get gives a wrong version");
    // Each round has a new snapshot (one of the three versions) and new random
    // keys. The check compares the sum of each thread with the versions that
    // fill made. It has no time measurement.
    std::uint64_t round_seed = 0;
    Ts snapshot = 35;
    std::vector<std::size_t> sums(static_cast<std::size_t>(T));
    const auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            round_seed = seed;
            snapshot = static_cast<Ts>(15 + 10 * (seed % 3));
        },
        [&] {
            in_threads([&](int th) {
                auto txn = copies.begin();
                std::mt19937_64 rng(round_seed + static_cast<std::uint64_t>(th));
                std::size_t s = 0;
                for (int i = 0; i < 500'000; ++i) s += copies.get(txn, rng() % keys).value_or(0);
                tira::keep(s);
            });
        },
        [&] {
            in_threads([&](int th) {
                Txn txn;
                txn.id = 2000 + static_cast<TxnId>(th);
                txn.snapshot = snapshot;
                std::mt19937_64 rng(round_seed + static_cast<std::uint64_t>(th));
                std::size_t s = 0;
                for (int i = 0; i < 500'000; ++i) s += store.get(txn, rng() % keys).value_or(0);
                sums[static_cast<std::size_t>(th)] = s;
            });
        },
        [&] {
            const Value c = snapshot / 10;  // The version that the snapshot sees.
            for (int th = 0; th < T; ++th) {
                std::mt19937_64 rng(round_seed + static_cast<std::uint64_t>(th));
                std::size_t want = 0;
                for (int i = 0; i < 500'000; ++i) want += (rng() % keys) * 10 + c;
                if (sums[static_cast<std::size_t>(th)] != want) return false;
            }
            return true;
        },
        5, 324);
    return tira::report(task, t, 5.0);
}

bool bench5() {
    const std::string_view task = "task5 transfers";
    const Key accounts = 10'000;
    const int total = 400'000;
    auto run = [&](int threads) {
        MvccStore s;
        {
            Txn t = s.begin();
            for (Key k = 0; k < accounts; ++k) s.put(t, k, 1000);
            s.commit(t);
        }
        const double sec = tira::seconds([&] {
            std::vector<std::jthread> ts;
            for (int th = 0; th < threads; ++th)
                ts.emplace_back([&, th] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(th));
                    for (int i = 0; i < total / threads; ++i) {
                        Txn t = s.begin();
                        const Key x = rng() % accounts, y = rng() % accounts;
                        const Value a = s.get(t, x).value_or(0), b = s.get(t, y).value_or(0);
                        if (x != y && s.put(t, x, a - (a > 0)) && s.put(t, y, b + (a > 0))) s.commit(t);
                        else s.abort(t);
                    }
                });
        });
        Txn t = s.begin();
        Value sum = 0;
        for (Key k = 0; k < accounts; ++k) sum += s.get(t, k).value_or(0);
        s.commit(t);
        return sum == accounts * 1000 ? sec : -1.0;
    };
    std::vector<double> one, many;
    for (int r = 0; r < 3; ++r) one.push_back(run(1)), many.push_back(run(T));
    if (std::ranges::min(one) < 0 || std::ranges::min(many) < 0) return wrong(task, "the transfers do not keep the sum of the accounts");
    std::println("{:<34} {} transfers: one thread {:.0f} ms, {} threads {:.0f} ms (no goal: the tests are the goal)", task, total, median(one) * 1e3, T,
                 median(many) * 1e3);
    return true;
}

bool bench6() {
    const std::string_view task = "task6 gc of 1M versions";
    MvccStore s;
    const Key keys = 10'000;
    for (Key k = 0; k < keys; ++k) {
        std::unique_ptr<Version> head;
        for (Ts c = 1; c <= 100; ++c) {
            head = std::make_unique<Version>(c, false, c, std::move(head));
            head->commit = c;
        }
        s.shard_of(k).chains[k] = std::move(head);
    }
    s.last_commit = 100;
    std::size_t freed = 0;
    const double sec = tira::seconds([&] { freed = s.gc(); });
    if (freed != keys * 99 || s.versions() != keys) return wrong(task, "gc should keep exactly the newest version of each key");
    std::println("{:<34} {:.1f} ms for {} versions (no goal: the tests are the goal)", task, sec * 1e3, freed);
    return true;
}

bool bench7() {
    const std::string_view task = "task7 check a history";
    CopyStore<> store;
    History h;
    std::mt19937_64 rng(327);
    Value next = 1;
    for (int i = 0; i < 200'000; ++i) {  // one transaction after another: a valid history
        auto t = store.begin();
        TxnRecord rec{t.snapshot, 0, {}};
        for (int j = 0; j < 5; ++j) {
            const Key k = rng() % 1000;
            if (rng() % 2) rec.ops.push_back({Op::read, k, store.get(t, k)});
            else store.put(t, k, next), rec.ops.push_back({Op::write, k, next++});
        }
        rec.commit = store.commit(t);
        if (i % 1000 == 0) store.gc();
        h.push_back(std::move(rec));
    }
    std::optional<std::string> problem;
    const double sec = tira::seconds([&] { problem = check_history(h); });
    if (problem) return wrong(task, "a valid history is reported");
    std::println("{:<34} {:.0f} ms for 200,000 transactions, 1,000,000 operations (no goal: the tests are the goal)", task, sec * 1e3);
    return true;
}

bool bench8() {
    const std::string_view task = "task8 stress test of MvccStore";
    MvccStore store;
    std::optional<std::string> problem;
    const double sec = tira::seconds([&] { problem = stress(store, StressOptions{}); });
    if (problem) return wrong(task, *problem);
    std::println("{:<34} {:.0f} ms, no problem found (no goal: the tests are the goal)", task, sec * 1e3);
    return true;
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1}, {"task2", bench2}, {"task3", bench3}, {"task4", bench4}, {"task5", bench5}, {"task6", bench6}, {"task7", bench7}, {"task8", bench8}}};
    return b.run(argc, argv);
}
