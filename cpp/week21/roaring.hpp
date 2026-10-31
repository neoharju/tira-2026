// Week 21: Roaring bitmaps (given). Task 5 writes intersect().
#pragma once
#include <cstdint>
#include <span>
#include <vector>

namespace w21 {

// A container holds the low 16 bits of the values that share their high 16
// bits, in one of three forms:
//  - Array:  at most 4096 values, sorted (2 bytes per value);
//  - Bitmap: 65,536 bits in 1024 words (8 KB); bit x of word i is the value 64 i + x;
//  - Run:    runs of consecutive values as pairs (start, length - 1) in `array`.
struct Container {
    enum Kind : std::uint8_t { Array, Bitmap, Run };
    Kind kind = Array;
    std::uint32_t cardinality = 0;      // the number of values, 1 ... 65536
    std::vector<std::uint16_t> array;   // Array: the values; Run: start, length - 1, start, length - 1, ...
    std::vector<std::uint64_t> bitmap;  // Bitmap: 1024 words; empty for the other kinds
    friend bool operator==(const Container&, const Container&) = default;
};

inline constexpr std::uint32_t ARRAY_MAX = 4096;  // more values than this: a bitmap is smaller
inline constexpr std::size_t BITMAP_WORDS = 1024;

// A set of 32-bit values. keys[i] is the high 16 bits of the values in
// containers[i]; the keys are increasing and no container is empty.
struct Roaring {
    std::vector<std::uint16_t> keys;
    std::vector<Container> containers;

    // The set of the given values (increasing, different). Every container
    // gets the smallest kind: an array takes 2 bytes per value, a bitmap 8192
    // bytes and a run container 4 bytes per run (ties: array, then bitmap).
    static Roaring from_sorted(std::span<const std::uint32_t> values);
    std::vector<std::uint32_t> to_vector() const;  // all values, increasing
    std::uint64_t cardinality() const;
    std::size_t bytes() const;  // the memory of the containers' values
    friend bool operator==(const Roaring&, const Roaring&) = default;
};

// Task 5. The intersection of two sets. In the result, a container with at
// most ARRAY_MAX values is an array and a larger one a bitmap (no runs), and
// there are no empty containers.
Roaring intersect(const Roaring& a, const Roaring& b);

}  // namespace w21
