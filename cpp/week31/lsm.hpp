// Week 31: a small LSM-tree key-value store, made of the parts of the tasks.
// All of it is given (lsm.cpp); it calls your code: the log (task 1), the
// memtable (task 2), table lookups (task 3), crc32c (task 4), compaction
// (task 5 or 8) and the filters (task 6). Tasks 4 and 6 only make it faster:
// the store is correct with the baseline checksum and with filters that say "maybe".
#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

#include "compaction.hpp"
#include "format.hpp"
#include "memtable.hpp"
#include "table.hpp"

namespace w31 {

struct LsmOptions {
    std::size_t memtable_bytes = 1 << 20;  // flush the memtable when it uses this much memory
    std::size_t level0_files = 4;          // compact level 0 when it has this many tables
    std::size_t level1_bytes = 8 << 20;    // the size limit of level 1; each level below has 10 times more
    std::size_t target_size = 2 << 20;     // the size of the tables that compactions write
    int levels = 7;
    bool use_filters = true;
    bool parallel_compaction = false;  // compact_parallel (task 8) instead of compact (task 5)
};

// Counters of the work that the store did.
struct LsmStats {
    std::uint64_t user_bytes = 0;        // 8 bytes of key and the value, for every put and delete
    std::uint64_t log_bytes = 0;         // bytes appended to the log
    std::uint64_t flush_bytes = 0;       // bytes of the tables that flushes wrote
    std::uint64_t compaction_bytes = 0;  // bytes of the tables that compactions wrote
    std::uint64_t compaction_read_bytes = 0;
    std::uint64_t flushes = 0, compactions = 0;
    std::uint64_t gets = 0;          // calls of get
    std::uint64_t table_gets = 0;    // calls of Table::get: each reads a data block
    std::uint64_t filter_skips = 0;  // tables that a filter said "no" for
    // Bytes written to the disk per byte that the user wrote.
    double write_amplification() const {
        return user_bytes ? static_cast<double>(log_bytes + flush_bytes + compaction_bytes) / static_cast<double>(user_bytes) : 0.0;
    }
};

class Lsm {
public:
    explicit Lsm(LsmOptions options = {});

    void put(Key key, std::string_view value);
    void del(Key key);
    // The value of the key, as a reader with this snapshot sees it.
    std::optional<std::string> get(Key key, Seq snapshot = max_seq);

    // A snapshot: the reads with it see exactly the writes made before it.
    // Compactions keep the versions that a live snapshot can see.
    Seq snapshot();
    void release(Seq snapshot);

    // Writes the memtable to a new table of level 0, and compacts if needed.
    void flush();
    // A crash: the memtable is lost. The store rebuilds it from the log,
    // which a real store would read from its file.
    void crash_and_recover();

    const LsmStats& stats() const { return stats_; }
    std::size_t table_bytes() const;  // the bytes of all tables
    // The number of tables on each level, for example "5 3 12 0".
    std::string shape() const;
    // Checks that the tables of levels 1, 2, ... are sorted by key and do not
    // overlap. Throws std::logic_error if not.
    void validate() const;

    struct File {
        Table table;
        std::uint64_t number;
    };
    std::vector<std::vector<File>> levels;  // level 0 newest first; levels 1+ sorted by key

private:
    void write(Key key, Kind kind, std::string_view value);
    void maybe_compact();
    void compact_level(int level);
    std::optional<std::optional<std::string>> search(const Table& t, Key key, Seq snapshot);

    LsmOptions opt_;
    LsmStats stats_;
    MemTable mem_;
    std::string log_;  // the write-ahead log of the memtable
    Seq last_seq_ = 0;
    std::uint64_t next_file_ = 1;
    std::multiset<Seq> snapshots_;
    std::vector<Key> compact_pointer_;  // per level: the largest key of the last compaction
};

}  // namespace w31
