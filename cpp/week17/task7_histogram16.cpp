// Task 7: this parallel version is correct but slow, because the threads
// fight over the same counters. Remove the contention: give every thread its
// own counters, then merge them, and make the merge parallel too.
#include <omp.h>

#include "tasks.hpp"

namespace w17 {

std::vector<std::uint32_t> histogram16(std::span<const std::uint16_t> data) {
    std::vector<std::uint32_t> h(65536);
    const std::uint16_t* p = data.data();
    std::uint32_t* counter = h.data();
    const std::size_t n = data.size();
#pragma omp parallel for
    for (std::size_t i = 0; i < n; ++i) {
#pragma omp atomic
        ++counter[p[i]];
    }
    return h;
}

}  // namespace w17
