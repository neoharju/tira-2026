// Task 4: an R-tree packed by Sort-Tile-Recursive, exactly as rtree.hpp says.
// Make a level's nodes in order with all 8 slots set (unused slots: the
// empty box), and give the next level the entries of these nodes.
#include <algorithm>
#include <cmath>

#include "rtree.hpp"

namespace w30 {

RTree str_build(std::span<const Point> points) {
    (void)points;  // TODO
    return {};
}

}  // namespace w30
