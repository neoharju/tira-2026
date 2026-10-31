// Week 22: the functions that you write. Each one is in its own file
// (task1_push.cpp, ...). The tests are in test.cpp and the speed goals in
// bench.cpp.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

#include "graph.hpp"

namespace w22 {

// One step of power iteration for PageRank with the damping factor d, from
// the ranks x to the ranks y (one value per node, n nodes):
//   y[v] = (1 - d) / n + d * (sum over the arcs u -> v of x[u] / outdeg(u) + D / n),
// where D is the sum of x[u] over the dangling nodes u (outdeg(u) == 0). An
// arc that appears twice counts twice. The steps return the L1 norm of the
// change: the sum of |y[v] - x[v]| over all nodes.

// Task 1. The step in the push direction: every node u sends x[u] / outdeg(u)
// along its arcs. g has the arcs that leave every node.
double push_step(const Graph& g, std::span<const double> x, std::span<double> y, double d);

// Task 2. The step in the pull direction: every node v adds up what comes in
// along its arcs. in = transpose(g) and out_degree = out_degrees(g).
double pull_step(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x, std::span<double> y, double d);

// Task 3. PageRank by power iteration: start from x[v] = 1 / n and take steps
// until the change is below epsilon (or max_steps steps). `steps` is the
// number of steps taken; the last one had a change below epsilon.
struct PageRank {
    std::vector<double> rank;
    int steps = 0;
};
PageRank pagerank(const Graph& g, double d = 0.85, double epsilon = 1e-9, int max_steps = 1000);

// Task 4. Personalized PageRank of one seed node with forward push: the
// random surfer jumps back to the seed instead of to a random page, and also
// leaves a dangling node to the seed. Start with residual r[seed] = 1 and
// estimate p = 0. While some node u has r[u] >= epsilon * max(1, outdeg(u)),
// push u: add (1 - d) * r[u] to p[u], set r[u] = 0, and give d * r[u] (the old
// value) in equal parts to the targets of the arcs of u, or all of it to the
// seed if u is dangling. Both results list the nodes with a value > 0 in
// increasing order.
struct Sparse {
    std::vector<Node> node;
    std::vector<double> value;
};
struct LocalRank {
    Sparse estimate, residual;
};
LocalRank personalized(const Graph& g, Node seed, double d, double epsilon);

// Task 5. The second half of a pull step, with AVX2: for every node v
//   y[v] = base + d * sum[v]   and   contrib[v] = y[v] * inv_degree[v],
// where inv_degree[v] = 1 / outdeg(v), or 0 for a dangling node. Returns the
// change (the sum of |y[v] - x[v]|) and the sum of y[v] over the dangling nodes.
struct Update {
    double change, dangling;
};
Update update_ranks(std::span<const double> sum, std::span<const double> x, std::span<const double> inv_degree, double base,
                    double d, std::span<double> y, std::span<double> contrib);

// Tasks 6 and 7. pull_step with OpenMP threads, without atomic operations.
double pull_step_parallel(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x,
                          std::span<double> y, double d);

// Task 8. A new numbering of the nodes in which linked nodes get close
// numbers: new_id[u] is the new number of node u (a permutation of 0 ... n - 1).
std::vector<Node> locality_order(const Graph& g);

// Simple versions for comparison (baseline.cpp and baseline_scalar.cpp).
namespace baseline {
double push_step(const Graph& g, std::span<const double> x, std::span<double> y, double d);
double pull_step(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x, std::span<double> y, double d);
PageRank pagerank(const Graph& g, double d = 0.85, double epsilon = 1e-9, int max_steps = 1000);
// Personalized PageRank of the seed by power iteration, until the change is below epsilon.
std::vector<double> personalized(const Graph& g, Node seed, double d, double epsilon);
Update update_ranks(std::span<const double> sum, std::span<const double> x, std::span<const double> inv_degree, double base,
                    double d, std::span<double> y, std::span<double> contrib);
}  // namespace baseline

}  // namespace w22
