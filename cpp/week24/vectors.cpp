#include "vectors.hpp"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <numbers>
#include <print>
#include <random>
#include <stdexcept>

namespace w24 {

namespace {

// The same random numbers with every compiler and standard library.
double unit(std::mt19937_64& rng) { return static_cast<double>(rng() >> 11) * 0x1.0p-53; }

struct Normal {
    bool ready = false;
    double spare = 0;
    double operator()(std::mt19937_64& rng) {
        if (ready) {
            ready = false;
            return spare;
        }
        const double r = std::sqrt(-2 * std::log(1 - unit(rng))), angle = 2 * std::numbers::pi * unit(rng);
        spare = r * std::sin(angle);
        ready = true;
        return r * std::cos(angle);
    }
};

std::uint32_t distance(const std::uint8_t* a, const std::uint8_t* b, std::size_t dim) {
    std::uint32_t s = 0;
    for (std::size_t d = 0; d < dim; ++d) {
        const int x = a[d] - b[d];
        s += static_cast<std::uint32_t>(x * x);
    }
    return s;
}

}  // namespace

Vectors sift_like(std::size_t n, std::uint64_t seed, std::uint64_t structure) {
    // As in week 23: 40 groups of 25 clusters, 16 directions per cluster,
    // noise 6, rounded and cut to 0 ... 255.
    constexpr std::size_t dim = 128, groups = 40, per_group = 25, clusters = groups * per_group, rank = 16;
    std::mt19937_64 s(structure);
    Normal normal;
    std::vector<double> center(clusters * dim), basis(clusters * rank * dim), group(dim), cumulative(clusters);
    for (std::size_t g = 0; g < groups; ++g) {
        for (double& v : group) v = std::exp(2.8 + normal(s)) - 12;
        for (std::size_t c = g * per_group; c < (g + 1) * per_group; ++c)
            for (std::size_t d = 0; d < dim; ++d) center[c * dim + d] = group[d] + 5 * normal(s);
    }
    for (std::size_t b = 0; b < clusters * rank; ++b) {
        double* u = basis.data() + b * dim;
        double norm = 0;
        for (std::size_t d = 0; d < dim; ++d) u[d] = normal(s);
        for (std::size_t d = 0; d < dim; ++d) norm += u[d] * u[d];
        for (std::size_t d = 0; d < dim; ++d) u[d] /= std::sqrt(norm);
    }
    double total = 0;
    for (double& c : cumulative) c = total += std::pow(1 - unit(s), -1 / 1.5);

    std::mt19937_64 r(seed);
    Vectors x(n, dim);
    std::vector<double> v(dim);
    for (std::size_t i = 0; i < n; ++i) {
        const auto c = static_cast<std::size_t>(std::ranges::upper_bound(cumulative, unit(r) * total) - cumulative.begin());
        std::copy_n(center.data() + c * dim, dim, v.data());
        for (std::size_t k = 0; k < rank; ++k) {
            const double z = normal(r) * 44 * std::pow(0.9, static_cast<double>(k));
            const double* u = basis.data() + (c * rank + k) * dim;
            for (std::size_t d = 0; d < dim; ++d) v[d] += z * u[d];
        }
        for (std::size_t d = 0; d < dim; ++d) x[i][d] = static_cast<std::uint8_t>(std::clamp(std::round(v[d] + 6 * normal(r)), 0.0, 255.0));
    }
    return x;
}

Vectors random_bytes(std::size_t n, std::size_t dim, unsigned range, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    Vectors x(n, dim);
    for (auto& v : x.values) v = static_cast<std::uint8_t>(rng() % range);
    return x;
}

Vectors read_fvecs(const std::string& path, std::size_t max_count) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    std::int32_t d = 0;
    Vectors x;
    std::vector<float> row;
    while (x.n < max_count && in.read(reinterpret_cast<char*>(&d), sizeof d)) {
        if (d <= 0 || (x.dim != 0 && static_cast<std::size_t>(d) != x.dim)) throw std::runtime_error("bad dimension in " + path);
        x.dim = static_cast<std::size_t>(d);
        row.resize(x.dim);
        if (!in.read(reinterpret_cast<char*>(row.data()), static_cast<std::streamsize>(x.dim * sizeof(float))))
            throw std::runtime_error("truncated file " + path);
        for (float v : row) x.values.push_back(static_cast<std::uint8_t>(std::clamp(std::round(v), 0.0f, 255.0f)));
        ++x.n;
    }
    return x;
}

Vectors benchmark_base() {
    const std::string path = "data/sift/sift_base.fvecs";
    if (std::filesystem::exists(path)) {
        std::println("vectors: {} (SIFT1M, the first 100,000)", path);
        return read_fvecs(path, 100000);
    }
    std::println("vectors: sift_like(100000, 1) (download SIFT1M with tools/download_sift.sh)");
    return sift_like(100000, 1);
}

Vectors benchmark_queries() {
    const std::string path = "data/sift/sift_query.fvecs";
    if (std::filesystem::exists(path)) return read_fvecs(path, 1000);
    return sift_like(1000, 2);
}

Results ground_truth(const Vectors& data, const Vectors& queries, std::size_t k) {
    Results truth(queries.n);
#pragma omp parallel
    {
        std::vector<Neighbor> all(data.n);
#pragma omp for schedule(dynamic)
        for (std::size_t q = 0; q < queries.n; ++q) {
            for (std::size_t i = 0; i < data.n; ++i) all[i] = {distance(data[i], queries[q], data.dim), static_cast<Id>(i)};
            const std::size_t m = std::min(k, all.size());
            std::ranges::partial_sort(all, all.begin() + static_cast<std::ptrdiff_t>(m));
            truth[q].assign(all.begin(), all.begin() + static_cast<std::ptrdiff_t>(m));
        }
    }
    return truth;
}

double recall(const Results& results, const Results& truth, std::size_t k) {
    std::size_t found = 0, wanted = 0;
    for (std::size_t q = 0; q < truth.size(); ++q) {
        const std::size_t t = std::min(k, truth[q].size());
        wanted += t;
        if (q >= results.size()) continue;
        const std::size_t r = std::min(k, results[q].size());
        for (std::size_t i = 0; i < r; ++i)
            for (std::size_t j = 0; j < t; ++j)
                if (results[q][i].id == truth[q][j].id) {
                    ++found;
                    break;
                }
    }
    return wanted ? static_cast<double>(found) / static_cast<double>(wanted) : 1.0;
}

}  // namespace w24
