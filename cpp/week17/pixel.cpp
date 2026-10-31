#include "pixel.hpp"

namespace w17 {
std::uint8_t blend_byte(std::uint8_t s, std::uint8_t a, std::uint8_t d) {
    return static_cast<std::uint8_t>((s * a + d * (255 - a) + 127) / 255);
}
}  // namespace w17
