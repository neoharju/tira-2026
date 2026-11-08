// Week 31: tables (SSTables): the format, the given writer and iterator, and
// the lookup of task 3. The given parts are in table.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "bloom.hpp"
#include "format.hpp"

namespace w31 {

// A table is one string of bytes, written once and never changed:
//
//   data block 0 | data block 1 | ... | filter block | index block | footer
//
// All numbers are little-endian.
//
// A data block holds versions in the internal order, then a trailer:
//   version: [key: 8][tag: 8][value length: varint32][value bytes]
//   trailer: [count of versions: 4][crc: 4]
// where crc = crc32c of all bytes of the block before the crc. A delete has
// value length 0. The writer ends a block after the version that brings the
// versions of the block to block_size (4096) bytes or more, so the versions of
// one key can be in two blocks; the last block can be smaller.
//
// The filter block: the 32-byte blocks of the split-block Bloom filter of the
// keys of the table (each key once, hash_key(key), 10 bits per key), then
// [count of filter blocks: 4][crc: 4].
//
// The index block: for each data block in order,
//   [last key: 8][last seq: 8][offset: 8][size: 4]
// the internal key of its last version, and where the block is in the table
// (the size includes the trailer); then [count of data blocks: 4][crc: 4].
//
// The footer, the last 56 bytes:
//   [filter offset: 8][filter size: 8][index offset: 8][index size: 8]
//   [count of versions: 8][smallest key: 8][magic: 8]
inline constexpr std::uint64_t table_magic = 0x3133572D41524954ULL;  // "TIRA-W31" in ASCII
inline constexpr std::size_t footer_size = 56;
inline constexpr std::size_t index_entry_size = 28;

// Writes a table. The versions must come in the internal order.
class TableBuilder {
public:
    explicit TableBuilder(std::size_t block_size = 4096) : block_size_(block_size) {}

    // Adds a version. Throws std::logic_error if it is not after the last one.
    void add(Key key, Seq seq, Kind kind, std::string_view value);
    // The bytes of the data blocks so far: the finished blocks with their
    // trailers, and the versions of the block that is not finished yet.
    std::size_t data_bytes() const { return out_.size() + block_.size(); }
    std::size_t versions() const { return count_; }
    bool empty() const { return count_ == 0; }
    // The table. The builder is empty again after this.
    std::string finish();

private:
    void end_block();
    std::size_t block_size_;
    std::string out_, block_, index_;
    std::uint32_t in_block_ = 0;
    std::size_t count_ = 0;
    std::vector<Key> keys_;  // each key once, for the filter
    Key last_key_ = 0, smallest_ = 0;
    Seq last_seq_ = 0;
};

// An entry of the index: a data block and its last version.
struct IndexEntry {
    Key last_key;
    Seq last_seq;
    std::uint64_t offset;
    std::uint32_t size;  // with the trailer
};

// Reads one version from the start of `in` and removes its bytes from `in`.
// Returns false if `in` ends inside the version, or its kind is not put or
// del. `value` is a view into `in`.
bool decode_entry(std::string_view& in, Key& key, Seq& seq, Kind& kind, std::string_view& value);

// A table opened for reading.
class Table {
public:
    // Opens a table. Checks the footer, the magic number, the crc of the
    // filter and the index blocks, and that every offset and size in them is
    // inside the file. Throws Corruption if something is wrong. The table
    // shares the ownership of the bytes, so they live as long as the table.
    static Table open(std::shared_ptr<const std::string> file);

    // Task 3. The newest version of key with seq <= snapshot in this table,
    // or nothing. Find the data block with a binary search on the index: the
    // first block whose last version is not smaller than (key, snapshot) in
    // the internal order. Check the crc of the block, and search it. Throws
    // Corruption if the crc is wrong, or if the bytes of the block are not
    // `count` versions followed by the trailer.
    std::optional<Lookup> get(Key key, Seq snapshot) const;

    // The filter: false means that the key is surely not in the table.
    bool may_contain(Key key) const { return filter.may_contain(hash_key(key)); }
    // The bytes of data block i, with its trailer.
    std::string_view block(std::size_t i) const { return std::string_view(*file).substr(index[i].offset, index[i].size); }
    std::size_t size() const { return file->size(); }

    std::shared_ptr<const std::string> file;
    std::vector<IndexEntry> index;  // the index block, decoded
    SplitBlockBloom filter;         // the filter block, copied to aligned memory
    std::uint64_t versions = 0;
    Key smallest = 0, largest = 0;  // the smallest and largest key (0 and 0 for an empty table)
};

// Reads the versions of a table in the internal order, block by block, and
// checks the crc of each block that it reads (throws Corruption).
class TableIterator {
public:
    explicit TableIterator(const Table& table) : t_(&table) {}
    void seek_to_first() { load(0); }
    // Goes to the first version with a key >= key (with the index).
    void seek(Key key);
    bool valid() const { return valid_; }
    void next();
    Key key() const { return key_; }
    Seq seq() const { return seq_; }
    Kind kind() const { return kind_; }
    std::string_view value() const { return value_; }

private:
    void load(std::size_t block);
    const Table* t_;
    std::size_t block_ = 0;
    std::string_view rest_;
    std::uint32_t left_ = 0;
    bool valid_ = false;
    Key key_ = 0;
    Seq seq_ = 0;
    Kind kind_ = Kind::put;
    std::string_view value_;
};

// Makes a table of these versions (in the internal order) and opens it.
Table make_table(std::span<const Entry> entries, std::size_t block_size = 4096);
// All versions of a table, in order.
std::vector<Entry> table_entries(const Table& t);

}  // namespace w31
