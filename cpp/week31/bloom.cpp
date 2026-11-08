// The given parts of the filters: the size of a split-block filter, and the
// classic Bloom filter.
#include "bloom.hpp"

#include <cmath>

namespace w31 {

SplitBlockBloom SplitBlockBloom::for_keys(std::size_t n, double bits_per_key) {
    return SplitBlockBloom(static_cast<std::size_t>(std::ceil(static_cast<double>(n) * bits_per_key / 256.0)));
}

namespace baseline {

BloomFilter::BloomFilter(std::size_t n, double bits_per_key, int hashes)
    : m(std::max<std::uint64_t>(64, static_cast<std::uint64_t>(static_cast<double>(n) * bits_per_key))), k(hashes) {
    words.assign((m + 63) / 64, 0);
}

void BloomFilter::insert(std::uint64_t hash) {
    const std::uint64_t h1 = hash >> 32, h2 = (hash & 0xFFFF'FFFFULL) | 1;
    for (int i = 0; i < k; ++i) {
        const std::uint64_t bit = (h1 + static_cast<std::uint64_t>(i) * h2) % m;
        words[bit / 64] |= std::uint64_t{1} << (bit % 64);
    }
}

bool BloomFilter::may_contain(std::uint64_t hash) const {
    const std::uint64_t h1 = hash >> 32, h2 = (hash & 0xFFFF'FFFFULL) | 1;
    for (int i = 0; i < k; ++i) {
        const std::uint64_t bit = (h1 + static_cast<std::uint64_t>(i) * h2) % m;
        if ((words[bit / 64] >> (bit % 64) & 1) == 0) return false;
    }
    return true;
}

}  // namespace baseline
}  // namespace w31
