// Simple versions of the week 21 tasks.
#include <algorithm>
#include <iterator>
#include <map>
#include <unordered_map>

#include "tasks.hpp"

namespace w21::baseline {

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

std::vector<Hit> top_k(const Index& index, const Scores& scores, std::span<const TermId> query, std::size_t k) {
    std::unordered_map<DocId, std::uint32_t> sum;
    for (TermId t : query)
        for (std::uint32_t i = index.offset[t]; i < index.offset[t + 1]; ++i) sum[index.docs[i]] += scores.impact[i];
    std::vector<Hit> hits;
    for (auto [d, s] : sum) hits.push_back({d, s});
    std::ranges::sort(hits, better);
    if (hits.size() > k) hits.resize(k);
    return hits;
}

std::vector<std::uint8_t> encode(std::span<const DocId> postings) {
    std::vector<std::uint8_t> out;
    DocId previous = 0;
    for (DocId d : postings) {
        std::uint32_t x = d - previous;  // the first value is "a gap from 0"
        previous = d;
        while (x >= 128) {
            out.push_back(static_cast<std::uint8_t>(x | 128));
            x >>= 7;
        }
        out.push_back(static_cast<std::uint8_t>(x));
    }
    return out;
}

std::vector<DocId> decode(std::span<const std::uint8_t> bytes, std::size_t count) {
    std::vector<DocId> out;
    std::size_t i = 0;
    DocId previous = 0;
    for (std::size_t n = 0; n < count; ++n) {
        std::uint32_t x = 0;
        for (int shift = 0;; shift += 7) {
            const std::uint8_t byte = bytes[i++];
            x |= std::uint32_t{byte & 127u} << shift;
            if (byte < 128) break;
        }
        previous += x;
        out.push_back(previous);
    }
    return out;
}

}  // namespace w21::baseline
