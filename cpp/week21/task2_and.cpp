// Task 2: AND queries. This is right, but it merges the lists in the order of
// the query. Intersect the shortest lists first, and use galloping when one
// list is much longer than the other.
#include <algorithm>
#include <iterator>

#include "tasks.hpp"

namespace w21 {

std::vector<DocId> intersect(std::span<const DocId> a, std::span<const DocId> b) {
    std::vector<DocId> out;
    std::set_intersection(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(out));
    return out;
}

std::vector<DocId> and_query(const Index& index, std::span<const TermId> query) {
    if (query.empty()) return {};
    auto p = index.postings(query[0]);
    std::vector<DocId> result(p.begin(), p.end());
    for (std::size_t i = 1; i < query.size(); ++i) result = intersect(result, index.postings(query[i]));
    return result;
}

}  // namespace w21
