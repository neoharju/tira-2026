// Task 1: the write-ahead log, as wal.hpp describes. A length in a log is
// input from a disk: check that the bytes are really there before you read
// them, and never allocate memory by a length that you have not checked.
#include "crc32c.hpp"
#include "wal.hpp"

namespace w31 {

void append_record(std::string& log, std::string_view payload) {
    (void)log;  // TODO
    (void)payload;
}

Recovered recover(std::string_view log) {
    (void)log;  // TODO
    return {};
}

}  // namespace w31
