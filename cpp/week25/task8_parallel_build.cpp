// Task 8: build the static B+ tree with OpenMP threads. Now this calls your
// one-thread build of task 3.
#include "tasks.hpp"

namespace w25 {

void build_static_btree_parallel(StaticBTree& t, std::span<const Key> sorted) {
    build_static_btree(t, sorted);  // TODO
}

}  // namespace w25
