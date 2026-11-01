// Task 8: bulk_load with OpenMP threads. Now this calls the one-thread
// version of bplus.cpp. Every leaf, and every node of a level, can be filled
// on its own once you know where its keys start. resize() of the pages writes
// nothing (NoInit in bplus.hpp), so the threads that fill the pages also touch
// them first.
#include "tasks.hpp"

namespace w26 {

BPlusTree bulk_load_parallel(std::span<const std::pair<Key, Value>> sorted) {
    return bulk_load(sorted);  // TODO
}

}  // namespace w26
