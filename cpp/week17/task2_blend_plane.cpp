// Task 2: make this loop vectorize automatically. Build the release preset and
// read the vectorization report of this file (see the chapter), find out why
// the loop is not vectorized, and change the code so that it is.
#include "pixel.hpp"
#include "tasks.hpp"

namespace w17 {

void blend_plane(std::span<const std::uint8_t> s, std::span<const std::uint8_t> a,
                 std::span<const std::uint8_t> d, std::span<std::uint8_t> out) {
    for (std::size_t i = 0; i < out.size(); ++i) out[i] = blend_byte(s[i], a[i], d[i]);
}

}  // namespace w17
