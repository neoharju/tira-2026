// Tests for week 31. Run one task's tests with: ./w31_test -tc="task3*"
// The tests of each task use the given code, not your other tasks; only the
// test of task 8 compares with your compact of task 5. Task 8 uses threads:
// run its tests in the tsan preset too. The test case "store" runs the whole
// key-value store of lsm.hpp, so it passes when tasks 1, 2, 3 and 5 work.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <array>
#include <map>
#include <numeric>
#include <random>
#include <set>
#include <string>
#include <vector>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w31;
using namespace std::string_literals;

namespace {

// The newest version of key with seq <= snapshot in versions sorted in the
// internal order.
std::optional<Lookup> model_get(const std::vector<Entry>& v, Key key, Seq snapshot) {
    const auto it = std::partition_point(v.begin(), v.end(), [&](const Entry& e) { return internal_less(e.key, e.seq, key, snapshot); });
    if (it == v.end() || it->key != key) return std::nullopt;
    return Lookup{it->kind, it->value};
}

std::string show(const std::optional<Lookup>& r) {
    if (!r) return "nothing";
    return r->kind == Kind::del ? "a delete"s : "a put of " + std::to_string(r->value.size()) + " bytes";
}

// The keys to look up: those of the versions, their neighbours, and the ends.
std::vector<Key> probe_keys(const std::vector<Entry>& v, std::mt19937_64& rng) {
    std::vector<Key> keys = {0, 1, ~Key{0}, ~Key{0} - 1};
    for (std::size_t i = 0; i < std::min<std::size_t>(v.size(), 3000); ++i) {
        const Key k = v[rng() % v.size()].key;
        keys.push_back(k);
        keys.push_back(k + 1);
        keys.push_back(k - 1);
    }
    return keys;
}

// Compaction by the rules of compaction.hpp, written simply: the expected
// versions, and the expected tables.
std::vector<Entry> model_compact(std::vector<Entry> all, const std::vector<Seq>& snapshots, bool bottom) {
    all = sorted(std::move(all));
    std::vector<Entry> out;
    for (std::size_t i = 0; i < all.size();) {
        std::size_t j = i;
        while (j < all.size() && all[j].key == all[i].key) ++j;
        std::vector<Entry> kept;
        for (std::size_t k = i; k < j; ++k) {
            bool keep = k == i;
            if (!keep) {
                const auto s = std::ranges::lower_bound(snapshots, all[k].seq);  // the smallest snapshot >= seq(v(k))
                keep = s != snapshots.end() && *s < all[k - 1].seq;
            }
            if (keep) kept.push_back(all[k]);
        }
        if (bottom)
            while (!kept.empty() && kept.back().kind == Kind::del) kept.pop_back();
        out.insert(out.end(), kept.begin(), kept.end());
        i = j;
    }
    return out;
}

std::vector<std::string> model_tables(const std::vector<Entry>& kept, std::size_t target_size) {
    std::vector<std::string> out;
    TableBuilder b;
    for (std::size_t k = 0; k < kept.size(); ++k) {
        if (!b.empty() && kept[k].key != kept[k - 1].key && b.data_bytes() >= target_size) out.push_back(b.finish());
        b.add(kept[k].key, kept[k].seq, kept[k].kind, kept[k].value);
    }
    if (!b.empty()) out.push_back(b.finish());
    return out;
}

std::vector<Entry> all_versions(const std::vector<std::string>& tables) {
    std::vector<Entry> out;
    for (const std::string& bytes : tables) {
        const auto t = table_entries(Table::open(std::make_shared<const std::string>(bytes)));
        out.insert(out.end(), t.begin(), t.end());
    }
    return out;
}

// The size of the data blocks of a table: the filter block starts there.
std::uint64_t data_size(const std::string& table) { return get_u64(table.data() + table.size() - footer_size); }

struct Job {
    std::vector<Entry> writes;
    CompactionJob job;
};

// Compaction jobs: overlapping inputs, many versions per key, deletes,
// snapshots, and small and large tables.
std::vector<Job> test_jobs(std::uint64_t seed) {
    std::vector<Job> jobs;
    std::mt19937_64 rng(seed);
    const std::size_t sizes[] = {1, 50, 2000, 20'000};
    for (const std::size_t n : sizes) {
        for (const int variant : {0, 1, 2, 3}) {
            Job j;
            const Key keys = variant == 3 ? 0 : 1 + n / (variant + 2);  // variant 3: random 64-bit keys
            j.writes = random_writes(n, keys, variant == 1 ? 0.5 : 0.2, rng());
            j.job.inputs = overlapping_tables(j.writes, 1 + rng() % 8, rng());
            const std::size_t snaps = variant == 0 ? 0 : variant == 2 ? 50 : 3;
            for (std::size_t s = 0; s < snaps; ++s) j.job.snapshots.push_back(rng() % (n + 2));
            std::ranges::sort(j.job.snapshots);
            j.job.snapshots.erase(std::unique(j.job.snapshots.begin(), j.job.snapshots.end()), j.job.snapshots.end());
            j.job.bottom = (variant + n) % 2 == 0;
            const std::size_t targets[] = {2 << 20, 16 << 10, 4096, 1};
            j.job.target_size = targets[(variant + n / 50) % 4];
            jobs.push_back(std::move(j));
        }
    }
    return jobs;
}

// The rules of the split-block filter, written out.
std::size_t spec_block(std::uint64_t h, std::size_t blocks) { return static_cast<std::size_t>(((h >> 32) * blocks) >> 32); }
std::array<std::uint32_t, 8> spec_mask(std::uint64_t h) {
    std::array<std::uint32_t, 8> m{};
    const auto x = static_cast<std::uint32_t>(h);
    for (int i = 0; i < 8; ++i) m[i] = std::uint32_t{1} << ((x * bloom_salt[i]) >> 27);
    return m;
}
std::vector<BloomBlock> spec_filter(const std::vector<std::uint64_t>& hashes, std::size_t blocks) {
    std::vector<BloomBlock> f(blocks, BloomBlock{});
    for (const std::uint64_t h : hashes) {
        const auto m = spec_mask(h);
        for (int i = 0; i < 8; ++i) f[spec_block(h, blocks)].word[i] |= m[i];
    }
    return f;
}
bool same_words(const std::vector<BloomBlock>& a, const std::vector<BloomBlock>& b) {
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i)
        for (int w = 0; w < 8; ++w)
            if (a[i].word[w] != b[i].word[w]) return false;
    return true;
}
std::vector<std::uint64_t> random_hashes(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<std::uint64_t> v(n);
    for (auto& h : v) h = hash_key(rng());
    return v;
}

template <class Insert, class Query>
void check_filter(Insert insert, Query query) {
    SUBCASE("one key sets one bit in each word of its block") {
        for (const std::size_t blocks : {1, 3, 64, 1000}) {
            for (const std::uint64_t h : random_hashes(300, blocks)) {
                SplitBlockBloom f(blocks);
                insert(f, h);
                if (!same_words(f.blocks, spec_filter({h}, blocks))) FAIL("the bits of the hash " << h << " are wrong (" << blocks << " blocks)");
                CHECK(query(f, h));
            }
        }
    }
    SUBCASE("the bits of many keys, no false negatives and few false positives") {
        const auto keys = random_hashes(100'000, 7);
        SplitBlockBloom f = SplitBlockBloom::for_keys(keys.size(), 10.0);
        for (const auto h : keys) insert(f, h);
        CHECK_MESSAGE(same_words(f.blocks, spec_filter(keys, f.blocks.size())), "the filter has other bits than the rules give");
        bool all = true;
        for (const auto h : keys) all = all && query(f, h);
        CHECK_MESSAGE(all, "a key that was inserted is not in the filter (a false negative)");
        std::size_t positives = 0;
        const auto others = random_hashes(1'000'000, 8);
        for (const auto h : others) positives += query(f, h);
        const double rate = static_cast<double>(positives) / static_cast<double>(others.size());
        INFO("false positive rate " << rate * 100 << " %");
        CHECK(rate > 0.004);
        CHECK(rate < 0.02);
    }
}

}  // namespace

TEST_CASE("task1 write-ahead log") {
    SUBCASE("the format of a record") {
        std::string log;
        append_record(log, "abc");
        REQUIRE(log.size() == 11);
        CHECK(get_u32(log.data() + 4) == 3);
        CHECK(log.substr(8) == "abc");
        CHECK_MESSAGE(get_u32(log.data()) == baseline::crc32c(std::string_view(log).substr(4)), "the crc should cover the length and the payload");
        append_record(log, "");
        REQUIRE(log.size() == 19);
        CHECK(get_u32(log.data() + 11) == baseline::crc32c("\0\0\0\0"s));
    }
    SUBCASE("the records come back") {
        std::mt19937_64 rng(1);
        std::string log;
        std::vector<std::string> want;
        for (int i = 0; i < 2000; ++i) {
            want.push_back(i == 1000 ? random_value(rng, 1 << 20, 1 << 20) : random_value(rng, 0, i % 7 == 0 ? 0 : 300));
            append_record(log, want.back());
        }
        const Recovered r = recover(log);
        CHECK(r.records == want);
        CHECK(r.valid_bytes == log.size());
        CHECK(recover("").records.empty());
    }
    std::mt19937_64 rng(2);
    std::string log;
    std::vector<std::string> payloads;
    std::vector<std::size_t> ends;  // where each record ends
    for (int i = 0; i < 30; ++i) {
        payloads.push_back(random_value(rng, 0, 40));
        append_record(log, payloads.back());
        ends.push_back(log.size());
    }
    SUBCASE("a log that ends inside a record") {
        for (std::size_t cut = 0; cut <= log.size(); ++cut) {
            const std::size_t complete = static_cast<std::size_t>(std::ranges::upper_bound(ends, cut) - ends.begin());
            const Recovered r = recover(std::string_view(log).substr(0, cut));
            if (r.records != std::vector(payloads.begin(), payloads.begin() + static_cast<std::ptrdiff_t>(complete)) || r.valid_bytes != (complete ? ends[complete - 1] : 0))
                FAIL("a log cut after " << cut << " bytes should give " << complete << " records and " << (complete ? ends[complete - 1] : 0) << " valid bytes");
        }
    }
    SUBCASE("a damaged byte stops the recovery") {
        for (int trial = 0; trial < 3000; ++trial) {
            std::string damaged = log;
            const std::size_t at = rng() % log.size();
            damaged[at] = static_cast<char>(damaged[at] ^ (1 << (rng() % 8)));
            const std::size_t bad = static_cast<std::size_t>(std::ranges::upper_bound(ends, at) - ends.begin());  // the damaged record
            const Recovered r = recover(damaged);
            if (r.records != std::vector(payloads.begin(), payloads.begin() + static_cast<std::ptrdiff_t>(bad)) || r.valid_bytes != (bad ? ends[bad - 1] : 0))
                FAIL("a bit flipped in record " << bad << " should give the " << bad << " records before it");
        }
    }
    SUBCASE("zeros and huge lengths are not records") {
        std::string z;
        append_record(z, "x");
        z += std::string(64, '\0');
        CHECK(recover(z).records.size() == 1);
        CHECK(recover(z).valid_bytes == 9);
        std::string huge;
        put_u32(huge, 0);
        put_u32(huge, 0xFFFF'FFF0U);  // a length of almost 4 GB, but only 3 bytes follow
        huge += "abc";
        CHECK(recover(huge).records.empty());
        CHECK(recover(huge).valid_bytes == 0);
    }
    SUBCASE("crashes keep every synced record") {
        for (int trial = 0; trial < 300; ++trial) {
            SimFile file;
            std::vector<std::string> written;
            std::size_t synced_records = 0;
            for (int i = 0; i < 40; ++i) {
                std::string record;
                written.push_back(random_value(rng, 0, 60));
                append_record(record, written.back());
                file.append(record);
                if (rng() % 4 == 0) {
                    file.sync();
                    synced_records = written.size();
                }
            }
            std::string disk = file.crash(rng);
            Recovered r = recover(disk);
            REQUIRE(r.records.size() >= synced_records);
            REQUIRE(r.records.size() <= written.size());
            CHECK(r.records == std::vector(written.begin(), written.begin() + static_cast<std::ptrdiff_t>(r.records.size())));
            // Cut the log to its valid prefix, and go on writing after it.
            disk.resize(r.valid_bytes);
            append_record(disk, "after the crash");
            r = recover(disk);
            REQUIRE(!r.records.empty());
            CHECK(r.records.back() == "after the crash");
        }
    }
}

TEST_CASE("task2 skip-list memtable") {
    SUBCASE("an empty memtable") {
        const MemTable m;
        CHECK(!m.get(5, max_seq));
        CHECK(m.size() == 0);
        m.validate();
    }
    SUBCASE("versions and snapshots") {
        MemTable m;
        m.add(7, 1, Kind::put, "a");
        m.add(7, 5, Kind::del, "");
        m.add(9, 2, Kind::put, "x");
        m.add(7, 3, Kind::put, "b");
        m.validate();
        CHECK(m.size() == 4);
        CHECK(!m.get(7, 0));
        CHECK(m.get(7, 1) == Lookup{Kind::put, "a"});
        CHECK(m.get(7, 2) == Lookup{Kind::put, "a"});
        CHECK(m.get(7, 4) == Lookup{Kind::put, "b"});
        CHECK(m.get(7, 5) == Lookup{Kind::del, ""});
        CHECK(m.get(7, max_seq) == Lookup{Kind::del, ""});
        CHECK(!m.get(8, max_seq));
        CHECK(!m.get(9, 1));
        CHECK(m.get(9, 2) == Lookup{Kind::put, "x"});
        const std::vector<Entry> want = {{7, 5, Kind::del, ""}, {7, 3, Kind::put, "b"}, {7, 1, Kind::put, "a"}, {9, 2, Kind::put, "x"}};
        CHECK(m.entries() == want);
    }
    SUBCASE("the shape of the list") {
        MemTable m(77), heights(77);
        std::vector<int> want;
        for (int i = 0; i < 5000; ++i) want.push_back(heights.random_height());
        const auto writes = random_writes(5000, 0, 0.1, 3);
        for (const Entry& e : writes) m.add(e.key, e.seq, e.kind, e.value);
        REQUIRE(m.nodes.size() == 5001);
        bool same = true;
        for (std::size_t i = 0; i < want.size(); ++i) same = same && m.nodes[i + 1].height == want[i];
        CHECK_MESSAGE(same, "node i should have the height of the i-th call of random_height()");
        CHECK(m.link.size() == static_cast<std::size_t>(MemTable::max_height + std::accumulate(want.begin(), want.end(), 0)));
        m.validate();
    }
    SUBCASE("random versions against a model") {
        for (const Key keys : {Key{1}, Key{50}, Key{5000}, Key{0}}) {
            CAPTURE(keys);
            auto writes = random_writes(20'000, keys, 0.2, keys + 4, 1, 0, 30);
            writes.push_back({0, 20'001, Kind::put, "zero"});
            writes.push_back({~Key{0}, 20'002, Kind::put, "max"});
            std::mt19937_64 rng(keys);
            std::ranges::shuffle(writes, rng);  // any order of the sequence numbers
            MemTable m(keys);
            for (const Entry& e : writes) m.add(e.key, e.seq, e.kind, e.value);
            m.validate();
            const auto model = sorted(writes);
            CHECK(m.entries() == model);
            for (const Key k : probe_keys(model, rng))
                for (const Seq s : {Seq{0}, rng() % 20'003, rng() % 20'003, max_seq}) {
                    const auto got = m.get(k, s);
                    if (got != model_get(model, k, s)) FAIL("get(" << k << ", " << s << ") gives " << show(got) << ", the model " << show(model_get(model, k, s)));
                }
        }
    }
}

TEST_CASE("task3 table lookup") {
    SUBCASE("an empty table") {
        const Table t = make_table({});
        CHECK(!t.get(1, max_seq));
        CHECK(!t.get(0, 0));
    }
    SUBCASE("lookups against a model") {
        std::mt19937_64 rng(5);
        for (const auto& size : {std::pair<std::size_t, Key>{1, 10}, {100, 30}, {5000, 2000}, {20'000, 40}, {3000, 0}}) {
            const std::size_t n = size.first;  // a plain variable: Clang's OpenMP cannot capture a structured binding
            const Key keys = size.second;
            for (const std::size_t block_size : {4096, 256, 40}) {
                CAPTURE(n);
                CAPTURE(keys);
                CAPTURE(block_size);
                const auto model = sorted(random_writes(n, keys, 0.2, rng(), 1, 0, 50));
                const Table t = make_table(model, block_size);
                for (const Key k : probe_keys(model, rng))
                    for (const Seq s : {Seq{0}, rng() % (n + 2), rng() % (n + 2), max_seq}) {
                        const auto got = t.get(k, s);
                        if (got != model_get(model, k, s)) FAIL("get(" << k << ", " << s << ") gives " << show(got) << ", the model " << show(model_get(model, k, s)));
                    }
            }
        }
    }
    SUBCASE("a damaged data block throws Corruption") {
        std::mt19937_64 rng(6);
        const auto model = sorted(random_writes(3000, 1000, 0.2, 9));
        const std::string bytes = *make_table(model).file;
        for (int trial = 0; trial < 300; ++trial) {
            std::string damaged = bytes;
            const std::size_t at = rng() % data_size(bytes);
            damaged[at] = static_cast<char>(damaged[at] ^ (1 << (rng() % 8)));
            const Table t = Table::open(std::make_shared<const std::string>(damaged));  // the index and the filter are fine
            std::size_t b = 0;
            while (t.index[b].offset + t.index[b].size <= at) ++b;
            CHECK_THROWS_AS((void)t.get(t.index[b].last_key, t.index[b].last_seq), Corruption);
        }
    }
    SUBCASE("a block with a correct crc but a wrong length throws Corruption") {
        std::string bytes = *make_table(std::vector<Entry>{{5, 1, Kind::put, "abc"}}).file;
        REQUIRE(bytes[16] == 3);  // the length of the value
        bytes[16] = 100;          // the value would go past the end of the block
        const std::string_view block = std::string_view(bytes).substr(0, 28);
        const std::uint32_t crc = crc32c(block.substr(0, 24));
        std::memcpy(bytes.data() + 24, &crc, 4);  // a correct crc for the wrong bytes
        const Table t = Table::open(std::make_shared<const std::string>(bytes));
        CHECK_THROWS_AS((void)t.get(5, max_seq), Corruption);
    }
}

TEST_CASE("task4 CRC-32C") {
    SUBCASE("known values") {
        CHECK(crc32c("") == 0);
        CHECK(crc32c("123456789") == 0xE3069283U);
        std::string up(32, '\0'), down(32, '\0');
        for (int i = 0; i < 32; ++i) up[i] = static_cast<char>(i), down[i] = static_cast<char>(31 - i);
        CHECK(crc32c(std::string(32, '\0')) == 0x8A9136AAU);  // the test values of RFC 3720 (iSCSI)
        CHECK(crc32c(std::string(32, '\xFF')) == 0x62A8AB43U);
        CHECK(crc32c(up) == 0x46DD794EU);
        CHECK(crc32c(down) == 0x113FDB5CU);
    }
    SUBCASE("random bytes at any address, and continued checksums") {
        std::mt19937_64 rng(10);
        const std::string buffer = random_value(rng, 5000, 5000);
        for (int trial = 0; trial < 20'000; ++trial) {
            const std::size_t at = rng() % 16, n = rng() % (trial % 10 == 0 ? 4000 : 70);
            const std::string_view data = std::string_view(buffer).substr(at, n);
            const std::uint32_t seed = trial % 3 == 0 ? 0 : static_cast<std::uint32_t>(rng());
            if (crc32c(data, seed) != baseline::crc32c(data, seed)) FAIL("crc32c of " << n << " bytes at offset " << at << " is wrong");
            const std::size_t cut = n ? rng() % n : 0;
            if (crc32c(data.substr(cut), crc32c(data.substr(0, cut))) != crc32c(data)) FAIL("crc32c(b, crc32c(a)) is not crc32c(a + b)");
        }
    }
}

TEST_CASE("task5 compaction") {
    SUBCASE("no input, and nothing kept") {
        CHECK(compact(CompactionJob{}).empty());
        CompactionJob all_deleted;
        all_deleted.inputs.push_back(make_table(std::vector<Entry>{{1, 2, Kind::del, ""}, {1, 1, Kind::put, "a"}, {4, 3, Kind::del, ""}}));
        all_deleted.bottom = true;
        CHECK(compact(all_deleted).empty());
        all_deleted.bottom = false;  // above the bottom the deletes stay: older data may be below
        CHECK(all_versions(compact(all_deleted)) == std::vector<Entry>{{1, 2, Kind::del, ""}, {4, 3, Kind::del, ""}});
        all_deleted.snapshots = {1};  // a reader at snapshot 1 sees the put
        all_deleted.bottom = true;
        CHECK(all_versions(compact(all_deleted)) == std::vector<Entry>{{1, 2, Kind::del, ""}, {1, 1, Kind::put, "a"}});
    }
    SUBCASE("the versions and the tables of the rules") {
        for (const Job& j : test_jobs(11)) {
            CAPTURE(j.writes.size());
            CAPTURE(j.job.inputs.size());
            CAPTURE(j.job.snapshots.size());
            CAPTURE(j.job.bottom);
            CAPTURE(j.job.target_size);
            const auto kept = model_compact(j.writes, j.job.snapshots, j.job.bottom);
            const auto got = compact(j.job);
            const auto versions = all_versions(got);
            if (versions != kept) FAIL("the output has " << versions.size() << " versions, the rules keep " << kept.size() << " (or some versions differ)");
            const auto want = model_tables(kept, j.job.target_size);
            CHECK_MESSAGE(got.size() == want.size(), "the output should have " << want.size() << " tables, not " << got.size());
            CHECK_MESSAGE(got == want, "the tables are not cut by rule 4");
        }
    }
}

TEST_CASE("task6 split-block Bloom filter") {
    check_filter([](SplitBlockBloom& f, std::uint64_t h) { f.insert(h); }, [](const SplitBlockBloom& f, std::uint64_t h) { return f.may_contain(h); });
}

TEST_CASE("task7 split-block Bloom filter with AVX2") {
    check_filter([](SplitBlockBloom& f, std::uint64_t h) { f.insert_avx2(h); }, [](const SplitBlockBloom& f, std::uint64_t h) { return f.may_contain_avx2(h); });
}

TEST_CASE("task8 subcompactions") {
    const auto jobs = test_jobs(12);
    for (const int threads : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(threads);
        CAPTURE(threads);
        for (const Job& j : jobs) {
            CAPTURE(j.writes.size());
            CAPTURE(j.job.target_size);
            const auto got = compact_parallel(j.job);
            if (all_versions(got) != model_compact(j.writes, j.job.snapshots, j.job.bottom)) FAIL("the versions are not those of the rules (and of compact)");
            std::size_t small = 0;
            for (std::size_t i = 0; i < got.size(); ++i) {
                const Table t = Table::open(std::make_shared<const std::string>(got[i]));
                REQUIRE_MESSAGE(t.versions > 0, "a table is empty");
                if (i > 0) {
                    const Table prev = Table::open(std::make_shared<const std::string>(got[i - 1]));
                    REQUIRE_MESSAGE(prev.largest < t.smallest, "the keys of two tables overlap, or the tables are not in order");
                }
                small += data_size(got[i]) < j.job.target_size;
            }
            CHECK_MESSAGE(small <= static_cast<std::size_t>(4 * threads), "too many small tables: use at most 4 parts per thread");
        }
    }
    omp_set_num_threads(static_cast<int>(tira::threads()));
}

TEST_CASE("store: the parts together") {
    const LsmOptions options{.memtable_bytes = 32 << 10, .level0_files = 4, .level1_bytes = 128 << 10, .target_size = 32 << 10};
    Lsm db(options);
    std::vector<Entry> history;  // every version, for the reads at snapshots
    std::map<Key, std::optional<std::string>> latest;
    std::vector<Seq> live;
    std::mt19937_64 rng(13);
    Seq seq = 0;
    auto check = [&](int samples) {
        const auto model = sorted(history);
        for (int i = 0; i < samples; ++i) {
            const Key k = rng() % 6000;
            const Seq s = live.empty() || rng() % 2 ? max_seq : live[rng() % live.size()];
            const auto want = model_get(model, k, s);
            const auto got = db.get(k, s);
            const std::optional<std::string> w = want && want->kind == Kind::put ? std::optional(want->value) : std::nullopt;
            if (got != w) FAIL("get(" << k << ", " << s << ") is wrong");
        }
    };
    for (int i = 1; i <= 120'000; ++i) {
        const Key k = rng() % 6000;
        if (rng() % 5 == 0) {
            db.del(k);
            history.push_back({k, ++seq, Kind::del, {}});
        } else {
            const std::string v = random_value(rng, 0, 60);
            db.put(k, v);
            history.push_back({k, ++seq, Kind::put, v});
        }
        if (i % 7000 == 0) live.push_back(db.snapshot());
        if (i % 11'000 == 0 && live.size() > 2) {
            db.release(live.front());
            live.erase(live.begin());
        }
        if (i % 20'000 == 0) {
            db.crash_and_recover();
            db.validate();
            check(3000);
        }
    }
    check(20'000);
    INFO("levels: " << db.shape());
    CHECK(db.stats().compactions > 0);
    CHECK(db.stats().write_amplification() > 1.0);
}
