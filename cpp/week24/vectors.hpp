// Week 24: vectors of bytes, data sets and recall. This file is given (you do
// not need to change it).
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <new>
#include <string>
#include <vector>

namespace w24 {

using Id = std::uint32_t;

// An allocator that starts an array at a cache line (64 bytes): a vector of
// 128 bytes then fills exactly two cache lines.
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

// n vectors of dim bytes, one after another: data[i] points to vector i.
// SIFT descriptors are whole numbers from 0 to 255, so a byte holds each
// value exactly: a quarter of the memory of floats, and the distances are
// exact whole numbers.
struct Vectors {
    std::size_t n = 0, dim = 0;
    std::vector<std::uint8_t, CacheAligned<std::uint8_t>> values;

    Vectors() = default;
    Vectors(std::size_t count, std::size_t dimension) : n(count), dim(dimension), values(count * dimension) {}
    std::uint8_t* operator[](std::size_t i) { return values.data() + i * dim; }
    const std::uint8_t* operator[](std::size_t i) const { return values.data() + i * dim; }
    bool operator==(const Vectors&) const = default;
};

// A result of a search: the squared distance and the number of the vector.
// One result is better than another if its distance is smaller, or the
// distances are equal and its id is smaller.
struct Neighbor {
    std::uint32_t distance;
    Id id;
    friend auto operator<=>(const Neighbor&, const Neighbor&) = default;
};

using Results = std::vector<std::vector<Neighbor>>;

// SIFT-like vectors (the generator of week 23): 128 bytes, in clusters.
Vectors sift_like(std::size_t n, std::uint64_t seed, std::uint64_t structure = 23);

// n vectors of dim random bytes from 0 to range - 1.
Vectors random_bytes(std::size_t n, std::size_t dim, unsigned range, std::uint64_t seed);

// Reads a .fvecs file of the TEXMEX corpus (at most max_count vectors) and
// rounds the values to bytes: SIFT values are whole numbers from 0 to 255.
Vectors read_fvecs(const std::string& path, std::size_t max_count = std::numeric_limits<std::size_t>::max());

// The data of the benchmarks: the first 100,000 vectors and the first 1000
// queries of SIFT1M if data/sift/sift_base.fvecs and data/sift/sift_query.fvecs
// exist (see tools/download_sift.sh), otherwise sift_like(100000, 1) and
// sift_like(1000, 2).
Vectors benchmark_base();
Vectors benchmark_queries();

// The exact k nearest neighbours of every query by brute force, with OpenMP
// threads, for checking results.
Results ground_truth(const Vectors& data, const Vectors& queries, std::size_t k);

// recall@k: the fraction of the true k nearest neighbours that are among the
// first k results, over all queries.
double recall(const Results& results, const Results& truth, std::size_t k);

}  // namespace w24
