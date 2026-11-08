// The baselines of week 30: keys one bit at a time, and queries that check
// every point. Compiled without automatic vectorization.
#include <algorithm>
#include <utility>

#include "geo.hpp"
#include "rtree.hpp"

namespace w30::baseline {

std::uint64_t morton_encode(std::uint32_t x, std::uint32_t y) {
    std::uint64_t key = 0;
    for (unsigned i = 0; i < 32; ++i) {
        key |= std::uint64_t{(x >> i) & 1} << (2 * i);
        key |= std::uint64_t{(y >> i) & 1} << (2 * i + 1);
    }
    return key;
}

std::pair<std::uint32_t, std::uint32_t> morton_decode(std::uint64_t key) {
    std::uint32_t x = 0, y = 0;
    for (unsigned i = 0; i < 32; ++i) {
        x |= static_cast<std::uint32_t>((key >> (2 * i)) & 1) << i;
        y |= static_cast<std::uint32_t>((key >> (2 * i + 1)) & 1) << i;
    }
    return {x, y};
}

std::uint64_t hilbert_encode(std::uint32_t x, std::uint32_t y) {
    std::uint64_t d = 0;
    for (std::uint32_t s = std::uint32_t{1} << 31; s > 0; s >>= 1) {
        const std::uint32_t rx = (x & s) != 0, ry = (y & s) != 0;
        d += std::uint64_t{s} * s * ((3 * rx) ^ ry);  // the quadrant, in the order of the curve
        if (ry == 0) {  // turn the quadrant so that the curve in it starts at the right corner
            if (rx == 1) {
                x = ~x;  // n - 1 - x for n = 2^32
                y = ~y;
            }
            std::swap(x, y);
        }
    }
    return d;
}

std::string geohash(double lat, double lon, int chars) {
    static constexpr char base32[] = "0123456789bcdefghjkmnpqrstuvwxyz";
    double lo[2] = {-180, -90}, hi[2] = {180, 90};
    const double value[2] = {lon, lat};
    std::string out;
    unsigned bits = 0, n = 0;
    for (int i = 0; i < 5 * chars; ++i) {
        const int c = i % 2;  // the longitude first
        const double mid = (lo[c] + hi[c]) / 2;
        const unsigned bit = value[c] >= mid;
        (bit ? lo[c] : hi[c]) = mid;
        bits = bits << 1 | bit;
        if (++n == 5) {
            out += base32[bits];
            bits = n = 0;
        }
    }
    return out;
}

void range_query(std::span<const Point> points, const Rect& q, std::vector<std::uint32_t>& out) {
    for (std::size_t i = 0; i < points.size(); ++i)
        if (q.min_x <= points[i].x && points[i].x <= q.max_x && q.min_y <= points[i].y && points[i].y <= q.max_y)
            out.push_back(static_cast<std::uint32_t>(i));
}

std::vector<std::uint32_t> knn(std::span<const Point> points, Point p, std::size_t k) {
    std::vector<std::pair<double, std::uint32_t>> d(points.size());
    for (std::size_t i = 0; i < points.size(); ++i) {
        const double dx = double{points[i].x} - p.x, dy = double{points[i].y} - p.y;
        d[i] = {dx * dx + dy * dy, static_cast<std::uint32_t>(i)};
    }
    k = std::min(k, d.size());
    std::partial_sort(d.begin(), d.begin() + static_cast<std::ptrdiff_t>(k), d.end());
    std::vector<std::uint32_t> out;
    for (std::size_t i = 0; i < k; ++i) out.push_back(d[i].second);
    return out;
}

}  // namespace w30::baseline
