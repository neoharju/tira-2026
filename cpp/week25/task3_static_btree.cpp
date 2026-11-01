// Task 3: fill in the keys of the static B+ tree, as layout.hpp describes:
// the leaves (the sorted keys and the padding), then every level above them.
#include "tasks.hpp"

namespace w25 {

void build_static_btree(StaticBTree& t, std::span<const Key> sorted) {
    (void)sorted;  // TODO
    for (std::size_t i = 0; i < t.keys.size(); ++i) t.keys[i] = none;
}

}  // namespace w25
