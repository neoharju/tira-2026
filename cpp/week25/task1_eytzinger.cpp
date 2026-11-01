// Task 1: the Eytzinger layout. Now this copies the keys in sorted order,
// which is not the layout. Fill e[1 ... n] in breadth-first order: an in-order
// walk of the tree (left subtree 2k, node k, right subtree 2k + 1) visits the
// places in the order of the sorted keys.
#include "tasks.hpp"

namespace w25 {

Keys eytzinger(std::span<const Key> sorted) {
    Keys e(sorted.size() + 1);
    e[0] = none;
    for (std::size_t i = 0; i < sorted.size(); ++i) e[i + 1] = sorted[i];  // TODO
    return e;
}

}  // namespace w25
