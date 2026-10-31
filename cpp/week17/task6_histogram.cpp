// Task 6: count the bytes with OpenMP threads, without contention.
#include <omp.h>

#include "tasks.hpp"

namespace w17 {

std::array<std::uint64_t, 256> histogram(std::span<const std::uint8_t> data) {
    std::array<std::uint64_t, 256> h{};
    for (std::size_t i = 0; i < data.size(); ++i) ++h[data[i]];
    return h;
}

}  // namespace w17
