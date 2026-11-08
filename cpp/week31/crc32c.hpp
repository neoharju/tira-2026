// Week 31: the checksum of the log records and the table blocks (task 4).
#pragma once
#include <cstdint>
#include <string_view>

namespace w31 {

// CRC-32C (Castagnoli), the checksum of iSCSI, ext4, Btrfs, LevelDB and
// RocksDB: the polynomial 0x1EDC6F41, in reflected bit order 0x82F63B78.
// crc32c(data, crc) continues the checksum `crc` of earlier bytes, so
//   crc32c(b, crc32c(a)) == crc32c(a + b),
// and crc32c(data) starts from nothing. The known check value is
// crc32c("123456789") == 0xE3069283.
//
// Task 4. With the crc32 instruction of SSE4.2 (_mm_crc32_u64 and friends).
// Now it calls the baseline. The log (task 1) and the tables (tasks 3, 5
// and 8) call this function.
std::uint32_t crc32c(std::string_view data, std::uint32_t crc = 0);

namespace baseline {
// One byte at a time with a table of 256 entries (Sarwate, 1988).
std::uint32_t crc32c(std::string_view data, std::uint32_t crc = 0);
}  // namespace baseline

}  // namespace w31
