// Task 6: your search of task 2 with __builtin_prefetch. Now this calls it.
#include "tasks.hpp"

namespace w25 {

Key eytzinger_search_prefetch(std::span<const Key> e, Key x) {
    return eytzinger_search(e, x);  // TODO
}

}  // namespace w25
