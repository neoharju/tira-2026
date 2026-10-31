// Task 4: compute the sum with OpenMP threads.
#include <omp.h>

#include "tasks.hpp"

namespace w17 {

std::int64_t sum(std::span<const std::int32_t> a) {
    std::int64_t s = 0;
    for (std::size_t i = 0; i < a.size(); ++i) s += a[i];
    return s;
}

}  // namespace w17
