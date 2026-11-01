// Tests for week 27. Run one task's tests with: ./w27_test -tc="task3*"
// Tasks 7 and 8 use threads: run their tests in the tsan preset too.
#include <doctest/doctest.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cstring>
#include <deque>
#include <map>
#include <random>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "tasks.hpp"

using namespace w27;

namespace {

// Exact frequencies with the same rules as FrequencySketch (counters stop at
// 15, aging after sample_size increments), for testing W-TinyLFU on its own.
struct ExactSketch {
    std::unordered_map<std::uint64_t, unsigned> count;
    std::size_t sample_size = 0, additions = 0;
    void increment(std::uint64_t k) {
        unsigned& c = count[k];
        if (c < 15) ++c;
        if (++additions == sample_size) {
            std::erase_if(count, [](auto& kv) { return (kv.second /= 2) == 0; });
            additions /= 2;
        }
    }
    unsigned estimate(std::uint64_t k) const {
        const auto it = count.find(k);
        return it == count.end() ? 0 : it->second;
    }
};

void check_valid(const SlottedPage& p) {
    try {
        p.validate();
    } catch (const std::exception& e) {
        FAIL(e.what());
    }
}

std::vector<std::byte> random_record(std::mt19937_64& rng, std::size_t max_size) {
    std::vector<std::byte> r(1 + rng() % max_size);
    for (auto& b : r) b = static_cast<std::byte>(rng());
    return r;
}

std::uint64_t read_u64(const std::byte* p) {
    std::uint64_t v;
    std::memcpy(&v, p, sizeof v);
    return v;
}

void write_u64(std::byte* p, std::uint64_t v) { std::memcpy(p, &v, sizeof v); }

}  // namespace

namespace w27 {
template <>
ExactSketch sketch_for_cache<ExactSketch>(std::size_t capacity) {
    ExactSketch s;
    s.sample_size = 10 * capacity;
    return s;
}
}  // namespace w27

TEST_CASE("task1 slotted page") {
    SUBCASE("simple cases") {
        SlottedPage p;
        check_valid(p);
        CHECK(p.free_space() == page_size - 8);
        const std::vector<std::byte> a(100, std::byte{1}), b(50, std::byte{2});
        CHECK(p.insert(a) == SlotId{0});
        CHECK(p.insert(b) == SlotId{1});
        CHECK(p.free_end() == page_size - 150);
        CHECK(std::ranges::equal(p.get(0), a));
        CHECK(p.erase(0));
        CHECK_FALSE(p.erase(0));
        CHECK_FALSE(p.erase(7));
        CHECK(p.get(0).empty());
        CHECK(p.garbage() == 100);
        CHECK(p.insert(b) == SlotId{0});  // the smallest free slot
        check_valid(p);
        CHECK_FALSE(p.insert({}).has_value());  // records have at least one byte
        const std::vector<std::byte> big(SlottedPage::max_record + 1, std::byte{3});
        CHECK_FALSE(p.insert(big).has_value());
    }
    SUBCASE("a record of max_record bytes fills an empty page") {
        SlottedPage p;
        const std::vector<std::byte> r(SlottedPage::max_record, std::byte{9});
        CHECK(p.insert(r) == SlotId{0});
        CHECK(p.free_space() == 0);
        CHECK_FALSE(p.insert(std::vector<std::byte>(1)).has_value());
        check_valid(p);
    }
    SUBCASE("random operations") {
        for (std::uint64_t seed = 1; seed <= 12; ++seed) {
            std::mt19937_64 rng(seed);
            SlottedPage p;
            std::map<SlotId, std::vector<std::byte>> model;
            std::size_t slots = 0, live = 0;  // the model's n and bytes of records
            const std::size_t max_size = seed % 4 == 0 ? 600 : 120;
            std::string error;  // the first difference, if any
            try {
                for (int op = 0; op < 3000 && error.empty(); ++op) {
                    const std::string where = "seed " + std::to_string(seed) + ", operation " + std::to_string(op) + ": ";
                    const auto kind = rng() % 10;
                    if (kind < 6) {
                        const auto r = random_record(rng, max_size);
                        SlotId want = static_cast<SlotId>(slots);
                        for (SlotId s = 0; s < slots; ++s)
                            if (!model.contains(s)) {
                                want = s;
                                break;
                            }
                        const std::size_t new_slots = want == slots ? slots + 1 : slots;
                        const bool fits = 8 + 4 * new_slots + live + r.size() <= page_size;
                        const auto got = p.insert(r);
                        if (got.has_value() != fits)
                            error = where + (fits ? "insert failed, but the record fits" : "insert succeeded, but the record does not fit");
                        else if (got && *got != want)
                            error = where + "insert gave slot " + std::to_string(*got) + ", the smallest free slot is " + std::to_string(want);
                        else if (got) {
                            model[want] = r;
                            slots = new_slots;
                            live += r.size();
                        }
                    } else if (kind < 9) {
                        if (model.empty()) continue;
                        auto it = model.begin();
                        std::advance(it, static_cast<std::ptrdiff_t>(rng() % model.size()));
                        if (!p.erase(it->first)) error = where + "erase of a slot with a record returned false";
                        live -= it->second.size();
                        model.erase(it);
                    } else {
                        p.compact();
                        if (p.garbage() != 0) error = where + "garbage is not 0 after compact()";
                        else if (p.free_space() != page_size - 8 - 4 * slots - live) error = where + "the free space is not one piece after compact()";
                    }
                    if (error.empty() && p.slot_count() != slots) error = where + "the number of slots is wrong";
                    if (error.empty() && (op % 7 == 0 || kind == 9)) p.validate();
                }
                p.validate();
            } catch (const std::exception& e) {
                error = "seed " + std::to_string(seed) + ": " + e.what();
            }
            if (!error.empty()) FAIL(error);
            bool records = true;
            for (SlotId s = 0; s < slots; ++s) {
                const auto it = model.find(s);
                records = records && std::ranges::equal(p.get(s), it == model.end() ? std::vector<std::byte>{} : it->second);
            }
            CHECK_MESSAGE(records, "a record changed");
            SlottedPage copy;  // a page is only bytes: a copy works the same
            std::memcpy(copy.bytes, p.bytes, page_size);
            bool copied = true;
            for (const auto& [s, rec] : model) copied = copied && std::ranges::equal(copy.get(s), rec);
            CHECK(copied);
        }
    }
}

TEST_CASE("task2 CLOCK replacement") {
    SUBCASE("a full turn clears the reference bits") {
        ClockReplacer r(4);
        CHECK_FALSE(r.evict().has_value());
        for (FrameId f = 0; f < 4; ++f) r.record_access(f), r.set_evictable(f, true);
        CHECK(r.size() == 4);
        CHECK(r.evict() == FrameId{0});
        CHECK(r.evict() == FrameId{1});
        r.record_access(2);
        CHECK(r.evict() == FrameId{3});
        CHECK(r.evict() == FrameId{2});
        CHECK_FALSE(r.evict().has_value());
        CHECK(r.size() == 0);
    }
    SUBCASE("frames that are not evictable are skipped") {
        ClockReplacer r(3);
        for (FrameId f = 0; f < 3; ++f) r.record_access(f);
        r.set_evictable(0, true);
        r.set_evictable(2, true);
        CHECK(r.evict() == FrameId{0});
        CHECK(r.evict() == FrameId{2});
        CHECK_FALSE(r.evict().has_value());
        r.set_evictable(1, true);
        r.set_evictable(1, true);  // twice is the same as once
        CHECK(r.size() == 1);
        CHECK(r.evict() == FrameId{1});
    }
    SUBCASE("long random traces give the victims of the rules") {
        struct Trace {
            std::size_t frames, ops;
            std::uint64_t seed, want;
        };
        for (const Trace t : {Trace{64, 200000, 1, 13096634796360099501ULL}, Trace{5, 50000, 2, 13418733344858572518ULL},
                              Trace{1000, 300000, 3, 668620448476452988ULL}}) {
            ClockReplacer r(t.frames);
            std::mt19937_64 rng(t.seed);
            std::uint64_t sum = 0;
            for (std::size_t i = 0; i < t.ops; ++i) {
                const auto op = rng() % 10;
                const auto f = static_cast<FrameId>(rng() % t.frames);
                if (op < 6) r.record_access(f);
                else if (op < 8) r.set_evictable(f, true);
                else if (op == 8) r.set_evictable(f, false);
                else {
                    const auto v = r.evict();
                    sum = sum * 1000003 + (v ? *v + 1 : 0);
                }
            }
            INFO(t.frames << " frames: the victims differ from the rules of buffer_pool.hpp");
            CHECK(sum * 31 + r.size() == t.want);
        }
    }
}

TEST_CASE("task3 buffer pool") {
    SUBCASE("hits, misses, pins and dirty pages") {
        Disk disk(10);
        for (int i = 0; i < 4; ++i) disk.allocate();
        BufferPool pool(2, disk);
        std::byte* a = pool.fetch(0);
        REQUIRE(a != nullptr);
        write_u64(a, 11);
        CHECK(pool.pin_count(0) == 1);
        CHECK(pool.fetch(0) == a);  // a hit: no read
        CHECK(disk.reads() == 1);
        CHECK(pool.pin_count(0) == 2);
        REQUIRE(pool.fetch(1) != nullptr);
        CHECK(pool.fetch(2) == nullptr);  // both frames pinned
        CHECK_FALSE(pool.contains(2));
        CHECK(pool.unpin(0, true));
        CHECK(pool.unpin(0, false));
        CHECK_FALSE(pool.unpin(0, false));  // not pinned any more
        CHECK(pool.is_dirty(0));
        REQUIRE(pool.fetch(2) != nullptr);  // evicts page 0, writing it
        CHECK_FALSE(pool.contains(0));
        CHECK(disk.writes() == 1);
        std::byte buffer[page_size];
        disk.read(0, buffer);
        CHECK(read_u64(buffer) == 11);
        CHECK_FALSE(pool.flush(0));
        CHECK(pool.unpin(1, false));
        CHECK(pool.unpin(2, false));
        const PageId p = disk.allocate();
        std::byte* fresh = pool.create(p);  // no read
        REQUIRE(fresh != nullptr);
        CHECK(std::all_of(fresh, fresh + page_size, [](std::byte x) { return x == std::byte{0}; }));
        CHECK(pool.pin_count(p) == 1);
        CHECK(disk.reads() == 4);
        write_u64(fresh, 5);
        CHECK(pool.unpin(p, true));
        CHECK(pool.flush(p));
        CHECK_FALSE(pool.is_dirty(p));
        CHECK(pool.contains(p));
        disk.read(p, buffer);
        CHECK(read_u64(buffer) == 5);
    }
    SUBCASE("random traces: the data and the pages read and written") {
        struct Trace {
            std::size_t frames, pages, ops, max_pinned;
            std::uint64_t seed, reads, writes;
        };
        for (const Trace t : {Trace{16, 200, 20000, 4, 1, 15329, 6018}, Trace{8, 40, 20000, 7, 2, 16709, 6102},
                              Trace{64, 1000, 50000, 3, 3, 27212, 11182}}) {
            Disk disk(t.pages + t.ops / 50 + 10);
            for (std::size_t i = 0; i < t.pages; ++i) disk.allocate();
            BufferPool pool(t.frames, disk);
            std::mt19937_64 rng(t.seed);
            std::deque<std::pair<PageId, std::byte*>> pinned;
            std::unordered_map<PageId, std::uint64_t> writes;  // the model: changes per page
            bool ok = true;
            for (std::size_t i = 0; i < t.ops; ++i) {
                if (pinned.size() == t.max_pinned) {
                    const auto [page, bytes] = pinned.front();
                    const bool dirty = rng() % 3 == 0;
                    if (dirty) {  // change the page while it is pinned
                        write_u64(bytes, read_u64(bytes) + 1);
                        ++writes[page];
                    }
                    ok = ok && pool.unpin(page, dirty);
                    pinned.pop_front();
                }
                const auto op = rng() % 100;
                if (op == 0) {
                    const PageId p = disk.allocate();
                    if (std::byte* b = pool.create(p)) pinned.emplace_back(p, b);
                } else if (op == 1) {
                    pool.flush(static_cast<PageId>(rng() % disk.pages()));
                } else {
                    const PageId p = static_cast<PageId>(rng() % 2 ? rng() % 20 : rng() % disk.pages());
                    if (std::byte* b = pool.fetch(p)) pinned.emplace_back(p, b);
                }
            }
            for (const auto& [page, bytes] : pinned) {
                write_u64(bytes, read_u64(bytes) + 1);
                ++writes[page];
                ok = ok && pool.unpin(page, true);
            }
            pool.flush_all();
            INFO(t.frames << " frames, seed " << t.seed);
            CHECK_MESSAGE(ok, "an unpin of a pinned page returned false, or a fetch of a pinned page failed");
            CHECK_MESSAGE(disk.reads() == t.reads, "the pages read differ from the rules of buffer_pool.hpp");
            CHECK_MESSAGE(disk.writes() == t.writes, "the pages written differ from the rules of buffer_pool.hpp");
            std::byte buffer[page_size];
            bool data = true;
            for (PageId p = 0; p < disk.pages(); ++p) {
                disk.read(p, buffer);
                data = data && read_u64(buffer) == writes[p];
            }
            CHECK_MESSAGE(data, "a change of a page was lost");
        }
    }
}

TEST_CASE("task4 frequency sketch") {
    for (const std::size_t width : {16, 64, 1024}) {
        FrequencySketch s(width, 300);
        std::vector<std::array<std::uint8_t, 4096>> model(4);  // model[r][j]
        std::mt19937_64 rng(width);
        std::size_t additions = 0;
        for (int i = 0; i < 5000; ++i) {
            const std::uint64_t key = rng() % (i % 7 == 0 ? 3 : 200);
            s.increment(key);
            const std::uint64_t h = mix(key);
            for (unsigned r = 0; r < 4; ++r) {
                auto& c = model[r][row_index(h, r, width)];
                if (c < 15) ++c;
            }
            if (++additions == 300) {
                for (auto& row : model)
                    for (auto& c : row) c /= 2;
                additions /= 2;
            }
            INFO("width " << width << ", increment " << i);
            REQUIRE(s.additions == additions);
            unsigned want = 15;
            for (unsigned r = 0; r < 4; ++r) want = std::min<unsigned>(want, model[r][row_index(h, r, width)]);
            REQUIRE(s.estimate(key) == want);
        }
        bool words = true;
        for (unsigned r = 0; r < 4; ++r)
            for (std::size_t j = 0; j < width; ++j)
                words = words && ((s.words[r * width / 16 + j / 16] >> (4 * (j % 16))) & 15) == model[r][j];
        CHECK_MESSAGE(words, "a counter is not in its place in the words");
    }
}

TEST_CASE("task5 W-TinyLFU") {
    SUBCASE("a hit is a key in the cache, and the cache never grows too large") {
        for (const std::size_t capacity : {2, 3, 50, 101, 1000}) {
            WTinyLfu<ExactSketch> cache(capacity);
            const auto trace = zipf_trace(20000, 4 * capacity + 10, 0.8, capacity);
            bool ok = true;
            for (std::uint64_t key : trace) {
                const bool there = cache.contains(key);
                ok = ok && cache.access(key) == there && cache.contains(key) && cache.size() <= capacity;
            }
            INFO("capacity " << capacity);
            CHECK(ok);
        }
    }
    SUBCASE("scans do not push out the popular keys") {
        WTinyLfu<ExactSketch> cache(100);
        for (int round = 0; round < 10; ++round)
            for (std::uint64_t k = 0; k < 50; ++k) cache.access(k);
        for (std::uint64_t k = 0; k < 1000; ++k) cache.access(1000000 + k);  // a scan
        int hits = 0;
        for (std::uint64_t k = 0; k < 50; ++k) hits += cache.access(k);
        CHECK_MESSAGE(hits >= 45, "after a scan only " << hits << " of 50 popular keys were still in the cache");
    }
    SUBCASE("the hits of the rules of task5_wtinylfu.hpp") {
        struct Case {
            std::string name;
            std::vector<std::uint64_t> trace;
            std::size_t hits;
        };
        for (const Case& c : {Case{"Zipf", zipf_trace(50000, 5000, 0.9, 1), 25351}, Case{"scans", scan_trace(50000, 5000, 0.9, 400, 400, 2), 12593},
                              Case{"loop", loop_trace(30000, 240), 23602}, Case{"shifting", shifting_trace(60000, 5000, 0.9, 15000, 4), 28766}}) {
            WTinyLfu<ExactSketch> cache(200);
            std::size_t hits = 0;
            for (std::uint64_t key : c.trace) hits += cache.access(key);
            INFO(c.name << ", capacity 200, exact frequencies");
            CHECK(hits == c.hits);
        }
    }
}

TEST_CASE("task6 blocked sketch with SIMD") {
    for (const std::size_t blocks : {1, 4, 256}) {
        BlockedSketch s(blocks, 500);
        std::vector<std::array<std::uint8_t, 64>> model(blocks);
        std::mt19937_64 rng(blocks);
        std::size_t additions = 0;
        for (int i = 0; i < 20000; ++i) {
            const std::uint64_t key = rng() % (i % 5 == 0 ? 2 : 3000);
            s.increment(key);
            const std::uint64_t h = mix(key);
            auto& block = model[h & (blocks - 1)];
            unsigned m = 255;
            for (unsigned r = 0; r < 4; ++r) m = std::min<unsigned>(m, block[16 * r + ((h >> (32 + 4 * r)) & 15)]);
            for (unsigned r = 0; r < 4; ++r) {
                auto& c = block[16 * r + ((h >> (32 + 4 * r)) & 15)];
                if (c == m && c < 255) ++c;
            }
            if (++additions == 500) {
                for (auto& b : model)
                    for (auto& c : b) c /= 2;
                additions /= 2;
            }
            if (i % 997 == 0 || i < 300) {
                INFO("blocks " << blocks << ", increment " << i);
                REQUIRE(s.additions == additions);
                bool same = true;
                for (std::size_t b = 0; b < blocks; ++b) same = same && std::ranges::equal(s.blocks[b].counters, model[b]);
                REQUIRE_MESSAGE(same, "the counters differ from the conservative update");
                REQUIRE(s.estimate(key) == std::min({model[h & (blocks - 1)][(h >> 32) & 15], model[h & (blocks - 1)][16 + ((h >> 36) & 15)],
                                                     model[h & (blocks - 1)][32 + ((h >> 40) & 15)], model[h & (blocks - 1)][48 + ((h >> 44) & 15)]}));
            }
        }
    }
    SUBCASE("counters stop at 255") {
        BlockedSketch s(1, 1'000'000'000);
        for (int i = 0; i < 300; ++i) s.increment(7);
        CHECK(s.estimate(7) == 255);
    }
}

TEST_CASE("task7 sharded buffer pool") {
    SUBCASE("the shards") {
        Disk disk(100);
        ShardedPool pool(64, 16, disk);
        REQUIRE(pool.shards.size() == 16);
        for (const auto& s : pool.shards) CHECK(s->pool.frame_count() == 4);
    }
    for (const int threads : {1, 2, 4, 7}) {
        Disk disk(4096);
        const PageId pages = 600;
        for (PageId p = 0; p < pages; ++p) disk.allocate();
        ShardedPool pool(256, 16, disk);  // fewer frames than pages: pages are evicted all the time
        std::vector<std::uint64_t> changes(pages, 0);  // written by the owner thread of each page
        std::atomic<int> failures{0};
        {
            std::vector<std::jthread> workers;
            for (int t = 0; t < threads; ++t)
                workers.emplace_back([&, t] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(t) + 1);
                    for (int i = 0; i < 3000; ++i) {
                        const PageId p = static_cast<PageId>(rng() % pages);
                        std::byte* b = pool.fetch(p);
                        if (!b) {
                            ++failures;
                            continue;
                        }
                        const bool mine = static_cast<int>(p % static_cast<PageId>(threads)) == t;
                        if (mine) {  // only the owner writes, so the bytes need no latch
                            write_u64(b + 8, read_u64(b + 8) + 1);
                            ++changes[p];
                        }
                        if (!pool.unpin(p, mine)) ++failures;
                        if (i % 300 == 0) {
                            const auto [np, nb] = pool.create();
                            if (nb) pool.unpin(np, false);
                        }
                    }
                });
        }
        pool.flush_all();
        INFO(threads << " threads");
        CHECK(failures == 0);
        std::byte buffer[page_size];
        bool data = true;
        for (PageId p = 0; p < pages; ++p) {
            disk.read(p, buffer);
            data = data && read_u64(buffer + 8) == changes[p];
        }
        CHECK_MESSAGE(data, "a change of a page was lost");
    }
}

TEST_CASE("task8 latches and guards") {
    SUBCASE("one thread") {
        Disk disk(16);
        for (int i = 0; i < 4; ++i) disk.allocate();
        ShardedPool pool(4, 1, disk);
        {
            WriteGuard w = pool.fetch_write(1);
            REQUIRE(w);
            write_u64(w.bytes, 42);
            WriteGuard moved = std::move(w);
            CHECK_FALSE(w);
            CHECK(moved);
        }
        CHECK(pool.shards[0]->pool.pin_count(1) == 0);
        CHECK(pool.shards[0]->pool.is_dirty(1));
        {
            ReadGuard a = pool.fetch_read(1), b = pool.fetch_read(1);  // two readers at once
            REQUIRE((a && b));
            CHECK(read_u64(a.bytes) == 42);
            CHECK(pool.shards[0]->pool.pin_count(1) == 2);
            a.release();
            CHECK(pool.shards[0]->pool.pin_count(1) == 1);
        }
        std::vector<ReadGuard> held;
        for (PageId p = 0; p < 4; ++p) held.push_back(pool.fetch_read(p));  // all 4 frames pinned
        const PageId extra = disk.allocate();
        CHECK_FALSE(pool.fetch_write(extra));
        CHECK_FALSE(pool.fetch_read(extra));
        held.clear();  // the guards unpin
        CHECK(pool.fetch_write(extra));
        pool.flush_all();
        std::byte buffer[page_size];
        disk.read(1, buffer);
        CHECK(read_u64(buffer) == 42);
    }
    for (const int threads : {2, 4, 7}) {
        Disk disk(256);
        const PageId hot = 6;
        for (PageId p = 0; p < 40; ++p) disk.allocate();
        ShardedPool pool(32, 4, disk);
        std::atomic<int> torn{0}, empty{0};
        {
            std::vector<std::jthread> workers;
            for (int t = 0; t < threads; ++t)
                workers.emplace_back([&, t] {
                    std::mt19937_64 rng(static_cast<std::uint64_t>(t) + 7);
                    for (int i = 0; i < 2000; ++i) {
                        const PageId p = static_cast<PageId>(i % 5 == 0 ? hot + rng() % 34 : rng() % hot);
                        if (t % 2 == 0 || i % 3 == 0) {
                            WriteGuard w = pool.fetch_write(p);  // both numbers change together
                            if (!w) {
                                ++empty;
                                continue;
                            }
                            write_u64(w.bytes, read_u64(w.bytes) + 1);
                            write_u64(w.bytes + 64, read_u64(w.bytes + 64) + 1);
                        } else {
                            ReadGuard r = pool.fetch_read(p);
                            if (!r) {
                                ++empty;
                                continue;
                            }
                            if (read_u64(r.bytes) != read_u64(r.bytes + 64)) ++torn;
                        }
                    }
                });
        }
        pool.flush_all();
        std::uint64_t total = 0, expected = 0;
        for (int t = 0; t < threads; ++t)
            for (int i = 0; i < 2000; ++i) expected += t % 2 == 0 || i % 3 == 0;
        std::byte buffer[page_size];
        for (PageId p = 0; p < 40; ++p) {
            disk.read(p, buffer);
            total += read_u64(buffer);
        }
        INFO(threads << " threads");
        CHECK(empty == 0);
        CHECK_MESSAGE(torn == 0, "a reader saw a page in the middle of a change");
        CHECK_MESSAGE(total == expected, "an increment under a write guard was lost");
    }
}
