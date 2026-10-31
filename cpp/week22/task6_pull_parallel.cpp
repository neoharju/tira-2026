// Tasks 6 and 7: pull_step with OpenMP threads, without atomic operations.
// Task 7: make it fast also when the nodes are sorted by in-degree.
#include <omp.h>

#include "tasks.hpp"

namespace w22 {

double pull_step_parallel(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x,
                          std::span<double> y, double d) {
    return pull_step(in, out_degree, x, y, d);  // TODO: in parallel
}

}  // namespace w22
