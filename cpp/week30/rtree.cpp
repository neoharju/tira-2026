// The given parts of the R-tree: validate, tree_hash and min_dist2.
#include "rtree.hpp"

#include <algorithm>
#include <bit>
#include <stdexcept>
#include <string>

namespace w30 {

double min_dist2(const Rect& b, Point p) {
    const double dx = std::max({double{b.min_x} - p.x, 0.0, double{p.x} - b.max_x});
    const double dy = std::max({double{b.min_y} - p.y, 0.0, double{p.y} - b.max_y});
    return dx * dx + dy * dy;
}

namespace {

[[noreturn]] void broken(const std::string& what) { throw std::logic_error("validate: " + what); }

Rect slot_box(const Node& n, unsigned i) { return {n.min_x[i], n.min_y[i], n.max_x[i], n.max_y[i]}; }

Rect union_of(const Node& n) {
    Rect u{inf, inf, -inf, -inf};
    for (unsigned i = 0; i < n.count; ++i) {
        u.min_x = std::min(u.min_x, n.min_x[i]);
        u.min_y = std::min(u.min_y, n.min_y[i]);
        u.max_x = std::max(u.max_x, n.max_x[i]);
        u.max_y = std::max(u.max_y, n.max_y[i]);
    }
    return u;
}

bool same(const Rect& a, const Rect& b) { return a.min_x == b.min_x && a.min_y == b.min_y && a.max_x == b.max_x && a.max_y == b.max_y; }

}  // namespace

void validate(const RTree& t, std::span<const Point> points) {
    if (points.empty()) {
        if (t.height != 0 || !t.nodes.empty()) broken("the tree of no points is not empty");
        return;
    }
    if (t.height < 1 || t.nodes.empty() || t.root != t.nodes.size() - 1) broken("the root is not the last node, or the height is wrong");
    std::vector<int> seen(points.size(), 0);
    std::size_t entries = points.size();  // the entries of the level being checked
    std::size_t first = 0;                // its first node
    for (int level = 0; level < t.height; ++level) {
        const std::size_t count = level + 1 == t.height ? 1 : (entries + fanout - 1) / fanout;
        if (level + 1 == t.height && entries > fanout) broken("the root has too many entries below it");
        if (first + count > t.nodes.size()) broken("there are too few nodes");
        std::size_t slots = 0;
        for (std::size_t j = first; j < first + count; ++j) {
            const Node& n = t.nodes[j];
            const std::string where = "node " + std::to_string(j);
            if (n.level != level) broken(where + " has level " + std::to_string(n.level) + ", not " + std::to_string(level));
            if (n.count < 1 || n.count > fanout) broken(where + " has a wrong count");
            slots += n.count;
            for (unsigned i = n.count; i < fanout; ++i)
                if (n.min_x[i] != inf || n.min_y[i] != inf || n.max_x[i] != -inf || n.max_y[i] != -inf) broken(where + ": an unused slot does not have the empty box");
            for (unsigned i = 0; i < n.count; ++i) {
                const std::uint32_t c = n.child[i];
                if (level == 0) {
                    if (c >= points.size() || seen[c]++) broken(where + ": the point " + std::to_string(c) + " is not in exactly one leaf");
                    const Rect want{points[c].x, points[c].y, points[c].x, points[c].y};
                    if (!same(slot_box(n, i), want)) broken(where + ": the box of point " + std::to_string(c) + " is not the point");
                } else {
                    if (c < first - entries || c >= first || t.nodes[c].level != level - 1) broken(where + ": a child is not a node of the level below");
                    if (!same(slot_box(n, i), union_of(t.nodes[c]))) broken(where + ": the box of child " + std::to_string(c) + " is not the union of its slots");
                }
            }
        }
        if (slots != entries) broken("level " + std::to_string(level) + " does not have every entry of the level below exactly once");
        first += count;
        entries = count;
    }
    if (first != t.nodes.size()) broken("there are more nodes than the levels need");
}

RTree pack(std::span<const Point> points, std::span<const std::uint32_t> order) {
    RTree t;
    if (points.empty()) return t;
    std::vector<Entry> entries;
    for (std::uint32_t id : order) entries.push_back({{points[id].x, points[id].y, points[id].x, points[id].y}, id});
    for (std::uint16_t level = 0;; ++level) {
        std::vector<Entry> next;
        for (std::size_t run = 0; run < entries.size(); run += fanout) {
            Node n;
            for (unsigned i = 0; i < fanout; ++i) {
                const bool used = run + i < entries.size();
                const Rect b = used ? entries[run + i].box : Rect{inf, inf, -inf, -inf};
                n.min_x[i] = b.min_x;
                n.min_y[i] = b.min_y;
                n.max_x[i] = b.max_x;
                n.max_y[i] = b.max_y;
                n.child[i] = used ? entries[run + i].id : 0;
            }
            n.count = static_cast<std::uint16_t>(std::min<std::size_t>(fanout, entries.size() - run));
            n.level = level;
            next.push_back({union_of(n), static_cast<std::uint32_t>(t.nodes.size())});
            t.nodes.push_back(n);
        }
        if (next.size() == 1) {
            t.root = next[0].id;
            t.height = level + 1;
            return t;
        }
        entries = std::move(next);
    }
}

std::vector<std::uint32_t> hilbert_order(std::span<const Point> points) {
    std::vector<std::pair<std::uint64_t, std::uint32_t>> keyed(points.size());
    for (std::size_t i = 0; i < points.size(); ++i)
        keyed[i] = {baseline::hilbert_encode(static_cast<std::uint32_t>(points[i].x), static_cast<std::uint32_t>(points[i].y)), static_cast<std::uint32_t>(i)};
    std::ranges::sort(keyed);
    std::vector<std::uint32_t> order;
    for (auto [key, id] : keyed) order.push_back(id);
    return order;
}

std::size_t nodes_read(const RTree& t, const Rect& q) {
    if (t.height == 0) return 0;
    std::size_t read = 0;
    std::vector<std::uint32_t> stack = {t.root};
    while (!stack.empty()) {
        const Node& n = t.nodes[stack.back()];
        stack.pop_back();
        ++read;
        if (n.level == 0) continue;
        for (unsigned i = 0; i < n.count; ++i)
            if (n.min_x[i] <= q.max_x && q.min_x <= n.max_x[i] && n.min_y[i] <= q.max_y && q.min_y <= n.max_y[i]) stack.push_back(n.child[i]);
    }
    return read;
}

std::uint64_t tree_hash(const RTree& t) {
    std::uint64_t h = 1469598103934665603ULL;
    auto mix = [&](std::uint64_t v) {
        h ^= v;
        h *= 1099511628211ULL;
        h ^= h >> 29;
    };
    mix(t.root);
    mix(static_cast<std::uint64_t>(t.height));
    for (const Node& n : t.nodes) {
        mix(n.count);
        mix(n.level);
        for (unsigned i = 0; i < fanout; ++i) {
            mix(std::bit_cast<std::uint32_t>(n.min_x[i]));
            mix(std::bit_cast<std::uint32_t>(n.min_y[i]));
            mix(std::bit_cast<std::uint32_t>(n.max_x[i]));
            mix(std::bit_cast<std::uint32_t>(n.max_y[i]));
            mix(i < n.count ? n.child[i] : 0);
        }
    }
    return h;
}

}  // namespace w30
