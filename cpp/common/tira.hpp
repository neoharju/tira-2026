// Small helpers shared by the tests and benchmarks.
#pragma once
#include <omp.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <print>
#include <random>
#include <string>
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

// ---------------------------------------------------------------- Seeds
//
// The seeds of the benchmark inputs. TIRA_SEED selects them:
//
// * Not set: the same inputs in each run. Use this to compare your runs.
// * A number: other fixed inputs. The grader can give each student a number.
// * "random": new inputs from std::random_device in each round. The grader
//   uses this for the goals. Then a program cannot know the inputs before
//   the round, and it cannot keep earlier results.

namespace detail {
inline std::uint64_t splitmix(std::uint64_t x) {
    x += 0x9E3779B97F4A7C15ULL;
    x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9ULL;
    x = (x ^ (x >> 27)) * 0x94D049BB133111EBULL;
    return x ^ (x >> 31);
}

struct SeedMode {
    bool random = false;
    std::uint64_t base = 0;
};

inline SeedMode seed_mode() {
    static const SeedMode mode = [] {
        SeedMode m;
        const char* s = std::getenv("TIRA_SEED");
        if (s == nullptr || *s == '\0') return m;
        if (std::string_view(s) == "random") {
            m.random = true;
            return m;
        }
        char* end = nullptr;
        m.base = std::strtoull(s, &end, 10);
        if (end == s || *end != '\0') {
            std::println(stderr, "TIRA_SEED must be a number or \"random\"; using the default inputs");
            m.base = 0;
        }
        return m;
    }();
    return mode;
}
}  // namespace detail

// Gives the seed of round `round` of a benchmark. `salt` makes the inputs of
// different benchmarks different. Round -1 is the warm-up.
inline std::uint64_t round_seed(std::uint64_t salt, int round) {
    const detail::SeedMode m = detail::seed_mode();
    if (m.random) {
        std::random_device device;  // main() started before this read, thus no static initializer can see the seed
        return (std::uint64_t{device()} << 32) ^ device();
    }
    return detail::splitmix(m.base ^ detail::splitmix(salt ^ (static_cast<std::uint64_t>(round + 2) << 40)));
}

// ---------------------------------------------------------------- Timing

struct Timing {
    double baseline = 0, yours = 0;  // The medians, in seconds.
    double ratio = 0;                // The median of baseline / yours in the rounds.
    double spread = 0;               // (75th percentile - 25th percentile of the ratios) / ratio.
    bool fresh = false;              // True if each round had new inputs (compare_fresh).
    bool ok = true;                  // False if a result of a measured round was not correct.
    double speedup() const { return ratio; }
};

namespace detail {
inline double percentile(std::vector<double> v, double p) {
    std::ranges::sort(v);
    const double at = p * static_cast<double>(v.size() - 1);
    const auto lo = static_cast<std::size_t>(at);
    const std::size_t hi = std::min(lo + 1, v.size() - 1);
    return v[lo] + (v[hi] - v[lo]) * (at - static_cast<double>(lo));
}

inline Timing summary(const std::vector<double>& tb, const std::vector<double>& ty) {
    std::vector<double> r;
    for (std::size_t i = 0; i < tb.size(); ++i) r.push_back(tb[i] / ty[i]);
    Timing t;
    t.baseline = percentile(tb, 0.5);
    t.yours = percentile(ty, 0.5);
    t.ratio = percentile(r, 0.5);
    t.spread = (percentile(r, 0.75) - percentile(r, 0.25)) / t.ratio;
    return t;
}
}  // namespace detail

// Measures a goal. Each round (also the warm-up) has these steps:
//
// 1. fresh(seed) makes new inputs. This step has no time measurement.
// 2. baseline() and yours() use the inputs. The function measures the time of
//    each. The function that starts first changes in each round.
// 3. check() tells if your result of this round is correct. This step has no
//    time measurement.
//
// Each round has new inputs, and the grader does a check of each result.
// Thus a program cannot keep the results of earlier calls and use them.
// The order changes in each round. Thus slow changes of the machine (other
// programs, the clock speed) do not help one side. The speedup is the median
// of the ratios of the rounds.
template <class F, class B, class Y, class C>
Timing compare_fresh(F&& fresh, B&& baseline, Y&& yours, C&& check, int rounds = 9, std::uint64_t salt = 0) {
    std::vector<double> tb, ty;
    Timing t;
    for (int r = -1; r < rounds; ++r) {
        fresh(round_seed(salt, r));
        double b = 0, y = 0;
        if (r % 2 == 0) {  // The order changes in each round. Thus no side always starts first.
            b = seconds(baseline);
            y = seconds(yours);
        } else {
            y = seconds(yours);
            b = seconds(baseline);
        }
        if (!check()) {
            t.ok = false;
            break;
        }
        if (r >= 0) tb.push_back(b), ty.push_back(y);
    }
    if (!t.ok) return t;
    t = detail::summary(tb, ty);
    t.fresh = true;
    return t;
}

// Measures `baseline` and `yours` in turns, with the same inputs, `rounds`
// times each, after one warm-up run of each. Use this only for numbers
// without a goal, because a program can keep the result of an earlier call.
// Goals use compare_fresh.
template <class B, class Y>
Timing compare(B&& baseline, Y&& yours, int rounds = 9) {
    baseline();
    yours();
    std::vector<double> tb, ty;
    for (int r = 0; r < rounds; ++r) {
        tb.push_back(seconds(baseline));
        ty.push_back(seconds(yours));
    }
    return detail::summary(tb, ty);
}

// Shows one line of results. Returns true if the speedup reaches the goal.
// A goal is reached only if each round had new inputs.
inline bool report(std::string_view task, Timing t, double goal) {
    if (!t.ok) {
        std::println("{:<32} WRONG: a result of a timed round is not right (run the tests)", task);
        return false;
    }
    const bool ok = t.fresh && t.speedup() >= goal;
    std::println("{:<32} baseline {:8.2f} ms  yours {:8.2f} ms  speedup {:5.2f}x ±{:3.0f}%  goal {:4.2f}x  {}", task,
                 t.baseline * 1e3, t.yours * 1e3, t.speedup(), 100 * t.spread, goal,
                 ok ? "ok" : t.fresh ? "BELOW GOAL" : "NOT GRADED (same inputs every round)");
    return ok;
}

// Runs the benchmarks whose names start with the first command-line argument
// (all of them without one). Returns the exit code: 0 if all reached the goal.
struct Benchmarks {
    std::vector<std::pair<std::string_view, bool (*)()>> list;
    int run(int argc, char** argv) const {
        std::string_view only = argc > 1 ? argv[1] : "";
        int failed = 0, ran = 0;
        const detail::SeedMode m = detail::seed_mode();
        std::println("{} threads (set OMP_NUM_THREADS to change), inputs: {}", threads(),
                     m.random ? "new in every round (TIRA_SEED=random)"
                              : m.base == 0 ? "the default ones (set TIRA_SEED to change)" : "TIRA_SEED=" + std::to_string(m.base));
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
