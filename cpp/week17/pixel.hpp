// The blending formula for one byte (used by task 2).
#pragma once
#include <cstdint>

namespace w17 {
// (s * a + d * (255 - a) + 127) / 255, defined in pixel.cpp.
std::uint8_t blend_byte(std::uint8_t s, std::uint8_t a, std::uint8_t d);
}  // namespace w17
