// Task 3: the geohash of a place, the hexagon of a point and the hexagons
// near a hexagon, as geo.hpp describes.
#include <cmath>

#include "geo.hpp"

namespace w30 {

std::string geohash(double lat, double lon, int chars) {
    (void)lat;  // TODO
    (void)lon;
    (void)chars;
    return "";
}

Hex hex_of(double x, double y, double size) {
    (void)x;  // TODO
    (void)y;
    (void)size;
    return {0, 0};
}

std::vector<Hex> hex_disk(Hex center, int k) {
    (void)center;  // TODO
    (void)k;
    return {};
}

}  // namespace w30
