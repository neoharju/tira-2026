// Task 6: longest-prefix match, as lpm.hpp describes. The members of Lpm are
// the layout DIR-24-8; you may change them as you like.
#include "lpm.hpp"

namespace w29 {

Lpm::Lpm(std::span<const Route> routes) {
    (void)routes;  // TODO
}

Hop Lpm::lookup(std::uint32_t address) const {
    (void)address;  // TODO
    return no_route;
}

}  // namespace w29
