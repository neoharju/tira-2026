// Simple versions for comparison.
#include <algorithm>

#include "tasks.hpp"

namespace w26::baseline {

std::size_t node_lower_bound(const Key* keys, std::size_t count, Key x) {
    return static_cast<std::size_t>(std::lower_bound(keys, keys + count, x) - keys);
}

}  // namespace w26::baseline
