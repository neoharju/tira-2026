// Tests for week 32. Run one task's tests with: ./w32_test -tc="task2*"
// Every task uses threads: run its tests in the tsan preset too. The tests of
// task 5 use your get of task 4, those of task 6 your tasks 4 and 5, and the
// last part of task 8 runs your stress test on your MvccStore.
#include <doctest/doctest.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <map>
#include <memory>
#include <random>
#include <set>
#include <thread>
#include <tuple>
#include <vector>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w32;

namespace {

Value value_of(Key k) { return k * 2654435761ULL + 17; }

void check_valid(const ConcurrentTree& t) {
    try {
        t.validate();
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

// A chain made by hand: versions newest first, as (value, deleted, writer, commit).
void set_chain(MvccStore& s, Key key, const std::vector<std::tuple<Value, bool, TxnId, Ts>>& versions) {
    std::unique_ptr<Version> head;
    for (auto it = versions.rbegin(); it != versions.rend(); ++it) {
        const auto [v, d, w, c] = *it;
        head = std::make_unique<Version>(v, d, w, std::move(head));
        head->commit = c;
    }
    s.shard_of(key).chains[key] = std::move(head);
}

Txn reader(TxnId id, Ts snapshot) {
    Txn t;
    t.id = id;
    t.snapshot = snapshot;
    return t;
}

// A valid history: transactions of a correct store, run in one thread with
// up to 4 of them open at a time, their operations interleaved at random.
History random_history(std::uint64_t seed, int count, int keys) {
    std::mt19937_64 rng(seed);
    CopyStore<> store;
    struct Open {
        CopyStore<>::Txn t;
        TxnRecord rec;
    };
    std::vector<Open> open;
    History h;
    Value next = 1;
    int started = 0;
    while (started < count || !open.empty()) {
        if (started < count && (open.size() < 4 && rng() % 3 == 0)) {
            auto t = store.begin();
            open.push_back({t, {t.snapshot, 0, {}}});
            ++started;
            continue;
        }
        if (open.empty()) continue;
        const std::size_t i = rng() % open.size();
        Open& o = open[i];
        const Key k = rng() % static_cast<Key>(keys);
        switch (rng() % 6) {
            case 0:
            case 1: o.rec.ops.push_back({Op::read, k, store.get(o.t, k)}); break;
            case 2: store.put(o.t, k, next), o.rec.ops.push_back({Op::write, k, next++}); break;
            case 3: store.erase(o.t, k), o.rec.ops.push_back({Op::erase, k, std::nullopt}); break;
            default:
                if (rng() % 5 == 0) store.abort(o.t);
                else o.rec.commit = store.commit(o.t);
                h.push_back(o.rec);
                open.erase(open.begin() + static_cast<std::ptrdiff_t>(i));
        }
    }
    return h;
}

template <Bug bug>
bool catches(int tries) {
    for (int seed = 1; seed <= tries; ++seed) {
        CopyStore<bug> store;
        if (stress(store, StressOptions{.seed = static_cast<std::uint64_t>(seed)})) return true;
    }
    return false;
}

}  // namespace

TEST_CASE("task1 find and scan with latch coupling") {
    SUBCASE("one thread, against std::map") {
        for (const int cap : {3, 4, 8, 64}) {
            CAPTURE(cap);
            ConcurrentTree t(cap);
            std::map<Key, Value> m;
            std::mt19937_64 rng(cap);
            for (int i = 0; i < 20'000; ++i) {
                const Key k = rng() % 50'000;
                const Value v = rng();
                t.insert_plain(k, v);
                m[k] = v;
            }
            for (const Key k : {Key{0}, ~Key{0}}) t.insert_plain(k, value_of(k)), m[k] = value_of(k);
            check_valid(t);
            for (int i = 0; i < 20'000; ++i) {
                const Key k = i < 2 ? (i ? ~Key{0} : 0) : rng() % 50'002;
                const auto it = m.find(k);
                if (t.find(k) != (it == m.end() ? std::nullopt : std::optional(it->second))) FAIL("find(" << k << ") is wrong");
            }
            for (int i = 0; i < 300; ++i) {
                Key lo = rng() % 50'000, hi = lo + rng() % 3000;
                if (i % 10 == 0) hi = ~Key{0};
                if (i % 17 == 0) std::swap(lo, hi);  // an empty range
                std::vector<std::pair<Key, Value>> got, want;
                t.scan(lo, hi, got);
                for (auto it = m.lower_bound(lo); it != m.end() && it->first <= hi; ++it) want.push_back(*it);
                if (got != want) FAIL("scan(" << lo << ", " << hi << ") gives " << got.size() << " pairs, " << want.size() << " are right");
            }
        }
    }
    SUBCASE("readers while writers insert") {
        for (const int cap : {4, 16, 64}) {
            CAPTURE(cap);
            ConcurrentTree t(cap);
            const Key n = 20'000;
            for (Key k = 0; k < n; k += 2) t.insert_plain(k, value_of(k));  // the even keys are there from the start
            std::atomic<int> bad{0};
            {
                std::vector<std::jthread> threads;
                for (int w = 0; w < 2; ++w)
                    threads.emplace_back([&, w] {
                        for (Key k = 1 + 2 * static_cast<Key>(w); k < n; k += 4) t.insert_coarse(k, value_of(k));  // the odd keys
                    });
                for (int r = 0; r < 4; ++r)
                    threads.emplace_back([&, r] {
                        std::mt19937_64 rng(static_cast<std::uint64_t>(r));
                        std::vector<std::pair<Key, Value>> out;
                        for (int i = 0; i < 3000; ++i) {
                            const Key k = rng() % n;
                            const auto v = t.find(k);
                            if (k % 2 == 0 ? v != value_of(k) : (v && *v != value_of(k))) ++bad;
                            if (i % 20 == 0) {
                                out.clear();
                                const Key lo = rng() % n, hi = lo + 500;
                                t.scan(lo, hi, out);
                                bool ok = true;
                                std::size_t evens = 0;
                                for (std::size_t q = 0; q < out.size(); ++q) {
                                    ok = ok && out[q].first >= lo && out[q].first <= hi && out[q].second == value_of(out[q].first) && (q == 0 || out[q - 1].first < out[q].first);
                                    evens += out[q].first % 2 == 0;
                                }
                                const Key top = std::min(hi, n - 1);
                                const std::size_t want = static_cast<std::size_t>((top - top % 2 - (lo + lo % 2)) / 2 + 1);
                                if (!ok || evens != want) ++bad;
                            }
                        }
                    });
            }
            CHECK_MESSAGE(bad == 0, "a reader saw a wrong value, a missing key or a wrong scan");
            check_valid(t);
            CHECK(t.size() == n);
        }
    }
}

namespace {

// The leaf where a key belongs (one thread, no latches).
Node* leaf_of(ConcurrentTree& t, Key key) {
    Node* n = t.root;
    while (n->level > 0) n = n->children[ConcurrentTree::child_index(n, key)];
    return n;
}

// Starts f in a thread and waits up to 3 seconds for it to finish; true if it
// did. The flag is shared, because the thread can outlive this call.
template <class F>
bool finishes(F f, std::jthread& thread) {
    auto done = std::make_shared<std::atomic<bool>>(false);
    thread = std::jthread([done, f] { f(); *done = true; });
    for (int i = 0; i < 300 && !*done; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    return *done;
}

// A tree of height 3 whose root and level-1 nodes have room: inserts below
// the level-1 nodes never change the root.
ConcurrentTree& tall_tree(ConcurrentTree& t) {
    std::mt19937_64 rng(42);
    while (t.root->level < 2) t.insert_plain(rng() >> 1, 1);
    return t;
}

}  // namespace

TEST_CASE("task2 insert with latch coupling") {
    for (const int cap : {3, 4, 8, 64}) {
        for (const int threads : {1, 2, 4, 7}) {
            CAPTURE(cap);
            CAPTURE(threads);
            ConcurrentTree t(cap);
            const int per = cap <= 4 ? 3000 : 6000;
            std::atomic<std::size_t> added{0};
            auto key_of = [&](std::mt19937_64& rng, int w) { return (rng() % static_cast<Key>(per * 3)) * static_cast<Key>(threads) + static_cast<Key>(w); };
            {
                std::vector<std::jthread> ws;
                for (int w = 0; w < threads; ++w)
                    ws.emplace_back([&, w] {
                        std::mt19937_64 rng(static_cast<std::uint64_t>(w + 100 * cap));
                        for (int i = 0; i < per; ++i) {
                            const Key k = key_of(rng, w);  // the keys of thread w are w modulo threads: no two threads share a key
                            if (t.insert(k, value_of(k))) ++added;
                        }
                        if (t.insert(~Key{0} - 5, 7)) ++added;  // all threads insert this key; exactly one adds it
                    });
            }
            check_valid(t);
            CHECK_MESSAGE(t.size() == added, "the number of true returns is not the number of keys in the tree");
            bool all = true;
            for (int w = 0; w < threads; ++w) {
                std::mt19937_64 rng(static_cast<std::uint64_t>(w + 100 * cap));
                for (int i = 0; i < per; ++i) {
                    const Key k = key_of(rng, w);
                    all = all && t.find_plain(k) == value_of(k);
                }
            }
            CHECK_MESSAGE(all, "a key is missing or has a wrong value");
            CHECK(t.find_plain(~Key{0} - 5) == 7);
        }
    }
    SUBCASE("an insert that waits for a leaf does not stop inserts in other subtrees") {
        ConcurrentTree t;
        tall_tree(t);
        Node* first = t.root->children[0];
        Node* last = t.root->children[t.root->count];
        REQUIRE(t.root->count < t.capacity);
        REQUIRE(first->count < t.capacity);
        REQUIRE(last->count < t.capacity);
        Node* leaf = first->children[0];
        const Key a = leaf->keys[0];                // a key in the first leaf
        const Key b = last->children[0]->keys[0];  // a key under the last level-1 node
        leaf->latch.lock();  // the test holds the first leaf: the insert of `a` must wait for it
        std::jthread tb;
        std::jthread ta([&] { t.insert(a, 5); });
        std::this_thread::sleep_for(std::chrono::milliseconds(100));  // `a` waits at the leaf now
        const bool passed = finishes([&] { t.insert(b, 6); }, tb);
        leaf->latch.unlock();
        ta.join();
        tb.join();
        CHECK_MESSAGE(passed, "while one insert waited for a leaf, an insert under another level-1 node could not finish: release the latches above a safe node");
        CHECK(t.find_plain(a) == 5);
        CHECK(t.find_plain(b) == 6);
        check_valid(t);
    }
}

TEST_CASE("task3 optimistic insert and erase") {
    for (const int cap : {3, 4, 8, 64}) {
        for (const int threads : {1, 2, 4, 7}) {
            CAPTURE(cap);
            CAPTURE(threads);
            ConcurrentTree t(cap);
            const Key n = 30'000;
            for (Key k = 0; k < n; k += 3) t.insert_plain(k, value_of(k));
            std::atomic<int> bad{0};
            std::vector<std::map<Key, Value>> models(static_cast<std::size_t>(threads));
            {
                std::vector<std::jthread> ws;
                for (int w = 0; w < threads; ++w)
                    ws.emplace_back([&, w] {
                        auto& model = models[static_cast<std::size_t>(w)];  // the keys k = w modulo threads
                        for (Key k = static_cast<Key>(w); k < n; k += static_cast<Key>(threads))
                            if (k % 3 == 0) model[k] = value_of(k);
                        std::mt19937_64 rng(static_cast<std::uint64_t>(w + 7 * cap));
                        for (int i = 0; i < 6000; ++i) {
                            const Key k = (rng() % (n / static_cast<Key>(threads))) * static_cast<Key>(threads) + static_cast<Key>(w);
                            if (rng() % 5 < 3) {
                                const Value v = rng();
                                if (t.insert_optimistic(k, v) != !model.contains(k)) ++bad;
                                model[k] = v;
                            } else {
                                if (t.erase(k) != model.contains(k)) ++bad;
                                model.erase(k);
                            }
                        }
                    });
            }
            CHECK_MESSAGE(bad == 0, "insert_optimistic or erase returned a wrong answer");
            check_valid(t);
            bool same = true;
            std::size_t keys = 0;
            for (Key k = 0; k < n; ++k) {
                const auto& model = models[k % static_cast<Key>(threads)];
                const auto it = model.find(k);
                const auto want = it == model.end() ? std::nullopt : std::optional(it->second);
                same = same && t.find_plain(k) == want;
                keys += want.has_value();
            }
            CHECK_MESSAGE(same, "the tree is not the model of the threads' operations");
            CHECK(t.size() == keys);
        }
    }
    SUBCASE("an optimistic insert and an erase pass a reader of the root") {
        ConcurrentTree t;
        tall_tree(t);
        Node* leaf = t.root->children[0]->children[0];
        REQUIRE(leaf->count < t.capacity);
        const Key a = leaf->keys[0], fresh = leaf->keys[0] + 1;  // `fresh` belongs in the same leaf
        REQUIRE(leaf_of(t, fresh) == leaf);
        t.root_latch.lock_shared();  // a long reader holds root_latch and the root, shared
        t.root->latch.lock_shared();
        std::jthread ti, te;
        const bool inserted = finishes([&] { t.insert_optimistic(fresh, 7); }, ti);
        const bool erased = finishes([&] { t.erase(a); }, te);
        t.root->latch.unlock_shared();
        t.root_latch.unlock_shared();
        ti.join();
        te.join();
        CHECK_MESSAGE(inserted, "insert_optimistic waited for a reader of the root: it should take only shared latches above the leaf");
        CHECK_MESSAGE(erased, "erase waited for a reader of the root: it should take only shared latches above the leaf");
        CHECK(t.find_plain(fresh) == 7);
        CHECK(!t.find_plain(a));
        check_valid(t);
    }
}

TEST_CASE("task4 snapshot reads") {
    SUBCASE("a chain made by hand") {
        MvccStore s;
        // newest first: pending by txn 9; a delete at 8; 10 at 4; 5 at 2
        set_chain(s, 7, {{30, false, 9, 0}, {0, true, 5, 8}, {10, false, 3, 4}, {5, false, 2, 2}});
        CHECK(!s.get(reader(100, 1), 7));
        CHECK(s.get(reader(100, 2), 7) == 5);
        CHECK(s.get(reader(100, 3), 7) == 5);
        CHECK(s.get(reader(100, 4), 7) == 10);
        CHECK(s.get(reader(100, 7), 7) == 10);
        CHECK(!s.get(reader(100, 8), 7));    // deleted
        CHECK(!s.get(reader(100, 999), 7));  // the pending version is not committed
        CHECK(s.get(reader(9, 3), 7) == 30);  // its writer sees its own pending version
        CHECK(!s.get(reader(100, 999), 8));   // no chain at all
        set_chain(s, 8, {{0, true, 11, 0}, {4, false, 2, 3}});
        CHECK(!s.get(reader(11, 5), 8));  // its own pending delete
        CHECK(s.get(reader(12, 5), 8) == 4);
    }
    SUBCASE("many readers at the same time") {
        MvccStore s;
        for (Key k = 0; k < 2000; ++k) set_chain(s, k, {{k + 3, false, 3, 30}, {k + 2, k % 7 == 0, 2, 20}, {k + 1, false, 1, 10}});
        std::atomic<int> bad{0};
        {
            std::vector<std::jthread> rs;
            for (int r = 0; r < 4; ++r)
                rs.emplace_back([&, r] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(r));
                    for (int i = 0; i < 20'000; ++i) {
                        const Key k = rng() % 2000;
                        const Ts snap = rng() % 40;
                        const std::optional<Value> want = snap >= 30 ? std::optional(k + 3) : snap >= 20 ? (k % 7 == 0 ? std::nullopt : std::optional(k + 2)) : snap >= 10 ? std::optional(k + 1) : std::nullopt;
                        if (s.get(reader(1000 + static_cast<TxnId>(r), snap), k) != want) ++bad;
                    }
                });
        }
        CHECK(bad == 0);
    }
}

TEST_CASE("task5 writes, commits and aborts") {
    SUBCASE("one transaction after another") {
        MvccStore s;
        Txn a = s.begin();
        CHECK(s.put(a, 1, 10));
        CHECK(s.get(a, 1) == 10);  // its own write
        Txn b = s.begin();
        CHECK(!s.get(b, 1));  // a has not committed
        CHECK(s.commit(a) == 1);
        CHECK(!s.get(b, 1));  // b's snapshot is older than a's commit
        Txn c = s.begin();
        CHECK(c.snapshot == 1);
        CHECK(s.get(c, 1) == 10);
        CHECK(s.erase(c, 1));
        CHECK(!s.get(c, 1));
        CHECK(s.commit(c) == 2);
        CHECK(!s.get(s.begin(), 1));
        CHECK(!s.put(b, 1, 99));  // a newer version committed after b's snapshot
        s.abort(b);
        Txn d = s.begin();
        CHECK(s.commit(d) == 3);  // a transaction without writes gets a timestamp too
    }
    SUBCASE("first updater wins") {
        MvccStore s;
        Txn a = s.begin(), b = s.begin();
        CHECK(s.put(a, 5, 1));
        CHECK(!s.put(b, 5, 2));  // a's version of 5 is pending
        CHECK(!s.erase(b, 5));
        CHECK(s.put(a, 5, 3));  // a changes its own version
        s.abort(b);
        s.commit(a);
        CHECK(s.get(s.begin(), 5) == 3);
        CHECK(s.versions() == 1);
    }
    SUBCASE("abort removes the pending versions") {
        MvccStore s;
        Txn a = s.begin();
        CHECK(s.put(a, 1, 1));
        CHECK(s.put(a, 2, 2));
        s.abort(a);
        CHECK(s.versions() == 0);
        Txn b = s.begin();
        CHECK(!s.get(b, 1));
        CHECK(s.put(b, 1, 5));  // no conflict: a's version is gone
        CHECK(s.commit(b) == 1);
        CHECK(s.active.empty());
    }
    SUBCASE("bank transfers in threads") {
        MvccStore s;
        const Key accounts = 64;
        {
            Txn t = s.begin();
            for (Key k = 0; k < accounts; ++k) s.put(t, k, 1000);
            s.put(t, 999, 0);  // a counter
            s.commit(t);
        }
        std::atomic<int> bad{0};
        std::atomic<Value> increments{0};
        {
            std::vector<std::jthread> ws;
            for (int w = 0; w < 4; ++w)
                ws.emplace_back([&, w] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(w));
                    for (int i = 0; i < 4000; ++i) {
                        Txn t = s.begin();
                        if (w == 3 && i % 2 == 0) {  // a reader: the sum of a snapshot is always the same
                            Value sum = 0;
                            for (Key k = 0; k < accounts; ++k) sum += s.get(t, k).value_or(0);
                            if (sum != accounts * 1000) ++bad;
                            s.commit(t);
                            continue;
                        }
                        const Key x = rng() % accounts, y = (x + 1 + rng() % (accounts - 1)) % accounts;
                        const Value a = s.get(t, x).value_or(0), b = s.get(t, y).value_or(0), amount = a ? rng() % (a + 1) : 0;
                        const Value c = s.get(t, 999).value_or(0);
                        if (!s.put(t, x, a - amount) || !s.put(t, y, b + amount) || !s.put(t, 999, c + 1)) {
                            s.abort(t);
                            continue;
                        }
                        s.commit(t);
                        ++increments;
                    }
                });
        }
        CHECK_MESSAGE(bad == 0, "a reader saw a sum that is not 64000: its reads were not one snapshot");
        Txn t = s.begin();
        Value sum = 0;
        for (Key k = 0; k < accounts; ++k) sum += s.get(t, k).value_or(0);
        CHECK(sum == accounts * 1000);
        CHECK_MESSAGE(s.get(t, 999) == increments.load(), "an increment of the counter was lost");
        s.commit(t);
        CHECK(s.active.empty());
    }
}

TEST_CASE("task6 garbage collection") {
    SUBCASE("only the versions that no snapshot sees") {
        MvccStore s;
        auto write = [&](Key k, Value v) {
            Txn t = s.begin();
            s.put(t, k, v);
            return s.commit(t);
        };
        for (Value v = 1; v <= 3; ++v) write(1, v);
        Txn old = s.begin();  // snapshot 3
        for (Value v = 4; v <= 10; ++v) write(1, v);
        CHECK(s.versions() == 10);
        CHECK(s.gc() == 2);  // the watermark is 3: versions 1 and 2 go
        CHECK(s.versions() == 8);
        CHECK(s.get(old, 1) == 3);
        s.commit(old);
        CHECK(s.gc() == 7);  // no transaction is active: only the newest version stays
        {
            Txn t = s.begin();
            CHECK(s.get(t, 1) == 10);
            s.commit(t);
        }
        Txn e = s.begin();
        s.erase(e, 1);
        s.commit(e);
        Txn active = s.begin();
        CHECK(s.gc() == 2);  // the delete is the newest version, older than the watermark: the key goes
        CHECK(s.versions() == 0);
        CHECK(!s.get(active, 1));
        s.commit(active);
    }
    SUBCASE("memory stays small while threads write and read") {
        MvccStore s;
        const Key keys = 100;
        std::atomic<bool> done{false};
        std::atomic<int> bad{0};
        {
            std::vector<std::jthread> ws;
            for (int w = 0; w < 3; ++w)
                ws.emplace_back([&, w] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(w));
                    for (int i = 0; i < 8000; ++i) {
                        Txn t = s.begin();
                        const Key k = rng() % keys;
                        if (s.put(t, k, rng())) s.commit(t);
                        else s.abort(t);
                    }
                });
            ws.emplace_back([&] {  // long readers: a snapshot must not change while gc runs
                std::mt19937_64 rng(9);
                while (!done) {
                    Txn t = s.begin();
                    std::vector<std::optional<Value>> first;
                    for (Key k = 0; k < keys; ++k) first.push_back(s.get(t, k));
                    std::this_thread::sleep_for(std::chrono::microseconds(200));
                    for (Key k = 0; k < keys; ++k)
                        if (s.get(t, k) != first[k]) ++bad;
                    s.commit(t);
                }
            });
            ws.emplace_back([&] {
                while (!done) {
                    s.gc();
                    std::this_thread::sleep_for(std::chrono::microseconds(100));
                }
            });
            for (int w = 0; w < 3; ++w) ws[static_cast<std::size_t>(w)].join();
            done = true;
        }
        CHECK_MESSAGE(bad == 0, "a reader saw a value change inside its snapshot");
        s.gc();
        CHECK_MESSAGE(s.versions() <= keys, "after the last gc, only the newest version of each key should be left");
    }
}

TEST_CASE("task7 checking histories") {
    const auto w = [](Key k, Value v) { return Op{Op::write, k, v}; };
    const auto r = [](Key k, std::optional<Value> v) { return Op{Op::read, k, v}; };
    const auto e = [](Key k) { return Op{Op::erase, k, std::nullopt}; };
    SUBCASE("valid histories") {
        CHECK(!check_history({}));
        CHECK(!check_history({{0, 1, {w(1, 10), r(1, 10)}}, {1, 2, {r(1, 10), e(1), r(1, std::nullopt)}}, {2, 0, {r(1, std::nullopt), w(1, 5)}}}));
        CHECK(!check_history({{0, 2, {w(1, 1)}}, {0, 1, {w(2, 2)}}, {0, 3, {r(1, std::nullopt), r(2, std::nullopt)}}}));  // disjoint writes may overlap
        for (std::uint64_t seed = 1; seed <= 30; ++seed) {
            const History h = random_history(seed, 400, 6);
            const auto problem = check_history(h);
            if (problem) FAIL("a valid history is reported: " << *problem);
        }
    }
    SUBCASE("broken rules") {
        CHECK(check_history({{0, 1, {w(1, 10)}}, {0, 2, {r(1, 10)}}}));                // a read sees a commit after its snapshot
        CHECK(check_history({{0, 1, {w(1, 10)}}, {0, 0, {r(1, 10)}}}));                // the same, in an aborted transaction
        CHECK(check_history({{0, 0, {w(1, 10)}}, {1, 2, {r(1, 10)}}}));                // a read sees an aborted write
        CHECK(check_history({{0, 1, {w(1, 10)}}, {0, 2, {w(1, 20)}}}));                // a lost update
        CHECK(check_history({{0, 1, {e(1)}}, {0, 2, {w(1, 20)}}}));                    // an erase conflicts too
        CHECK(check_history({{0, 1, {w(1, 1)}}, {0, 1, {w(2, 2)}}}));                  // the same commit timestamp twice
        CHECK(check_history({{3, 3, {w(1, 1)}}}));                                     // snapshot >= commit
        CHECK(check_history({{0, 1, {w(1, 1), w(1, 2)}}, {1, 2, {r(1, 1)}}}));         // the last write of a transaction wins
        CHECK(check_history({{0, 1, {w(1, 1)}}, {1, 0, {w(1, 7), r(1, 1)}}}));         // its own write first
        CHECK(check_history({{0, 1, {w(1, 1)}}, {1, 3, {r(1, 1)}}, {1, 2, {w(1, 2)}}, {2, 4, {r(1, 1)}}}));  // a stale read
    }
    SUBCASE("random changes to valid histories are found") {
        std::mt19937_64 rng(5);
        int found = 0, tries = 0;
        for (std::uint64_t seed = 1; seed <= 30; ++seed) {
            History h = random_history(seed, 300, 6);
            for (int i = 0; i < 20; ++i) {
                History bad = h;
                auto& t = bad[rng() % bad.size()];
                std::vector<std::size_t> reads;
                for (std::size_t j = 0; j < t.ops.size(); ++j)
                    if (t.ops[j].kind == Op::read) reads.push_back(j);
                if (reads.empty()) continue;
                auto& op = t.ops[reads[rng() % reads.size()]];
                op.value = op.value ? std::optional<Value>(*op.value + 1000000) : std::optional<Value>(1000000);
                ++tries;
                found += check_history(bad).has_value();
            }
        }
        CHECK(tries > 100);
        CHECK_MESSAGE(found == tries, "a changed read was not found");
    }
}

TEST_CASE("task8 stress test") {
    SUBCASE("a correct store passes") {
        for (std::uint64_t seed = 1; seed <= 3; ++seed) {
            CopyStore<> store;
            const auto problem = stress(store, StressOptions{.seed = seed});
            if (problem) FAIL("the stress test reports a problem in a correct store: " << *problem);
        }
    }
    SUBCASE("every mutant is caught") {
        CHECK_MESSAGE(catches<Bug::lost_update>(6), "the lost update was not caught");
        CHECK_MESSAGE(catches<Bug::read_committed>(6), "read committed (no snapshot) was not caught");
        CHECK_MESSAGE(catches<Bug::dirty_read>(6), "the dirty read was not caught");
        CHECK_MESSAGE(catches<Bug::torn_commit>(6), "the torn commit was not caught");
        CHECK_MESSAGE(catches<Bug::eager_gc>(6), "the eager gc was not caught");
        CHECK_MESSAGE(catches<Bug::keep_aborted>(6), "the visible aborted writes were not caught");
    }
    SUBCASE("your MvccStore passes") {
        for (std::uint64_t seed = 1; seed <= 3; ++seed) {
            MvccStore store;
            const auto problem = stress(store, StressOptions{.seed = seed});
            if (problem) FAIL("the stress test reports a problem in your MvccStore: " << *problem);
            CHECK(store.active.empty());
        }
    }
}
