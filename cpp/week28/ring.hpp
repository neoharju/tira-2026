// Week 28: consistent hashing (task 8), which spreads keys over the servers
// of a distributed store so that adding or removing a server moves only a few
// keys.
#pragma once
#include <cstdint>
#include <utility>
#include <vector>

#include "hash.hpp"

namespace w28 {

// Task 8. A ring of 64-bit tokens. Node n with v virtual nodes owns the tokens
// token(n, 0), ..., token(n, v - 1). A key belongs to the node of the first
// token >= hash_key(key, seed), or of the smallest token if there is no such
// token (the ring wraps around). tokens is kept sorted by (token, node).
class HashRing {
public:
    explicit HashRing(std::uint64_t s = 0) : seed(s) {}

    // The token of virtual node i of node n.
    std::uint64_t token(std::uint32_t node, std::uint32_t i) const {
        return hash_key((std::uint64_t{node} << 32) | i, seed ^ 0x9e3779b97f4a7c15ULL);
    }
    void add_node(std::uint32_t node, std::uint32_t vnodes);  // the node is not in the ring yet
    void remove_node(std::uint32_t node);                     // removes all its tokens
    std::uint32_t owner(Key key) const;                       // the ring is not empty

    std::vector<std::pair<std::uint64_t, std::uint32_t>> tokens;  // (token, node)
    std::uint64_t seed;
};

// Task 8. Jump consistent hash (Lamping and Veach, 2014): the bucket
// 0 ... buckets - 1 of a key, with their algorithm exactly, so that the tests
// can compare results. When buckets grows by one, a key either stays or moves
// to the new bucket.
std::int32_t jump_hash(std::uint64_t key, std::int32_t buckets);

}  // namespace w28
