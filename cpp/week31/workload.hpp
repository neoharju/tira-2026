// Week 31: generated versions for the tests and the benchmarks.
#pragma once
#include <cstddef>
#include <cstdint>
#include <random>
#include <string>
#include <vector>

#include "format.hpp"
#include "table.hpp"

namespace w31 {

// A value of min_size ... max_size random bytes (also zeros).
std::string random_value(std::mt19937_64& rng, std::size_t min_size, std::size_t max_size);

// n writes of random keys in [0, keys): a delete with probability
// `deletes`, otherwise a put with a random value. The sequence numbers are
// first, first + 1, ... in this order.
std::vector<Entry> random_writes(std::size_t n, Key keys, double deletes, std::uint64_t seed, Seq first = 1, std::size_t min_value = 0,
                                 std::size_t max_value = 40);

// The versions sorted in the internal order.
std::vector<Entry> sorted(std::vector<Entry> v);

// The writes as `count` overlapping tables: each write goes to a random
// table, and each table is sorted.
std::vector<Table> overlapping_tables(const std::vector<Entry>& writes, std::size_t count, std::uint64_t seed);

}  // namespace w31
