// Task 5: a compaction, by the rules of compaction.hpp. A TableIterator per
// input, and a k-way merge: each step takes the smallest version of all
// iterators in the internal order (a std::priority_queue of iterators, or a
// loop over them when there are few). Keep the versions of one key until its
// last version has come, then decide which of them stay (rules 2 and 3).
#include <algorithm>
#include <queue>

#include "compaction.hpp"

namespace w31 {

std::vector<std::string> compact(const CompactionJob& job) {
    (void)job;  // TODO
    return {};
}

}  // namespace w31
