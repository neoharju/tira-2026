// Week 23: the functions that you write. Each one is in its own file
// (task1_distance.cpp, ...). The tests are in test.cpp and the speed goals in
// bench.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "vectors.hpp"

namespace w23 {

// Task 1. The squared Euclidean distance, the sum of (a[i] - b[i])^2, and the
// inner product, the sum of a[i] * b[i], of two vectors of dim values, with
// AVX2 and FMA intrinsics. Automatic vectorization is off for this file.
float l2_squared(const float* a, const float* b, std::size_t dim);
float inner_product(const float* a, const float* b, std::size_t dim);

// Task 2. The k nearest neighbours of the query by brute force: the k vectors
// with the smallest l2_squared distance, sorted by distance and on equal
// distances by id. All vectors if k >= data.n.
std::vector<Neighbor> knn(const Dataset& data, const float* query, std::size_t k);

// Task 3. A k-d tree. The points are reordered into an implicit tree: the
// range [lo, hi) at depth t (the whole array at depth 0) is a leaf if it has
// at most leaf_size points. Otherwise it is split by coordinate t % dim at
// mid = lo + (hi - lo) / 2: points[mid] is the median of that coordinate,
// the range [lo, mid) has no larger values in it and [mid + 1, hi) no smaller
// ones. Both are subtrees at depth t + 1.
struct KdTree {
    Dataset points;        // the points in tree order
    std::vector<Id> ids;   // ids[i] is the number of points[i] in the input
    std::size_t leaf_size = 8;
};
KdTree build_kdtree(const Dataset& points, std::size_t leaf_size);
// The k nearest neighbours of the query, exactly as knn would find them.
std::vector<Neighbor> kdtree_knn(const KdTree& tree, const float* query, std::size_t k);

// Task 4. k-means with Lloyd's algorithm. `iterations` times: give every
// vector to its nearest centroid (by l2_squared; on equal distances the one
// with the smaller number), then move every centroid to the mean of its
// vectors. A centroid without vectors stays where it is. Returns the centroids.
Dataset kmeans(const Dataset& data, Dataset centroids, int iterations);

// Task 5. The inverted file index (IVF): every vector is in the list of its
// nearest centroid (on equal distances the one with the smaller number), and
// the vectors of a list are stored one after another, by increasing id.
struct Ivf {
    Dataset centroids;                  // nlist centroids
    std::vector<std::uint32_t> offset;  // list c has the vectors offset[c] ... offset[c + 1] - 1
    std::vector<Id> ids;                // the numbers of the vectors in list order
    Dataset vectors;                    // the vectors in list order
};
Ivf build_ivf(const Dataset& data, Dataset centroids);
// The k nearest neighbours among the vectors of the nprobe lists whose
// centroids are nearest to the query (on equal distances the smaller number),
// sorted by distance and on equal distances by id.
std::vector<Neighbor> search_ivf(const Ivf& ivf, const float* query, std::size_t k, std::size_t nprobe);

// Task 6. Product quantization with up to 256 centroids per part.
// The code of vector i: codes[i * pq.m + j] is the number of the centroid of
// part j that is nearest to part j of the vector (on equal distances the
// smaller number).
std::vector<std::uint8_t> pq_encode(const ProductQuantizer& pq, const Dataset& data);
// The distance table of the query: table[j * pq.ksub + c] is the l2_squared
// distance between part j of the query and centroid c of part j.
std::vector<float> pq_table(const ProductQuantizer& pq, const float* query);
// The k vectors with the smallest approximate distance, the sum of
// table[j * pq.ksub + code[j]] over the parts j, sorted by that distance and on
// equal distances by id.
std::vector<Neighbor> pq_search(const ProductQuantizer& pq, std::span<const std::uint8_t> codes, std::span<const float> table,
                                std::size_t k);

// Task 7. Fast scan of 4-bit codes with AVX2: for every vector i,
// sums[i] = the sum over the parts j of table.lut[j * 16 + (code of vector i
// in part j)]. sums has room for 32 * codes.blocks() values. Automatic
// vectorization is off for this file.
void fast_scan(const PackedCodes& codes, const QuantizedTable& table, std::span<std::uint16_t> sums);

// Task 8. The k nearest neighbours of every query, with OpenMP threads:
// result[i] is the same as knn(data, queries[i], k).
Results knn_batch(const Dataset& data, const Dataset& queries, std::size_t k);

// Simple versions for comparison (baseline.cpp and baseline_scalar.cpp).
namespace baseline {
float l2_squared(const float* a, const float* b, std::size_t dim);
float inner_product(const float* a, const float* b, std::size_t dim);
// All distances into one array, then sorted.
std::vector<Neighbor> knn(const Dataset& data, const float* query, std::size_t k);
Dataset kmeans(const Dataset& data, Dataset centroids, int iterations);
Ivf build_ivf(const Dataset& data, Dataset centroids);
std::vector<Neighbor> search_ivf(const Ivf& ivf, const float* query, std::size_t k, std::size_t nprobe);
std::vector<std::uint8_t> pq_encode(const ProductQuantizer& pq, const Dataset& data);
std::vector<float> pq_table(const ProductQuantizer& pq, const float* query);
std::vector<Neighbor> pq_search(const ProductQuantizer& pq, std::span<const std::uint8_t> codes, std::span<const float> table,
                                std::size_t k);
void fast_scan(const PackedCodes& codes, const QuantizedTable& table, std::span<std::uint16_t> sums);
}  // namespace baseline

}  // namespace w23
