// Simple versions of the week 22 tasks.
#include <cmath>

#include "tasks.hpp"

namespace w22::baseline {

double push_step(const Graph& g, std::span<const double> x, std::span<double> y, double d) {
    const Node n = g.nodes();
    double dangling = 0;
    for (Node u = 0; u < n; ++u)
        if (g.degree(u) == 0) dangling += x[u];
    for (Node v = 0; v < n; ++v) y[v] = (1 - d) / n + d * dangling / n;
    for (Node u = 0; u < n; ++u)
        for (Node v : g.neighbours(u)) y[v] += d * x[u] / g.degree(u);
    double change = 0;
    for (Node v = 0; v < n; ++v) change += std::abs(y[v] - x[v]);
    return change;
}

double pull_step(const Graph& in, std::span<const std::uint32_t> out_degree, std::span<const double> x, std::span<double> y, double d) {
    const Node n = in.nodes();
    double dangling = 0;
    for (Node u = 0; u < n; ++u)
        if (out_degree[u] == 0) dangling += x[u];
    double change = 0;
    for (Node v = 0; v < n; ++v) {
        double sum = 0;
        for (Node u : in.neighbours(v)) sum += x[u] / out_degree[u];
        y[v] = (1 - d) / n + d * (sum + dangling / n);
        change += std::abs(y[v] - x[v]);
    }
    return change;
}

PageRank pagerank(const Graph& g, double d, double epsilon, int max_steps) {
    const Node n = g.nodes();
    PageRank r;
    r.rank.assign(n, n ? 1.0 / n : 0.0);
    std::vector<double> next(n);
    while (r.steps < max_steps) {
        const double change = baseline::push_step(g, r.rank, next, d);
        r.rank.swap(next);
        ++r.steps;
        if (change < epsilon) break;
    }
    return r;
}

std::vector<double> personalized(const Graph& g, Node seed, double d, double epsilon) {
    const Node n = g.nodes();
    std::vector<double> x(n, 0.0), y(n);
    x[seed] = 1;
    for (int step = 0; step < 100000; ++step) {
        double dangling = 0;
        for (Node u = 0; u < n; ++u)
            if (g.degree(u) == 0) dangling += x[u];
        for (Node v = 0; v < n; ++v) y[v] = 0;
        y[seed] = (1 - d) + d * dangling;
        for (Node u = 0; u < n; ++u)
            for (Node v : g.neighbours(u)) y[v] += d * x[u] / g.degree(u);
        double change = 0;
        for (Node v = 0; v < n; ++v) change += std::abs(y[v] - x[v]);
        x.swap(y);
        if (change < epsilon) break;
    }
    return x;
}

}  // namespace w22::baseline
