// The baseline CRC-32C: one byte at a time with a table (Sarwate, 1988).
#include <array>

#include "crc32c.hpp"

namespace w31::baseline {

namespace {

// The table is computed by the compiler (constexpr): entry i is the crc of
// the byte i, one bit at a time, with the reflected polynomial.
constexpr std::array<std::uint32_t, 256> make_table() {
    std::array<std::uint32_t, 256> t{};
    for (std::uint32_t i = 0; i < 256; ++i) {
        std::uint32_t c = i;
        for (int bit = 0; bit < 8; ++bit) c = (c & 1) ? (c >> 1) ^ 0x82F63B78U : c >> 1;
        t[i] = c;
    }
    return t;
}
constexpr std::array<std::uint32_t, 256> table = make_table();

}  // namespace

std::uint32_t crc32c(std::string_view data, std::uint32_t crc) {
    std::uint32_t c = ~crc;
    for (const char ch : data) c = table[(c ^ static_cast<unsigned char>(ch)) & 0xFF] ^ (c >> 8);
    return ~c;
}

}  // namespace w31::baseline
