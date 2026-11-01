// Week 27: Count-Min sketches, which estimate how often keys were seen in a
// small fixed amount of memory. TinyLFU (task 5) uses one to decide which keys
// deserve a place in the cache. You write the sketch of TinyLFU (task 4) and a
// blocked sketch with SIMD (task 6); the textbook sketch is the baseline.
#pragma once
#include <algorithm>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace w27 {

// A good 64-bit mixer (the finalizer of MurmurHash3): every bit of the key
// changes about half of the bits of the result.
inline std::uint64_t mix(std::uint64_t x) {
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return x;
}

// The counter of a key in row r (0 ... 3) of a sketch with rows of `width`
// counters (a power of two), from h = mix(key): double hashing with the two
// 32-bit halves of h.
inline std::size_t row_index(std::uint64_t h, unsigned r, std::size_t width) {
    const auto lo = static_cast<std::uint32_t>(h), hi = static_cast<std::uint32_t>(h >> 32);
    return static_cast<std::uint32_t>(lo + r * hi) & (width - 1);
}

// Task 4. The frequency sketch of TinyLFU, as in Caffeine: 4 rows of `width`
// counters of 4 bits (0 ... 15), packed 16 to a 64-bit word. Counter j of row
// r is bits 4 * (j % 16) ... 4 * (j % 16) + 3 of words[r * width / 16 + j / 16].
// The counter of key k in row r is j = row_index(mix(k), r, width).
//  - increment(k) adds one to the 4 counters of k; a counter at 15 stays 15.
//    It also counts the increments in `additions`. When additions reaches
//    sample_size, the sketch ages: reset() halves every counter (rounding
//    down) and additions.
//  - estimate(k) is the smallest of the 4 counters of k.
// width is a power of two, at least 16.
class FrequencySketch {
public:
    FrequencySketch(std::size_t width, std::size_t sample_size);
    void increment(std::uint64_t key);
    unsigned estimate(std::uint64_t key) const;
    void reset();

    std::size_t width, sample_size;
    std::size_t additions = 0;
    std::vector<std::uint64_t> words;  // 4 * width / 16 words, zeros at first
};

// Task 6. A blocked sketch: all 4 counters of a key are in one block of 64
// bytes (one cache line). There are `blocks` blocks (a power of two) of 64
// counters of 8 bits: block b is bytes[64 * b ... 64 * b + 63]. A block has 4
// rows of 16 counters. With h = mix(key), the key's block is
// h & (blocks - 1), and its counter in row r (0 ... 3) is
// 16 * r + ((h >> (32 + 4 * r)) & 15).
//  - increment(k) uses the conservative update: it adds one only to those of
//    the 4 counters that are equal to their smallest value (a counter at 255
//    stays 255). Then it counts the increment and ages as FrequencySketch:
//    when additions reaches sample_size, reset() halves every counter and
//    additions.
//  - estimate(k) is the smallest of the 4 counters.
class BlockedSketch {
public:
    BlockedSketch(std::size_t blocks, std::size_t sample_size);
    void increment(std::uint64_t key);
    unsigned estimate(std::uint64_t key) const;
    void reset();

    struct alignas(64) Block {
        std::uint8_t counters[64];
    };
    std::size_t sample_size;
    std::size_t additions = 0;
    std::vector<Block> blocks;  // zeros at first
};

// The sketch that TinyLFU uses for a cache of `capacity` keys: 4 counters per
// key of the cache, and aging after 10 * capacity increments.
template <class Sketch>
Sketch sketch_for_cache(std::size_t capacity);
template <>
inline FrequencySketch sketch_for_cache<FrequencySketch>(std::size_t capacity) {
    return FrequencySketch(std::bit_ceil(std::max<std::size_t>(capacity, 16)), 10 * capacity);
}
template <>
inline BlockedSketch sketch_for_cache<BlockedSketch>(std::size_t capacity) {
    return BlockedSketch(std::bit_ceil(std::max<std::size_t>(capacity / 16, 1)), 10 * capacity);
}

namespace baseline {
// The textbook Count-Min sketch with the conservative update of BlockedSketch:
// 4 rows of `width` counters of 8 bits, the counter of key k in row r at
// row_index(mix(k), r, width). increment adds one only to those of the 4
// counters that are equal to their smallest value (a counter at 255 stays
// 255); estimate is the smallest. No aging.
class CountMinSketch {
public:
    explicit CountMinSketch(std::size_t width);
    void increment(std::uint64_t key);
    unsigned estimate(std::uint64_t key) const;

    std::size_t width;
    std::vector<std::uint8_t> counters;  // row r is counters[r * width ... r * width + width - 1]
};
}  // namespace baseline

}  // namespace w27
