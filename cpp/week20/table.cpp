#include "table.hpp"

#include <algorithm>

namespace w20 {

namespace {
// Dijkstra upwards from s without a stopping rule: the search space of s.
std::vector<std::pair<Node, Dist>> search_space(const Graph& up, Node s) {
    std::vector<std::pair<Node, Dist>> space;
    std::vector<Dist> dist(up.nodes(), INF);
    StdHeap heap;
    dist[s] = 0;
    heap.push(make_key(0, s));
    while (!heap.empty()) {
        std::uint64_t key = heap.pop();
        Node u = key_node(key);
        if (key_dist(key) != dist[u]) continue;
        space.push_back({u, dist[u]});
        for (std::uint32_t e = up.offset[u]; e < up.offset[u + 1]; ++e) {
            Dist d = dist[u] + up.weight[e];
            if (d < dist[up.target[e]]) dist[up.target[e]] = d, heap.push(make_key(d, up.target[e]));
        }
    }
    return space;
}
}  // namespace

TableInput table_input(const Hierarchy& h, std::span<const Node> sources, std::span<const Node> targets) {
    TableInput in;
    in.T = static_cast<std::uint32_t>((targets.size() + 7) / 8 * 8);
    std::vector<std::uint32_t> row_of(h.up.nodes(), INF);
    std::vector<std::vector<std::pair<Node, Dist>>> back(targets.size());
    std::uint32_t rows = 0;
    for (std::size_t j = 0; j < targets.size(); ++j) {
        back[j] = search_space(h.down, targets[j]);
        for (auto [k, d] : back[j])
            if (row_of[k] == INF) row_of[k] = rows++;
    }
    in.B.assign(std::size_t{rows} * in.T, BIG);
    for (std::size_t j = 0; j < targets.size(); ++j)
        for (auto [k, d] : back[j]) in.B[std::size_t{row_of[k]} * in.T + j] = d;
    for (Node s : sources) {
        auto& space = in.spaces.emplace_back();
        for (auto [k, d] : search_space(h.up, s))
            if (row_of[k] != INF) space.push_back({row_of[k], d});
    }
    return in;
}

std::vector<Dist> distance_table(const TableInput& in, RowFunction row) {
    std::vector<Dist> D(in.spaces.size() * in.T);
    for (std::size_t i = 0; i < in.spaces.size(); ++i) row(in.spaces[i], in.B.data(), in.T, D.data() + i * in.T);
    for (Dist& d : D)
        if (d >= BIG) d = INF;
    return D;
}

}  // namespace w20
