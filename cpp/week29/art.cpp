// The given parts of the adaptive radix tree: making and freeing nodes,
// bulk_build, validate and shape.
#include "art.hpp"

#include <algorithm>
#include <bit>
#include <stdexcept>
#include <string>

namespace w29 {

Leaf* new_leaf(Key key, Value value) { return new Leaf{{Kind::leaf}, key, value}; }

Inner* new_inner(Kind kind, unsigned depth, Key prefix) {
    Inner* n = nullptr;
    switch (kind) {
        case Kind::node4: n = new Node4{}; break;
        case Kind::node16: n = new Node16{}; break;
        case Kind::node48: {
            auto* m = new Node48{};
            std::fill(std::begin(m->index), std::end(m->index), no_child);
            n = m;
            break;
        }
        case Kind::node256: n = new Node256{}; break;
        case Kind::leaf: throw std::logic_error("new_inner: a leaf is not an inner node");
    }
    n->kind = kind;
    n->depth = static_cast<std::uint8_t>(depth);
    n->count = 0;
    n->prefix = prefix;
    return n;
}

void append_child(Inner* n, std::uint8_t byte, Node* child) {
    switch (n->kind) {
        case Kind::node4: {
            auto* m = static_cast<Node4*>(n);
            m->keys[m->count] = byte;
            m->children[m->count] = child;
            break;
        }
        case Kind::node16: {
            auto* m = static_cast<Node16*>(n);
            m->keys[m->count] = byte;
            m->children[m->count] = child;
            break;
        }
        case Kind::node48: {
            auto* m = static_cast<Node48*>(n);
            m->index[byte] = static_cast<std::uint8_t>(m->count);
            m->children[m->count] = child;
            break;
        }
        case Kind::node256: static_cast<Node256*>(n)->children[byte] = child; break;
        case Kind::leaf: throw std::logic_error("append_child: a leaf has no children");
    }
    ++n->count;
}

void free_node(Node* n) {
    if (n == nullptr) return;
    switch (n->kind) {
        case Kind::leaf: delete static_cast<Leaf*>(n); break;
        case Kind::node4: delete static_cast<Node4*>(n); break;
        case Kind::node16: delete static_cast<Node16*>(n); break;
        case Kind::node48: delete static_cast<Node48*>(n); break;
        case Kind::node256: delete static_cast<Node256*>(n); break;
    }
}

namespace {

// Calls f(byte, child) for every child of n, in increasing order of the bytes.
template <class F>
void for_each_child(const Inner* n, F&& f) {
    switch (n->kind) {
        case Kind::node4: {
            auto* m = static_cast<const Node4*>(n);
            for (unsigned i = 0; i < m->count; ++i) f(m->keys[i], m->children[i]);
            break;
        }
        case Kind::node16: {
            auto* m = static_cast<const Node16*>(n);
            for (unsigned i = 0; i < m->count; ++i) f(m->keys[i], m->children[i]);
            break;
        }
        case Kind::node48: {
            auto* m = static_cast<const Node48*>(n);
            for (unsigned b = 0; b < 256; ++b)
                if (m->index[b] != no_child) f(static_cast<std::uint8_t>(b), m->children[m->index[b]]);
            break;
        }
        case Kind::node256: {
            auto* m = static_cast<const Node256*>(n);
            for (unsigned b = 0; b < 256; ++b)
                if (m->children[b] != nullptr) f(static_cast<std::uint8_t>(b), m->children[b]);
            break;
        }
        case Kind::leaf: break;
    }
}

Kind kind_for(std::size_t children) {
    return children <= 4 ? Kind::node4 : children <= 16 ? Kind::node16 : children <= 48 ? Kind::node48 : Kind::node256;
}

Node* build(std::span<const Item> s) {
    if (s.size() == 1) return new_leaf(s[0].key, s[0].value);
    // The keys are increasing, so all of them have the bytes that the first
    // and the last key have in common: the node branches on the next byte.
    const auto depth = static_cast<unsigned>(std::countl_zero(s.front().key ^ s.back().key)) / 8;
    std::size_t runs = 1;  // the different values of the byte
    for (std::size_t i = 1; i < s.size(); ++i) runs += key_byte(s[i].key, depth) != key_byte(s[i - 1].key, depth);
    Inner* n = new_inner(kind_for(runs), depth, s.front().key & prefix_mask(depth));
    for (std::size_t begin = 0; begin < s.size();) {
        const std::uint8_t b = key_byte(s[begin].key, depth);
        std::size_t end = begin + 1;
        while (end < s.size() && key_byte(s[end].key, depth) == b) ++end;
        append_child(n, b, build(s.subspan(begin, end - begin)));
        begin = end;
    }
    return n;
}

[[noreturn]] void broken(const std::string& what) { throw std::logic_error("validate: " + what); }

// Checks the node n, which is the child of byte `byte` of a node with the
// given depth and prefix (depth -1 for the root). Returns its leaves.
std::size_t check(const Node* n, int parent_depth, Key parent_prefix, std::uint8_t byte) {
    if (n == nullptr) broken("a child is nullptr");
    // The first parent_depth + 1 bytes of every key below n.
    const unsigned known = static_cast<unsigned>(parent_depth + 1);
    const Key path = parent_depth < 0 ? 0 : parent_prefix | Key{byte} << (56 - 8 * parent_depth);
    if (n->kind == Kind::leaf) {
        const auto* l = static_cast<const Leaf*>(n);
        if ((l->key & prefix_mask(known)) != path) broken("the leaf of key " + std::to_string(l->key) + " is not where its key belongs");
        return 1;
    }
    if (n->kind > Kind::node256) broken("a node has an unknown kind");
    const auto* in = static_cast<const Inner*>(n);
    const std::string where = "the node at depth " + std::to_string(in->depth) + " with prefix " + std::to_string(in->prefix);
    if (in->depth >= key_bytes || static_cast<int>(in->depth) <= parent_depth) broken(where + " has a wrong depth");
    if ((in->prefix & ~prefix_mask(in->depth)) != 0) broken(where + ": its prefix has bits after the first depth bytes");
    if ((in->prefix & prefix_mask(known)) != path) broken(where + ": its prefix is not the path from the root to it");
    const unsigned capacity = in->kind == Kind::node4 ? 4 : in->kind == Kind::node16 ? 16 : in->kind == Kind::node48 ? 48 : 256;
    if (in->count > capacity) broken(where + ": count is larger than the room for children");
    if (in->kind == Kind::node48) {  // before the children are read through the index
        const auto* m = static_cast<const Node48*>(in);
        std::vector<bool> used(48);
        for (unsigned b = 0; b < 256; ++b) {
            if (m->index[b] == no_child) continue;
            if (m->index[b] >= m->count || used[m->index[b]]) broken(where + ": its index is wrong");
            used[m->index[b]] = true;
        }
    }
    std::size_t children = 0, leaves = 0;
    int last = -1;
    for_each_child(in, [&](std::uint8_t b, const Node* child) {
        if (static_cast<int>(b) <= last) broken(where + ": the bytes of its children are not increasing");
        last = b;
        ++children;
        leaves += check(child, in->depth, in->prefix, b);
    });
    if (children != in->count) broken(where + ": count is not the number of children");
    if (children < 2) broken(where + " has fewer than 2 children");
    if (in->kind != kind_for(children)) broken(where + " has " + std::to_string(children) + " children, so it should be a " +
                                                   (children <= 4 ? "Node4" : children <= 16 ? "Node16" : children <= 48 ? "Node48" : "Node256"));
    return leaves;
}

void shape_of(const Node* n, std::vector<std::uint64_t>& out) {
    if (n->kind == Kind::leaf) {
        const auto* l = static_cast<const Leaf*>(n);
        out.insert(out.end(), {0, l->key, l->value});
        return;
    }
    const auto* in = static_cast<const Inner*>(n);
    out.insert(out.end(), {static_cast<std::uint64_t>(in->kind), in->depth, in->prefix, in->count});
    for_each_child(in, [&](std::uint8_t b, const Node* child) {
        out.push_back(b);
        shape_of(child, out);
    });
}

void stats_of(const Node* n, std::size_t depth, Stats& s) {
    switch (n->kind) {
        case Kind::leaf: ++s.leaves; s.bytes += sizeof(Leaf); return;
        case Kind::node4: ++s.node4; s.bytes += sizeof(Node4); break;
        case Kind::node16: ++s.node16; s.bytes += sizeof(Node16); break;
        case Kind::node48: ++s.node48; s.bytes += sizeof(Node48); break;
        case Kind::node256: ++s.node256; s.bytes += sizeof(Node256); break;
    }
    s.max_depth = std::max(s.max_depth, depth + 1);
    for_each_child(static_cast<const Inner*>(n), [&](std::uint8_t, const Node* child) { stats_of(child, depth + 1, s); });
}

}  // namespace

void free_tree(Node* n) {
    if (n == nullptr) return;
    if (n->kind != Kind::leaf) for_each_child(static_cast<Inner*>(n), [](std::uint8_t, Node* child) { free_tree(child); });
    free_node(n);
}

Node* bulk_build_nodes(std::span<const Item> sorted) {
    for (std::size_t i = 1; i < sorted.size(); ++i)
        if (sorted[i - 1].key >= sorted[i].key) throw std::invalid_argument("bulk_build: the keys are not different and increasing");
    return sorted.empty() ? nullptr : build(sorted);
}

void validate_tree(const Node* root, std::size_t count) {
    if (root == nullptr) {
        if (count != 0) broken("the tree is empty but count is " + std::to_string(count));
        return;
    }
    if (check(root, -1, 0, 0) != count) broken("count is not the number of leaves");
}

std::vector<std::uint64_t> shape(const Node* root) {
    std::vector<std::uint64_t> out;
    if (root != nullptr) shape_of(root, out);
    return out;
}

Stats stats(const Node* root) {
    Stats s;
    if (root != nullptr) stats_of(root, 0, s);
    return s;
}

}  // namespace w29
