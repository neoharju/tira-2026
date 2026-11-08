#include "keys.hpp"

#include <algorithm>
#include <random>
#include <unordered_set>

namespace w29 {

namespace {

template <class Next>
std::vector<Item> different(std::size_t n, std::uint64_t seed, Next&& next) {
    std::mt19937_64 rng(seed);
    std::unordered_set<Key> seen;
    seen.reserve(2 * n);
    std::vector<Item> items;
    items.reserve(n);
    while (items.size() < n) {
        const Key k = next(rng);
        if (seen.insert(k).second) items.push_back({k, k * 31 + 7});
    }
    return items;
}

}  // namespace

std::vector<Item> random_items(std::size_t n, std::uint64_t seed) {
    return different(n, seed, [](std::mt19937_64& rng) { return rng(); });
}

std::vector<Item> dense_items(std::size_t n, Key base, std::uint64_t seed) {
    std::vector<Item> items(n);
    for (std::size_t i = 0; i < n; ++i) items[i] = {base + i, (base + i) * 31 + 7};
    std::mt19937_64 rng(seed);
    std::ranges::shuffle(items, rng);
    return items;
}

std::vector<Item> skewed_items(std::size_t n, std::uint64_t seed) {
    return different(n, seed, [](std::mt19937_64& rng) {
        const Key k = rng();
        return rng() % 10 < 7 ? (Key{0x2A} << 56) | (k >> 8) : k;
    });
}

std::vector<Item> sorted(std::vector<Item> items) {
    std::ranges::sort(items, {}, &Item::key);
    return items;
}

}  // namespace w29
