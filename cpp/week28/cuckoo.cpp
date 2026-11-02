// The given parts of the cuckoo table.
#include <stdexcept>
#include <string>

#include "cuckoo.hpp"

namespace w28 {

CuckooMap::CuckooMap(std::size_t n, std::uint64_t s) : buckets(n), used(n, 0), seed(s), rng(mix(s) | 1) {}

void CuckooMap::validate() const {
    auto broken = [](const std::string& what) { throw std::logic_error("CuckooMap::validate: " + what); };
    const std::size_t n = buckets.size();
    if (n < 2 || (n & (n - 1)) != 0) broken("the number of buckets is not a power of two of at least 2");
    if (used.size() != n) broken("used does not have one entry per bucket");
    std::size_t pairs = 0;
    for (std::size_t b = 0; b < n; ++b) {
        if (used[b] > bucket_slots) broken("bucket " + std::to_string(b) + " has more than 4 pairs");
        pairs += used[b];
        for (std::size_t i = 0; i < used[b]; ++i) {
            const Key k = buckets[b].keys[i];
            const std::size_t f = first(k), s = second(k);
            const std::string where = "the key in bucket " + std::to_string(b) + ", slot " + std::to_string(i);
            if (f != b && s != b) broken(where + " is in neither of its two buckets");
            for (std::size_t j = i + 1; j < used[b]; ++j)
                if (buckets[b].keys[j] == k) broken(where + " is in the bucket twice");
            const std::size_t other = f == b ? s : f;
            if (other != b)
                for (std::size_t j = 0; j < used[other]; ++j)
                    if (buckets[other].keys[j] == k) broken(where + " is in its other bucket too");
        }
    }
    if (pairs != count) broken("count is not the number of pairs");
}

}  // namespace w28
