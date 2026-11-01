// Task 5: a differential fuzz harness. Read the bytes as a list of operations
// (insert, erase, find, scan, ...) with their keys and values, apply each one to
// `map` and to a std::map, and return false as soon as they differ: another
// result, another size, or a broken rule (call map.validate() if the map has
// it; it throws an exception). Return true if the whole input agreed. Bytes
// past the end of the input read as 0.
//
// The tests run your harness on 1000 random inputs of up to 1024 bytes against
// maps with one bug each (mutants.hpp): it must catch all of them, and it must
// never fail on a correct map. Hints: let one operation insert many keys (a
// map needs more than 64 keys to split a leaf), use small keys (so that keys
// repeat) and keys near 2^63 and 2^64, and at the end compare everything.
// fuzz.cpp gives your harness to libFuzzer, with your tree.
#pragma once
#include <cstdint>
#include <map>
#include <span>
#include <vector>

#include "bplus.hpp"

namespace w26 {

template <class Map>
bool differential(std::span<const std::uint8_t> input, Map& map) {
    std::map<Key, Value> model;
    (void)input;  // TODO
    (void)map;
    return true;
}

}  // namespace w26
