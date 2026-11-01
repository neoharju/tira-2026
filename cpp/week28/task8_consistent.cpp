// Task 8: consistent hashing, as ring.hpp describes: the ring with virtual
// nodes (keep tokens sorted; find the owner with a binary search) and jump
// consistent hash.
#include <algorithm>

#include "ring.hpp"

namespace w28 {

void HashRing::add_node(std::uint32_t node, std::uint32_t vnodes) {
    (void)node;  // TODO
    (void)vnodes;
}

void HashRing::remove_node(std::uint32_t node) {
    (void)node;  // TODO
}

std::uint32_t HashRing::owner(Key key) const {
    (void)key;  // TODO
    return 0;
}

std::int32_t jump_hash(std::uint64_t key, std::int32_t buckets) {
    (void)key;  // TODO
    (void)buckets;
    return 0;
}

}  // namespace w28
