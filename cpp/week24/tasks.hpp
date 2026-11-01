// Week 24: the functions that you write. Each one is in its own file
// (task1_select.cpp, ...). The tests are in test.cpp and the speed goals in
// bench.cpp.
//
// All distances are exact whole numbers (the squared Euclidean distance of
// two byte vectors), so ties are real: when this file says "nearest" or
// "better", it compares (distance, id), as operator< of Neighbor does.
#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "hnsw.hpp"
#include "vectors.hpp"

namespace w24 {

// Task 1. The neighbour heuristic of HNSW. The candidates are sorted by
// their distance to some node q (the distance is in each Neighbor). Go through
// them in this order and keep a candidate e if no candidate kept before it is
// nearer to e than q is: keep e if l2(e, r) >= e.distance for every kept r.
// Stop when `count` are kept. Returns the kept candidates, in order.
std::vector<Neighbor> select_neighbors(const Vectors& data, std::span<const Neighbor> candidates, std::size_t count);

// Task 2. The search in one layer: a beam search that keeps the ef best nodes
// found so far. Start from the entry points (with their distances to the
// query). Repeat: take the best candidate c that is not yet expanded; stop if
// ef results have been found and c is worse than the worst of them.
// Otherwise look at the links of c on this layer: a node that has not been
// seen before becomes a candidate and a result if fewer than ef results have
// been found or it is better than the worst result (which then leaves the
// results). Returns the results, best first.
std::vector<Neighbor> search_layer(const Hnsw& index, const std::uint8_t* query, std::span<const Neighbor> entry, std::size_t ef,
                                   int layer, Workspace& work);

// Task 3. Inserts node `id` (always index.inserted) into the index:
//  1. If the index is empty, the node becomes the entry point and the top.
//  2. From the entry point, go down the layers above the level of the node
//     with search_layer and ef = 1: the result is the entry of the next layer.
//  3. On every layer from min(level, top) down to 0: search_layer with
//     ef_construction from the entry points (on the first such layer the
//     node of step 2, then the results of the layer above). Link the node to
//     the select_neighbors(results, m) and link each of them back to the node.
//     If that gives a node more than capacity(layer) links, choose its new
//     links with select_neighbors among the old ones and the new node, sorted
//     by their distance to it.
//  4. If the level of the node is above the top, it becomes the entry point.
void insert(Hnsw& index, Id id, std::size_t ef_construction, Workspace& work);

// Task 4. The k nearest neighbours of the query: from the entry point, go down
// to layer 1 with search_layer and ef = 1, then search layer 0 with
// max(ef, k) and return the first k results. Do not prefetch here: task 6
// measures what prefetching adds to this search.
std::vector<Neighbor> search(const Hnsw& index, const std::uint8_t* query, std::size_t k, std::size_t ef, Workspace& work);

// Task 5. The squared Euclidean distance of two byte vectors with AVX2.
// Automatic vectorization is off for this file.
std::uint32_t l2_squared(const std::uint8_t* a, const std::uint8_t* b, std::size_t dim);

// Task 6. The same results as search, but faster: prefetch the vectors (and
// links) that the search needs next, so that their loads overlap.
std::vector<Neighbor> search_fast(const Hnsw& index, const std::uint8_t* query, std::size_t k, std::size_t ef, Workspace& work);

// Task 7. results[i] = search_fast(index, queries[i], k, ef), with OpenMP
// threads; every thread needs its own Workspace.
Results search_batch(const Hnsw& index, const Vectors& queries, std::size_t k, std::size_t ef);

// Task 8. The parameters of the index and the ef of the search with which the
// benchmark reaches its goal: recall@10 of at least 0.95 with few distance
// computations per query (see bench.cpp).
struct Settings {
    Params params;
    std::size_t ef;
};
Settings tuned_settings();

// Simple versions for comparison (baseline.cpp and baseline_scalar.cpp).
namespace baseline {
std::uint32_t l2_squared(const std::uint8_t* a, const std::uint8_t* b, std::size_t dim);
// With std::priority_queue and std::unordered_set, which allocate memory.
std::vector<Neighbor> search_layer(const Hnsw& index, const std::uint8_t* query, std::span<const Neighbor> entry, std::size_t ef,
                                   int layer);
std::vector<Neighbor> search(const Hnsw& index, const std::uint8_t* query, std::size_t k, std::size_t ef);
// The number of distances that baseline::search_layer has computed in this
// thread (the benchmark of task 8 counts them).
std::uint64_t& distances_computed();
// Brute force: all distances, then sorted.
std::vector<Neighbor> knn(const Vectors& data, const std::uint8_t* query, std::size_t k);
}  // namespace baseline

}  // namespace w24
