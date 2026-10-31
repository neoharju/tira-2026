// Task 1: this function has a memory bug. The tests may pass in the release
// build, but the debug build (AddressSanitizer) stops with an error.
// Find the bug with the sanitizer report and gdb, and fix it.
#include "tasks.hpp"

namespace w17 {

std::vector<float> moving_average(std::span<const float> x, std::size_t k) {
    std::vector<float> out;
    if (k == 0 || k > x.size()) return out;
    const float* p = x.data();
    std::size_t n = x.size();
    double window = 0;  // the sum of p[i], ..., p[i + k - 1]
    for (std::size_t i = 0; i < k; ++i) window += p[i];
    for (std::size_t i = 0; i + k <= n; ++i) {
        out.push_back(static_cast<float>(window / static_cast<double>(k)));
        window += p[i + k] - p[i];  // move the window one step to the right
    }
    return out;
}

}  // namespace w17
