// Simple versions for comparison: the textbook data structures, which
// allocate memory in every search.
#include <algorithm>
#include <functional>
#include <queue>
#include <unordered_set>

#include "tasks.hpp"

namespace w24::baseline {

std::uint64_t& distances_computed() {
    thread_local std::uint64_t count = 0;
    return count;
}

std::vector<Neighbor> search_layer(const Hnsw& index, const std::uint8_t* query, std::span<const Neighbor> entry, std::size_t ef,
                                   int layer) {
    if (ef == 0) return {};
    const Vectors& data = *index.data;
    std::uint64_t& computed = distances_computed();
    std::priority_queue<Neighbor, std::vector<Neighbor>, std::greater<>> candidates;  // the best on top
    std::priority_queue<Neighbor> results;                                            // the worst on top
    std::unordered_set<Id> seen;
    for (const Neighbor& e : entry) {
        if (!seen.insert(e.id).second) continue;
        candidates.push(e);
        results.push(e);
        if (results.size() > ef) results.pop();
    }
    while (!candidates.empty()) {
        const Neighbor c = candidates.top();
        if (results.size() >= ef && c > results.top()) break;
        candidates.pop();
        for (Id e : index.links(c.id, layer)) {
            if (!seen.insert(e).second) continue;
            const Neighbor n{l2_squared(data[e], query, data.dim), e};
            ++computed;
            if (results.size() < ef || n < results.top()) {
                candidates.push(n);
                results.push(n);
                if (results.size() > ef) results.pop();
            }
        }
    }
    std::vector<Neighbor> out(results.size());
    for (std::size_t i = out.size(); i-- > 0; results.pop()) out[i] = results.top();
    return out;
}

std::vector<Neighbor> search(const Hnsw& index, const std::uint8_t* query, std::size_t k, std::size_t ef) {
    if (index.top < 0 || k == 0) return {};
    const Vectors& data = *index.data;
    Neighbor ep{l2_squared(data[index.entry], query, data.dim), index.entry};
    for (int layer = index.top; layer >= 1; --layer) ep = search_layer(index, query, std::span(&ep, 1), 1, layer).front();
    std::vector<Neighbor> found = search_layer(index, query, std::span(&ep, 1), std::max(ef, k), 0);
    if (found.size() > k) found.resize(k);
    return found;
}

std::vector<Neighbor> knn(const Vectors& data, const std::uint8_t* query, std::size_t k) {
    std::vector<Neighbor> all(data.n);
    for (std::size_t i = 0; i < data.n; ++i) all[i] = {l2_squared(data[i], query, data.dim), static_cast<Id>(i)};
    std::ranges::sort(all);
    if (all.size() > k) all.resize(k);
    return all;
}

}  // namespace w24::baseline
