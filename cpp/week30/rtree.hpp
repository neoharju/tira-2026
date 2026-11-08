// Week 30: an R-tree of points, packed by Sort-Tile-Recursive (tasks 4 and 7),
// its range and nearest-neighbour queries (task 5), the SIMD node test (task 6)
// and batches of queries (task 8). The given parts are in rtree.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <span>
#include <vector>

#include "geo.hpp"

namespace w30 {

inline constexpr unsigned fanout = 8;  // children per node: 8 floats are one AVX2 register

// A node: the boxes of its children as a struct of arrays (one array per
// coordinate, so one aligned load gets a coordinate of all 8 children), and the
// children: points (their ids) in a leaf, nodes in an inner node. A slot that
// is not in use has the empty box min = +infinity, max = -infinity, which
// meets no box.
struct alignas(64) Node {
    float min_x[fanout], min_y[fanout], max_x[fanout], max_y[fanout];
    std::uint32_t child[fanout];  // a point id (level 0) or a node (level > 0)
    std::uint16_t count;          // the slots in use: slots 0 ... count - 1
    std::uint16_t level;          // 0: a leaf; the children of level l are nodes of level l - 1
};

inline constexpr float inf = std::numeric_limits<float>::infinity();

// An R-tree. The nodes are stored level by level: first the leaves, then the
// level above them, and so on; the root is the last node. A leaf holds the
// boxes of its points, with min = max = the point.
struct RTree {
    std::vector<Node> nodes;
    std::uint32_t root = 0;
    int height = 0;  // 0: an empty tree; 1: the root is a leaf
};

// An entry of a level while the tree is built: the box of a point or of a node.
struct Entry {
    Rect box;
    std::uint32_t id;  // a point id, or a node
};

// Task 4. The R-tree of the points (id = place in `points`), by Sort-Tile-
// Recursive (Leutenegger, Lopez and Edgington, 1997), exactly so:
//  - Level 0 starts with the entries of the points; level l + 1 with the
//    entries of the nodes of level l (their box: the union of their slots),
//    in the order of the nodes.
//  - A level with m <= 8 entries is the root: one node with the entries in
//    their order. Otherwise, with P = ceil(m / 8) nodes and S = the smallest
//    whole number with S * S >= P:
//     1. sort the entries by (min_x + max_x, min_y + max_y, id);
//     2. cut them into slices of S * 8 entries (the last slice may have fewer);
//     3. sort each slice by (min_y + max_y, min_x + max_x, id);
//     4. cut each slice into nodes of 8 entries (the last node of a slice may
//        have fewer), slice after slice. The nodes get the next places in
//        `nodes`, in this order, and their slots the entries in this order.
//  (min + max is twice the centre: a sum of two whole numbers below 2^23 is
//  exact in a float.)
RTree str_build(std::span<const Point> points);

// Task 7. The same tree, built with OpenMP threads.
RTree str_build_parallel(std::span<const Point> points);

// The node test of a range query: bit i is 1 when the box of slot i meets q
// (edges included). The empty boxes of unused slots meet nothing.
struct ScalarTest {
    static unsigned mask(const Node& n, const Rect& q) {
        unsigned m = 0;
        for (unsigned i = 0; i < fanout; ++i)
            if (n.min_x[i] <= q.max_x && q.min_x <= n.max_x[i] && n.min_y[i] <= q.max_y && q.min_y <= n.max_y[i]) m |= 1u << i;
        return m;
    }
};

// Task 5. Appends the ids of the points inside q (edges included) to out, in
// any order. Test is ScalarTest or SimdTest (task 6, simd_test.hpp).
template <class Test>
void range_query(const RTree& t, const Rect& q, std::vector<std::uint32_t>& out);
// Task 5. The k points nearest to p (fewer if the tree has fewer), sorted by
// (squared distance, id). The squared distance is computed in double, so it
// is exact for our whole-number coordinates.
std::vector<std::uint32_t> knn(const RTree& t, Point p, std::size_t k);

// Task 8. out[i] = the ids of the points in queries[i] (any order), with OpenMP.
void range_query_batch(const RTree& t, std::span<const Rect> queries, std::vector<std::vector<std::uint32_t>>& out);

// The given parts (rtree.cpp).
// Checks the rules: the box of every slot is the union of its child (a leaf:
// the point), unused slots are empty, the levels and the order of the nodes,
// and that every point is in exactly one leaf. Throws std::logic_error if not.
void validate(const RTree& t, std::span<const Point> points);
// A number that depends on every node, slot and box of the tree: two trees
// with the same nodes in the same order have the same hash.
std::uint64_t tree_hash(const RTree& t);
// The squared distance from p to the nearest point of the box (0 inside it).
double min_dist2(const Rect& b, Point p);
// A packed R-tree: the points in the given order, 8 to a leaf, and the nodes
// of each level in their order, 8 to a parent (Kamel and Faloutsos, 1993). With
// the points in the order of their Hilbert keys, this is a packed Hilbert
// R-tree. The tests and benchmarks of tasks 5, 6 and 8 use it, so that they do
// not need your str_build.
RTree pack(std::span<const Point> points, std::span<const std::uint32_t> order);
// The ids of the points in the order of baseline::hilbert_encode of their coordinates.
std::vector<std::uint32_t> hilbert_order(std::span<const Point> points);
// The number of nodes that a range query for q reads.
std::size_t nodes_read(const RTree& t, const Rect& q);

namespace baseline {
// Range query and k nearest by checking every point.
void range_query(std::span<const Point> points, const Rect& q, std::vector<std::uint32_t>& out);
std::vector<std::uint32_t> knn(std::span<const Point> points, Point p, std::size_t k);
}  // namespace baseline

}  // namespace w30
