// Task 8: run the queries in parallel with OpenMP. Every thread may write only
// the results of its own queries.
#include "tasks.hpp"

namespace w23 {

Results knn_batch(const Dataset& data, const Dataset& queries, std::size_t k) {
    Results results(queries.n);
    for (std::size_t q = 0; q < queries.n; ++q) results[q] = knn(data, queries[q], k);
    return results;
}

}  // namespace w23
