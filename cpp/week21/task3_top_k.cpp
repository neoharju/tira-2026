// Task 3: the k best documents, term at a time, with a heap.
#include <queue>

#include "tasks.hpp"

namespace w21 {

std::vector<Hit> top_k(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k) {
    (void)index;  // TODO
    (void)scores;
    (void)query;
    (void)k;
    return {};
}

}  // namespace w21
