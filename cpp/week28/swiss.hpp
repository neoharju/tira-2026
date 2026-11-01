// Week 28: a Swiss table (tasks 3-6), the design of Abseil's flat_hash_map
// and of Rust's HashMap. The member functions are in task3_swiss.cpp,
// task4_swiss_erase.cpp and task6_batch.cpp; the group functions of task 5 in
// task5_group_sse.hpp.
#pragma once
#include <bit>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

#include "hash.hpp"

namespace w28 {

// Every slot has a control byte: kEmpty, kDeleted (a tombstone: an erased
// key), or, for a full slot, H2: the low 7 bits of the hash (0 ... 127). Both
// special values have the top bit set, so they are negative as int8_t.
inline constexpr std::int8_t kEmpty = -128;  // 0b1000'0000
inline constexpr std::int8_t kDeleted = -2;  // 0b1111'1110
inline constexpr std::size_t group_size = 16;

// The slots of a group as bits: bit i is slot i of the group.
using Mask = std::uint32_t;

// The group functions of a group of 16 control bytes, one byte at a time.
// Task 5 writes SseGroup with the same functions in a few SSE2 instructions.
struct ScalarGroup {
    // The slots whose control byte is h2.
    static Mask match(const std::int8_t* ctrl, std::int8_t h2) {
        Mask m = 0;
        for (std::size_t i = 0; i < group_size; ++i)
            if (ctrl[i] == h2) m |= Mask{1} << i;
        return m;
    }
    // The empty slots.
    static Mask match_empty(const std::int8_t* ctrl) { return match(ctrl, kEmpty); }
    // The slots that are empty or deleted (whose top bit is set).
    static Mask match_empty_or_deleted(const std::int8_t* ctrl) {
        Mask m = 0;
        for (std::size_t i = 0; i < group_size; ++i)
            if (ctrl[i] < 0) m |= Mask{1} << i;
        return m;
    }
};

// A Swiss table of `capacity` slots (a power of two, at least 16) in groups
// of 16: group g has the slots 16g ... 16g + 15. With h = hash_key(key, seed),
// H1 = h >> 7 and H2 = h & 127.
//  - Probing visits the groups g0 = H1 % groups, then g0 + 1, g0 + 3, g0 + 6,
//    g0 + 10, ... (the step grows by one each time, modulo the number of
//    groups): with a power of two of groups this visits every group once.
//  - find(k): in each group of the sequence, compare the key of every slot
//    in match(H2), in order; stop with "not found" at the first group that
//    has an empty slot.
//  - insert(k, v): if k is there, replace its value (false). Otherwise (true)
//    put the pair in the first slot of the first group of the sequence that
//    has an empty or deleted slot. Using an empty slot uses up growth_left;
//    reusing a deleted one lowers tombstones. Before that, if growth_left is
//    0, the table is rebuilt: with twice the capacity if count + 1 would be
//    more than 7/8 of the capacity, otherwise (the tombstones took the room)
//    with the same capacity. Rebuilding inserts the pairs again into an
//    empty table, in the order of the old slots, and drops all tombstones.
//  - erase(k): if k's group has an empty slot, the slot becomes empty
//    (growth_left grows by one), otherwise it becomes deleted (tombstones
//    grows by one): a find for another key may have walked through this full
//    group, and must still walk through it.
//  - growth_left is always 7/8 of the capacity - count - tombstones.
template <class Group>
class SwissMap {
public:
    explicit SwissMap(std::size_t capacity = 16, std::uint64_t seed = 0)
        : ctrl(capacity, kEmpty), slots(capacity), growth_left(capacity - capacity / 8), seed_(seed) {}

    std::optional<Value> find(Key key) const;  // task 3
    bool insert(Key key, Value value);         // task 3
    bool erase(Key key);                       // task 4
    // Task 6. out[i] = find(keys[i]) for every i, faster.
    void find_batch(std::span<const Key> keys, std::span<std::optional<Value>> out) const;

    std::size_t size() const { return count; }
    std::size_t capacity() const { return slots.size(); }
    std::size_t groups() const { return slots.size() / group_size; }
    std::uint64_t seed() const { return seed_; }

    // Checks the bookkeeping: H2 of every full slot, count, tombstones and
    // growth_left, and that every key can be found from its first group.
    void validate() const {
        auto broken = [](const std::string& what) { throw std::logic_error("SwissMap::validate: " + what); };
        std::size_t full = 0, deleted = 0;
        for (std::size_t i = 0; i < slots.size(); ++i) {
            if (ctrl[i] == kDeleted) ++deleted;
            if (ctrl[i] < 0) continue;
            ++full;
            const std::uint64_t h = hash_key(slots[i].key, seed_);
            if (ctrl[i] != static_cast<std::int8_t>(h & 127)) broken("slot " + std::to_string(i) + " has a wrong H2");
            // Every group before the key's group in its probe sequence must have no empty slot.
            std::size_t g = (h >> 7) & (groups() - 1);
            for (std::size_t step = 1; g != i / group_size; ++step) {
                for (std::size_t j = 0; j < group_size; ++j)
                    if (ctrl[g * group_size + j] == kEmpty) broken("a find for the key of slot " + std::to_string(i) + " stops before it");
                if (step > groups()) broken("the key of slot " + std::to_string(i) + " is not on its probe sequence");
                g = (g + step) & (groups() - 1);
            }
        }
        if (full != count) broken("count is not the number of full slots");
        if (deleted != tombstones) broken("tombstones is not the number of deleted slots");
        if (growth_left != slots.size() - slots.size() / 8 - count - tombstones) broken("growth_left is wrong");
    }

    // The table, open for your code.
    struct Slot {
        Key key;
        Value value;
    };
    std::vector<std::int8_t> ctrl;  // one control byte per slot
    std::vector<Slot> slots;
    std::size_t count = 0, tombstones = 0, growth_left;

private:
    std::uint64_t seed_;
};

}  // namespace w28
