// Task 3: rewrite this loop with AVX2 intrinsics (8 pixels = 32 bytes at a
// time). Automatic vectorization is turned off for this file (see
// CMakeLists.txt), so the speed has to come from your intrinsics.
#include <immintrin.h>

#include "tasks.hpp"

namespace w17 {

namespace {
std::uint8_t blend(unsigned s, unsigned a, unsigned d) {
    return static_cast<std::uint8_t>((s * a + d * (255 - a) + 127) / 255);
}
}  // namespace

void blend_rgba(std::span<const Rgba> src, std::span<const Rgba> dst, std::span<Rgba> out) {
    for (std::size_t i = 0; i < out.size(); ++i) {
        unsigned a = src[i].a;
        out[i] = {blend(src[i].r, a, dst[i].r), blend(src[i].g, a, dst[i].g), blend(src[i].b, a, dst[i].b),
                  blend(src[i].a, a, dst[i].a)};
    }
}

}  // namespace w17
