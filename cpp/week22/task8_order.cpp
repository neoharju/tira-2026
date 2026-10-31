// Task 8: a numbering of the nodes in which linked nodes get close numbers.
#include <numeric>

#include "tasks.hpp"

namespace w22 {

std::vector<Node> locality_order(const Graph& g) {
    std::vector<Node> id(g.nodes());
    std::iota(id.begin(), id.end(), Node{0});  // TODO: the same order as now
    return id;
}

}  // namespace w22
