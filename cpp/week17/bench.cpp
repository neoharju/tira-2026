// Speed goals for week 17. Run in the release build: ./w17_bench [task]
// The goals were calibrated with GCC 16 on a 4-core machine; with more cores
// the parallel tasks become easier.
#include <omp.h>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w17;

namespace {

// Each round of a goal has new input data (see tira::compare_fresh). The
// sizes are the same in each round.

bool bench_blend_plane() {
    const std::size_t n = 1 << 18;  // one plane of a 512 x 512 image
    std::vector<std::uint8_t> s, a, d, want(n), got(n);
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            s = tira::random_vector<std::uint8_t>(n, 0, 255, seed);
            a = tira::random_vector<std::uint8_t>(n, 0, 255, seed + 1);
            d = tira::random_vector<std::uint8_t>(n, 0, 255, seed + 2);
        },
        [&] { baseline::blend_plane(s, a, d, want); }, [&] { blend_plane(s, a, d, got); }, [&] { return got == want; },
        9, 172);
    return tira::report("task2 blend_plane", t, 6.0);
}

bool bench_blend_rgba() {
    const std::size_t n = 1 << 18;  // 512 x 512 pixels
    std::vector<Rgba> src(n), dst(n), want(n), got(n);
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            auto bytes = tira::random_vector<std::uint8_t>(8 * n, 0, 255, seed);
            for (std::size_t i = 0; i < n; ++i) {
                src[i] = {bytes[8 * i], bytes[8 * i + 1], bytes[8 * i + 2], bytes[8 * i + 3]};
                dst[i] = {bytes[8 * i + 4], bytes[8 * i + 5], bytes[8 * i + 6], bytes[8 * i + 7]};
            }
        },
        [&] { baseline::blend_rgba(src, dst, want); }, [&] { blend_rgba(src, dst, got); }, [&] { return got == want; },
        9, 173);
    return tira::report("task3 blend_rgba", t, 5.0);
}

bool bench_sum() {
    std::vector<std::int32_t> a;  // 16 MiB
    std::int64_t want = 0, got = 0;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { a = tira::random_vector<std::int32_t>(1 << 22, -1000, 1000, seed); },
                                 [&] { want = baseline::sum(a); }, [&] { got = sum(a); }, [&] { return got == want; }, 25, 174);
    return tira::report("task4 sum", t, 2.2);
}

bool bench_argmin() {
    std::vector<std::int32_t> a;
    MinResult want{}, got{};
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { a = tira::random_vector<std::int32_t>(1 << 22, -1'000'000'000, 1'000'000'000, seed); },
        [&] { want = baseline::argmin(a); }, [&] { got = argmin(a, tira::threads()); }, [&] { return got == want; }, 25, 175);
    return tira::report("task5 argmin", t, 2.0);
}

bool bench_histogram() {
    std::vector<std::uint8_t> data;
    std::array<std::uint64_t, 256> want{}, got{};
    auto t = tira::compare_fresh([&](std::uint64_t seed) { data = tira::random_vector<std::uint8_t>(1 << 26, 0, 255, seed); },
                                 [&] { want = baseline::histogram(data); }, [&] { got = histogram(data); },
                                 [&] { return got == want; }, 9, 176);
    return tira::report("task6 histogram", t, 2.0);
}

bool bench_histogram16() {
    std::vector<std::uint16_t> data;
    std::vector<std::uint32_t> want, got;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { data = tira::random_vector<std::uint16_t>(1 << 22, 0, 65535, seed); },
                                 [&] { want = baseline::histogram16(data); }, [&] { got = histogram16(data); },
                                 [&] { return got == want; }, 25, 177);
    return tira::report("task7 histogram16", t, 2.0);
}

bool bench_prefix_sum() {
    std::vector<std::int64_t> want, got;  // 16 MiB each
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) {
            want = tira::random_vector<std::int64_t>(1 << 21, -1000, 1000, seed);
            got = want;
        },
        [&] { baseline::prefix_sum(want); }, [&] { prefix_sum(got); }, [&] { return got == want; }, 25, 178);
    return tira::report("task8 prefix_sum", t, 1.5);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task2", bench_blend_plane},
                        {"task3", bench_blend_rgba},
                        {"task4", bench_sum},
                        {"task5", bench_argmin},
                        {"task6", bench_histogram},
                        {"task7", bench_histogram16},
                        {"task8", bench_prefix_sum}}};
    return b.run(argc, argv);
}
