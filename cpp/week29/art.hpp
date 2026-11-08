// Week 29: the adaptive radix tree (ART) of Leis, Kemper and Neumann (ICDE
// 2013) for 64-bit keys: four kinds of inner nodes, path compression and lazy
// expansion. You write find, insert and scan (tasks 1-3) and the SIMD search
// in a node of 16 keys (tasks 4 and 5, simd_search.hpp). The given parts are
// in art.cpp: making and freeing nodes, bulk_build, validate and shape.
#pragma once
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <utility>
#include <vector>

namespace w29 {

using Key = std::uint64_t;
using Value = std::uint64_t;

struct Item {
    Key key;
    Value value;
    friend bool operator==(const Item&, const Item&) = default;
};

// The tree reads a key as 8 bytes, the most significant byte first: byte 0
// is bits 63-56 and byte 7 is bits 7-0. In this order, comparing the bytes one
// by one gives the same result as comparing the keys as numbers.
inline constexpr unsigned key_bytes = 8;
constexpr std::uint8_t key_byte(Key key, unsigned i) { return static_cast<std::uint8_t>(key >> (56 - 8 * i)); }
// The bits of the first d bytes of a key (d = 0 ... 8): key & prefix_mask(d).
constexpr Key prefix_mask(unsigned d) { return d == 0 ? 0 : ~Key{0} << (64 - 8 * d); }

// The kind of a node. Every node starts with its kind, so a child is a Node*,
// and its kind tells what it really is.
enum class Kind : std::uint8_t { leaf, node4, node16, node48, node256 };

struct Node {
    Kind kind;
};

// Lazy expansion: a key becomes a leaf as soon as it is the only key below a
// place in the tree, also if the tree has not looked at all of its bytes yet.
// So a leaf keeps the whole key, and a search compares it at the end.
struct Leaf : Node {
    Key key;
    Value value;
};

// The common part of the inner nodes. An inner node branches on byte `depth`
// of its keys (the keys below it): it has one child for each different value
// of that byte, at least 2. All keys below the node have the same first
// `depth` bytes: they are in `prefix`, whose other bytes are 0.
//
// Path compression: a child can be deeper than its parent's depth + 1. The
// bytes in between are the same for all keys below the child, so no node
// branches on them; the child's prefix keeps them.
struct Inner : Node {
    std::uint8_t depth;   // 0 ... 7
    std::uint16_t count;  // the number of children, 2 ... 256
    Key prefix;
};

// The four kinds of inner nodes. The tree only grows (there is no erase), and
// a node always has the smallest kind that has room for its children:
//   Node4: 2-4 children, Node16: 5-16, Node48: 17-48, Node256: 49-256.
// Node4 and Node16: keys[0 ... count - 1] are the bytes of the children, in
// increasing order, and children[i] is the child of keys[i].
struct Node4 : Inner {
    std::uint8_t keys[4];
    Node* children[4];
};
struct Node16 : Inner {
    std::uint8_t keys[16];
    Node* children[16];
};
// Node48: index[b] is the place in `children` of the child of byte b, or
// no_child. The children are in any order in children[0 ... count - 1].
inline constexpr std::uint8_t no_child = 0xFF;
struct Node48 : Inner {
    std::uint8_t index[256];
    Node* children[48];
};
// Node256: children[b] is the child of byte b, or nullptr.
struct Node256 : Inner {
    Node* children[256];
};

// The given parts (art.cpp). New nodes come from operator new, so that many
// threads can make nodes at the same time (task 7).
Leaf* new_leaf(Key key, Value value);
// An inner node of the given kind without children (count 0). The bytes
// after the first `depth` bytes of prefix must be 0. A Node48 starts with
// no_child in all of index; the other arrays start with zeros.
Inner* new_inner(Kind kind, unsigned depth, Key prefix);
// Adds a child to a node that has room for it. The byte must be larger than
// the bytes of all children that the node has (bulk_build adds the children
// in increasing order).
void append_child(Inner* n, std::uint8_t byte, Node* child);
// Frees one node of any kind, not its children.
void free_node(Node* n);
// Frees a node and everything below it.
void free_tree(Node* n);

// The tree of the different keys of `sorted` (increasing keys) with their
// values, built from the top down: the root branches on the first byte where
// the first and the last key differ, and so on. The tree of a set of keys is
// always the same: inserting the same keys in any order gives this tree.
Node* bulk_build_nodes(std::span<const Item> sorted);
// Checks every rule of the comment above: kinds and counts, depths, prefixes,
// the order of the bytes in Node4 and Node16, that every leaf is where its key
// belongs, and that the tree has `count` leaves. Throws std::logic_error if not.
void validate_tree(const Node* root, std::size_t count);
// The tree as numbers, from the top down, children in the order of their bytes:
// two trees have the same shape exactly when they have the same nodes.
std::vector<std::uint64_t> shape(const Node* root);

struct Stats {
    std::size_t leaves = 0, node4 = 0, node16 = 0, node48 = 0, node256 = 0;
    std::size_t bytes = 0;  // sizeof of all nodes and leaves
    std::size_t max_depth = 0;  // the most inner nodes on a path from the root
};
Stats stats(const Node* root);

// The search inside a Node16. The tree is a template of the search, so that
// the same code runs with these scalar loops and with your SIMD versions
// (SimdSearch in simd_search.hpp, tasks 4 and 5).
struct ScalarSearch {
    // The place i of byte b in n.keys[0 ... n.count - 1], or -1 if b is not there.
    static int find16(const Node16& n, std::uint8_t b) {
        for (int i = 0; i < n.count; ++i)
            if (n.keys[i] >= b) return n.keys[i] == b ? i : -1;
        return -1;
    }
    // The number of keys among n.keys[0 ... n.count - 1] that are less than b:
    // the place where b belongs.
    static int lower16(const Node16& n, std::uint8_t b) {
        int i = 0;
        while (i < n.count && n.keys[i] < b) ++i;
        return i;
    }
};

// An adaptive radix tree that maps keys to values. Search is ScalarSearch or
// SimdSearch: the Node16 search that the member functions use.
template <class Search>
class Art {
public:
    Art() = default;
    explicit Art(Node* r, std::size_t n) : root(r), count(n) {}
    ~Art() { free_tree(root); }
    Art(const Art&) = delete;
    Art& operator=(const Art&) = delete;
    Art(Art&& o) noexcept : root(std::exchange(o.root, nullptr)), count(std::exchange(o.count, 0)) {}
    Art& operator=(Art&& o) noexcept {
        if (this != &o) {
            free_tree(root);
            root = std::exchange(o.root, nullptr);
            count = std::exchange(o.count, 0);
        }
        return *this;
    }

    // Task 1. The value of the key, or nothing.
    std::optional<Value> find(Key key) const;
    // Task 2. Adds the key with its value and returns true, or replaces the
    // value of a key that is already there and returns false.
    bool insert(Key key, Value value);
    // Task 3. Appends the pairs with lo <= key <= hi to out, in increasing
    // order of the keys (nothing if lo > hi).
    void scan(Key lo, Key hi, std::vector<Item>& out) const;

    std::size_t size() const { return count; }
    void validate() const { validate_tree(root, count); }

    Node* root = nullptr;  // nullptr: an empty tree; a Leaf: a tree of one key
    std::size_t count = 0;  // the number of keys
};

// The tree of `sorted` (different keys in increasing order), see bulk_build_nodes.
template <class Search>
Art<Search> bulk_build(std::span<const Item> sorted) {
    return Art<Search>(bulk_build_nodes(sorted), sorted.size());
}

}  // namespace w29
