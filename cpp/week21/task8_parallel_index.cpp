// Task 8: build the index with OpenMP threads: every thread indexes its own
// shard of the documents, and then the shards are merged (see the chapter).
#include <omp.h>

#include "tasks.hpp"

namespace w21 {

Index build_index_parallel(std::span<const std::string> docs) {
    return build_index(docs);  // TODO: in parallel
}

}  // namespace w21
