// The given parts of longest-prefix match: the binary trie, the generated
// table, the reader of a downloaded table, and the addresses to look up.
#include "lpm.hpp"

#include <array>
#include <charconv>
#include <fstream>
#include <random>
#include <set>
#include <stdexcept>
#include <utility>

namespace w29 {

BinaryTrie::BinaryTrie(std::span<const Route> routes) : nodes(1, TrieNode{{0, 0}, no_route}) {
    for (const Route& r : routes) {
        std::uint32_t at = 0;
        for (unsigned i = 0; i < r.length; ++i) {
            const unsigned bit = (r.prefix >> (31 - i)) & 1;
            if (nodes[at].child[bit] == 0) {
                nodes[at].child[bit] = static_cast<std::uint32_t>(nodes.size());
                nodes.push_back(TrieNode{{0, 0}, no_route});
            }
            at = nodes[at].child[bit];
        }
        nodes[at].hop = r.hop;
    }
}

Hop BinaryTrie::lookup(std::uint32_t address) const {
    Hop best = nodes[0].hop;
    std::uint32_t at = 0;
    for (int i = 31; i >= 0; --i) {
        at = nodes[at].child[(address >> i) & 1];
        if (at == 0) break;
        if (nodes[at].hop != no_route) best = nodes[at].hop;  // a longer prefix matches
    }
    return best;
}

std::vector<Route> bgp_like_table(std::size_t n, std::uint64_t seed) {
    // Routes per length in a table of about 1,000,000 routes: the global table
    // of 2025 for /8 ... /24, and some longer prefixes of a provider's own network.
    constexpr std::array<std::pair<unsigned, double>, 25> share = {{
        {8, 16},     {9, 12},     {10, 36},    {11, 100},   {12, 300},    {13, 600},   {14, 1100},
        {15, 2000},  {16, 13500}, {17, 8500},  {18, 14500}, {19, 26000},  {20, 42000}, {21, 50000},
        {22, 120000}, {23, 95000}, {24, 600000}, {25, 2000}, {26, 1500},  {27, 1000},  {28, 800},
        {29, 800},   {30, 1000},  {31, 300},   {32, 3000},
    }};
    std::vector<double> weights;
    for (auto [len, w] : share) weights.push_back(w);
    std::discrete_distribution<std::size_t> pick(weights.begin(), weights.end());
    std::mt19937_64 rng(seed);
    std::set<std::pair<std::uint32_t, unsigned>> seen;
    std::vector<Route> routes;
    routes.reserve(n);
    while (routes.size() < n) {
        const unsigned len = share[pick(rng)].first;
        const auto first = static_cast<std::uint32_t>(1 + rng() % 223);  // 1.0.0.0 ... 223.255.255.255
        const auto address = first << 24 | static_cast<std::uint32_t>(rng() & 0xFF'FFFF);
        const std::uint32_t prefix = len == 0 ? 0 : address & ~std::uint32_t{0} << (32 - len);
        if (!seen.insert({prefix, len}).second) continue;
        routes.push_back({prefix, static_cast<std::uint8_t>(len), static_cast<Hop>(1 + rng() % 400'000)});
    }
    return routes;
}

std::vector<Route> read_table(const std::string& path) {
    std::ifstream in(path);
    if (!in) throw std::runtime_error("cannot read " + path);
    std::vector<Route> routes;
    std::set<std::pair<std::uint32_t, unsigned>> seen;
    std::string line;
    while (std::getline(in, line)) {
        const char* p = line.data();
        const char* end = p + line.size();
        std::uint32_t address = 0;
        bool ok = true;
        for (int part = 0; part < 4 && ok; ++part) {
            unsigned v = 256;
            auto r = std::from_chars(p, end, v);
            ok = r.ec == std::errc{} && v < 256 && r.ptr < end && *r.ptr == (part < 3 ? '.' : '/');
            address = address << 8 | v;
            p = r.ptr + 1;
        }
        unsigned len = 33;
        if (ok) {
            auto r = std::from_chars(p, end, len);
            ok = r.ec == std::errc{} && len <= 32;
            p = r.ptr;
        }
        if (!ok) continue;
        while (p < end && (*p == ' ' || *p == '\t')) ++p;
        std::uint64_t as = 0;
        std::from_chars(p, end, as);
        const std::uint32_t prefix = len == 0 ? 0 : address & ~std::uint32_t{0} << (32 - len);
        if (seen.insert({prefix, len}).second)
            routes.push_back({prefix, static_cast<std::uint8_t>(len), static_cast<Hop>(as % no_route)});
    }
    return routes;
}

std::vector<std::uint32_t> lookup_addresses(std::span<const Route> routes, std::size_t n, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<std::uint32_t> out(n);
    for (auto& a : out) {
        const auto r = static_cast<std::uint32_t>(rng());
        if (routes.empty() || rng() % 10 == 0) {
            a = r;
            continue;
        }
        const Route& x = routes[rng() % routes.size()];
        const std::uint32_t host = x.length == 0 ? ~std::uint32_t{0} : x.length == 32 ? 0 : ~std::uint32_t{0} >> x.length;
        a = x.prefix | (r & host);
    }
    return out;
}

}  // namespace w29
