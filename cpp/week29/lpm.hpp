// Week 29: longest-prefix match for IPv4 routing (task 6). The given parts are
// in lpm.cpp: the baseline binary trie, a generated table like the global BGP
// table, and the reader of the table of tools/download_bgp.sh.
#pragma once
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

namespace w29 {

using Hop = std::uint32_t;                    // the next hop of a route (here: the AS that announced it)
inline constexpr Hop no_route = 0x7FFF'FFFF;  // the answer when no prefix matches the address

// A route: every address whose first `length` bits are those of `prefix` goes
// to `hop`. The bits of prefix after the first `length` bits are 0, and a
// table has at most one route for each (prefix, length).
struct Route {
    std::uint32_t prefix;
    std::uint8_t length;  // 0 ... 32
    Hop hop;              // < no_route
};

// The baseline: a binary trie, one bit of the address per level. Node 0 is
// the root; a child 0 means "no child".
class BinaryTrie {
public:
    explicit BinaryTrie(std::span<const Route> routes);
    // The hop of the longest prefix that matches the address, or no_route.
    Hop lookup(std::uint32_t address) const;
    std::size_t bytes() const { return nodes.size() * sizeof(TrieNode); }

private:
    struct TrieNode {
        std::uint32_t child[2];
        Hop hop;  // no_route if no route ends here
    };
    std::vector<TrieNode> nodes;
};

// Task 6. Longest-prefix match, with the same answers as BinaryTrie but much
// faster. The members below are the layout DIR-24-8 of Gupta, Lin and McKeown
// (1998), as in DPDK's rte_lpm; you may change them as you like.
//  - tbl24 has 2^24 entries, one for each value of the first 24 bits of an
//    address. An entry without group_bit is the hop of the longest prefix of
//    length <= 24 that matches those 24 bits (no_route if none).
//  - If one or more prefixes longer than 24 bits start with those 24 bits, the
//    entry is group_bit | g. Then tbl8[256 * g + (address & 255)] is the hop
//    for the address: tbl8 has 256 entries for each group, one for each
//    value of the last 8 bits.
inline constexpr std::uint32_t group_bit = 0x8000'0000;
class Lpm {
public:
    explicit Lpm(std::span<const Route> routes);
    Hop lookup(std::uint32_t address) const;
    std::size_t bytes() const { return (tbl24.size() + tbl8.size()) * sizeof(std::uint32_t); }

    std::vector<std::uint32_t> tbl24;
    std::vector<Hop> tbl8;
};

// n different routes whose lengths follow the global IPv4 BGP table of 2025
// (about 60 % of the routes are /24), plus a few longer prefixes as in the
// table of a provider's own network. The prefixes are in 1.0.0.0-223.255.255.255.
std::vector<Route> bgp_like_table(std::size_t n, std::uint64_t seed);
// The routes of a text file with one route per line, "a.b.c.d/length AS"
// (tools/download_bgp.sh); lines of another form are skipped.
std::vector<Route> read_table(const std::string& path);
// n addresses to look up: 90 % inside the prefix of a random route, 10 % random.
std::vector<std::uint32_t> lookup_addresses(std::span<const Route> routes, std::size_t n, std::uint64_t seed);

}  // namespace w29
