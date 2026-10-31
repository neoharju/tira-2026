// Speed goals for week 18 (tasks 2 and 3 have none). Run in the release
// build: ./w18_bench [task]
// The goals were calibrated on a 4-core machine with AVX-512.
#include <random>

#include "baseline.hpp"
#include "heap4.hpp"
#include "heap8.hpp"
#include "tira.hpp"
#include "workspace.hpp"

using namespace w18;

namespace {

const EdgeList& edge_list() {
    static const EdgeList el = benchmark_graph();
    return el;
}

const Graph& graph() {
    static const Graph g = baseline::build_csr(edge_list().nodes, edge_list().edges);
    return g;
}

std::vector<Node> sources() {
    Node n = graph().nodes();
    return {0, n / 2 + 517, n - 1, 12345 % n};
}

bool bench_csr() {
    const EdgeList& el = edge_list();
    auto t = tira::compare([&] { tira::keep(baseline::build_csr(el.nodes, el.edges)); },
                           [&] { tira::keep(build_csr(el.nodes, el.edges)); });
    return tira::report("task1 build_csr", t, 2.0);
}

// Dijkstra (your settle_order from task 2) from the benchmark sources with
// the given heap.
template <class Heap>
auto run_with() {
    return [] {
        static Heap heap;
        std::vector<Dist> dist;
        for (Node s : sources()) tira::keep(settle_order(graph(), s, heap, dist));
    };
}

bool bench_heap4() {
    auto t = tira::compare(run_with<StdHeap>(), run_with<Heap4>(), 7);
    return tira::report("task4 Dijkstra with Heap4", t, 1.2);
}

bool bench_heap8_avx512() {
    if (!tira::has_avx512()) {
        std::println("task5: SKIPPED, this CPU has no AVX-512 (measure on the course machine)");
        return false;
    }
    auto t = tira::compare(run_with<StdHeap>(), run_with<Heap8<MinChildAvx512>>(), 7);
    bool ok = tira::report("task5 Dijkstra, AVX-512 Heap8", t, 1.25);
    auto vs4 = tira::compare(run_with<Heap4>(), run_with<Heap8<MinChildAvx512>>(), 7);
    std::println("      compared with your Heap4: {:.2f}x (no goal)", vs4.speedup());
    return ok;
}

bool bench_heap8_avx2() {
    auto t = tira::compare(run_with<StdHeap>(), run_with<Heap8<MinChildAvx2>>(), 7);
    return tira::report("task6 Dijkstra, AVX2 Heap8", t, 1.15);
}

bool bench_distances() {
    auto queries = random_queries(graph().nodes(), 32, 12);
    auto one_thread = [&] {  // your query, one query after another
        Workspace ws(graph().nodes());
        StdHeap heap;
        for (auto [s, d] : queries) tira::keep(query(graph(), s, d, ws, heap));
    };
    auto t = tira::compare(one_thread, [&] { tira::keep(distances(graph(), queries)); }, 5);
    return tira::report("task7 parallel queries", t, 2.5);
}

bool bench_workspace() {
    // Short queries: the target is 12 random steps away from the source.
    const Graph& g = graph();
    std::mt19937_64 rng(13);
    std::vector<Query> queries;
    for (Query q : random_queries(g.nodes(), 2000, 14)) {
        Node v = q.source;
        for (int step = 0; step < 12; ++step)
            if (g.offset[v + 1] > g.offset[v]) v = g.target[g.offset[v] + rng() % (g.offset[v + 1] - g.offset[v])];
        queries.push_back({q.source, v});
    }
    auto run = [&](auto& ws) {
        StdHeap heap;
        for (auto [s, d] : queries) tira::keep(query(g, s, d, ws, heap));
    };
    baseline::ResettingWorkspace ref(g.nodes());
    Workspace mine(g.nodes());
    auto t = tira::compare([&] { run(ref); }, [&] { run(mine); });
    return tira::report("task8 short queries, workspace", t, 3.0);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench_csr},
                        {"task4", bench_heap4},
                        {"task5", bench_heap8_avx512},
                        {"task6", bench_heap8_avx2},
                        {"task7", bench_distances},
                        {"task8", bench_workspace}}};
    return b.run(argc, argv);
}
