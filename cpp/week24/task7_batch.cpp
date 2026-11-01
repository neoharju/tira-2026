// Task 7: run the queries in parallel with OpenMP. The index is only read;
// every thread needs its own Workspace.
#include "tasks.hpp"

namespace w24 {

Results search_batch(const Hnsw& index, const Vectors& queries, std::size_t k, std::size_t ef) {
    Results results(queries.n);
    Workspace work;
    for (std::size_t q = 0; q < queries.n; ++q) results[q] = search_fast(index, queries[q], k, ef, work);
    return results;
}

}  // namespace w24
