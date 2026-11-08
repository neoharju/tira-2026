// Week 30: points, boxes, keys and cells. Tasks 1-3: Morton keys with BMI2,
// Hilbert keys, geohash and hexagonal cells. The baselines are in baseline.cpp.
#pragma once
#include <compare>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace w30 {

// A point on the map: whole meters east (x) and north (y) of a corner south-west
// of Finland, as in the national coordinates ETRS-TM35FIN with a smaller
// origin. A float holds every whole number below 2^24 exactly, so the
// coordinates and the compares of this week are exact.
struct Point {
    float x, y;
};

// A box, edges included: the points with min_x <= x <= max_x and min_y <= y <= max_y.
struct Rect {
    float min_x, min_y, max_x, max_y;
};

// Task 1. The Morton key (Z-order) of (x, y): the bits of x and y in turns,
// bit i of x at bit 2i of the key and bit i of y at bit 2i + 1.
std::uint64_t morton_encode(std::uint32_t x, std::uint32_t y);
// Task 1. The (x, y) of a Morton key.
std::pair<std::uint32_t, std::uint32_t> morton_decode(std::uint64_t key);

// Task 2. The place of (x, y) on the Hilbert curve that fills the square of
// 2^32 x 2^32 points: the same number as baseline::hilbert_encode.
std::uint64_t hilbert_encode(std::uint32_t x, std::uint32_t y);

// Task 3. The geohash of a place with `chars` characters (1 ... 12): the bits
// of the longitude and the latitude in turns, the longitude first, each found
// by halving its range ([-180, 180] and [-90, 90]); a bit is 1 if the value is
// >= the middle of the range. Every 5 bits are one character of
// "0123456789bcdefghjkmnpqrstuvwxyz".
std::string geohash(double lat, double lon, int chars);

// A hexagon of a grid of pointy-top hexagons whose corners are `size` from
// their centres, in axial coordinates: the centre of (q, r) is
//   x = size * sqrt(3) * (q + r / 2),   y = size * 3/2 * r.
struct Hex {
    std::int32_t q, r;
    friend auto operator<=>(const Hex&, const Hex&) = default;
};
// Task 3. The hexagon that contains the point: the one with the nearest centre.
Hex hex_of(double x, double y, double size);
// Task 3. The hexagons at most k steps from `center` (1 + 3k(k + 1) of them),
// in any order. One step goes to one of the 6 neighbours.
std::vector<Hex> hex_disk(Hex center, int k);

namespace baseline {

std::uint64_t morton_encode(std::uint32_t x, std::uint32_t y);           // one bit at a time
std::pair<std::uint32_t, std::uint32_t> morton_decode(std::uint64_t key);  // one bit at a time
// The loop of the classic xy2d function (Wikipedia, "Hilbert curve"), for 32-bit coordinates.
std::uint64_t hilbert_encode(std::uint32_t x, std::uint32_t y);
std::string geohash(double lat, double lon, int chars);  // the definition above, bit by bit

}  // namespace baseline

}  // namespace w30
