// The libFuzzer target of week 26: your harness (task 5) with your tree. Build
// and run it with the fuzz preset (see cpp/README.md):
//   cmake --preset fuzz && cmake --build --preset fuzz --target w26_fuzz
//   ./build/fuzz/week26/w26_fuzz -max_total_time=60
#include <cstdint>

#include "task5_fuzz.hpp"
#include "tasks.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    w26::BPlusTree tree;
    if (!w26::differential(std::span(data, size), tree)) __builtin_trap();
    return 0;
}
