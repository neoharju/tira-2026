// Week 21: the functions that you write. Each one is in its own file
// (task1_index.cpp, ...); task 5 is declared in roaring.hpp. The tests are in
// test.cpp and the speed goals in bench.cpp.
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "index.hpp"
#include "roaring.hpp"

namespace w21 {

// Task 1. The inverted index of the documents; document i has the id i. Terms
// get ids in the order of their first appearance (document by document, token
// by token, with for_each_token). The starting code is right but slow.
Index build_index(std::span<const std::string> docs);

// Task 2. The values that are in both a and b (both increasing), in
// increasing order. Use galloping when one list is much longer.
std::vector<DocId> intersect(std::span<const DocId> a, std::span<const DocId> b);

// Task 2. The documents that contain every term of the query, in increasing
// order. An empty query gives an empty result.
std::vector<DocId> and_query(const Index& index, std::span<const TermId> query);

// Task 3. The k best documents for a query of different terms: every document
// that contains at least one term of the query gets the score "sum of its
// impacts for the query terms" (scores.impact), and the result is the best k
// of them, best first (see better() in index.hpp). If fewer documents match,
// the result has all of them.
std::vector<Hit> top_k(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k);

// Task 4. The same result with MaxScore (see the chapter).
std::vector<Hit> top_k_maxscore(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k);

// Task 6. Writes the values that are in both a and b (both increasing) to
// out, in increasing order, and returns how many there are. out has room for
// std::min(a.size(), b.size()) + 8 values, so an AVX2 store may write up to 8
// values past the end of the result. Use AVX2 intrinsics.
std::size_t intersect_avx2(std::span<const std::uint32_t> a, std::span<const std::uint32_t> b, std::uint32_t* out);

// Task 7. Delta and varint coding of a posting list. encode writes the first
// doc id and then the gaps postings[i] - postings[i - 1]. Every number is a
// varint: 7 bits per byte, the lowest 7 bits first, and the highest bit of a
// byte is 1 if another byte of the same number follows. decode reads `count`
// doc ids back.
std::vector<std::uint8_t> encode(std::span<const DocId> postings);
std::vector<DocId> decode(std::span<const std::uint8_t> bytes, std::size_t count);

// Task 8. The same index as build_index, built with OpenMP threads.
Index build_index_parallel(std::span<const std::string> docs);

// Simple versions for comparison (baseline.cpp and baseline_scalar.cpp). The
// tests compare your results with these, and the benchmarks your speed.
namespace baseline {
Index build_index(std::span<const std::string> docs);
std::vector<DocId> intersect(std::span<const DocId> a, std::span<const DocId> b);
std::vector<DocId> and_query(const Index& index, std::span<const TermId> query);
std::vector<Hit> top_k(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k);
std::size_t intersect_scalar(std::span<const std::uint32_t> a, std::span<const std::uint32_t> b, std::uint32_t* out);
std::vector<std::uint8_t> encode(std::span<const DocId> postings);
std::vector<DocId> decode(std::span<const std::uint8_t> bytes, std::size_t count);
}  // namespace baseline

}  // namespace w21
