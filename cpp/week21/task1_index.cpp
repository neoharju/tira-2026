// Task 1: this works, but it is slow: std::map compares strings in a tree,
// every token becomes a std::string, and every term has its own vector.
// Make it fast with a hash map that can look up a string_view and with the
// CSR construction of week 18 (counting sort by term).
#include <map>

#include "tasks.hpp"

namespace w21 {

Index build_index(std::span<const std::string> docs) {
    std::map<std::string, TermId> ids;  // the text of a term -> its id
    std::vector<std::vector<std::pair<DocId, std::uint32_t>>> lists;  // (doc, frequency) of every term
    Index index;
    std::string buffer;
    for (DocId d = 0; d < docs.size(); ++d) {
        std::uint32_t length = 0;
        for_each_token(docs[d], buffer, [&](std::string_view token) {
            ++length;
            auto [it, added] = ids.try_emplace(std::string(token), static_cast<TermId>(index.terms.size()));
            if (added) {
                index.terms.emplace_back(token);
                lists.emplace_back();
            }
            auto& list = lists[it->second];
            if (list.empty() || list.back().first != d) list.push_back({d, 0});
            ++list.back().second;
        });
        index.doc_length.push_back(length);
    }
    index.offset.push_back(0);
    for (const auto& list : lists) {
        for (auto [d, f] : list) {
            index.docs.push_back(d);
            index.freqs.push_back(f);
        }
        index.offset.push_back(static_cast<std::uint32_t>(index.docs.size()));
    }
    return index;
}

}  // namespace w21
