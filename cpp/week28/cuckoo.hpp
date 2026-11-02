// Week 28: a cuckoo hash table (task 6), the design of DPDK's rte_hash and of
// cuckoo filters. Every key has two buckets of 4 slots and is always in one
// of them, so a lookup reads at most two cache lines, and it knows both
// addresses before the first load. The given parts are in cuckoo.cpp.
#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

#include "hash.hpp"

namespace w28 {

// A table of bucket_count() buckets (a power of two, at least 2) of 4 slots.
// With h = hash_key(key, seed), the two buckets of a key are
//   first(key)  = h & (bucket_count() - 1)          (the low bits of h)
//   second(key) = (h >> 32) & (bucket_count() - 1)  (bits of the high half)
// They can be the same bucket. Bucket b keeps its pairs in its first used[b]
// slots; the other slots hold old data that means nothing.
//  - find(k) looks at the used slots of first(k) and second(k).
//  - insert(k, v): if k is there, replace its value (false). Otherwise (true):
//    if first(k) has a free slot, append the pair there; else if second(k)
//    has one, append it there. Else kick, with b = first(k), at most
//    max_kicks times: swap the pair in hand with the pair in slot
//    random_slot() of bucket b. The pair now in hand goes to its other
//    bucket: b becomes the one of its first and second bucket that is not b
//    (b again if both are b). If b has a free slot, append the pair in hand
//    there and stop. If max_kicks kicks do not stop, the table doubles: a
//    table of twice the buckets (with the same seed) gets every pair again
//    with insert, in the order of the old buckets and slots, and then the
//    pair in hand.
//  - erase(k): the last used pair of k's bucket moves into k's slot, and
//    used[b] goes down by one.
class CuckooMap {
public:
    static constexpr std::size_t bucket_slots = 4;
    static constexpr int max_kicks = 500;

    // buckets is a power of two, at least 2.
    explicit CuckooMap(std::size_t buckets = 4, std::uint64_t seed = 0);

    std::optional<Value> find(Key key) const;  // task 6
    bool insert(Key key, Value value);         // task 6
    bool erase(Key key);                       // task 6

    std::size_t size() const { return count; }
    std::size_t bucket_count() const { return buckets.size(); }
    std::size_t capacity() const { return buckets.size() * bucket_slots; }
    std::size_t first(Key key) const { return hash_key(key, seed) & (buckets.size() - 1); }
    std::size_t second(Key key) const { return (hash_key(key, seed) >> 32) & (buckets.size() - 1); }

    // The slot that a kick takes: one step of xorshift64 on rng.
    std::size_t random_slot() {
        rng ^= rng << 13;
        rng ^= rng >> 7;
        rng ^= rng << 17;
        return static_cast<std::size_t>(rng % bucket_slots);
    }

    // Checks that every pair is in one of its two buckets, that no key is
    // there twice, and count. Throws std::logic_error if not.
    void validate() const;

    // The table, open for your code. A bucket is one cache line: 4 keys, then
    // their 4 values.
    struct alignas(64) Bucket {
        std::array<Key, bucket_slots> keys;
        std::array<Value, bucket_slots> values;
    };
    std::vector<Bucket> buckets;
    std::vector<std::uint8_t> used;  // the number of pairs in each bucket
    std::size_t count = 0;
    std::uint64_t seed;
    std::uint64_t rng;  // the state of random_slot, never 0
};

}  // namespace w28
