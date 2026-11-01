// Task 6: the same results as search, faster: your l2_squared, and
// _mm_prefetch for the vectors of the links before their distances are
// computed. Now this calls your search of task 4.
#include <immintrin.h>

#include "tasks.hpp"

namespace w24 {

std::vector<Neighbor> search_fast(const Hnsw& index, const std::uint8_t* query, std::size_t k, std::size_t ef, Workspace& work) {
    return search(index, query, k, ef, work);  // TODO
}

}  // namespace w24
