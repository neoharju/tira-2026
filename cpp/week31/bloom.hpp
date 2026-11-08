// Week 31: Bloom filters. The split-block Bloom filter of Apache Parquet
// (tasks 6 and 7), and the classic Bloom filter for comparison. The given
// parts are in bloom.cpp.
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "format.hpp"

namespace w31 {

// The hash of a key for the filters: a good 64-bit mixer (the finalizer of
// splitmix64), not a cryptographic hash.
constexpr std::uint64_t hash_key(Key key) {
    std::uint64_t z = key + 0x9E3779B97F4A7C15ULL;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

// A block of the split-block filter: 8 words of 32 bits. 256 bits are one AVX2
// register, and two blocks fill one cache line of 64 bytes.
struct alignas(32) BloomBlock {
    std::uint32_t word[8];
};

// The 8 odd constants of the Parquet specification.
inline constexpr std::uint32_t bloom_salt[8] = {0x47b6137bU, 0x44974d91U, 0x8824ad5bU, 0xa2b7289dU,
                                                0x705495c7U, 0x2df1424bU, 0x9efc4947U, 0x5c6bfb31U};

// The split-block Bloom filter of Apache Parquet (Impala, Arrow and Kudu use
// the same layout). For a hash h:
//  - its block is ((h >> 32) * blocks.size()) >> 32: the top 32 bits of h,
//    scaled to the number of blocks with a multiplication, not a division;
//  - in that block, the low 32 bits x of h choose one bit in each of the 8
//    words: in word i, bit number (x * bloom_salt[i]) >> 27. The product is
//    modulo 2^32, and its top 5 bits are a bit number 0 ... 31.
// insert sets these 8 bits. may_contain says whether all 8 are set: a key that
// was inserted always gives true, and another key gives true with a small
// probability, a "false positive".
class SplitBlockBloom {
public:
    explicit SplitBlockBloom(std::size_t block_count = 1) : blocks(std::max<std::size_t>(block_count, 1), BloomBlock{}) {}
    // A filter for n keys with about bits_per_key bits per key:
    // ceil(n * bits_per_key / 256) blocks, at least 1.
    static SplitBlockBloom for_keys(std::size_t n, double bits_per_key = 10.0);

    // Task 6. Scalar code.
    void insert(std::uint64_t hash);
    bool may_contain(std::uint64_t hash) const;

    // Task 7. The same with AVX2: the 8 words of a block are one register.
    void insert_avx2(std::uint64_t hash);
    bool may_contain_avx2(std::uint64_t hash) const;

    std::vector<BloomBlock> blocks;  // all bits 0 at the start
};

namespace baseline {
// The classic Bloom filter (Bloom, 1970): m bits, and k bits per key anywhere
// in the m bits, at the places h1 + i * h2 (modulo m) for i = 0 ... k - 1,
// where h1 and h2 are the two halves of the hash (Kirsch and Mitzenmacher,
// 2006). For a large filter each of the k bits is a cache miss.
class BloomFilter {
public:
    explicit BloomFilter(std::size_t n, double bits_per_key = 10.0, int k = 7);
    void insert(std::uint64_t hash);
    bool may_contain(std::uint64_t hash) const;  // stops at the first bit that is 0

    std::vector<std::uint64_t> words;
    std::uint64_t m;  // bits
    int k;
};
}  // namespace baseline

}  // namespace w31
