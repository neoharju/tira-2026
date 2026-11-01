// Week 28: keys, values and the hash function of the hash tables.
#pragma once
#include <cstdint>

namespace w28 {

using Key = std::uint64_t;
using Value = std::uint64_t;

// The finalizer of MurmurHash3: every bit of x changes about half of the
// bits of the result. It is a bijection, so different keys never collide in
// all 64 bits.
inline std::uint64_t mix(std::uint64_t x) {
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return x;
}

// The hash of a key in a table with the given seed. mix can be inverted, so
// with a known seed an attacker could choose keys that collide in a table
// (hash flooding); a table that faces untrusted keys takes a random seed.
inline std::uint64_t hash_key(Key key, std::uint64_t seed) { return mix(key ^ seed); }

}  // namespace w28
