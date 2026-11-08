// Task 8: subcompactions with OpenMP. Choose boundary keys that split the
// versions into parts of about the same size (the last keys of the index
// entries of the inputs tell where the data is), and run the merge of task 5
// on each part: TableIterator::seek finds the start of a part. All versions
// of a key must be in the same part. Put the tables of the parts in order.
// Now this calls compact().
#include <omp.h>

#include <algorithm>

#include "compaction.hpp"

namespace w31 {

std::vector<std::string> compact_parallel(const CompactionJob& job) {
    return compact(job);  // TODO
}

}  // namespace w31
