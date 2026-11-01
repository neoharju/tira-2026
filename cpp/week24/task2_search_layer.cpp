// Task 2: the beam search in one layer. Use the visited marks of the
// Workspace (with its version number) and keep the two heaps in its vectors,
// so that a search allocates no memory except the result.
#include <algorithm>

#include "tasks.hpp"

namespace w24 {

std::vector<Neighbor> search_layer(const Hnsw& index, const std::uint8_t* query, std::span<const Neighbor> entry, std::size_t ef,
                                   int layer, Workspace& work) {
    (void)index;  // TODO: now this returns the entry points
    (void)query;
    (void)ef;
    (void)layer;
    (void)work;
    std::vector<Neighbor> out(entry.begin(), entry.end());
    std::ranges::sort(out);
    return out;
}

}  // namespace w24
