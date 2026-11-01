// Task 7: run the searches in parallel with OpenMP.
#include "tasks.hpp"

namespace w25 {

void search_batch(const StaticBTree& t, std::span<const Key> queries, std::span<Key> results) {
    for (std::size_t i = 0; i < queries.size(); ++i) results[i] = static_btree_search(t, queries[i]);
}

}  // namespace w25
