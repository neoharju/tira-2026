// Week 28: a Robin Hood hash table (tasks 1 and 2). The given parts are in
// robin_hood.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

#include "hash.hpp"

namespace w28 {

// Open addressing with linear probing: a key lives in its home slot
// hash_key(key, seed) % capacity or in one of the slots after it (after the
// last slot comes slot 0). Robin Hood keeps the keys of a run ordered by how
// far they are from home:
//  - Every slot stores dist: 0 if the slot is empty, d + 1 if its key is d
//    slots after its home slot.
//  - insert(k, v): if k is in the table, its value is replaced (false).
//    Otherwise (true) the new pair starts at its home slot with d = 0 and
//    walks right. At an empty slot it stays there. At a slot whose pair is
//    closer to its home (dist - 1 < d), the two swap: the new pair takes the
//    slot, and the walk continues with the pair that was there ("take from
//    the rich"). Before the walk, if the table would then hold more than 7/8
//    of its capacity, it doubles: every pair is inserted again into a table
//    of twice the capacity, in the order of the old slots. The table also
//    doubles before a walk would store a d of 255 or more (then it tries again).
//  - find(k) walks from home with d = 0 and stops at an empty slot or at a
//    pair closer to its home than d: k would have been placed before it.
//  - erase(k) empties k's slot and shifts the following pairs one slot back,
//    up to the first empty slot or the first pair that is in its home slot
//    (backward shift: no tombstones).
class RobinHoodMap {
public:
    // capacity is a power of two, at least 16.
    explicit RobinHoodMap(std::size_t capacity = 16, std::uint64_t seed = 0);

    std::optional<Value> find(Key key) const;  // task 1
    bool insert(Key key, Value value);         // task 1
    bool erase(Key key);                       // task 2

    std::size_t size() const { return count; }
    std::size_t capacity() const { return slots.size(); }
    std::size_t home(Key key) const { return hash_key(key, seed) & (slots.size() - 1); }

    // Checks the rules: every dist is right, the pairs of a run are in Robin
    // Hood order, and count is right. Throws std::logic_error if not.
    void validate() const;

    // The table, open for your code.
    struct Slot {
        Key key;
        Value value;
        std::uint8_t dist;  // 0: empty; d + 1: d slots after its home
    };
    std::vector<Slot> slots;
    std::size_t count = 0;
    std::uint64_t seed;
};

}  // namespace w28
