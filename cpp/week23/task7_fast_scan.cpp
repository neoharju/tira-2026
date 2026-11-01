// Task 7: rewrite this with AVX2: one _mm256_shuffle_epi8 looks up the codes
// of 32 vectors in the 16-byte table of a part. Automatic vectorization is
// turned off for this file (see CMakeLists.txt).
#include <immintrin.h>

#include "tasks.hpp"

namespace w23 {

void fast_scan(const PackedCodes& codes, const QuantizedTable& table, std::span<std::uint16_t> sums) {
    const std::size_t m = codes.m;
    for (std::size_t b = 0; b < codes.blocks(); ++b) {
        const std::uint8_t* block = codes.bytes.data() + b * m * 16;
        for (std::size_t i = 0; i < 32; ++i) {
            unsigned s = 0;
            for (std::size_t j = 0; j < m; ++j) {
                const std::uint8_t byte = block[j * 16 + i % 16];
                const unsigned code = i < 16 ? byte & 15u : byte >> 4u;
                s += table.lut[j * 16 + code];
            }
            sums[b * 32 + i] = static_cast<std::uint16_t>(s);
        }
    }
}

}  // namespace w23
