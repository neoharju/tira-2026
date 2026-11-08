// Task 7: the Sort-Tile-Recursive build with OpenMP: the same tree as your
// str_build. Now this calls str_build. STR needs only the set of entries of
// each slice, not a fully sorted level, and the slices are independent once
// their entries are known.
#include <omp.h>

#include <algorithm>

#include "rtree.hpp"

namespace w30 {

RTree str_build_parallel(std::span<const Point> points) {
    return str_build(points);  // TODO
}

}  // namespace w30
