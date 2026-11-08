// The given parts of the concurrent B+ tree: nodes, the helpers, the plain
// and the coarse operations, and validate.
#include "btree.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string>

namespace w32 {

ConcurrentTree::ConcurrentTree(int cap) : capacity(cap) {
    if (cap < 3 || cap > max_capacity) throw std::invalid_argument("the capacity of a node must be 3 ... 64");
    root = new_node(0);
}

ConcurrentTree::~ConcurrentTree() = default;  // nodes_ owns and frees every node

Node* ConcurrentTree::new_node(int level) {
    auto n = std::make_unique<Node>();
    n->level = level;
    Node* p = n.get();
    std::scoped_lock lock(nodes_mutex_);
    nodes_.push_back(std::move(n));
    return p;
}

int ConcurrentTree::child_index(const Node* n, Key key) { return static_cast<int>(std::lower_bound(n->keys, n->keys + n->count, key) - n->keys); }
int ConcurrentTree::leaf_index(const Node* n, Key key) { return static_cast<int>(std::lower_bound(n->keys, n->keys + n->count, key) - n->keys); }

void ConcurrentTree::leaf_put(Node* leaf, int i, Key key, Value value) {
    std::move_backward(leaf->keys + i, leaf->keys + leaf->count, leaf->keys + leaf->count + 1);
    std::move_backward(leaf->values + i, leaf->values + leaf->count, leaf->values + leaf->count + 1);
    leaf->keys[i] = key;
    leaf->values[i] = value;
    ++leaf->count;
}

void ConcurrentTree::inner_put(Node* n, int i, Key separator, Node* right) {
    std::move_backward(n->keys + i, n->keys + n->count, n->keys + n->count + 1);
    std::move_backward(n->children + i + 1, n->children + n->count + 1, n->children + n->count + 2);
    n->keys[i] = separator;
    n->children[i + 1] = right;
    ++n->count;
}

std::pair<Key, Node*> ConcurrentTree::split(Node* n) {
    Node* r = new_node(n->level);
    if (n->level == 0) {
        const int keep = (n->count + 1) / 2;
        r->count = n->count - keep;
        std::copy(n->keys + keep, n->keys + n->count, r->keys);
        std::copy(n->values + keep, n->values + n->count, r->values);
        n->count = keep;
        r->next = n->next;
        n->next = r;
        return {n->keys[keep - 1], r};
    }
    const int m = n->count / 2;  // keys[m] moves up
    r->count = n->count - m - 1;
    std::copy(n->keys + m + 1, n->keys + n->count, r->keys);
    std::copy(n->children + m + 1, n->children + n->count + 1, r->children);
    n->count = m;
    return {n->keys[m], r};
}

bool ConcurrentTree::insert_into_path(std::span<Node* const> path, Key key, Value value) {
    Node* leaf = path.back();
    const int i = leaf_index(leaf, key);
    if (i < leaf->count && leaf->keys[i] == key) {
        leaf->values[i] = value;
        return false;
    }
    if (leaf->count < capacity) {
        leaf_put(leaf, i, key, value);
        return true;
    }
    auto [sep, right] = split(leaf);
    Node* half = key <= sep ? leaf : right;
    leaf_put(half, leaf_index(half, key), key, value);
    for (std::size_t d = path.size() - 1; d-- > 0;) {  // up the path: a separator and a new child for each parent
        Node* parent = path[d];
        if (parent->count < capacity) {
            inner_put(parent, child_index(parent, sep), sep, right);
            return true;
        }
        auto [psep, pright] = split(parent);
        Node* p = sep < psep ? parent : pright;
        inner_put(p, child_index(p, sep), sep, right);
        sep = psep;
        right = pright;
    }
    if (path[0] != root) throw std::logic_error("insert_into_path: the first node of the path split, but it is not the root");
    Node* r = new_node(path[0]->level + 1);  // the tree grows at the top
    r->count = 1;
    r->keys[0] = sep;
    r->children[0] = path[0];
    r->children[1] = right;
    root = r;
    return true;
}

std::optional<Value> ConcurrentTree::find_plain(Key key) const {
    const Node* n = root;
    while (n->level > 0) n = n->children[child_index(n, key)];
    const int i = leaf_index(n, key);
    if (i < n->count && n->keys[i] == key) return n->values[i];
    return std::nullopt;
}

bool ConcurrentTree::insert_plain(Key key, Value value) {
    Node* path[max_height];
    int depth = 0;
    for (Node* n = root;; n = n->children[child_index(n, key)]) {
        path[depth++] = n;
        if (n->level == 0) break;
    }
    return insert_into_path(std::span(path, static_cast<std::size_t>(depth)), key, value);
}

bool ConcurrentTree::insert_coarse(Key key, Value value) {
    std::unique_lock top(root_latch);
    Node* path[max_height];
    int depth = 0;
    for (Node* n = root;; n = n->children[child_index(n, key)]) {
        n->latch.lock();
        path[depth++] = n;
        if (n->level == 0) break;
    }
    const bool added = insert_into_path(std::span(path, static_cast<std::size_t>(depth)), key, value);
    for (int d = depth; d-- > 0;) path[d]->latch.unlock();
    return added;
}

namespace {

[[noreturn]] void broken(const std::string& what) { throw std::logic_error("validate: " + what); }

// Checks the subtree of n: its keys are in (lo, hi], its levels and counts;
// appends its leaves in order.
void check(const Node* n, int capacity, Key lo, Key hi, bool has_lo, std::vector<const Node*>& leaves) {
    if (n->count < 0 || n->count > capacity) broken("a node has " + std::to_string(n->count) + " keys");
    for (int i = 0; i < n->count; ++i) {
        if (i > 0 && !(n->keys[i - 1] < n->keys[i])) broken("the keys of a node are not increasing");
        if ((has_lo && !(n->keys[i] > lo)) || n->keys[i] > hi) broken("a key is outside the range of its node");
    }
    if (n->level == 0) {
        leaves.push_back(n);
        return;
    }
    if (n->count < 1) broken("an inner node has no keys");
    for (int i = 0; i <= n->count; ++i) {
        const Node* c = n->children[i];
        if (c == nullptr || c->level != n->level - 1) broken("a child is missing or has a wrong level");
        check(c, capacity, i == 0 ? lo : n->keys[i - 1], i == n->count ? hi : n->keys[i], i == 0 ? has_lo : true, leaves);
    }
}

}  // namespace

void ConcurrentTree::validate() const {
    std::vector<const Node*> leaves;
    check(root, capacity, 0, std::numeric_limits<Key>::max(), false, leaves);
    for (std::size_t i = 0; i < leaves.size(); ++i)
        if (leaves[i]->next != (i + 1 < leaves.size() ? leaves[i + 1] : nullptr)) broken("the leaf links are not the leaves in order");
}

std::size_t ConcurrentTree::size() const {
    const Node* n = root;
    while (n->level > 0) n = n->children[0];
    std::size_t count = 0;
    for (; n; n = n->next) count += static_cast<std::size_t>(n->count);
    return count;
}

namespace baseline {

std::optional<Value> LockedTree::find(Key key) {
    std::shared_lock lock(mutex_);
    return tree_.find_plain(key);
}

bool LockedTree::insert(Key key, Value value) {
    std::unique_lock lock(mutex_);
    return tree_.insert_plain(key, value);
}

}  // namespace baseline
}  // namespace w32
