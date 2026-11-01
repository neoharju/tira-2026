#include "vectors.hpp"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <numbers>
#include <numeric>
#include <print>
#include <random>
#include <stdexcept>

#include "tasks.hpp"

namespace w23 {

namespace {

// Random numbers that are the same with every compiler and standard library
// (std::normal_distribution is not): a double in [0, 1), and normal numbers
// by the Box-Muller method.
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

}  // namespace

Dataset sift_like(std::size_t n, std::uint64_t seed, std::uint64_t structure) {
    // 40 groups of 25 clusters. A cluster has a center and 16 directions in
    // which its vectors vary (with standard deviations 44, 40, 36, ...), and
    // every value gets noise with standard deviation 6. The cluster sizes
    // follow a power law. Then the values are rounded and cut to 0 ... 255.
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
    Dataset x(n, dim);
    std::vector<double> v(dim);
    for (std::size_t i = 0; i < n; ++i) {
        const auto c = static_cast<std::size_t>(std::ranges::upper_bound(cumulative, unit(r) * total) - cumulative.begin());
        std::copy_n(center.data() + c * dim, dim, v.data());
        for (std::size_t k = 0; k < rank; ++k) {
            const double z = normal(r) * 44 * std::pow(0.9, static_cast<double>(k));
            const double* u = basis.data() + (c * rank + k) * dim;
            for (std::size_t d = 0; d < dim; ++d) v[d] += z * u[d];
        }
        for (std::size_t d = 0; d < dim; ++d) x[i][d] = static_cast<float>(std::clamp(std::round(v[d] + 6 * normal(r)), 0.0, 255.0));
    }
    return x;
}

Dataset uniform_points(std::size_t n, std::size_t dim, std::uint32_t range, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    Dataset x(n, dim);
    for (float& v : x.values) v = static_cast<float>(rng() % range);
    return x;
}

Dataset read_fvecs(const std::string& path, std::size_t max_count) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    std::int32_t d = 0;
    Dataset x;
    std::vector<float> row;
    while (x.n < max_count && in.read(reinterpret_cast<char*>(&d), sizeof d)) {
        if (d <= 0 || (x.dim != 0 && static_cast<std::size_t>(d) != x.dim)) throw std::runtime_error("bad dimension in " + path);
        x.dim = static_cast<std::size_t>(d);
        row.resize(x.dim);
        if (!in.read(reinterpret_cast<char*>(row.data()), static_cast<std::streamsize>(x.dim * sizeof(float))))
            throw std::runtime_error("truncated file " + path);
        x.values.insert(x.values.end(), row.begin(), row.end());
        ++x.n;
    }
    return x;
}

Dataset benchmark_base() {
    const std::string path = "data/sift/sift_base.fvecs";
    if (std::filesystem::exists(path)) {
        std::println("vectors: {} (SIFT1M, the first 200,000)", path);
        return read_fvecs(path, 200000);
    }
    std::println("vectors: sift_like(200000, 1) (download SIFT1M with tools/download_sift.sh)");
    return sift_like(200000, 1);
}

Dataset benchmark_queries() {
    const std::string path = "data/sift/sift_query.fvecs";
    if (std::filesystem::exists(path)) return read_fvecs(path, 1000);
    return sift_like(1000, 2);
}

Dataset initial_centroids(const Dataset& data, std::size_t k, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<std::size_t> pick(data.n);
    std::iota(pick.begin(), pick.end(), std::size_t{0});
    Dataset c(k, data.dim);
    for (std::size_t i = 0; i < k; ++i) {
        std::size_t p = i % data.n;
        if (i < data.n) {
            std::swap(pick[i], pick[i + rng() % (data.n - i)]);  // a partial Fisher-Yates shuffle
            p = pick[i];
        }
        std::copy_n(data[p], data.dim, c[i]);
    }
    return c;
}

Dataset every(const Dataset& data, std::size_t step, std::size_t first) {
    Dataset x(first < data.n ? (data.n - first + step - 1) / step : 0, data.dim);
    for (std::size_t i = 0; i < x.n; ++i) std::copy_n(data[first + i * step], data.dim, x[i]);
    return x;
}

Results ground_truth(const Dataset& data, const Dataset& queries, std::size_t k) {
    Results truth(queries.n);
    const std::size_t dim = data.dim;
#pragma omp parallel
    {
        std::vector<Neighbor> all(data.n);
#pragma omp for schedule(dynamic)
        for (std::size_t q = 0; q < queries.n; ++q) {
            const float* query = queries[q];
            for (std::size_t i = 0; i < data.n; ++i) {
                const float* x = data[i];
                float s = 0;
#pragma omp simd reduction(+ : s)
                for (std::size_t d = 0; d < dim; ++d) s += (x[d] - query[d]) * (x[d] - query[d]);
                all[i] = {s, static_cast<Id>(i)};
            }
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

std::vector<Neighbor> rerank(const Dataset& data, const float* query, std::span<const Neighbor> candidates, std::size_t k) {
    std::vector<Neighbor> exact;
    exact.reserve(candidates.size());
    for (const Neighbor& c : candidates) exact.push_back({baseline::l2_squared(data[c.id], query, data.dim), c.id});
    std::ranges::sort(exact);
    if (exact.size() > k) exact.resize(k);
    return exact;
}

ProductQuantizer train_pq(const Dataset& sample, std::size_t m, std::size_t ksub, int iterations, std::uint64_t seed) {
    if (m == 0 || sample.dim % m != 0) throw std::invalid_argument("train_pq: dim must be a multiple of m");
    ProductQuantizer pq{sample.dim, m, ksub, std::vector<float>(sample.dim * ksub)};
    const std::size_t sd = pq.sub_dim();
    Dataset part(sample.n, sd);
    for (std::size_t j = 0; j < m; ++j) {
        for (std::size_t i = 0; i < sample.n; ++i) std::copy_n(sample[i] + j * sd, sd, part[i]);
        const Dataset c = kmeans(part, initial_centroids(part, ksub, seed + j), iterations);
        std::ranges::copy(c.values, pq.centroids.begin() + static_cast<std::ptrdiff_t>(j * ksub * sd));
    }
    return pq;
}

PackedCodes pack_codes(std::span<const std::uint8_t> codes, std::size_t n, std::size_t m) {
    PackedCodes p{n, m, {}};
    p.bytes.assign(p.blocks() * m * 16, 0);
    auto code = [&](std::size_t i, std::size_t j) { return i < n ? static_cast<std::uint8_t>(codes[i * m + j] & 15) : std::uint8_t{0}; };
    for (std::size_t b = 0; b < p.blocks(); ++b)
        for (std::size_t j = 0; j < m; ++j)
            for (std::size_t i = 0; i < 16; ++i)
                p.bytes[(b * m + j) * 16 + i] = static_cast<std::uint8_t>(code(32 * b + i, j) | code(32 * b + 16 + i, j) << 4);
    return p;
}

QuantizedTable quantize_table(std::span<const float> table, std::size_t m) {
    QuantizedTable q{m, std::vector<std::uint8_t>(m * 16), 1, 0};
    std::vector<float> low(m);
    float range = 0;
    for (std::size_t j = 0; j < m; ++j) {
        const auto [lo, hi] = std::minmax_element(table.begin() + static_cast<std::ptrdiff_t>(j * 16),
                                                  table.begin() + static_cast<std::ptrdiff_t>(j * 16 + 16));
        low[j] = *lo;
        range = std::max(range, *hi - *lo);
        q.offset += *lo;
    }
    if (range > 0) q.scale = range / 255;
    for (std::size_t j = 0; j < m; ++j)
        for (std::size_t c = 0; c < 16; ++c)
            q.lut[j * 16 + c] = static_cast<std::uint8_t>(std::clamp(std::round((table[j * 16 + c] - low[j]) / q.scale), 0.0f, 255.0f));
    return q;
}

}  // namespace w23
