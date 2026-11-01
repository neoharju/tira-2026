// Week 25: keys, arrays of keys, test data and the shape of the static B+
// tree. This file is given (you do not need to change it).
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <new>
#include <span>
#include <vector>

namespace w25 {

using Key = std::int32_t;

// The answer of a search when no key is >= x. All keys are smaller than it.
inline constexpr Key none = std::numeric_limits<Key>::max();

// Gives back memory that was allocated with an alignment.
struct AlignedDelete {
    std::size_t align = 64;
    void operator()(Key* p) const { ::operator delete(p, std::align_val_t{align}); }
};

// An array of keys that starts at a cache line (64 bytes), or at a 2 MB page
// if huge pages are asked for. The memory is NOT initialized: the operating
// system gives it physical pages only when it is first written ("first
// touch"), on the memory of the thread that writes it.
class Keys {
public:
    Keys() = default;
    explicit Keys(std::size_t n, bool huge_pages = false);

    std::size_t size() const { return n_; }
    Key* data() { return p_.get(); }
    const Key* data() const { return p_.get(); }
    Key& operator[](std::size_t i) { return p_[i]; }
    const Key& operator[](std::size_t i) const { return p_[i]; }
    operator std::span<Key>() { return {data(), n_}; }
    operator std::span<const Key>() const { return {data(), n_}; }
    friend bool operator==(const Keys& a, const Keys& b);

private:
    std::unique_ptr<Key[], AlignedDelete> p_;
    std::size_t n_ = 0;
};

// n different sorted keys: from a random start, every key is 1 to 15 larger
// than the one before. n must be at most 2^27, so that the keys stay below none.
std::vector<Key> sorted_keys(std::size_t n, std::uint64_t seed);

// `count` random queries from 10 below the smallest key to 10 above the
// largest: some are keys, most are not.
std::vector<Key> random_queries(std::span<const Key> sorted, std::size_t count, std::uint64_t seed);

// The static B+ tree of tasks 3, 4, 5, 7 and 8, with nodes of B = 16 keys
// (64 bytes, one cache line).
//  - Level 0 has the leaves: the sorted keys and then at least one `none`,
//    in nodes[0] = n / 16 + 1 nodes.
//  - Level j >= 1 has nodes[j] = ceil(nodes[j - 1] / 17) nodes, up to the
//    root level, which has one node. (With at most 16 keys the leaf is the root.)
//  - Node t of level j has the children 17t, 17t + 1, ..., 17t + 16 of level
//    j - 1, those that exist. Key i of node t is the largest key under child
//    17t + i, or none if that child does not exist. (The largest key under
//    the child that has the last leaf is none: the padding.)
//  - The levels are stored from the root down, in one array: node t of level
//    j starts at keys[(start[j] + t) * 16].
struct StaticBTree {
    static constexpr std::size_t B = 16;
    std::size_t n = 0;               // the number of keys (without the padding)
    std::vector<std::size_t> nodes;  // nodes[j]: the number of nodes on level j
    std::vector<std::size_t> start;  // start[j]: the first node of level j in keys
    Keys keys;                       // 16 keys per node

    std::size_t levels() const { return nodes.size(); }
    Key* node(std::size_t level, std::size_t t) { return keys.data() + (start[level] + t) * B; }
    const Key* node(std::size_t level, std::size_t t) const { return keys.data() + (start[level] + t) * B; }
};

// The shape of the tree for n keys: n, nodes and start, and the keys
// allocated but not written. Your builds fill in the keys.
StaticBTree static_btree_shape(std::size_t n, bool huge_pages = false);

}  // namespace w25
