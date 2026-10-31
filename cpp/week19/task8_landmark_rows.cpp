// Task 8: the landmark rows, with the 16 searches in parallel. Every thread
// needs its own distance array and heap; write the results so that two
// threads never write to the same cache line at the same time.
#include <omp.h>

#include "tasks.hpp"

namespace w19 {

std::vector<LandmarkRow> landmark_rows(const Graph& g, const Graph& rev, std::span<const Node> landmarks) {
    (void)g;  // TODO
    (void)rev;
    (void)landmarks;
    return {};
}

}  // namespace w19
