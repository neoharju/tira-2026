// Scalar baselines. This file is compiled without automatic vectorization.
#include "tasks.hpp"

namespace w23::baseline {

float l2_squared(const float* a, const float* b, std::size_t dim) {
    float s = 0;
    for (std::size_t i = 0; i < dim; ++i) {
        const float d = a[i] - b[i];
        s += d * d;
    }
    return s;
}

float inner_product(const float* a, const float* b, std::size_t dim) {
    float s = 0;
    for (std::size_t i = 0; i < dim; ++i) s += a[i] * b[i];
    return s;
}

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

}  // namespace w23::baseline
