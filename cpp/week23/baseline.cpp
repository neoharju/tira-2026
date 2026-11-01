// Simple versions of the tasks, for comparison: easy to check, but slow.
#include <algorithm>
#include <limits>

#include "tasks.hpp"

namespace w23::baseline {

namespace {

// The number of the centroid nearest to x (the smaller number on a tie).
std::size_t nearest(const Dataset& centroids, const float* x) {
    std::size_t best = 0;
    float best_distance = std::numeric_limits<float>::infinity();
    for (std::size_t c = 0; c < centroids.n; ++c) {
        const float d = l2_squared(centroids[c], x, centroids.dim);
        if (d < best_distance) best = c, best_distance = d;
    }
    return best;
}

std::vector<Neighbor> best(std::vector<Neighbor> all, std::size_t k) {
    std::ranges::sort(all);
    if (all.size() > k) all.resize(k);
    return all;
}

}  // namespace

std::vector<Neighbor> knn(const Dataset& data, const float* query, std::size_t k) {
    std::vector<Neighbor> all(data.n);
    for (std::size_t i = 0; i < data.n; ++i) all[i] = {l2_squared(data[i], query, data.dim), static_cast<Id>(i)};
    return best(std::move(all), k);
}

Dataset kmeans(const Dataset& data, Dataset centroids, int iterations) {
    const std::size_t k = centroids.n, dim = data.dim;
    for (int it = 0; it < iterations && k > 0; ++it) {
        std::vector<double> sum(k * dim, 0.0);
        std::vector<std::size_t> count(k, 0);
        for (std::size_t i = 0; i < data.n; ++i) {
            const std::size_t c = nearest(centroids, data[i]);
            ++count[c];
            for (std::size_t d = 0; d < dim; ++d) sum[c * dim + d] += data[i][d];
        }
        for (std::size_t c = 0; c < k; ++c)
            if (count[c] > 0)
                for (std::size_t d = 0; d < dim; ++d)
                    centroids[c][d] = static_cast<float>(sum[c * dim + d] / static_cast<double>(count[c]));
    }
    return centroids;
}

Ivf build_ivf(const Dataset& data, Dataset centroids) {
    std::vector<std::vector<Id>> lists(centroids.n);
    for (std::size_t i = 0; i < data.n; ++i) lists[nearest(centroids, data[i])].push_back(static_cast<Id>(i));
    Ivf ivf{std::move(centroids), {0}, {}, Dataset(data.n, data.dim)};
    for (const auto& list : lists) {
        for (Id id : list) {
            std::copy_n(data[id], data.dim, ivf.vectors[ivf.ids.size()]);
            ivf.ids.push_back(id);
        }
        ivf.offset.push_back(static_cast<std::uint32_t>(ivf.ids.size()));
    }
    return ivf;
}

std::vector<Neighbor> search_ivf(const Ivf& ivf, const float* query, std::size_t k, std::size_t nprobe) {
    std::vector<Neighbor> lists(ivf.centroids.n);
    for (std::size_t c = 0; c < ivf.centroids.n; ++c) lists[c] = {l2_squared(ivf.centroids[c], query, ivf.centroids.dim), static_cast<Id>(c)};
    lists = best(std::move(lists), nprobe);
    std::vector<Neighbor> candidates;
    for (const Neighbor& list : lists)
        for (std::uint32_t p = ivf.offset[list.id]; p < ivf.offset[list.id + 1]; ++p)
            candidates.push_back({l2_squared(ivf.vectors[p], query, ivf.vectors.dim), ivf.ids[p]});
    return best(std::move(candidates), k);
}

std::vector<std::uint8_t> pq_encode(const ProductQuantizer& pq, const Dataset& data) {
    const std::size_t sd = pq.sub_dim();
    std::vector<std::uint8_t> codes(data.n * pq.m);
    for (std::size_t i = 0; i < data.n; ++i)
        for (std::size_t j = 0; j < pq.m; ++j) {
            std::size_t best_c = 0;
            float best_distance = std::numeric_limits<float>::infinity();
            for (std::size_t c = 0; c < pq.ksub; ++c) {
                const float d = l2_squared(data[i] + j * sd, pq.centroid(j, c), sd);
                if (d < best_distance) best_c = c, best_distance = d;
            }
            codes[i * pq.m + j] = static_cast<std::uint8_t>(best_c);
        }
    return codes;
}

std::vector<float> pq_table(const ProductQuantizer& pq, const float* query) {
    const std::size_t sd = pq.sub_dim();
    std::vector<float> table(pq.m * pq.ksub);
    for (std::size_t j = 0; j < pq.m; ++j)
        for (std::size_t c = 0; c < pq.ksub; ++c) table[j * pq.ksub + c] = l2_squared(query + j * sd, pq.centroid(j, c), sd);
    return table;
}

std::vector<Neighbor> pq_search(const ProductQuantizer& pq, std::span<const std::uint8_t> codes, std::span<const float> table,
                                std::size_t k) {
    const std::size_t n = codes.size() / pq.m;
    std::vector<Neighbor> all(n);
    for (std::size_t i = 0; i < n; ++i) {
        float s = 0;
        for (std::size_t j = 0; j < pq.m; ++j) s += table[j * pq.ksub + codes[i * pq.m + j]];
        all[i] = {s, static_cast<Id>(i)};
    }
    return best(std::move(all), k);
}

}  // namespace w23::baseline
