// Speed goals for week 18 (tasks 2 and 3 have none). Run in the release
// build: ./w18_bench [task]
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
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

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

bool bench_csr() {
    const EdgeList& el = edge_list();
    if (build_csr(el.nodes, el.edges) != graph()) return wrong("task1 build_csr", "the graph is not the baseline's");
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

// The goals of tasks 4-6: a big heap of 2^20 keys (8 MB), then 2^20 rounds
// that pop the smallest key and push a larger one, as Dijkstra does. In the
// Dijkstra of this week the heap is small, and the heap matters less (see the
// chapter), so that speedup is printed without a goal. Returns a checksum of
// the popped keys: the keys are all different, so it is the same for every
// correct heap.
template <class Heap>
std::uint64_t big_heap() {
    constexpr std::size_t n = std::size_t{1} << 20;
    static const std::vector<std::uint32_t> r = [] {
        std::mt19937_64 rng(15);
        std::vector<std::uint32_t> v(2 * n);
        for (auto& x : v) x = static_cast<std::uint32_t>(rng() % 4096);
        return v;
    }();
    static Heap heap;
    heap.clear();
    for (std::size_t i = 0; i < n; ++i) heap.push(make_key(r[i], static_cast<Node>(i)));
    std::uint64_t check = 0;
    for (std::size_t i = 0; i < n; ++i) {
        std::uint64_t key = heap.pop();
        check = check * 0x9E3779B97F4A7C15 + key;  // depends on the order of the keys
        heap.push(make_key(key_dist(key) + 1 + r[n + i], key_node(key)));
    }
    return check;
}

// Compares Heap with std::priority_queue on the big heap, and prints the
// speedup in your Dijkstra too. Fails if the keys come out in a wrong order.
template <class Heap>
bool bench_heap(std::string_view task, double goal) {
    std::uint64_t want = 0, got = 0;
    auto t = tira::compare([&] { want = big_heap<StdHeap>(); }, [&] { got = big_heap<Heap>(); }, 9);
    if (got != want) {
        return wrong(task, "the keys come out in a wrong order");
    }
    bool ok = tira::report(task, t, goal);
    auto d = tira::compare(run_with<StdHeap>(), run_with<Heap>(), 7);
    std::println("      in Dijkstra: {:.2f}x (no goal)", d.speedup());
    return ok;
}

bool bench_heap4() { return bench_heap<Heap4>("task4 big heap, Heap4", 1.4); }

bool bench_heap8_avx512() {
    if (!tira::has_avx512()) {
        std::println("task5: SKIPPED, this CPU has no AVX-512 (measure on the course machine)");
        return false;
    }
    bool ok = bench_heap<Heap8<MinChildAvx512>>("task5 big heap, AVX-512 Heap8", 1.5);
    std::uint64_t a = 0, b = 0;
    auto vs4 = tira::compare([&] { a = big_heap<Heap4>(); }, [&] { b = big_heap<Heap8<MinChildAvx512>>(); }, 5);
    if (a == b) std::println("      big heap compared with your Heap4: {:.2f}x (no goal)", vs4.speedup());
    return ok;
}

bool bench_heap8_avx2() { return bench_heap<Heap8<MinChildAvx2>>("task6 big heap, AVX2 Heap8", 1.3); }

bool bench_distances() {
    auto queries = random_queries(graph().nodes(), 32, 12);
    std::vector<Dist> seq;
    auto one_thread = [&] {  // your query, one query after another
        Workspace ws(graph().nodes());
        StdHeap heap;
        seq.clear();
        for (auto [s, d] : queries) seq.push_back(query(graph(), s, d, ws, heap));
    };
    const std::string_view task = "task7 parallel queries";
    one_thread();
    if (std::ranges::all_of(seq, [](Dist d) { return d == INF; })) return wrong(task, "your query (task 3) is not written yet");
    if (distances(graph(), queries) != seq) return wrong(task, "the distances are not the same as with your query");
    auto t = tira::compare(one_thread, [&] { tira::keep(distances(graph(), queries)); }, 5);
    return tira::report(task, t, 2.5);
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
    auto run = [&](auto& ws, std::vector<Dist>& out) {
        StdHeap heap;
        out.clear();
        for (auto [s, d] : queries) out.push_back(query(g, s, d, ws, heap));
    };
    baseline::ResettingWorkspace ref(g.nodes());
    Workspace mine(g.nodes());
    std::vector<Dist> a, b;
    run(ref, a);
    run(mine, b);
    const std::string_view task = "task8 short queries, workspace";
    if (std::ranges::all_of(a, [](Dist d) { return d == INF; })) return wrong(task, "your query (task 3) is not written yet");
    if (a != b) return wrong(task, "the distances are not the same as with a cleared workspace");
    auto t = tira::compare([&] { run(ref, a); }, [&] { run(mine, b); });
    return tira::report(task, t, 3.0);
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
