// Week 31: the memtable, a skip list (task 2). The given parts are in
// memtable.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "format.hpp"

namespace w31 {

// The memtable keeps the newest writes in memory, sorted in the internal
// order, until it is full and is written to a table (a "flush"). Every write
// adds a version; nothing is changed or removed, as in LevelDB and RocksDB.
//
// It is a skip list (Pugh, 1990): a sorted linked list (level 0) with express
// lanes above it. A node with height h is on the levels 0 ... h - 1, and
// level i links the nodes of height > i in order. A search starts on the top
// level of the head node. It goes right while the next node is smaller than
// the target, and down one level when it is not.
//
// The nodes are in a vector and refer to each other by their number in it,
// like the pages of week 26: a number stays valid when the vector grows.
class MemTable {
public:
    static constexpr int max_height = 12;

    explicit MemTable(std::uint64_t seed = 31);

    // Task 2. Adds a version. No version of this key with this seq is in the
    // memtable yet. The new node is nodes.back(); its height comes from one
    // call of random_height(), and its links are the next `height` places at
    // the end of `link`, so that the shape of the list is exactly that of the
    // tests.
    void add(Key key, Seq seq, Kind kind, std::string_view value);

    // Task 2. The newest version of key with seq <= snapshot, or nothing.
    std::optional<Lookup> get(Key key, Seq snapshot) const;

    // The height of the next node: 1, and one more with probability 1/4
    // each time, at most max_height (LevelDB's rule).
    int random_height();

    std::size_t size() const { return nodes.size() - 1; }  // the number of versions
    // The memory that the list uses. A flush starts when it reaches a limit.
    std::size_t bytes() const { return nodes.size() * sizeof(Node) + link.size() * sizeof(std::uint32_t) + values.size(); }
    // All versions, in the internal order: the walk along level 0.
    std::vector<Entry> entries() const;
    // Checks the rules: every level is sorted in the internal order, a node
    // is on exactly the levels below its height, every node is on level 0,
    // and `height` is the largest height of a node (at least 1). Throws
    // std::logic_error if not.
    void validate() const;

    // A node: its version, its height and where its links are.
    struct Node {
        Key key;
        Seq seq;
        Kind kind;
        std::uint8_t height;
        std::uint32_t value_at, value_size;  // its value is values.substr(value_at, value_size)
        std::uint32_t first_link;            // its next node on level i is link[first_link + i]
    };
    std::uint32_t next(std::uint32_t node, int level) const { return link[nodes[node].first_link + static_cast<std::uint32_t>(level)]; }
    std::string_view value(const Node& n) const { return std::string_view(values).substr(n.value_at, n.value_size); }

    // The skip list, open for your code. Node 0 is the head: it has height
    // max_height, its links are link[0 ... 11], and it has no version. A link
    // 0 means "no next node": the head is never the next node of anything.
    std::vector<Node> nodes;
    std::vector<std::uint32_t> link;
    std::string values;  // the values of all nodes, one after another
    int height = 1;      // the largest height of a node: searches start on level height - 1

private:
    std::uint64_t rng_;
};

namespace baseline {
// The same versions in a std::map, a red-black tree, for comparison.
class MapMemTable {
public:
    void add(Key key, Seq seq, Kind kind, std::string_view value) { map_.emplace(std::pair{key, seq}, Lookup{kind, std::string(value)}); }
    std::optional<Lookup> get(Key key, Seq snapshot) const {
        const auto it = map_.lower_bound({key, snapshot});
        if (it == map_.end() || it->first.first != key) return std::nullopt;
        return it->second;
    }
    std::size_t size() const { return map_.size(); }

private:
    struct Less {
        bool operator()(const std::pair<Key, Seq>& a, const std::pair<Key, Seq>& b) const { return internal_less(a.first, a.second, b.first, b.second); }
    };
    std::map<std::pair<Key, Seq>, Lookup, Less> map_;
};
}  // namespace baseline

}  // namespace w31
