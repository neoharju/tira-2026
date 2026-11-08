// Week 31: the write-ahead log (task 1), the write batches that it holds, and
// a simulated file that can crash. The given parts are in wal.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <random>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "format.hpp"

namespace w31 {

// A log is a string of records. A record is
//   [crc: 4 bytes][length: 4 bytes][payload: `length` bytes]
// with both numbers in little-endian, and crc = crc32c of the 4 bytes of the
// length followed by the payload (crc32c.hpp). A payload can have any bytes,
// and it can be empty.

// Task 1. Appends one record with this payload to the end of the log.
void append_record(std::string& log, std::string_view payload);

// What recovery finds in a log.
struct Recovered {
    std::vector<std::string> records;  // the payloads, in order
    std::size_t valid_bytes = 0;       // the bytes of these records: the log's valid prefix
};

// Task 1. Reads the records from the start of the log until its end, or until
// the first record that is not complete (the log ends inside its header or
// its payload) or whose crc is wrong. Nothing after such a record is read: a
// crash can leave any bytes there. A log cut to valid_bytes holds exactly the
// records found, and new records can be appended after them.
Recovered recover(std::string_view log);

// A write batch is the payload of one record: the puts and deletes of one
// write, which get the sequence numbers first, first + 1, ... in order:
//   [first: 8][count: 4], then for each operation [kind: 1][key: 8], and for
//   a put also [value length: varint32][value].
// encode_batch uses the kind, key and value of each operation (not its seq).
std::string encode_batch(Seq first, std::span<const Entry> ops);
// Appends the operations of a batch to `ops`, with their sequence numbers.
// Returns false (and appends nothing) if the payload is not a valid batch.
bool decode_batch(std::string_view payload, std::vector<Entry>& ops);

// A file on a simulated disk, for the tests. append() writes into the page
// cache of the operating system, and sync() is fsync: it makes all bytes
// written so far durable. crash() gives what the disk holds after a power
// failure: every synced byte, and after them a random part of the bytes
// that were not synced yet (a torn write), whose last bytes may be garbage.
class SimFile {
public:
    void append(std::string_view bytes) { data_ += bytes; }
    void sync() {
        synced_ = data_.size();
        ++syncs_;
    }
    std::string crash(std::mt19937_64& rng) const;
    const std::string& contents() const { return data_; }
    std::size_t synced_bytes() const { return synced_; }
    std::size_t syncs() const { return syncs_; }

private:
    std::string data_;
    std::size_t synced_ = 0, syncs_ = 0;
};

}  // namespace w31
