// The scalar distance. This file is compiled without automatic vectorization.
#include "tasks.hpp"

namespace w24::baseline {

std::uint32_t l2_squared(const std::uint8_t* a, const std::uint8_t* b, std::size_t dim) {
    std::uint32_t s = 0;
    for (std::size_t i = 0; i < dim; ++i) {
        const int d = a[i] - b[i];
        s += static_cast<std::uint32_t>(d * d);
    }
    return s;
}

}  // namespace w24::baseline
