#include "layout.hpp"

#include <sys/mman.h>

#include <algorithm>
#include <random>
#include <stdexcept>

namespace w25 {

Keys::Keys(std::size_t n, bool huge_pages) : n_(n) {
    if (n == 0) return;
    const std::size_t align = huge_pages ? std::size_t{1} << 21 : 64;
    const std::size_t bytes = (n * sizeof(Key) + align - 1) / align * align;
    p_ = std::unique_ptr<Key[], AlignedDelete>(static_cast<Key*>(::operator new(bytes, std::align_val_t{align})), AlignedDelete{align});
    if (huge_pages) madvise(p_.get(), bytes, MADV_HUGEPAGE);  // a hint: 2 MB pages if the system allows them
}

bool operator==(const Keys& a, const Keys& b) { return a.n_ == b.n_ && std::equal(a.data(), a.data() + a.n_, b.data()); }

std::vector<Key> sorted_keys(std::size_t n, std::uint64_t seed) {
    if (n > (std::size_t{1} << 27)) throw std::invalid_argument("sorted_keys: at most 2^27 keys");
    std::mt19937_64 rng(seed);
    std::vector<Key> keys(n);
    Key k = static_cast<Key>(rng() % 1000);
    for (Key& x : keys) {
        x = k;
        k += 1 + static_cast<Key>(rng() % 15);
    }
    return keys;
}

std::vector<Key> random_queries(std::span<const Key> sorted, std::size_t count, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    const std::int64_t lo = sorted.empty() ? -10 : std::int64_t{sorted.front()} - 10;
    const std::int64_t hi = sorted.empty() ? 10 : std::int64_t{sorted.back()} + 10;
    std::vector<Key> q(count);
    for (Key& x : q) x = static_cast<Key>(lo + static_cast<std::int64_t>(rng() % static_cast<std::uint64_t>(hi - lo + 1)));
    return q;
}

StaticBTree static_btree_shape(std::size_t n, bool huge_pages) {
    StaticBTree t;
    t.n = n;
    t.nodes.push_back(n / StaticBTree::B + 1);
    while (t.nodes.back() > 1) t.nodes.push_back((t.nodes.back() + 16) / 17);
    t.start.assign(t.nodes.size(), 0);
    std::size_t total = 0;
    for (std::size_t j = t.nodes.size(); j-- > 0;) {  // the root level first
        t.start[j] = total;
        total += t.nodes[j];
    }
    t.keys = Keys(total * StaticBTree::B, huge_pages);
    return t;
}

}  // namespace w25
