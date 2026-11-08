// Task 4: CRC-32C with the crc32 instruction of SSE4.2. _mm_crc32_u64(crc, v)
// adds 8 bytes to a checksum in one instruction (_mm_crc32_u8 adds one byte).
// The instruction works on the inverted checksum: invert crc at the start
// and at the end, as the baseline does. Now this calls the baseline.
#include <immintrin.h>

#include "crc32c.hpp"
#include "format.hpp"

namespace w31 {

std::uint32_t crc32c(std::string_view data, std::uint32_t crc) {
    return baseline::crc32c(data, crc);  // TODO
}

}  // namespace w31
