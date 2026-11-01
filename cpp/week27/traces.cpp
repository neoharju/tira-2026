// The access traces of week 27.
#include <algorithm>
#include <cmath>
#include <random>

#include "cache.hpp"
#include "sketch.hpp"

namespace w27 {

namespace {

// Draws ranks 0 ... keys - 1 with Zipf probabilities: a binary search in the
// cumulative probabilities.
class Zipf {
public:
    Zipf(std::size_t keys, double alpha) : cdf_(keys) {
        double sum = 0;
        for (std::size_t i = 0; i < keys; ++i) cdf_[i] = sum += 1.0 / std::pow(static_cast<double>(i + 1), alpha);
        for (double& c : cdf_) c /= sum;
    }
    std::size_t operator()(std::mt19937_64& rng) const {
        const double u = static_cast<double>(rng() >> 11) * 0x1.0p-53;  // in [0, 1), the same on every system
        return std::min<std::size_t>(static_cast<std::size_t>(std::ranges::upper_bound(cdf_, u) - cdf_.begin()), cdf_.size() - 1);
    }

private:
    std::vector<double> cdf_;
};

}  // namespace

std::vector<std::uint64_t> zipf_trace(std::size_t length, std::size_t keys, double alpha, std::uint64_t seed) {
    const Zipf zipf(keys, alpha);
    std::mt19937_64 rng(seed);
    std::vector<std::uint64_t> t(length);
    for (auto& k : t) k = mix(zipf(rng) + (seed << 40));
    return t;
}

std::vector<std::uint64_t> scan_trace(std::size_t length, std::size_t keys, double alpha, std::size_t every,
                                      std::size_t scan, std::uint64_t seed) {
    const Zipf zipf(keys, alpha);
    std::mt19937_64 rng(seed);
    std::vector<std::uint64_t> t;
    t.reserve(length);
    std::uint64_t fresh = std::uint64_t{1} << 62;  // scanned keys, never repeated
    while (t.size() < length) {
        for (std::size_t i = 0; i < every && t.size() < length; ++i) t.push_back(mix(zipf(rng) + (seed << 40)));
        for (std::size_t i = 0; i < scan && t.size() < length; ++i) t.push_back(mix(fresh++));
    }
    return t;
}

std::vector<std::uint64_t> loop_trace(std::size_t length, std::size_t keys) {
    std::vector<std::uint64_t> t(length);
    for (std::size_t i = 0; i < length; ++i) t[i] = mix(i % keys);
    return t;
}

std::vector<std::uint64_t> shifting_trace(std::size_t length, std::size_t keys, double alpha, std::size_t phase,
                                          std::uint64_t seed) {
    const Zipf zipf(keys, alpha);
    std::mt19937_64 rng(seed);
    std::vector<std::uint64_t> t(length);
    for (std::size_t i = 0; i < length; ++i) t[i] = mix(zipf(rng) + ((seed + i / phase) << 40));
    return t;
}

}  // namespace w27
