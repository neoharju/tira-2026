// Tests for week 17. Run one task's tests with: ./w17_test -tc="task3*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <limits>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w17;

namespace {
// Runs f once with each of these OpenMP thread counts, then restores the default.
template <class F>
void with_thread_counts(F f) {
    int saved = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(t);
        CAPTURE(t);
        f();
    }
    omp_set_num_threads(saved);
}
}  // namespace

TEST_CASE("task1: moving average") {
    for (std::size_t n : {0, 1, 2, 7, 64, 1000}) {
        // A vector of exactly n values, so that reading x[n] is a bug that
        // AddressSanitizer can see.
        std::vector<float> x(n);
        auto r = tira::random_vector<int>(n, 0, 1000, n);
        for (std::size_t i = 0; i < n; ++i) x[i] = static_cast<float>(r[i]) / 8;
        for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{3}, n, n + 1}) {
            CAPTURE(n);
            CAPTURE(k);
            auto want = baseline::moving_average(x, k);
            auto got = moving_average(x, k);
            REQUIRE(got.size() == want.size());
            for (std::size_t i = 0; i < got.size(); ++i) CHECK(got[i] == doctest::Approx(want[i]).epsilon(1e-5));
        }
    }
}

TEST_CASE("task2: blend a plane, every combination of s, a and d") {
    const std::size_t n = std::size_t{1} << 24;
    std::vector<std::uint8_t> s(n), a(n), d(n), got(n), want(n);
    for (std::size_t i = 0; i < n; ++i) {
        s[i] = static_cast<std::uint8_t>(i);
        a[i] = static_cast<std::uint8_t>(i >> 8);
        d[i] = static_cast<std::uint8_t>(i >> 16);
    }
    baseline::blend_plane(s, a, d, want);
    blend_plane(s, a, d, got);
    CHECK(got == want);
    // Lengths that are not a multiple of the vector width.
    for (std::size_t len : {0, 1, 31, 33, 100}) {
        std::span<std::uint8_t> out(got.data() + 1, len);
        blend_plane(std::span(s).subspan(3, len), std::span(a).subspan(5, len), std::span(d).subspan(7, len), out);
        baseline::blend_plane(std::span(s).subspan(3, len), std::span(a).subspan(5, len), std::span(d).subspan(7, len),
                              std::span(want.data() + 1, len));
        CHECK(std::equal(out.begin(), out.end(), want.begin() + 1));
    }
}

TEST_CASE("task3: blend RGBA pixels") {
    for (std::size_t n : {0, 1, 7, 8, 9, 15, 16, 17, 31, 1000, 65536 + 5}) {
        CAPTURE(n);
        auto bytes = tira::random_vector<int>(8 * n + 8, 0, 255, n);
        std::vector<Rgba> src(n + 1), dst(n + 1), got(n + 1), want(n + 1);
        for (std::size_t i = 0; i <= n; ++i) {
            src[i] = {std::uint8_t(bytes[8 * i]), std::uint8_t(bytes[8 * i + 1]), std::uint8_t(bytes[8 * i + 2]),
                      std::uint8_t(i % 3 == 0 ? 255 * (i % 2) : bytes[8 * i + 3])};
            dst[i] = {std::uint8_t(bytes[8 * i + 4]), std::uint8_t(bytes[8 * i + 5]), std::uint8_t(bytes[8 * i + 6]),
                      std::uint8_t(bytes[8 * i + 7])};
        }
        // Start at index 1, so the data is not aligned to 32 bytes.
        auto s = std::span(src).subspan(1), d = std::span(dst).subspan(1);
        baseline::blend_rgba(s, d, std::span(want).subspan(1));
        blend_rgba(s, d, std::span(got).subspan(1));
        CHECK(got == want);
    }
}

TEST_CASE("task4: sum") {
    with_thread_counts([] {
        for (std::size_t n : {0, 1, 5, 1000, 100003}) {
            auto a = tira::random_vector<std::int32_t>(n, std::numeric_limits<std::int32_t>::min(),
                                                      std::numeric_limits<std::int32_t>::max(), n);
            CHECK(sum(a) == baseline::sum(a));
        }
    });
}

TEST_CASE("task5: argmin with threads") {
    for (unsigned threads : {1u, 2u, 3u, 4u, 8u, 13u}) {
        for (std::size_t n : {0, 1, 2, 5, 12, 1000, 100003}) {
            CAPTURE(threads);
            CAPTURE(n);
            auto a = tira::random_vector<std::int32_t>(n, -50, 50, n);  // many equal values
            CHECK(argmin(a, threads) == baseline::argmin(a));
            std::ranges::fill(a, 7);  // all equal: the answer is index 0
            CHECK(argmin(a, threads) == baseline::argmin(a));
        }
    }
}

TEST_CASE("task6: byte histogram") {
    with_thread_counts([] {
        for (std::size_t n : {0, 1, 1000, 100003}) {
            auto v = tira::random_vector<int>(n, 0, 255, n);
            std::vector<std::uint8_t> data(v.begin(), v.end());
            CHECK(histogram(data) == baseline::histogram(data));
            std::ranges::fill(data, 42);
            CHECK(histogram(data) == baseline::histogram(data));
        }
    });
}

TEST_CASE("task7: 16-bit histogram") {
    with_thread_counts([] {
        for (std::size_t n : {0, 1, 1000, 200003}) {
            auto v = tira::random_vector<int>(n, 0, 65535, n);
            std::vector<std::uint16_t> data(v.begin(), v.end());
            CHECK(histogram16(data) == baseline::histogram16(data));
        }
    });
}

TEST_CASE("task8: prefix sum") {
    with_thread_counts([] {
        for (std::size_t n : {0, 1, 2, 3, 10, 1000, 100003}) {
            auto a = tira::random_vector<std::int64_t>(n, -1'000'000, 1'000'000, n);
            auto want = a;
            baseline::prefix_sum(want);
            prefix_sum(a);
            CHECK(a == want);
        }
    });
}
