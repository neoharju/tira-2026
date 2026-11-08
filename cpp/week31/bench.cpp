// Speed goals for week 31. Tasks 1, 2, 3 and 5 have no goal (their tests are
// the goal): their benchmarks print speeds, and that of task 2 compares your
// skip list with std::map. `store` runs the whole key-value store and prints
// its amplification (no goal). Run in the release build: ./w31_bench [task].
// Every benchmark first checks your result: a wrong result is not timed. The
// goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <algorithm>
#include <map>
#include <random>
#include <type_traits>
#include <unordered_map>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w31;

namespace {

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<34} WRONG: {} (run the tests)", task, what);
    return false;
}

bool bench1() {
    const std::string_view task = "task1 log, 1M records of 100 bytes";
    std::mt19937_64 rng(311);
    std::vector<std::string> payloads(1'000'000);
    for (auto& p : payloads) p = random_value(rng, 100, 100);
    std::string log;
    const double write = tira::seconds([&] {
        for (const auto& p : payloads) append_record(log, p);
    });
    Recovered r;
    const double read = tira::seconds([&] { r = recover(log); });
    if (r.records != payloads) return wrong(task, "recover does not give the records back");
    const double mb = static_cast<double>(log.size()) / 1e6;
    std::println("{:<34} append {:.0f} MB/s, recover {:.0f} MB/s (no goal: the tests are the goal)", task, mb / write, mb / read);
    return true;
}

bool bench2() {
    const std::string_view task = "task2 memtable, 1M adds + 1M gets";
    const auto writes = random_writes(1'000'000, 0, 0.1, 312, 1, 0, 30);
    std::mt19937_64 rng(313);
    std::vector<Key> probes(1'000'000);
    for (auto& k : probes) k = rng() % 2 ? writes[rng() % writes.size()].key : rng();
    {
        MemTable m;
        baseline::MapMemTable b;
        for (std::size_t i = 0; i < 100'000; ++i) m.add(writes[i].key, writes[i].seq, writes[i].kind, writes[i].value), b.add(writes[i].key, writes[i].seq, writes[i].kind, writes[i].value);
        for (std::size_t i = 0; i < 100'000; ++i)
            if (m.get(probes[i], max_seq) != b.get(probes[i], max_seq)) return wrong(task, "a get gives another answer than std::map");
    }
    std::size_t bytes = 0;
    auto run = [&](auto table) {
        for (const Entry& e : writes) table.add(e.key, e.seq, e.kind, e.value);
        std::size_t found = 0;
        for (const Key k : probes) found += table.get(k, max_seq).has_value();
        if constexpr (std::is_same_v<decltype(table), MemTable>) bytes = table.bytes();
        return found;
    };
    const auto t = tira::compare([&] { tira::keep(run(baseline::MapMemTable{})); }, [&] { tira::keep(run(MemTable{})); }, 3);
    std::println("{:<34} yours {:.0f} ms, std::map {:.0f} ms; your list takes {:.1f} bytes per version (no goal: the tests are the goal)", task, t.yours * 1e3,
                 t.baseline * 1e3, static_cast<double>(bytes) / static_cast<double>(writes.size()));
    return true;
}

bool bench3() {
    const std::string_view task = "task3 1M lookups in a table";
    const auto model = sorted(random_writes(1'000'000, 0, 0.1, 314, 1, 0, 60));
    const Table t = make_table(model);
    std::mt19937_64 rng(315);
    std::vector<Key> probes(1'000'000);
    for (auto& k : probes) k = model[rng() % model.size()].key;
    for (std::size_t i = 0; i < 1000; ++i)
        if (!t.get(probes[i], max_seq)) return wrong(task, "get does not find a key of the table");
    std::size_t found = 0;
    const double s = tira::seconds([&] {
        for (const Key k : probes) found += t.get(k, max_seq).has_value();
    });
    tira::keep(found);
    std::println("{:<34} {:.0f} ns per lookup, {} data blocks of 4 KB (no goal: the tests are the goal)", task, s * 1e9 / static_cast<double>(probes.size()),
                 t.index.size());
    return true;
}

bool bench4() {
    const std::string_view task = "task4 CRC-32C of 4 KB blocks";
    std::mt19937_64 rng(316);
    const std::string data = random_value(rng, 1 << 20, 1 << 20);  // 1 MB: in the L2 cache
    for (std::size_t n : {0, 1, 7, 8, 9, 100, 4096})
        if (crc32c(std::string_view(data).substr(3, n)) != baseline::crc32c(std::string_view(data).substr(3, n))) return wrong(task, "a checksum is wrong");
    auto run = [&](auto crc, int rounds) {
        std::uint32_t x = 0;
        for (int r = 0; r < rounds; ++r)
            for (std::size_t at = 0; at + 4096 <= data.size(); at += 4096) x ^= crc(std::string_view(data).substr(at, 4096), 0);
        return x;
    };
    const auto t = tira::compare([&] { tira::keep(run(baseline::crc32c, 16)); }, [&] { tira::keep(run([](std::string_view d, std::uint32_t c) { return crc32c(d, c); }, 16)); }, 5);
    const bool ok = tira::report(task, t, 10.0);
    std::println("      that is {:.1f} GB/s (the baseline {:.2f} GB/s)", 16 * 1.048576e-3 / t.yours, 16 * 1.048576e-3 / t.baseline);
    return ok;
}

// 8 overlapping tables with 2,000,000 versions of 500,000 keys, and 4
// snapshots.
CompactionJob big_job(std::size_t versions, Key keys, std::uint64_t seed) {
    CompactionJob job;
    const auto writes = random_writes(versions, keys, 0.1, seed, 1, 0, 100);
    job.inputs = overlapping_tables(writes, 8, seed + 1);
    for (Seq s = 1; s <= 4; ++s) job.snapshots.push_back(s * versions / 5);
    job.target_size = 2 << 20;
    return job;
}

const CompactionJob& job() {
    static const CompactionJob j = big_job(2'000'000, 500'000, 317);
    return j;
}

std::size_t input_bytes(const CompactionJob& j) {
    std::size_t bytes = 0;
    for (const Table& t : j.inputs) bytes += t.size();
    return bytes;
}

bool bench5() {
    const std::string_view task = "task5 compaction of 8 tables";
    const auto& j = job();
    std::vector<std::string> out = compact(j);  // a first run, not timed
    if (out.empty()) return wrong(task, "compact gives no tables");
    std::vector<double> times;
    for (int r = 0; r < 3; ++r) times.push_back(tira::seconds([&] { out = compact(j); }));
    std::ranges::sort(times);
    const double s = times[1];  // the median
    std::size_t versions = 0, bytes = 0;
    for (const auto& t : out) versions += Table::open(std::make_shared<const std::string>(t)).versions, bytes += t.size();
    std::println("{:<34} {:.0f} ms: {:.0f} MB read, {:.0f} MB in {} tables written, {} of {} versions kept (no goal: the tests are the goal)", task, s * 1e3,
                 static_cast<double>(input_bytes(j)) / 1e6, static_cast<double>(bytes) / 1e6, out.size(), versions, 2'000'000);
    return true;
}

bool bench6() {
    const std::string_view task = "task6 filter of 64 MB, 1M lookups";
    // 53 million keys, 10 bits per key: a filter of 64 MB, larger than the L2 cache.
    const std::size_t n = (std::size_t{64} << 20) * 8 / 10;
    SplitBlockBloom f = SplitBlockBloom::for_keys(n);
    baseline::BloomFilter classic(n);
    std::mt19937_64 rng(318);
    std::vector<std::uint64_t> in(n);
    for (auto& h : in) h = hash_key(rng());
    for (const auto h : in) f.insert(h), classic.insert(h);
    std::vector<std::uint64_t> probes(1'000'000);
    for (auto& h : probes) h = rng() % 2 ? in[rng() % n] : hash_key(rng());  // half of them inserted
    for (std::size_t i = 0; i < 1000; ++i)
        if (!f.may_contain(in[i * 7919])) return wrong(task, "an inserted key is not in the filter");
    std::size_t positives = 0;
    for (std::size_t i = 0; i < 100'000; ++i) positives += f.may_contain(hash_key(rng()));
    if (positives > 2000) return wrong(task, "too many false positives");
    const auto t = tira::compare(
        [&] {
            std::size_t c = 0;
            for (const auto h : probes) c += classic.may_contain(h);
            tira::keep(c);
        },
        [&] {
            std::size_t c = 0;
            for (const auto h : probes) c += f.may_contain(h);
            tira::keep(c);
        },
        7);
    return tira::report(task, t, 1.5);
}

bool bench7() {
    const std::string_view task = "task7 AVX2 filter in L2, 4M ops";
    const std::size_t n = 1'000'000;  // 1.2 MB: in the L2 cache
    std::mt19937_64 rng(319);
    std::vector<std::uint64_t> in(n), probes(4'000'000);
    for (auto& h : in) h = hash_key(rng());
    for (auto& h : probes) h = rng() % 2 ? in[rng() % n] : hash_key(rng());
    SplitBlockBloom a = SplitBlockBloom::for_keys(n), b = SplitBlockBloom::for_keys(n);
    for (const auto h : in) a.insert(h), b.insert_avx2(h);
    for (std::size_t i = 0; i < a.blocks.size(); ++i)
        for (int w = 0; w < 8; ++w)
            if (a.blocks[i].word[w] != b.blocks[i].word[w]) return wrong(task, "insert_avx2 sets other bits than insert");
    for (std::size_t i = 0; i < 100'000; ++i)
        if (a.may_contain(probes[i]) != a.may_contain_avx2(probes[i])) return wrong(task, "may_contain_avx2 gives another answer than may_contain");
    const auto t = tira::compare(
        [&] {
            std::size_t c = 0;
            for (const auto h : probes) c += a.may_contain(h);
            tira::keep(c);
        },
        [&] {
            std::size_t c = 0;
            for (const auto h : probes) c += a.may_contain_avx2(h);
            tira::keep(c);
        },
        9);
    const bool ok = tira::report(task, t, 1.8);
    const auto u = tira::compare(
        [&] {
            SplitBlockBloom x = SplitBlockBloom::for_keys(n);
            for (const auto h : in) x.insert(h);
            tira::keep(x.blocks[0].word[0]);
        },
        [&] {
            SplitBlockBloom x = SplitBlockBloom::for_keys(n);
            for (const auto h : in) x.insert_avx2(h);
            tira::keep(x.blocks[0].word[0]);
        },
        9);
    std::println("      inserts: AVX2 against your scalar insert {:.2f}x (no goal)", u.speedup());
    return ok;
}

bool bench8() {
    const std::string_view task = "task8 subcompactions";
    const auto& j = job();
    const auto a = compact(j);
    if (a.empty()) return wrong(task, "your compact of task 5 does not work yet");
    const auto b = compact_parallel(j);
    std::vector<Entry> va, vb;
    for (const auto& x : a) {
        const auto e = table_entries(Table::open(std::make_shared<const std::string>(x)));
        va.insert(va.end(), e.begin(), e.end());
    }
    for (const auto& x : b) {
        const auto e = table_entries(Table::open(std::make_shared<const std::string>(x)));
        vb.insert(vb.end(), e.begin(), e.end());
    }
    if (va != vb) return wrong(task, "the versions are not those of your compact");
    const auto t = tira::compare([&] { tira::keep(compact(j).size()); }, [&] { tira::keep(compact_parallel(j).size()); }, 5);
    return tira::report(task, t, 2.5);
}

// The whole store: 2 million writes of 100-byte values to 1 million keys.
bool bench_store() {
    const std::string_view task = "store, 2M writes, 1M keys";
    for (const bool filters : {true, false}) {
        Lsm db({.use_filters = filters});
        std::mt19937_64 rng(320);
        std::unordered_map<Key, std::string> latest;
        const double w = tira::seconds([&] {
            for (int i = 0; i < 2'000'000; ++i) {
                const Key k = rng() % 1'000'000;
                std::string v = random_value(rng, 100, 100);
                db.put(k, v);
                latest[k] = std::move(v);
            }
        });
        std::size_t live = 0;
        for (const auto& [k, v] : latest) live += 8 + v.size();
        const LsmStats before = db.stats();
        std::size_t found = 0;
        const int gets = 200'000;
        const double r = tira::seconds([&] {
            for (int i = 0; i < gets; ++i) found += db.get(rng() % 2'000'000).has_value();  // half of the keys were never written
        });
        if (found == 0) return wrong(task, "the store finds nothing");
        const LsmStats& s = db.stats();
        if (filters) {
            std::println("{:<34} writes {:.2f} s, levels {}", task, w, db.shape());
            std::println("      write amplification {:.1f}, space amplification {:.2f}", s.write_amplification(),
                         static_cast<double>(db.table_bytes()) / static_cast<double>(live));
        }
        std::println("      {}: {:.2f} us per get, {:.2f} block reads per get", filters ? "with filters   " : "without filters", r * 1e6 / gets,
                     static_cast<double>(s.table_gets - before.table_gets) / gets);
    }
    return true;
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench1},
                        {"task2", bench2},
                        {"task3", bench3},
                        {"task4", bench4},
                        {"task5", bench5},
                        {"task6", bench6},
                        {"task7", bench7},
                        {"task8", bench8},
                        {"store", bench_store}}};
    return b.run(argc, argv);
}
