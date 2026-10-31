// Task 8: compute the prefix sum with OpenMP threads (two passes, see the
// chapter).
#include <omp.h>

#include "tasks.hpp"

namespace w17 {

void prefix_sum(std::span<std::int64_t> a) {
    for (std::size_t i = 1; i < a.size(); ++i) a[i] += a[i - 1];
}

}  // namespace w17
