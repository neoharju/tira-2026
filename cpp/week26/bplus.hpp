// Week 26: the pages of a B+ tree, the given parts of the tree (the empty tree,
// page allocation, validate and the one-thread bulk load) and the node search
// that the tree uses. You write find, insert, scan and erase (tasks 1-4).
#pragma once
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <span>
#include <utility>
#include <vector>

namespace w26 {

using Key = std::uint64_t;
using Value = std::uint64_t;
using PageId = std::uint32_t;  // the number of a page in leaves or inners

inline constexpr PageId no_page = std::numeric_limits<PageId>::max();
inline constexpr std::size_t leaf_capacity = 64;   // keys in a leaf
inline constexpr std::size_t inner_capacity = 64;  // keys in an inner node (it has one child more)
// Every page except the root has at least half of its capacity: 32 keys.
inline constexpr std::size_t min_keys = 32;

// A leaf: `count` keys in increasing order and their values, and the links to
// the leaves on the left and on the right (no_page at the ends). Only the
// first `count` keys and values mean something.
struct alignas(64) Leaf {
    std::uint32_t count;
    PageId prev, next;
    alignas(64) Key keys[leaf_capacity];
    Value values[leaf_capacity];
};

// An inner node: `count` keys in increasing order and count + 1 children.
// Every key under children[i] is <= keys[i], and every key under
// children[i + 1] is > keys[i]. So the child to follow for a key x is the
// number of keys < x.
struct alignas(64) Inner {
    std::uint32_t count;
    alignas(64) Key keys[inner_capacity];
    PageId children[inner_capacity + 1];
};

// The allocator of the pages: a new page is not filled with zeros (Leaf and
// Inner have no constructors), so resize() only reserves memory, and every
// page is first written ("first touch", week 25) by the code that fills it.
template <class T>
struct NoInit : std::allocator<T> {
    using std::allocator<T>::allocator;
    template <class U>
    void construct(U* p) noexcept {
        ::new (static_cast<void*>(p)) U;  // default-initialized: nothing is written
    }
    template <class U, class... Args>
    void construct(U* p, Args&&... args) {
        ::new (static_cast<void*>(p)) U(std::forward<Args>(args)...);
    }
};

// The number of keys < x among keys[0 ... count - 1] (which are increasing):
// the place of x in a node. The tree searches every node with this function;
// it is the scalar baseline at first, and the benchmark of tasks 6 and 7 points
// it to your SIMD versions.
using NodeSearch = std::size_t (*)(const Key* keys, std::size_t count, Key x);
extern NodeSearch node_search;

// A B+ tree in pages. All leaves are at the same depth: with height 1 the
// root is a leaf, otherwise the root is an inner node and the children of the
// inner nodes at depth height - 1 are leaves. A page is a place in `leaves` or
// `inners`, and its PageId stays the same while the vectors grow; a reference
// to a page does NOT (new_leaf and new_inner may move all pages).
class BPlusTree {
public:
    BPlusTree();  // an empty tree: one empty leaf, the root

    // Task 1. The value of the key, or nothing.
    std::optional<Value> find(Key key) const;
    // Task 2. Adds the key with its value and returns true, or replaces the
    // value of a key that is already there and returns false. A full page
    // (64 keys) splits into two of 33 and 32 keys.
    bool insert(Key key, Value value);
    // Task 3. Appends the pairs with lo <= key <= hi to `out`, in increasing order.
    void scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out) const;
    // Task 4. Removes the key and returns true, or returns false if it is not
    // there. A page with fewer than 32 keys borrows a key from a sibling or
    // merges with it.
    bool erase(Key key);

    std::size_t size() const { return count; }

    // Checks every rule of the tree: the order of the keys, the keys of the
    // inner nodes, the fill of the pages, the depth of the leaves, the leaf
    // links and the size. Throws std::logic_error with a message if one is broken.
    void validate() const;

    // The pages and the state of the tree, open for your code.
    std::vector<Leaf, NoInit<Leaf>> leaves;
    std::vector<Inner, NoInit<Inner>> inners;
    std::vector<PageId> free_leaves, free_inners;  // pages given back, for reuse
    PageId root = 0;
    int height = 1;
    std::size_t count = 0;  // the number of keys

    PageId new_leaf();  // a free page, or a new one at the end; count 0, no links (the rest is not set)
    PageId new_inner();
    void free_leaf(PageId page) { free_leaves.push_back(page); }
    void free_inner(PageId page) { free_inners.push_back(page); }
};

// Builds a tree from pairs sorted by key, without equal keys, in one pass:
// leaves full of 64 keys from the left, but if the last leaf would get fewer
// than 32 keys, the last two leaves share their keys (the left one gets the
// larger half). The levels above are made in the same way, with 65 children per
// node, until one node remains: the root. The pages are numbered from the left
// on each level, and the inner levels from the bottom up.
BPlusTree bulk_load(std::span<const std::pair<Key, Value>> sorted);

}  // namespace w26
