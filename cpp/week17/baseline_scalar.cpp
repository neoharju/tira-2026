// The blending baselines, compiled without automatic vectorization (see
// CMakeLists.txt): one pixel at a time, as a CPU without SIMD would do it.
#include "tasks.hpp"

namespace w17::baseline {

namespace {
std::uint8_t blend(unsigned s, unsigned a, unsigned d) {
    return static_cast<std::uint8_t>((s * a + d * (255 - a) + 127) / 255);
}
}  // namespace

void blend_plane(std::span<const std::uint8_t> s, std::span<const std::uint8_t> a,
                 std::span<const std::uint8_t> d, std::span<std::uint8_t> out) {
    for (std::size_t i = 0; i < out.size(); ++i) out[i] = blend(s[i], a[i], d[i]);
}

void blend_rgba(std::span<const Rgba> src, std::span<const Rgba> dst, std::span<Rgba> out) {
    for (std::size_t i = 0; i < out.size(); ++i) {
        unsigned a = src[i].a;
        out[i] = {blend(src[i].r, a, dst[i].r), blend(src[i].g, a, dst[i].g), blend(src[i].b, a, dst[i].b),
                  blend(src[i].a, a, dst[i].a)};
    }
}

}  // namespace w17::baseline
