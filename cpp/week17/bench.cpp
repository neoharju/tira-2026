// Speed goals for week 17. Run in the release build: ./w17_bench [task]
// The goals were calibrated on a 4-core machine; with more cores the parallel
// tasks become easier.
#include <omp.h>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w17;

namespace {

bool bench_blend_plane() {
    const std::size_t n = 1 << 18;  // one plane of a 512 x 512 image
    auto s = tira::random_vector<std::uint8_t>(n, 0, 255, 1), a = tira::random_vector<std::uint8_t>(n, 0, 255, 2),
         d = tira::random_vector<std::uint8_t>(n, 0, 255, 3);
    std::vector<std::uint8_t> out(n);
    auto t = tira::compare([&] { baseline::blend_plane(s, a, d, out); }, [&] { blend_plane(s, a, d, out); });
    return tira::report("task2 blend_plane", t, 6.0);
}

bool bench_blend_rgba() {
    const std::size_t n = 1 << 18;  // 512 x 512 pixels
    auto bytes = tira::random_vector<std::uint8_t>(8 * n, 0, 255, 4);
    std::vector<Rgba> src(n), dst(n), out(n);
    for (std::size_t i = 0; i < n; ++i) {
        src[i] = {bytes[8 * i], bytes[8 * i + 1], bytes[8 * i + 2], bytes[8 * i + 3]};
        dst[i] = {bytes[8 * i + 4], bytes[8 * i + 5], bytes[8 * i + 6], bytes[8 * i + 7]};
    }
    auto t = tira::compare([&] { baseline::blend_rgba(src, dst, out); }, [&] { blend_rgba(src, dst, out); });
    return tira::report("task3 blend_rgba", t, 5.0);
}

bool bench_sum() {
    auto a = tira::random_vector<std::int32_t>(1 << 22, -1000, 1000, 5);  // 16 MiB
    auto t = tira::compare([&] { tira::keep(baseline::sum(a)); }, [&] { tira::keep(sum(a)); }, 25);
    return tira::report("task4 sum", t, 2.2);
}

bool bench_argmin() {
    auto a = tira::random_vector<std::int32_t>(1 << 22, -1'000'000'000, 1'000'000'000, 6);
    auto t = tira::compare([&] { tira::keep(baseline::argmin(a)); }, [&] { tira::keep(argmin(a, tira::threads())); }, 25);
    return tira::report("task5 argmin", t, 2.0);
}

bool bench_histogram() {
    auto data = tira::random_vector<std::uint8_t>(1 << 26, 0, 255, 7);
    auto t = tira::compare([&] { tira::keep(baseline::histogram(data)); }, [&] { tira::keep(histogram(data)); });
    return tira::report("task6 histogram", t, 2.0);
}

bool bench_histogram16() {
    auto data = tira::random_vector<std::uint16_t>(1 << 22, 0, 65535, 8);
    auto t = tira::compare([&] { tira::keep(baseline::histogram16(data)); }, [&] { tira::keep(histogram16(data)); }, 25);
    return tira::report("task7 histogram16", t, 2.0);
}

bool bench_prefix_sum() {
    auto a = tira::random_vector<std::int64_t>(1 << 21, -1000, 1000, 9);  // 16 MiB
    auto t = tira::compare([&] { baseline::prefix_sum(a); }, [&] { prefix_sum(a); }, 25);
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
