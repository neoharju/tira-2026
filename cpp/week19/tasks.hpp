// Week 19: the functions that you write in tasks 2-8, one file per task.
// Task 1 is in astar.hpp.
#pragma once
#include <cstdint>
#include <span>
#include <vector>

#include "astar.hpp"

namespace w19 {

// Task 2. The scale of the straight-line bound: the smallest ratio
// weight / length over all arcs, where length is the straight-line distance
// between the ends of the arc. Arcs of length 0 do not count. Multiply the
// result by (1 - 1e-6) as a safety margin for rounding errors.
double geo_scale(const Graph& g, std::span<const Point> points);

// Task 2. The straight-line potential: scale times the straight-line distance
// from v to target, rounded down.
struct GeoPotential {
    std::span<const Point> points;
    double scale;  // from geo_scale
    Point target;
    Dist operator()(Node v) const;
};

// Task 3. k landmarks with the farthest-point method. The first landmark is
// the node farthest from start; every next one is the node whose distance from
// the nearest landmark chosen so far is the largest. All distances are from
// the landmarks to the nodes, in g. Ties go to the smallest node.
std::vector<Node> farthest_landmarks(const Graph& g, std::uint32_t k, Node start);

// The ALT data of one node for 8 landmarks L_0, ..., L_7: one cache line.
struct alignas(64) LandmarkRow {
    std::int32_t from[8];  // from[i] = d(L_i, v)
    std::int32_t to[8];    // to[i]   = d(v, L_i)
    friend bool operator==(const LandmarkRow&, const LandmarkRow&) = default;
};

// Task 4. The ALT potential for the target whose row is `target`: the largest
// of 0, target.from[i] - row.from[i] and row.to[i] - target.to[i] over the 8
// landmarks, where row = rows[v].
struct AltPotential {
    std::span<const LandmarkRow> rows;
    LandmarkRow target;
    Dist operator()(Node v) const;
};

// Task 5. The distance from source to target with bidirectional Dijkstra
// (INF if target cannot be reached). `rev` is the reverse graph. The two
// searches take turns, and they stop when top_f + top_b >= mu.
Dist bidirectional(const Graph& g, const Graph& rev, Node source, Node target);

// Task 6. The same search, and a shortest path.
struct PathResult {
    Dist distance = INF;
    std::vector<Node> path;  // source, ..., target; empty if target cannot be reached
};
PathResult bidirectional_path(const Graph& g, const Graph& rev, Node source, Node target);

// The ALT data of one node for 16 landmarks: two cache lines.
struct alignas(64) LandmarkRow16 {
    std::int32_t from[16];  // from[i] = d(L_i, v)
    std::int32_t to[16];    // to[i]   = d(v, L_i)
};

// Task 7. The ALT bound for 16 landmarks with AVX2 intrinsics: the largest of
// 0, t.from[i] - v.from[i] and v.to[i] - t.to[i] over the 16 landmarks.
Dist alt_bound16(const LandmarkRow16& v, const LandmarkRow16& t);

// Task 8. The rows of the 8 landmarks for every node: 16 independent
// Dijkstra searches (from every landmark in g and in rev), in parallel with
// OpenMP or std::jthread.
std::vector<LandmarkRow> landmark_rows(const Graph& g, const Graph& rev, std::span<const Node> landmarks);

}  // namespace w19
