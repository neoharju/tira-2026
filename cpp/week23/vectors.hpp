// Week 23: vectors, data sets, recall and the helpers of product
// quantization. This file is given (you do not need to change it).
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <new>
#include <span>
#include <string>
#include <vector>

namespace w23 {

using Id = std::uint32_t;

// An allocator that starts an array at a cache line (64 bytes). Then a
// vector of 128 floats (512 bytes) fills exactly 8 cache lines, and a 256-bit
// load of 8 floats never crosses a cache line.
template <class T>
struct CacheAligned {
    using value_type = T;
    CacheAligned() = default;
    template <class U>
    CacheAligned(const CacheAligned<U>&) {}
    T* allocate(std::size_t n) { return static_cast<T*>(::operator new(n * sizeof(T), std::align_val_t{64})); }
    void deallocate(T* p, std::size_t) { ::operator delete(p, std::align_val_t{64}); }
    friend bool operator==(CacheAligned, CacheAligned) { return true; }
};

// n vectors of dim floats, one after another: data[i] points to the dim
// values of vector i.
struct Dataset {
    std::size_t n = 0, dim = 0;
    std::vector<float, CacheAligned<float>> values;

    Dataset() = default;
    Dataset(std::size_t count, std::size_t dimension) : n(count), dim(dimension), values(count * dimension) {}
    float* operator[](std::size_t i) { return values.data() + i * dim; }
    const float* operator[](std::size_t i) const { return values.data() + i * dim; }
    bool operator==(const Dataset&) const = default;
};

// A result of a search: the (squared) distance and the number of the vector.
// Results are ordered by distance, and on equal distances by id.
struct Neighbor {
    float distance;
    Id id;
    friend auto operator<=>(const Neighbor&, const Neighbor&) = default;
};

using Results = std::vector<std::vector<Neighbor>>;

// ---- Data -----------------------------------------------------------------

// SIFT-like vectors: 128 whole numbers from 0 to 255, like the SIFT
// descriptors of the TEXMEX corpus. The vectors lie in clusters of different
// sizes, and inside a cluster mostly along a few directions. All vectors with
// the same `structure` come from the same clusters; `seed` picks the vectors.
Dataset sift_like(std::size_t n, std::uint64_t seed, std::uint64_t structure = 23);

// n points with dim whole-number coordinates from 0 to range - 1, uniform.
Dataset uniform_points(std::size_t n, std::size_t dim, std::uint32_t range, std::uint64_t seed);

// Reads the .fvecs format of the TEXMEX corpus: for every vector, its
// dimension as a 32-bit integer and then its values as 32-bit floats. Reads
// at most max_count vectors.
Dataset read_fvecs(const std::string& path, std::size_t max_count = std::numeric_limits<std::size_t>::max());

// The data of the benchmarks: the first 200,000 vectors and the first 1000
// queries of SIFT1M if data/sift/sift_base.fvecs and data/sift/sift_query.fvecs
// exist (see tools/download_sift.sh), otherwise sift_like(200000, 1) and
// sift_like(1000, 2).
Dataset benchmark_base();
Dataset benchmark_queries();

// k vectors of the data chosen at random (all different if k <= data.n), for
// starting k-means.
Dataset initial_centroids(const Dataset& data, std::size_t k, std::uint64_t seed);

// The vectors data[first], data[first + step], data[first + 2 * step], ...
Dataset every(const Dataset& data, std::size_t step, std::size_t first = 0);

// ---- Checking results -----------------------------------------------------

// The exact k nearest neighbours of every query, with OpenMP threads and a
// simple distance loop. For checking results and measuring recall.
Results ground_truth(const Dataset& data, const Dataset& queries, std::size_t k);

// recall@k: the fraction of the true k nearest neighbours that are among the
// first k results, over all queries.
double recall(const Results& results, const Results& truth, std::size_t k);

// The best k of the candidates by their exact distance to the query (for
// re-ranking the candidates of an approximate search).
std::vector<Neighbor> rerank(const Dataset& data, const float* query, std::span<const Neighbor> candidates, std::size_t k);

// ---- Product quantization (tasks 6 and 7) --------------------------------

// The product quantizer cuts a vector of dim values into m parts of
// dim / m values. Part j has ksub centroids (ksub <= 256), so the number of a
// centroid fits in a byte.
struct ProductQuantizer {
    std::size_t dim = 0, m = 0, ksub = 0;
    std::vector<float> centroids;  // centroid c of part j starts at (j * ksub + c) * sub_dim()

    std::size_t sub_dim() const { return dim / m; }
    const float* centroid(std::size_t j, std::size_t c) const { return centroids.data() + (j * ksub + c) * sub_dim(); }
};

// Trains the centroids of every part with your kmeans (task 4): `iterations`
// rounds from initial_centroids of that part of the sample.
ProductQuantizer train_pq(const Dataset& sample, std::size_t m, std::size_t ksub, int iterations, std::uint64_t seed);

// The codes of 4-bit product quantization (ksub = 16) in blocks of 32
// vectors. For part j of block b, 16 bytes start at (b * m + j) * 16: byte i
// has the code of vector 32 * b + i in its low 4 bits and the code of vector
// 32 * b + 16 + i in its high 4 bits. The last block is filled with code 0.
struct PackedCodes {
    std::size_t n = 0, m = 0;
    std::vector<std::uint8_t> bytes;

    std::size_t blocks() const { return (n + 31) / 32; }
};

// Packs codes[i * m + j] (each below 16) of n vectors.
PackedCodes pack_codes(std::span<const std::uint8_t> codes, std::size_t n, std::size_t m);

// A distance table (16 values per part) rounded to bytes: lut[j * 16 + c] is
// round((table[j * 16 + c] - min of part j) / scale), from 0 to 255, where
// scale is the same for all parts. So the approximate distance is
// scale * (sum of the bytes) + offset, with offset = the sum of the minimums.
struct QuantizedTable {
    std::size_t m = 0;
    std::vector<std::uint8_t> lut;
    float scale = 1, offset = 0;
};
QuantizedTable quantize_table(std::span<const float> table, std::size_t m);

}  // namespace w23
