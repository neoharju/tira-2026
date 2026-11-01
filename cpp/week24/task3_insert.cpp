// Task 3: insert a node into the index, as described in tasks.hpp. Now the
// first node becomes the entry point and no links are made.
#include "tasks.hpp"

namespace w24 {

void insert(Hnsw& index, Id id, std::size_t ef_construction, Workspace& work) {
    (void)ef_construction;  // TODO
    (void)work;
    index.inserted = id + 1;
    if (index.top < 0) {
        index.entry = id;
        index.top = index.level[id];
    }
}

}  // namespace w24
