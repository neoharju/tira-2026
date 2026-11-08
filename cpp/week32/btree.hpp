// Week 32: a B+ tree that many threads use at the same time, with a latch in
// every node (tasks 1-3). The given parts are in btree.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <span>
#include <utility>
#include <vector>

namespace w32 {

using Key = std::uint64_t;
using Value = std::uint64_t;

inline constexpr int max_capacity = 64;
inline constexpr int max_height = 40;  // enough for capacity 3 and 2^30 keys

// A node. A leaf (level 0) has `count` keys in increasing order and their
// values, and a link to the leaf on its right. An inner node (level > 0) has
// `count` keys and count + 1 children: every key under children[i] is <=
// keys[i], and every key under children[i + 1] is > keys[i] (as in week 26).
// The latch protects every field of the node: hold it shared to read the
// node, and exclusive to change it.
struct Node {
    std::shared_mutex latch;
    int level = 0;
    int count = 0;
    Key keys[max_capacity];
    Value values[max_capacity];        // in a leaf
    Node* children[max_capacity + 1];  // in an inner node
    Node* next = nullptr;              // in a leaf: the leaf on the right
};

// A B+ tree for many threads. Nodes are never freed while the tree lives:
// erase leaves a node with fewer keys, even with none (as PostgreSQL does), so
// a thread never reads a node that another thread has freed.
//
// The latch protocol. A thread always takes latches from the root down, and
// along the leaves only from left to right, so no two threads can wait for
// each other in a cycle: there are no deadlocks.
//  - root_latch protects `root`. Take it before the latch of the root node,
//    and release it as soon as the root node cannot change: a root changes
//    only when the root node splits.
//  - Latch coupling ("crabbing"): latch the child before you release the
//    parent, so that no other thread can change the child in between.
class ConcurrentTree {
public:
    // A tree whose nodes hold at most `capacity` keys (3 ... 64). Small
    // nodes split often, which the tests use.
    explicit ConcurrentTree(int capacity = max_capacity);
    ~ConcurrentTree();
    ConcurrentTree(const ConcurrentTree&) = delete;
    ConcurrentTree& operator=(const ConcurrentTree&) = delete;

    // Task 1. The value of the key, or nothing. Shared latches, coupled from
    // the root down to the leaf.
    std::optional<Value> find(Key key);
    // Task 1. Appends the pairs with lo <= key <= hi to `out`, in increasing
    // order: down to the leaf of lo with shared latches, then right along
    // the leaves, latching the next leaf before releasing the current one.
    void scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out);

    // Task 2. Adds the key with its value and returns true, or replaces the
    // value of a key that is there and returns false. Exclusive latches from
    // the root down; when a child is safe (it has room for one more key, so
    // it will not split), release every latch above it, root_latch too.
    bool insert(Key key, Value value);

    // Task 3. The same, optimistic: shared latches on the inner nodes and an
    // exclusive latch on the leaf only. If the leaf is full, release it and
    // call insert().
    bool insert_optimistic(Key key, Value value);
    // Task 3. Removes the key and returns true, or returns false. Shared
    // latches on the inner nodes, exclusive on the leaf. Nodes never merge.
    bool erase(Key key);

    // Given: an insert that holds exclusive latches on the whole path, and
    // root_latch, until it is done. Correct, but every insert waits for the
    // one before it at the root.
    bool insert_coarse(Key key, Value value);

    // Given, for one thread only (after the other threads have stopped):
    // checks the order of the keys, the keys of the inner nodes, the levels,
    // the counts and the leaf links. Throws std::logic_error if a rule is
    // broken.
    void validate() const;
    std::size_t size() const;  // the number of keys (one thread only)

    // Given: the operations without any latches, for one thread, or for a
    // caller that holds a lock around the whole tree (baseline::LockedTree).
    std::optional<Value> find_plain(Key key) const;
    bool insert_plain(Key key, Value value);

    // Given: puts the key into the leaf path.back() and splits full nodes up
    // the path. `path` goes from a node that does not split (it has room for
    // one more key), or from the root, down to the leaf, and the caller
    // holds the exclusive latches of all of them. If path[0] is the root and
    // it splits, a new root is made, so then the caller must also hold
    // root_latch exclusively. Returns true for a new key, false when it
    // replaced the value of a key that was there (then nothing splits).
    bool insert_into_path(std::span<Node* const> path, Key key, Value value);

    // Given helpers. They change one node, whose latch the caller must hold
    // exclusively.
    // The child of an inner node to follow for a key: the number of keys < key.
    static int child_index(const Node* n, Key key);
    // The place of the key in a leaf: the number of keys < key.
    static int leaf_index(const Node* n, Key key);
    // Puts the key at place i of a leaf that has room, moving larger keys right.
    static void leaf_put(Node* leaf, int i, Key key, Value value);
    // Puts a separator and the child on its right after children[i] of an
    // inner node that has room.
    static void inner_put(Node* inner, int i, Key separator, Node* right);
    // Splits a full node: a new node (unlatched, not yet in the tree) gets
    // the larger half, and the separator for the parent is returned. A leaf
    // keeps the first half of its keys (rounded up), the separator is a copy
    // of its largest key, and the new leaf is linked after it. In an inner
    // node the middle key moves up.
    std::pair<Key, Node*> split(Node* n);
    // A new node with this level, owned by the tree.
    Node* new_node(int level);

    std::shared_mutex root_latch;
    Node* root;
    int capacity;

private:
    std::mutex nodes_mutex_;
    std::vector<std::unique_ptr<Node>> nodes_;
};

namespace baseline {
// The tree behind one reader-writer lock: finds take it shared, inserts and
// erases exclusive. Inside, the tree needs no latches.
class LockedTree {
public:
    explicit LockedTree(int capacity = max_capacity) : tree_(capacity) {}
    std::optional<Value> find(Key key);
    bool insert(Key key, Value value);

private:
    std::shared_mutex mutex_;
    ConcurrentTree tree_;
};
}  // namespace baseline

}  // namespace w32
