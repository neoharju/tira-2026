// Task 4: the same result as top_k with MaxScore: skip the documents that
// cannot get into the top k.
#include "tasks.hpp"

namespace w21 {

std::vector<Hit> top_k_maxscore(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k) {
    return top_k(index, scores, query, k);  // TODO: MaxScore
}

}  // namespace w21
