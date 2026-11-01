#include "bplus.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>

#include "tasks.hpp"

namespace w26 {

NodeSearch node_search = baseline::node_lower_bound;

BPlusTree::BPlusTree() { root = new_leaf(); }

PageId BPlusTree::new_leaf() {
    PageId page;
    if (!free_leaves.empty()) {
        page = free_leaves.back();
        free_leaves.pop_back();
    } else {
        page = static_cast<PageId>(leaves.size());
        leaves.emplace_back();
    }
    Leaf& leaf = leaves[page];
    leaf.count = 0;
    leaf.prev = leaf.next = no_page;
    return page;
}

PageId BPlusTree::new_inner() {
    PageId page;
    if (!free_inners.empty()) {
        page = free_inners.back();
        free_inners.pop_back();
    } else {
        page = static_cast<PageId>(inners.size());
        inners.emplace_back();
    }
    inners[page].count = 0;
    return page;
}

namespace {

[[noreturn]] void broken(const std::string& what) { throw std::logic_error("BPlusTree::validate: " + what); }

struct Checker {
    const BPlusTree& tree;
    std::vector<PageId> leaf_order;
    std::vector<char> leaf_seen, inner_seen;
    std::size_t keys = 0;

    // Checks the subtree of `page` at `depth` (the root is at depth 1): all its
    // keys must be > low (if has_low) and <= high (if has_high).
    void check(PageId page, int depth, bool has_low, Key low, bool has_high, Key high) {
        const bool is_root = depth == 1;
        auto in_range = [&](Key k) { return (!has_low || k > low) && (!has_high || k <= high); };
        if (depth == tree.height) {
            if (page >= tree.leaves.size()) broken("a leaf id " + std::to_string(page) + " is out of range");
            if (leaf_seen[page]++) broken("leaf " + std::to_string(page) + " is in the tree twice");
            const Leaf& leaf = tree.leaves[page];
            if (leaf.count > leaf_capacity) broken("leaf " + std::to_string(page) + " has more than 64 keys");
            if (!is_root && leaf.count < min_keys) broken("leaf " + std::to_string(page) + " has fewer than 32 keys");
            for (std::size_t i = 0; i < leaf.count; ++i) {
                if (i > 0 && leaf.keys[i - 1] >= leaf.keys[i]) broken("the keys of leaf " + std::to_string(page) + " are not increasing");
                if (!in_range(leaf.keys[i])) broken("leaf " + std::to_string(page) + " has a key outside the range of its parent's keys");
            }
            keys += leaf.count;
            leaf_order.push_back(page);
            return;
        }
        if (page >= tree.inners.size()) broken("an inner node id " + std::to_string(page) + " is out of range");
        if (inner_seen[page]++) broken("inner node " + std::to_string(page) + " is in the tree twice");
        const Inner& node = tree.inners[page];
        if (node.count > inner_capacity) broken("inner node " + std::to_string(page) + " has more than 64 keys");
        if (node.count < (is_root ? 1 : min_keys)) broken("inner node " + std::to_string(page) + (is_root ? " (the root) has no keys" : " has fewer than 32 keys"));
        for (std::size_t i = 0; i < node.count; ++i) {
            if (i > 0 && node.keys[i - 1] >= node.keys[i]) broken("the keys of inner node " + std::to_string(page) + " are not increasing");
            if (has_low && node.keys[i] <= low) broken("inner node " + std::to_string(page) + " has a key outside its range");
        }
        for (std::size_t i = 0; i <= node.count; ++i) {
            const bool lo = i > 0 || has_low, hi = i < node.count || has_high;
            check(node.children[i], depth + 1, lo, i > 0 ? node.keys[i - 1] : low, hi, i < node.count ? node.keys[i] : high);
        }
    }
};

}  // namespace

void BPlusTree::validate() const {
    if (height < 1) broken("the height must be at least 1");
    Checker c{*this, {}, std::vector<char>(leaves.size(), 0), std::vector<char>(inners.size(), 0)};
    c.check(root, 1, false, 0, false, 0);
    if (c.keys != count) broken("size() is " + std::to_string(count) + ", but the leaves have " + std::to_string(c.keys) + " keys");
    for (std::size_t i = 0; i < c.leaf_order.size(); ++i) {
        const Leaf& leaf = leaves[c.leaf_order[i]];
        const PageId prev = i > 0 ? c.leaf_order[i - 1] : no_page, next = i + 1 < c.leaf_order.size() ? c.leaf_order[i + 1] : no_page;
        if (leaf.prev != prev || leaf.next != next) broken("the links of leaf " + std::to_string(c.leaf_order[i]) + " are wrong");
    }
    for (PageId page : free_leaves)
        if (page >= leaves.size() || c.leaf_seen[page]) broken("free leaf " + std::to_string(page) + " is in use or out of range");
    for (PageId page : free_inners)
        if (page >= inners.size() || c.inner_seen[page]) broken("free inner node " + std::to_string(page) + " is in use or out of range");
}

namespace {

// How many children (or keys, for leaves) each node of a level gets: full
// nodes from the left, and the last two share if the last would be too small.
std::vector<std::size_t> split_level(std::size_t total, std::size_t full, std::size_t minimum) {
    std::vector<std::size_t> sizes;
    for (std::size_t left = total; left > 0; left -= std::min(left, full)) sizes.push_back(std::min(left, full));
    if (sizes.size() >= 2 && sizes.back() < minimum) {
        const std::size_t both = sizes[sizes.size() - 2] + sizes.back();
        sizes[sizes.size() - 2] = (both + 1) / 2;
        sizes.back() = both / 2;
    }
    return sizes;
}

}  // namespace

BPlusTree bulk_load(std::span<const std::pair<Key, Value>> sorted) {
    BPlusTree t;
    if (sorted.empty()) return t;
    const auto per_leaf = split_level(sorted.size(), leaf_capacity, min_keys);
    t.leaves.resize(per_leaf.size());  // nothing is written yet (NoInit)
    std::vector<Key> largest(per_leaf.size());  // the largest key under each node of the level
    std::size_t next = 0;
    for (std::size_t l = 0; l < per_leaf.size(); ++l) {
        Leaf& leaf = t.leaves[l];
        leaf.count = static_cast<std::uint32_t>(per_leaf[l]);
        for (std::size_t i = 0; i < per_leaf[l]; ++i, ++next) {
            leaf.keys[i] = sorted[next].first;
            leaf.values[i] = sorted[next].second;
        }
        leaf.prev = l > 0 ? static_cast<PageId>(l - 1) : no_page;
        leaf.next = l + 1 < per_leaf.size() ? static_cast<PageId>(l + 1) : no_page;
        largest[l] = leaf.keys[leaf.count - 1];
    }
    t.count = sorted.size();
    t.root = 0;
    t.height = 1;
    PageId first = 0;  // the first page of the level below
    std::size_t below = per_leaf.size();
    while (below > 1) {
        const auto per_node = split_level(below, inner_capacity + 1, min_keys + 1);
        const auto start = static_cast<PageId>(t.inners.size());
        t.inners.resize(t.inners.size() + per_node.size());
        std::vector<Key> upper(per_node.size());
        std::size_t child = 0;
        for (std::size_t u = 0; u < per_node.size(); ++u) {
            Inner& node = t.inners[start + u];
            node.count = static_cast<std::uint32_t>(per_node[u] - 1);
            for (std::size_t i = 0; i < per_node[u]; ++i, ++child) {
                node.children[i] = static_cast<PageId>(first + child);
                if (i + 1 < per_node[u]) node.keys[i] = largest[child];
            }
            upper[u] = largest[child - 1];
        }
        largest = std::move(upper);
        first = start;
        below = per_node.size();
        t.root = start;
        ++t.height;
    }
    return t;
}

}  // namespace w26
