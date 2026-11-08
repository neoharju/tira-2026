// Week 29: the keys of the tests and benchmarks.
#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

#include "art.hpp"

namespace w29 {

// n different random keys in random order; the value of a key is key * 31 + 7.
std::vector<Item> random_items(std::size_t n, std::uint64_t seed);
// The keys base, base + 1, ..., base + n - 1 in random order: dense keys, like
// the ids of the rows of a table.
std::vector<Item> dense_items(std::size_t n, Key base, std::uint64_t seed);
// n different keys in random order, where 70 % start with the byte 0x2A and
// the others are random: skewed keys.
std::vector<Item> skewed_items(std::size_t n, std::uint64_t seed);
// The items sorted by key.
std::vector<Item> sorted(std::vector<Item> items);

}  // namespace w29
