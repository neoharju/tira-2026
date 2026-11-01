#include "hnsw.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

#include "tasks.hpp"

namespace w24 {

int random_level(Id id, std::size_t m, std::uint64_t seed) {
    // splitmix64 of the seed and the id: a well mixed 64-bit number.
    std::uint64_t h = seed + 0x9e3779b97f4a7c15ull * (static_cast<std::uint64_t>(id) + 1);
    h = (h ^ (h >> 30)) * 0xbf58476d1ce4e5b9ull;
    h = (h ^ (h >> 27)) * 0x94d049bb133111ebull;
    h ^= h >> 31;
    const double u = static_cast<double>((h >> 11) + 1) * 0x1.0p-53;  // in (0, 1]
    return std::min(30, static_cast<int>(-std::log(u) / std::log(static_cast<double>(m))));
}

void Hnsw::set_links(Id node, int layer, std::span<const Id> ids) {
    if (ids.size() > capacity(layer)) throw std::length_error("set_links: more links than the layer allows");
    Id* slot = layer == 0 ? links0.data() + node * (m0 + 1) : upper.data() + upper_slot[node] + (layer - 1) * (m + 1);
    slot[0] = static_cast<Id>(ids.size());
    std::ranges::copy(ids, slot + 1);
}

Hnsw empty_index(const Vectors& data, const Params& params) {
    if (params.m < 2) throw std::invalid_argument("empty_index: m must be at least 2");
    Hnsw index;
    index.data = &data;
    index.m = params.m;
    index.m0 = 2 * params.m;
    index.level.resize(data.n);
    index.upper_slot.resize(data.n);
    std::size_t upper = 0;
    for (Id i = 0; i < data.n; ++i) {
        index.level[i] = random_level(i, params.m, params.seed);
        index.upper_slot[i] = upper;
        upper += static_cast<std::size_t>(index.level[i]) * (params.m + 1);
    }
    index.links0.assign(data.n * (index.m0 + 1), 0);
    index.upper.assign(upper, 0);
    return index;
}

Hnsw build(const Vectors& data, const Params& params) {
    Hnsw index = empty_index(data, params);
    Workspace work;
    for (Id i = 0; i < data.n; ++i) insert(index, i, params.ef_construction, work);
    return index;
}

}  // namespace w24
