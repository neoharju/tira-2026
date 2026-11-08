// Week 31: compaction (tasks 5 and 8).
#pragma once
#include <cstddef>
#include <string>
#include <vector>

#include "format.hpp"
#include "table.hpp"

namespace w31 {

// A compaction reads some tables and writes their versions again, sorted and
// without the versions that no reader can see any more. The rules (LevelDB
// and RocksDB keep versions by the same rules):
//
//  1. The output has the versions of all inputs in the internal order. The
//     inputs can overlap each other in any way.
//  2. A version is kept if it is the newest version of its key, or if it is
//     the newest version of its key with seq <= s for some live snapshot s.
//     So with the versions of a key newest first, v1 is kept, and v(j) is
//     kept if some snapshot s has seq(v(j)) <= s < seq(v(j-1)).
//  3. If `bottom` is true (no older data of these keys is below the output),
//     then while the oldest kept version of a key is a delete, it is dropped
//     too: a delete with nothing older to hide is not needed.
//  4. The output is cut into tables of block_size 4096 (TableBuilder): before
//     adding the first version of a new key, if the table being written has
//     data_bytes() >= target_size, finish it and start a new one. So the
//     versions of a key are always in one table, and only the last table can
//     be smaller than target_size. No table is empty: if nothing is kept,
//     there is no output.
struct CompactionJob {
    std::vector<Table> inputs;
    std::vector<Seq> snapshots;  // the live snapshots, in increasing order
    bool bottom = false;
    std::size_t target_size = 2 << 20;
};

// Task 5. The tables of the output, in order.
std::vector<std::string> compact(const CompactionJob& job);

// Task 8. The same versions with OpenMP threads: the key range is split into
// parts, and each thread writes the tables of one part. Rule 4 holds in each
// part, so a part's last table can be smaller than target_size. The versions
// of the output, read in order through all tables, are those of compact().
std::vector<std::string> compact_parallel(const CompactionJob& job);

}  // namespace w31
