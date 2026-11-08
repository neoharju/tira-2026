// Week 30: the points and queries of the tests and benchmarks.
#pragma once
#include <cstdint>
#include <vector>

#include "geo.hpp"

namespace w30 {

// n points that follow the towns of Finland: most are near the 20 largest
// towns, more near the larger ones, and the rest are spread over the country,
// fewer in the north. Whole meters, x < 800,000 and y < 1,200,000 (y = 0 is
// 6,600,000 m north in ETRS-TM35FIN). Points may repeat.
std::vector<Point> finland_points(std::size_t n, std::uint64_t seed);
// n points with random whole coordinates in [0, size) x [0, size).
std::vector<Point> uniform_points(std::size_t n, std::uint32_t size, std::uint64_t seed);
// Boxes of `width` x `width` meters around random points of the set.
std::vector<Rect> boxes_around(const std::vector<Point>& points, std::size_t n, float width, std::uint64_t seed);

}  // namespace w30
