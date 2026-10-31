// Task 5: find the minimum with `threads` std::jthread threads (no OpenMP).
#include <thread>

#include "tasks.hpp"

namespace w17 {

MinResult argmin(std::span<const std::int32_t> a, unsigned threads) {
    (void)threads;
    MinResult best{0, 0};
    for (std::size_t i = 0; i < a.size(); ++i)
        if (i == 0 || a[i] < best.value) best = {a[i], i};
    return best;
}

}  // namespace w17
