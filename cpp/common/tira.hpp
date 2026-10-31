// Small helpers shared by the tests and benchmarks.
#pragma once
#include <omp.h>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <print>
#include <random>
#include <string_view>
#include <vector>

namespace tira {

// True if this CPU can run AVX-512 code (avx512f, which the course uses).
inline bool has_avx512() {
    __builtin_cpu_init();  // needed if this runs before main()
    return __builtin_cpu_supports("avx512f");
}

// Tells the compiler that `value` is used, so it does not delete the
// computation that produced it.
template <class T>
void keep(const T& value) {
    asm volatile("" : : "r,m"(value) : "memory");
}

// The number of threads that OpenMP uses: OMP_NUM_THREADS if it is set,
// otherwise the number of hardware threads.
inline unsigned threads() { return static_cast<unsigned>(omp_get_max_threads()); }

template <class F>
double seconds(F&& f) {
    auto start = std::chrono::steady_clock::now();
    f();
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
}

struct Timing {
    double baseline, yours;
    double speedup() const { return baseline / yours; }
};

// Times `baseline` and `yours` in turns, `rounds` times each, after one
// warm-up run of both, and returns the medians. Taking turns keeps slow changes
// of the machine (other programs, the clock speed) from favouring either side.
template <class B, class Y>
Timing compare(B&& baseline, Y&& yours, int rounds = 9) {
    baseline();
    yours();
    std::vector<double> tb, ty;
    for (int r = 0; r < rounds; ++r) {
        tb.push_back(seconds(baseline));
        ty.push_back(seconds(yours));
    }
    auto median = [](std::vector<double>& v) {
        std::ranges::sort(v);
        return v[v.size() / 2];
    };
    return {median(tb), median(ty)};
}

// Prints one line of results and returns true if the speedup reaches the goal.
inline bool report(std::string_view task, Timing t, double goal) {
    bool ok = t.speedup() >= goal;
    std::println("{:<32} baseline {:8.2f} ms  yours {:8.2f} ms  speedup {:5.2f}x  goal {:4.2f}x  {}", task,
                 t.baseline * 1e3, t.yours * 1e3, t.speedup(), goal, ok ? "ok" : "BELOW GOAL");
    return ok;
}

// Runs the benchmarks whose names start with the first command-line argument
// (all of them without one). Returns the exit code: 0 if all reached the goal.
struct Benchmarks {
    std::vector<std::pair<std::string_view, bool (*)()>> list;
    int run(int argc, char** argv) const {
        std::string_view only = argc > 1 ? argv[1] : "";
        int failed = 0, ran = 0;
        std::println("{} threads (set OMP_NUM_THREADS to change)", threads());
        for (auto [name, f] : list)
            if (name.starts_with(only)) ++ran, failed += !f();
        if (ran == 0) std::println("no benchmark is called {}", only);
        return failed || ran == 0 ? EXIT_FAILURE : EXIT_SUCCESS;
    }
};

// Random integers in [lo, hi] from a fixed seed, so every run sees the same data.
template <class T>
std::vector<T> random_vector(std::size_t n, T lo, T hi, std::uint64_t seed = 1) {
    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<long long> dist(lo, hi);
    std::vector<T> v(n);
    for (auto& x : v) x = static_cast<T>(dist(rng));
    return v;
}

}  // namespace tira
