// Task 1: the neighbour heuristic. This keeps simply the `count` nearest
// candidates; keep only those that pass the test described in tasks.hpp.
#include <algorithm>

#include "tasks.hpp"

namespace w24 {

std::vector<Neighbor> select_neighbors(const Vectors& data, std::span<const Neighbor> candidates, std::size_t count) {
    (void)data;  // TODO: the heuristic needs the vectors
    const std::size_t n = std::min(count, candidates.size());
    return {candidates.begin(), candidates.begin() + static_cast<std::ptrdiff_t>(n)};
}

}  // namespace w24
