// The given parts of the Robin Hood table.
#include <stdexcept>
#include <string>

#include "robin_hood.hpp"

namespace w28 {

RobinHoodMap::RobinHoodMap(std::size_t capacity, std::uint64_t s) : slots(capacity, Slot{0, 0, 0}), seed(s) {}

void RobinHoodMap::validate() const {
    auto broken = [](const std::string& what) { throw std::logic_error("RobinHoodMap::validate: " + what); };
    const std::size_t n = slots.size();
    if (n < 16 || (n & (n - 1)) != 0) broken("the capacity is not a power of two of at least 16");
    std::size_t used = 0;
    for (std::size_t i = 0; i < n; ++i) {
        const Slot& s = slots[i];
        if (s.dist == 0) continue;
        ++used;
        const std::size_t d = (i - home(s.key)) & (n - 1);
        if (d + 1 != s.dist) broken("slot " + std::to_string(i) + " has a wrong dist");
        const Slot& prev = slots[(i - 1) & (n - 1)];
        if (s.dist > 1 && (prev.dist == 0 || prev.dist + 1 < s.dist))
            broken("slot " + std::to_string(i) + " breaks the Robin Hood order (a gap or a richer pair before it)");
    }
    if (used != count) broken("count is not the number of full slots");
    if (count > n - n / 8) broken("the table is more than 7/8 full");
}

}  // namespace w28
