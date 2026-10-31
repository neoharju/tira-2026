// Simple single-threaded versions of the week 17 tasks.
#include <algorithm>
#include <numeric>

#include "tasks.hpp"

namespace w17::baseline {

std::vector<float> moving_average(std::span<const float> x, std::size_t k) {
    std::vector<float> out;
    if (k == 0 || k > x.size()) return out;
    for (std::size_t i = 0; i + k <= x.size(); ++i) {
        double s = 0;
        for (std::size_t j = i; j < i + k; ++j) s += x[j];
        out.push_back(static_cast<float>(s / static_cast<double>(k)));
    }
    return out;
}

std::int64_t sum(std::span<const std::int32_t> a) {
    std::int64_t s = 0;
    for (std::int32_t x : a) s += x;
    return s;
}

MinResult argmin(std::span<const std::int32_t> a) {
    MinResult best{0, 0};
    for (std::size_t i = 0; i < a.size(); ++i)
        if (i == 0 || a[i] < best.value) best = {a[i], i};
    return best;
}

std::array<std::uint64_t, 256> histogram(std::span<const std::uint8_t> data) {
    std::array<std::uint64_t, 256> h{};
    for (std::uint8_t x : data) ++h[x];
    return h;
}

std::vector<std::uint32_t> histogram16(std::span<const std::uint16_t> data) {
    std::vector<std::uint32_t> h(65536);
    for (std::uint16_t x : data) ++h[x];
    return h;
}

void prefix_sum(std::span<std::int64_t> a) { std::inclusive_scan(a.begin(), a.end(), a.begin()); }

}  // namespace w17::baseline
