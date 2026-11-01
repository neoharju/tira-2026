// Simple versions for comparison.
#include <algorithm>

#include "tasks.hpp"

namespace w25::baseline {

Key lower_bound(std::span<const Key> sorted, Key x) {
    const auto it = std::ranges::lower_bound(sorted, x);
    return it == sorted.end() ? none : *it;
}

Key branchless_lower_bound(std::span<const Key> sorted, Key x) {
    if (sorted.empty()) return none;
    const Key* base = sorted.data();
    std::size_t len = sorted.size();
    while (len > 1) {
        const std::size_t half = len / 2;
        base += (base[half - 1] < x) * half;  // a conditional move, not a branch
        len -= half;
    }
    return *base < x ? none : *base;
}

}  // namespace w25::baseline
