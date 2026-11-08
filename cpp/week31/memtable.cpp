// The given parts of the memtable: the empty list, the heights, entries and
// validate.
#include "memtable.hpp"

#include <algorithm>
#include <bit>
#include <stdexcept>

namespace w31 {

MemTable::MemTable(std::uint64_t seed) : rng_(seed) {
    nodes.push_back({0, 0, Kind::put, static_cast<std::uint8_t>(max_height), 0, 0, 0});
    link.assign(max_height, 0);
}

int MemTable::random_height() {
    // splitmix64: one 64-bit random number per node. Its lowest 2k bits are
    // all zero with probability 4^-k, so the height is at least k + 1 with
    // probability 4^-k.
    std::uint64_t z = (rng_ += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    z ^= z >> 31;
    return std::min(1 + std::countr_zero(z | (std::uint64_t{1} << 62)) / 2, max_height);
}

std::vector<Entry> MemTable::entries() const {
    std::vector<Entry> out;
    out.reserve(size());
    for (std::uint32_t x = next(0, 0); x != 0; x = next(x, 0)) {
        const Node& n = nodes[x];
        out.push_back({n.key, n.seq, n.kind, std::string(value(n))});
    }
    return out;
}

void MemTable::validate() const {
    auto broken = [](const std::string& what) { throw std::logic_error("validate: " + what); };
    if (nodes.empty() || nodes[0].height != max_height || nodes[0].first_link != 0 || link.size() < max_height) broken("the head node is wrong");
    int top = 1;
    std::vector<std::size_t> on_level(max_height, 0);
    for (std::size_t i = 1; i < nodes.size(); ++i) {
        const Node& n = nodes[i];
        if (n.height < 1 || n.height > max_height) broken("node " + std::to_string(i) + " has a wrong height");
        if (std::size_t{n.first_link} + n.height > link.size()) broken("the links of node " + std::to_string(i) + " are outside `link`");
        if (std::size_t{n.value_at} + n.value_size > values.size()) broken("the value of node " + std::to_string(i) + " is outside `values`");
        top = std::max(top, int{n.height});
        for (int l = 0; l < n.height; ++l) ++on_level[l];
    }
    if (height != top) broken("`height` is " + std::to_string(height) + ", but the highest node has height " + std::to_string(top));
    for (int l = 0; l < max_height; ++l) {
        std::size_t count = 0;
        std::uint32_t prev = 0;
        for (std::uint32_t x = next(0, l); x != 0; x = next(x, l)) {
            if (x >= nodes.size()) broken("a link on level " + std::to_string(l) + " goes to no node");
            if (nodes[x].height <= l) broken("node " + std::to_string(x) + " is on level " + std::to_string(l) + ", above its height");
            if (prev != 0 && !internal_less(nodes[prev].key, nodes[prev].seq, nodes[x].key, nodes[x].seq))
                broken("level " + std::to_string(l) + " is not in the internal order");
            if (++count > on_level[l]) broken("level " + std::to_string(l) + " has a cycle or a node twice");
            prev = x;
        }
        if (count != on_level[l]) broken("some nodes of height > " + std::to_string(l) + " are not on level " + std::to_string(l));
    }
}

}  // namespace w31
