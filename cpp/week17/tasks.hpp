// Week 17: the functions that you write. Each one is in its own file
// (task1_moving_average.cpp, ...). The tests are in test.cpp and the speed
// goals in bench.cpp.
#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace w17 {

// Task 1. The average of every window of k consecutive values:
// result[i] = (x[i] + ... + x[i + k - 1]) / k for i = 0, ..., n - k.
// The result is empty if k == 0 or k > n.
std::vector<float> moving_average(std::span<const float> x, std::size_t k);

// Task 2. Blends one colour plane of two images (struct-of-arrays layout):
// out[i] = (s[i] * a[i] + d[i] * (255 - a[i]) + 127) / 255, where s is the
// source plane, a the source alpha plane and d the destination plane.
void blend_plane(std::span<const std::uint8_t> s, std::span<const std::uint8_t> a,
                 std::span<const std::uint8_t> d, std::span<std::uint8_t> out);

// One pixel in the array-of-structs layout: 4 bytes in the order R, G, B, A.
struct Rgba {
    std::uint8_t r, g, b, a;
    friend bool operator==(const Rgba&, const Rgba&) = default;
};

// Task 3. Blends pixels with AVX2: every byte c of out[i] (r, g, b and a) is
// (c_src * A + c_dst * (255 - A) + 127) / 255, where A = src[i].a.
void blend_rgba(std::span<const Rgba> src, std::span<const Rgba> dst, std::span<Rgba> out);

// Task 4. The sum of the values, computed with OpenMP threads.
std::int64_t sum(std::span<const std::int32_t> a);

// Task 5. The smallest value and the first index where it occurs, computed
// with `threads` std::jthread threads. For an empty span: {0, 0}.
struct MinResult {
    std::int32_t value;
    std::size_t index;
    friend bool operator==(const MinResult&, const MinResult&) = default;
};
MinResult argmin(std::span<const std::int32_t> a, unsigned threads);

// Task 6. How many times each byte value occurs, computed with OpenMP threads.
std::array<std::uint64_t, 256> histogram(std::span<const std::uint8_t> data);

// Task 7. How many times each 16-bit value occurs (65536 counters), computed
// with OpenMP threads, without atomic operations.
std::vector<std::uint32_t> histogram16(std::span<const std::uint16_t> data);

// Task 8. Replaces a[i] by a[0] + a[1] + ... + a[i] (an inclusive prefix
// sum), computed with OpenMP threads.
void prefix_sum(std::span<std::int64_t> a);

// Simple versions for comparison (baseline.cpp). The tests compare your
// results with these, and the benchmarks compare your speed with them.
namespace baseline {
std::vector<float> moving_average(std::span<const float> x, std::size_t k);
void blend_plane(std::span<const std::uint8_t> s, std::span<const std::uint8_t> a,
                 std::span<const std::uint8_t> d, std::span<std::uint8_t> out);
void blend_rgba(std::span<const Rgba> src, std::span<const Rgba> dst, std::span<Rgba> out);
std::int64_t sum(std::span<const std::int32_t> a);
MinResult argmin(std::span<const std::int32_t> a);
std::array<std::uint64_t, 256> histogram(std::span<const std::uint8_t> data);
std::vector<std::uint32_t> histogram16(std::span<const std::uint16_t> data);
void prefix_sum(std::span<std::int64_t> a);
}  // namespace baseline

}  // namespace w17
