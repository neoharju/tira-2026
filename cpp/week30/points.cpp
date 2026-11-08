#include "points.hpp"

#include <algorithm>
#include <cmath>
#include <random>

namespace w30 {

namespace {

struct Town {
    double x, y, people;  // ETRS-TM35FIN east, north - 6,600,000, and inhabitants (rounded)
};
// The 20 largest towns, with rough coordinates.
constexpr Town towns[] = {
    {385'000, 72'000, 670'000}, {372'000, 74'000, 310'000}, {327'000, 222'000, 250'000}, {392'000, 88'000, 245'000},
    {428'000, 610'000, 215'000}, {240'000, 111'000, 200'000}, {435'000, 303'000, 147'000}, {534'000, 377'000, 125'000},
    {427'000, 162'000, 120'000}, {222'000, 234'000, 83'000},   {490'000, 149'000, 80'000},  {642'000, 345'000, 78'000},
    {575'000, 170'000, 73'000},  {360'000, 168'000, 68'000},   {229'000, 405'000, 68'000},  {282'000, 358'000, 65'000},
    {443'000, 775'000, 65'000},  {512'000, 240'000, 52'000},   {494'000, 107'000, 51'000},  {544'000, 524'000, 36'000},
};

}  // namespace

std::vector<Point> finland_points(std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<double> w;
    for (const Town& t : towns) w.push_back(t.people);
    std::discrete_distribution<std::size_t> town(w.begin(), w.end());
    std::normal_distribution<double> gauss(0, 1);
    std::uniform_real_distribution<double> uni(0, 1);
    std::vector<Point> p;
    p.reserve(n);
    while (p.size() < n) {
        double x, y;
        if (uni(rng) < 0.7) {
            const Town& t = towns[town(rng)];
            const double spread = 2'000 + 9 * std::sqrt(t.people);  // larger towns spread wider
            x = t.x + spread * gauss(rng);
            y = t.y + spread * gauss(rng);
        } else {
            // the country: a band that narrows to the north, with fewer people there
            y = 1'150'000 * (1 - std::sqrt(uni(rng)));
            const double west = 80'000 + y * 0.25, east = 720'000 - y * 0.18;
            x = west + (east - west) * uni(rng);
        }
        if (x < 0 || y < 0 || x >= 800'000 || y >= 1'200'000) continue;
        p.push_back({static_cast<float>(std::floor(x)), static_cast<float>(std::floor(y))});
    }
    return p;
}

std::vector<Point> uniform_points(std::size_t n, std::uint32_t size, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Point> p(n);
    for (Point& x : p) x = {static_cast<float>(rng() % size), static_cast<float>(rng() % size)};
    return p;
}

std::vector<Rect> boxes_around(const std::vector<Point>& points, std::size_t n, float width, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<Rect> q(n);
    for (Rect& r : q) {
        const Point c = points[rng() % points.size()];
        const float dx = static_cast<float>(rng() % 1000) - 500, dy = static_cast<float>(rng() % 1000) - 500;
        r = {c.x + dx - width / 2, c.y + dy - width / 2, c.x + dx + width / 2, c.y + dy + width / 2};
    }
    return q;
}

}  // namespace w30
