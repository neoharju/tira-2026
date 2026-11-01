// Goals for week 27. Run in the release build: ./w27_bench [task]. Tasks 1-4
// have no goal here (task 2 prints CLOCK against LRU): their tests are the goal. Task 5's goal is a hit
// ratio, the others are speedups. Every benchmark first checks your result: a
// wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include <algorithm>
#include <string>
#include <unordered_map>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w27;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

std::uint64_t read_u64(const std::byte* p) {
    std::uint64_t v;
    std::memcpy(&v, p, sizeof v);
    return v;
}

// Page numbers 0 ... pages - 1 with Zipf popularity.
std::vector<std::uint32_t> page_trace(std::size_t length, std::size_t pages, double alpha, std::uint64_t seed) {
    const auto keys = zipf_trace(length, pages, alpha, seed);
    std::unordered_map<std::uint64_t, std::uint32_t> id;
    std::vector<std::uint32_t> t(length);
    for (std::size_t i = 0; i < length; ++i) t[i] = id.emplace(keys[i], static_cast<std::uint32_t>(id.size())).first->second;
    return t;
}

// A buffer pool reduced to its replacement decisions: page table, pins (the
// last 8 pages stay pinned) and the replacer. Returns the misses, or
// UINT64_MAX if evict() failed while frames were evictable.
template <class Replacer>
std::uint64_t replay(Replacer& r, std::size_t frames, std::size_t pages, const std::vector<std::uint32_t>& trace) {
    constexpr std::uint32_t none = UINT32_MAX;
    constexpr std::size_t held = 8;
    std::vector<std::uint32_t> frame_of(pages, none), page_in(frames, none), pins(frames, 0);
    std::uint32_t ring[held];
    std::fill(ring, ring + held, none);
    std::size_t used = 0;
    std::uint64_t misses = 0;
    for (std::size_t i = 0; i < trace.size(); ++i) {
        const std::uint32_t p = trace[i];
        std::uint32_t f = frame_of[p];
        if (f == none) {
            ++misses;
            if (used < frames) {
                f = static_cast<std::uint32_t>(used++);
            } else {
                const auto v = r.evict();
                if (!v || pins[*v] != 0) return UINT64_MAX;
                f = *v;
                frame_of[page_in[f]] = none;
            }
            page_in[f] = p;
            frame_of[p] = f;
        }
        r.record_access(f);
        if (pins[f]++ == 0) r.set_evictable(f, false);
        std::uint32_t& slot = ring[i % held];  // unpin the page pinned 8 accesses ago
        if (slot != none && --pins[slot] == 0) r.set_evictable(slot, true);
        slot = f;
    }
    return misses;
}

bool bench_clock() {
    const std::string_view task = "task2 CLOCK replacement";
    const std::size_t frames = 4096, pages = 65536;
    const auto trace = page_trace(4'000'000, pages, 0.9, 27);
    std::uint64_t clock_misses = 0, lru_misses = 0;
    {
        ClockReplacer c(frames);
        baseline::LruReplacer l(frames);
        clock_misses = replay(c, frames, pages, trace);
        lru_misses = replay(l, frames, pages, trace);
    }
    if (clock_misses == UINT64_MAX) return wrong(task, "evict() returned no frame, or a pinned one");
    if (clock_misses > lru_misses * 13 / 10 || clock_misses < lru_misses * 7 / 10) return wrong(task, "far more or fewer misses than LRU");
    auto t = tira::compare(
        [&] {
            baseline::LruReplacer l(frames);
            tira::keep(replay(l, frames, pages, trace));
        },
        [&] {
            ClockReplacer c(frames);
            tira::keep(replay(c, frames, pages, trace));
        },
        7);
    std::println("{:<32} LRU {:8.2f} ms  CLOCK {:8.2f} ms  {:.2f}x (no goal: the tests are the goal)", task, t.baseline * 1e3, t.yours * 1e3, t.speedup());
    std::println("      hit ratio: CLOCK {:.1f} %, LRU {:.1f} %", 100.0 - 100.0 * static_cast<double>(clock_misses) / static_cast<double>(trace.size()),
                 100.0 - 100.0 * static_cast<double>(lru_misses) / static_cast<double>(trace.size()));
    return true;
}

bool bench_wtinylfu() {
    // The frequency sketch of task 4 must work first.
    {
        FrequencySketch s(64, 1000);
        for (int i = 0; i < 10; ++i) s.increment(1);
        if (s.estimate(1) != 10) {
            std::println("task5: your FrequencySketch of task 4 does not work yet, so W-TinyLFU is not measured");
            return false;
        }
    }
    struct Trace {
        std::string name;
        std::vector<std::uint64_t> keys;
        double goal;  // hit ratio in %
    };
    const std::size_t capacity = 10000;
    const std::vector<Trace> traces{
        {"Zipf 0.8", zipf_trace(4'000'000, 1 << 20, 0.8, 1), 31.0},
        {"Zipf 0.9 with scans", scan_trace(4'000'000, 1 << 20, 0.9, 50000, 30000, 2), 28.5},
        {"loop", loop_trace(2'000'000, capacity * 5 / 4), 77.5},
        {"shifting Zipf", shifting_trace(4'000'000, 1 << 20, 0.9, 1'000'000, 3), 43.5},
    };
    bool all = true;
    for (const Trace& t : traces) {
        baseline::LruCache lru(capacity);
        WTinyLfu<> mine(capacity);
        const double l = 100 * hit_ratio(lru, t.keys), m = 100 * hit_ratio(mine, t.keys);
        const bool ok = m >= t.goal;
        all = all && ok;
        std::println("task5 W-TinyLFU, {:<20} LRU {:5.1f} %  yours {:5.1f} %  goal {:5.1f} %  {}", t.name, l, m, t.goal, ok ? "ok" : "BELOW GOAL");
    }
    return all;
}

bool bench_blocked() {
    const std::string_view task = "task6 blocked sketch";
    {  // the counters of a small sketch, against a scalar model of the rules
        BlockedSketch s(64, 1'000'000'000);
        std::vector<std::uint8_t> model(64 * 64, 0);
        std::mt19937_64 rng(6);
        for (int i = 0; i < 100000; ++i) {
            const std::uint64_t key = rng() % 5000, h = mix(key);
            std::uint8_t* b = model.data() + 64 * (h & 63);
            unsigned m = 255;
            for (unsigned r = 0; r < 4; ++r) m = std::min<unsigned>(m, b[16 * r + ((h >> (32 + 4 * r)) & 15)]);
            for (unsigned r = 0; r < 4; ++r) {
                std::uint8_t& c = b[16 * r + ((h >> (32 + 4 * r)) & 15)];
                if (c == m && c < 255) ++c;
            }
            s.increment(key);
            if (s.estimate(key) != std::min(m + 1, 255u)) return wrong(task, "an estimate is not the one of the rules");
        }
    }
    std::mt19937_64 rng(66);
    std::vector<std::uint64_t> keys(4'000'000);
    for (auto& k : keys) k = rng() % 50'000'000;
    auto run = [&](auto& sketch) {
        unsigned s = 0;
        for (std::uint64_t k : keys) {
            sketch.increment(k);
            s += sketch.estimate(k ^ 1);
        }
        tira::keep(s);
    };
    // In memory the gain is the layout (one cache miss instead of four); in
    // the L2 cache it is the instructions (no branches in the update).
    bool ok = true;
    for (const auto& size : {std::pair{"task6 blocked sketch, 64 MB", std::size_t{1} << 26}, std::pair{"task6 blocked sketch, 64 KB", std::size_t{1} << 16}}) {
        const std::size_t counters = size.second;  // (Clang's OpenMP cannot capture a structured binding)
        auto t = tira::compare(
            [&] {
                baseline::CountMinSketch s(counters / 4);
                run(s);
            },
            [&] {
                BlockedSketch s(counters / 64, ~std::size_t{0});
                run(s);
            },
            5);
        ok = tira::report(size.first, t, 1.6) && ok;
    }
    return ok;
}

// Every thread fetches pages of its own Zipf trace, checks the page number
// written in the page and unpins it.
template <class Pool>
bool run_threads(Pool& pool, const std::vector<std::vector<std::uint32_t>>& traces) {
    bool ok = true;
#pragma omp parallel reduction(&& : ok)
    {
        const auto& trace = traces[static_cast<std::size_t>(omp_get_thread_num()) % traces.size()];
        for (std::uint32_t p : trace) {
            const std::byte* b = pool.fetch(p);
            ok = ok && b != nullptr && read_u64(b) == p && pool.unpin(p, false);
        }
    }
    return ok;
}

bool bench_sharded() {
    const std::string_view task = "task7 sharded pool, 4 threads";
    const std::size_t pages = 1 << 15, frames = 1 << 13;
    Disk disk(pages);
    for (std::size_t p = 0; p < pages; ++p) {
        const PageId page = disk.allocate();
        std::byte b[page_size] = {};
        std::memcpy(b, &page, sizeof page);
        disk.write(page, b);
    }
    std::vector<std::vector<std::uint32_t>> traces;
    for (unsigned t = 0; t < tira::threads(); ++t) traces.push_back(page_trace(250'000, pages, 1.0, 100 + t));
    {
        ShardedPool pool(frames, 64, disk);
        if (pool.shards.size() != 64) return wrong(task, "the pool does not have 64 shards");
        if (!run_threads(pool, traces)) return wrong(task, "a fetch returned the wrong page or failed");
    }
    auto t = tira::compare(
        [&] {
            baseline::LockedPool pool(frames, disk);
            tira::keep(run_threads(pool, traces));
        },
        [&] {
            ShardedPool pool(frames, 64, disk);
            tira::keep(run_threads(pool, traces));
        },
        5);
    return tira::report(task, t, 2.5);
}

bool bench_guards() {
    const std::string_view task = "task8 read latches, 4 threads";
    Disk disk(64);
    for (int p = 0; p < 64; ++p) disk.allocate();
    ShardedPool pool(256, 16, disk);
    {
        ReadGuard a = pool.fetch_read(1), b = pool.fetch_read(1);
        if (!a || !b) return wrong(task, "two read guards of one page");
    }
    // Every thread reads the root page of a tree again and again, with shared
    // or with exclusive latches. A long read computes a checksum of the page
    // (a chain of dependent steps, about 1 µs); a short read takes 8 bytes.
    auto work = [&](bool read, bool long_read, int rounds) {
        std::uint64_t s = 0;
#pragma omp parallel reduction(+ : s)
        for (int i = 0; i < rounds; ++i) {
            ReadGuard r;
            WriteGuard w;
            const std::byte* bytes = read ? (r = pool.fetch_read(0)).bytes : (w = pool.fetch_write(0)).bytes;
            if (!bytes) continue;
            std::uint64_t h = 0xcbf29ce484222325ULL;
            for (std::size_t j = 0; j < (long_read ? page_size : 8); j += 8) h = (h ^ read_u64(bytes + j)) * 0x100000001b3ULL;
            s += h;
        }
        return s;
    };
    auto t = tira::compare([&] { tira::keep(work(false, true, 30'000)); }, [&] { tira::keep(work(true, true, 30'000)); }, 5);
    const bool ok = tira::report(task, t, 1.8);
    auto s = tira::compare([&] { tira::keep(work(false, false, 30'000)); }, [&] { tira::keep(work(true, false, 30'000)); }, 5);
    std::println("      a short read of 8 bytes: {:.2f}x (no goal: then the mutex of the shard decides)", s.speedup());
    return ok;
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task2", bench_clock}, {"task5", bench_wtinylfu}, {"task6", bench_blocked}, {"task7", bench_sharded}, {"task8", bench_guards}}};
    return b.run(argc, argv);
}
