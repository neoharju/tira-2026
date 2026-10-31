#include "baseline.hpp"

#include <algorithm>
#include <queue>

namespace w20::baseline {

std::vector<Dist> distances_from(const Graph& g, Node source) {
    std::vector<Dist> dist(g.nodes(), INF);
    StdHeap heap;
    dist[source] = 0;
    heap.push(make_key(0, source));
    while (!heap.empty()) {
        std::uint64_t key = heap.pop();
        Node u = key_node(key);
        if (key_dist(key) != dist[u]) continue;
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
            Dist d = dist[u] + g.weight[e];
            if (d < dist[g.target[e]]) dist[g.target[e]] = d, heap.push(make_key(d, g.target[e]));
        }
    }
    return dist;
}

Dist dijkstra(const Graph& g, Node source, Node target) {
    std::vector<Dist> dist(g.nodes(), INF);
    StdHeap heap;
    dist[source] = 0;
    heap.push(make_key(0, source));
    while (!heap.empty()) {
        std::uint64_t key = heap.pop();
        Node u = key_node(key);
        if (key_dist(key) != dist[u]) continue;
        if (u == target) break;
        for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
            Dist d = dist[u] + g.weight[e];
            if (d < dist[g.target[e]]) dist[g.target[e]] = d, heap.push(make_key(d, g.target[e]));
        }
    }
    return dist[target];
}

namespace {
// The witness search of the starting code (witness.hpp), frozen here: tasks
// 1 and 3 may change that one.
class SimpleWitness {
public:
    explicit SimpleWitness(Node nodes) : dist_(nodes, INF) {}
    void run(const DynGraph& g, Node s, Node avoid, std::span<const std::uint8_t> skip, Dist limit) {
        std::ranges::fill(dist_, INF);
        StdHeap heap;
        dist_[s] = 0;
        heap.push(make_key(0, s));
        while (!heap.empty() && key_dist(heap.top()) <= limit) {
            std::uint64_t key = heap.pop();
            Node u = key_node(key);
            if (key_dist(key) != dist_[u]) continue;
            for (Arc a : g.out[u]) {
                if (a.node == avoid || (!skip.empty() && skip[a.node])) continue;
                Dist d = dist_[u] + a.weight;
                if (d < dist_[a.node]) dist_[a.node] = d, heap.push(make_key(d, a.node));
            }
        }
    }
    Dist dist(Node x) const { return dist_[x]; }

private:
    std::vector<Dist> dist_;
};
}  // namespace

std::vector<Shortcut> shortcuts_for(const DynGraph& g, Node v, std::span<const std::uint8_t> skip) {
    SimpleWitness ws(static_cast<Node>(g.out.size()));
    std::vector<Shortcut> result;
    Dist max_out = 0;
    for (Arc b : g.out[v]) max_out = std::max(max_out, b.weight);
    for (Arc a : g.in[v]) {
        ws.run(g, a.node, v, skip, a.weight + max_out);
        for (Arc b : g.out[v])
            if (b.node != a.node && ws.dist(b.node) > a.weight + b.weight)
                result.push_back({a.node, b.node, a.weight + b.weight, v});
    }
    return result;
}

Hierarchy contract(const Graph& g, std::span<const Node> order) {
    const Node n = g.nodes();
    DynGraph d = make_dyn(g);
    std::vector<std::vector<Arc>> up(n), down(n);
    std::vector<std::uint32_t> rank(n);
    std::uint64_t added = 0;
    for (std::uint32_t i = 0; i < n; ++i) {
        Node v = order[i];
        rank[v] = i;
        up[v] = d.out[v];
        down[v] = d.in[v];
        std::vector<Shortcut> sc = shortcuts_for(d, v, {});
        remove_node(d, v);
        for (const Shortcut& s : sc) added += add_shortcut(d, s);
    }
    return make_hierarchy(up, down, std::move(rank), added);
}

Hierarchy contract_parallel(const Graph& g, std::span<const Node> order) {
    const Node n = g.nodes();
    DynGraph d = make_dyn(g);
    std::vector<std::uint32_t> pos(n), rank(n);
    for (std::uint32_t i = 0; i < n; ++i) pos[order[i]] = i;
    std::vector<std::vector<Arc>> up(n), down(n);
    std::vector<std::uint8_t> in_round(n, 0), done(n, 0);
    std::uint64_t added = 0;
    std::uint32_t next = 0;
    while (next < n) {
        std::vector<Node> round;
        for (Node v : order) {  // in the order of `order`
            if (done[v]) continue;
            bool first = true;
            for (Arc a : d.out[v]) first = first && pos[a.node] > pos[v];
            for (Arc a : d.in[v]) first = first && pos[a.node] > pos[v];
            if (first) round.push_back(v);
        }
        for (Node v : round) in_round[v] = 1;
        std::vector<Shortcut> all;
        for (Node v : round) {
            up[v] = d.out[v];
            down[v] = d.in[v];
            auto sc = shortcuts_for(d, v, in_round);
            all.insert(all.end(), sc.begin(), sc.end());
        }
        for (Node v : round) remove_node(d, v), done[v] = 1, in_round[v] = 0, rank[v] = next++;
        std::ranges::sort(all);
        for (const Shortcut& s : all) added += add_shortcut(d, s);
    }
    return make_hierarchy(up, down, std::move(rank), added);
}

std::vector<Node> node_order(const Graph& g) {
    const Node n = g.nodes();
    DynGraph d = make_dyn(g);
    std::vector<Dist> dist(n, INF);
    std::vector<Node> touched;
    // A witness search that stops after 50 settled nodes: it may miss a
    // witness, which only makes the estimate a bit too high.
    auto shortcuts = [&](Node v) {
        std::vector<Shortcut> result;
        Dist max_out = 0;
        for (Arc b : d.out[v]) max_out = std::max(max_out, b.weight);
        for (Arc a : d.in[v]) {
            for (Node x : touched) dist[x] = INF;
            touched.assign(1, a.node);
            dist[a.node] = 0;
            StdHeap heap;
            heap.push(make_key(0, a.node));
            for (int settled = 0; !heap.empty() && settled < 50 && key_dist(heap.top()) <= a.weight + max_out;) {
                std::uint64_t key = heap.pop();
                Node u = key_node(key);
                if (key_dist(key) != dist[u]) continue;
                ++settled;
                for (Arc e : d.out[u]) {
                    if (e.node == v || dist[u] + e.weight >= dist[e.node]) continue;
                    if (dist[e.node] == INF) touched.push_back(e.node);
                    dist[e.node] = dist[u] + e.weight;
                    heap.push(make_key(dist[e.node], e.node));
                }
            }
            for (Arc b : d.out[v])
                if (b.node != a.node && dist[b.node] > a.weight + b.weight) result.push_back({a.node, b.node, a.weight + b.weight, v});
        }
        return result;
    };
    std::vector<long long> contracted_neighbours(n, 0);
    auto priority = [&](Node v) {
        return static_cast<long long>(shortcuts(v).size()) - static_cast<long long>(d.out[v].size() + d.in[v].size()) +
               contracted_neighbours[v];
    };
    using Item = std::pair<long long, Node>;
    std::priority_queue<Item, std::vector<Item>, std::greater<>> queue;
    for (Node v = 0; v < n; ++v) queue.push({priority(v), v});
    std::vector<std::uint8_t> done(n, 0);
    std::vector<Node> order;
    while (!queue.empty()) {
        auto [p, v] = queue.top();
        queue.pop();
        if (done[v]) continue;
        if (long long now = priority(v); now > p) {  // lazy update
            queue.push({now, v});
            continue;
        }
        done[v] = 1;
        order.push_back(v);
        std::vector<Node> neighbours;
        for (Arc a : d.out[v]) neighbours.push_back(a.node);
        for (Arc a : d.in[v]) neighbours.push_back(a.node);
        auto sc = shortcuts(v);
        remove_node(d, v);
        for (const Shortcut& s : sc) add_shortcut(d, s);
        std::ranges::sort(neighbours);
        neighbours.erase(std::unique(neighbours.begin(), neighbours.end()), neighbours.end());
        for (Node x : neighbours) {
            ++contracted_neighbours[x];
            queue.push({priority(x), x});
        }
    }
    return order;
}

}  // namespace w20::baseline
