// Tests for week 24. Run one task's tests with: ./w24_test -tc="task4*"
//
// The distances are exact whole numbers, so the searches are deterministic:
// your search_layer, search, search_fast and search_batch must give exactly
// the results of the baseline. The tests of tasks 2, 4, 6 and 7 use indexes
// made by brute force (every node linked to its nearest nodes on each layer),
// so they do not depend on your insert.
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <random>
#include <string>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w24;

namespace {

std::string show(const std::vector<Neighbor>& v) {
    std::string s = std::to_string(v.size()) + " results:";
    for (std::size_t i = 0; i < v.size() && i < 12; ++i) s += " (" + std::to_string(v[i].id) + ", " + std::to_string(v[i].distance) + ")";
    return s;
}

#define CHECK_RESULTS(got, want)                           \
    do {                                                   \
        const auto g_ = (got);                             \
        const auto w_ = (want);                            \
        INFO("got " << show(g_) << "\nwant " << show(w_)); \
        CHECK(g_ == w_);                                   \
    } while (false)

// All other vectors as candidates for node q, sorted by their distance to q.
std::vector<Neighbor> sorted_candidates(const Vectors& data, Id q) {
    std::vector<Neighbor> c;
    for (Id i = 0; i < data.n; ++i)
        if (i != q) c.push_back({baseline::l2_squared(data[i], data[q], data.dim), i});
    std::ranges::sort(c);
    return c;
}

// The rule of task 1, written out for checking.
std::vector<Neighbor> rule_of_task1(const Vectors& data, std::span<const Neighbor> candidates, std::size_t count) {
    std::vector<Neighbor> kept;
    for (const Neighbor& e : candidates) {
        if (kept.size() == count) break;
        if (std::ranges::all_of(kept, [&](const Neighbor& r) { return baseline::l2_squared(data[e.id], data[r.id], data.dim) >= e.distance; }))
            kept.push_back(e);
    }
    return kept;
}

// An index made without insert: on every layer, each node is linked to its
// `k` nearest nodes of that layer.
Hnsw knn_index(const Vectors& data, const Params& params, std::size_t k) {
    Hnsw index = empty_index(data, params);
    index.inserted = data.n;
    for (Id i = 0; i < data.n; ++i)
        if (index.level[i] > index.top) index.top = index.level[i], index.entry = i;
    for (int layer = 0; layer <= index.top; ++layer) {
        std::vector<Id> nodes;
        for (Id i = 0; i < data.n; ++i)
            if (index.level[i] >= layer) nodes.push_back(i);
        for (Id u : nodes) {
            std::vector<Neighbor> near;
            for (Id v : nodes)
                if (v != u) near.push_back({baseline::l2_squared(data[u], data[v], data.dim), v});
            const std::size_t count = std::min({k, index.capacity(layer), near.size()});
            std::ranges::partial_sort(near, near.begin() + static_cast<std::ptrdiff_t>(count));
            std::vector<Id> ids;
            for (std::size_t j = 0; j < count; ++j) ids.push_back(near[j].id);
            index.set_links(u, layer, ids);
        }
    }
    return index;
}

void check_structure(const Hnsw& index, const Vectors& data) {
    REQUIRE(index.inserted == data.n);
    if (data.n == 0) return;
    const int top = *std::ranges::max_element(index.level);
    CHECK(index.top == top);
    CHECK(index.level[index.entry] == top);
    bool ok = true;
    std::string why;
    for (Id i = 0; i < data.n && ok; ++i)
        for (int layer = 0; layer <= index.level[i] && ok; ++layer) {
            const auto links = index.links(i, layer);
            std::vector<Id> sorted(links.begin(), links.end());
            std::ranges::sort(sorted);
            if (links.size() > index.capacity(layer)) ok = false, why = "too many links";
            else if (std::ranges::adjacent_find(sorted) != sorted.end()) ok = false, why = "a link twice";
            for (Id j : links)
                if (j == i) ok = false, why = "a link to itself";
                else if (j >= data.n || index.level[j] < layer) ok = false, why = "a link to a node that is not in the layer";
            if (!ok) why += ": node " + std::to_string(i) + ", layer " + std::to_string(layer);
        }
    CHECK_MESSAGE(ok, why);
}

double index_recall(const Hnsw& index, const Vectors& data, const Vectors& queries, std::size_t ef) {
    Results got(queries.n), truth(queries.n);
    for (std::size_t q = 0; q < queries.n; ++q) {
        got[q] = baseline::search(index, queries[q], 10, ef);
        truth[q] = baseline::knn(data, queries[q], 10);
    }
    return recall(got, truth, 10);
}

}  // namespace

TEST_CASE("task1 select_neighbors keeps the candidates that pass the test") {
    for (std::uint64_t seed : {1, 2, 3}) {
        const Vectors data = seed == 3 ? sift_like(400, seed) : random_bytes(80, 8, 4, seed);  // small values: equal distances
        for (Id q : {0u, 7u, 40u}) {
            const auto candidates = sorted_candidates(data, q);
            for (std::size_t count : {0, 1, 2, 3, 8, 16, 1000}) {
                INFO("seed = " << seed << ", q = " << q << ", count = " << count);
                CHECK_RESULTS(select_neighbors(data, candidates, count), rule_of_task1(data, candidates, count));
                CHECK_RESULTS(select_neighbors(data, std::span(candidates).first(10), count),
                              rule_of_task1(data, std::span(candidates).first(10), count));
            }
        }
    }
}

TEST_CASE("task2 search_layer in a complete graph finds the nearest") {
    const Vectors data = random_bytes(40, 16, 256, 10), queries = random_bytes(5, 16, 256, 11);
    const Hnsw index = knn_index(data, Params{32, 10, 1}, 39);  // every node linked to all others on layer 0
    Workspace work;
    for (std::size_t q = 0; q < queries.n; ++q)
        for (std::size_t ef : {1, 3, 10, 40, 50}) {
            const Neighbor entry{baseline::l2_squared(data[q], queries[q], 16), static_cast<Id>(q)};
            INFO("ef = " << ef);
            CHECK_RESULTS(search_layer(index, queries[q], std::span(&entry, 1), ef, 0, work), baseline::knn(data, queries[q], ef));
        }
}

TEST_CASE("task2 search_layer gives the results of the baseline") {
    for (std::uint64_t seed : {20, 21}) {
        const Vectors data = seed == 20 ? sift_like(800, seed) : random_bytes(500, 12, 3, seed);
        const Vectors queries = seed == 20 ? sift_like(10, seed + 100) : random_bytes(10, 12, 3, seed + 100);
        const Hnsw index = knn_index(data, Params{4, 10, seed}, 6);
        Workspace work;
        std::mt19937_64 rng(seed);
        for (int layer = 0; layer <= index.top; ++layer) {
            std::vector<Id> nodes;
            for (Id i = 0; i < data.n; ++i)
                if (index.level[i] >= layer) nodes.push_back(i);
            for (std::size_t q = 0; q < queries.n; ++q)
                for (std::size_t ef : {1, 2, 5, 20, 100}) {
                    std::vector<Neighbor> entry;
                    for (std::size_t e = 0; e < 1 + rng() % 3; ++e) {
                        const Id id = nodes[rng() % nodes.size()];
                        entry.push_back({baseline::l2_squared(data[id], queries[q], data.dim), id});
                    }
                    INFO("seed = " << seed << ", layer = " << layer << ", ef = " << ef);
                    CHECK_RESULTS(search_layer(index, queries[q], entry, ef, layer, work), baseline::search_layer(index, queries[q], entry, ef, layer));
                }
        }
    }
}

TEST_CASE("task3 insert builds a valid index") {
    for (std::size_t n : {1, 2, 3, 10, 300, 700}) {
        for (std::size_t m : {2, 4, 16}) {
            const Vectors data = n == 300 ? random_bytes(n, 16, 3, n + m) : sift_like(n, n + m);
            INFO("n = " << n << ", m = " << m);
            const Hnsw index = build(data, Params{m, 32, 30});
            check_structure(index, data);
            if (n == 300) {
                const Hnsw again = build(data, Params{m, 32, 30});
                CHECK(again.links0 == index.links0);
                CHECK(again.upper == index.upper);
            }
        }
    }
}

TEST_CASE("task3 the index finds the nearest neighbours") {
    const Vectors data = sift_like(2000, 31), queries = sift_like(100, 32);
    const Hnsw index = build(data, Params{16, 64, 33});
    check_structure(index, data);
    CHECK(index_recall(index, data, queries, 64) >= 0.95);
    // Every node has links on layer 0 (only the first node could be alone).
    std::size_t alone = 0;
    for (Id i = 0; i < data.n; ++i) alone += index.links(i, 0).empty();
    CHECK(alone == 0);
}

TEST_CASE("task4 search gives the results of the baseline") {
    for (std::uint64_t seed : {40, 41}) {
        const Vectors data = seed == 40 ? sift_like(800, seed) : random_bytes(500, 12, 3, seed);
        const Vectors queries = seed == 40 ? sift_like(20, seed + 100) : random_bytes(20, 12, 3, seed + 100);
        const Hnsw index = knn_index(data, Params{4, 10, seed}, 6);
        Workspace work;
        for (std::size_t q = 0; q < queries.n; ++q)
            for (std::size_t k : {1, 10})
                for (std::size_t ef : {1, 10, 50}) {
                    INFO("seed = " << seed << ", k = " << k << ", ef = " << ef);
                    CHECK_RESULTS(search(index, queries[q], k, ef, work), baseline::search(index, queries[q], k, ef));
                }
    }
    const Vectors none(0, 16), one = random_bytes(1, 16, 256, 42);
    Workspace work;
    CHECK(search(empty_index(none, Params{}), one[0], 10, 10, work).empty());
    const Hnsw single = knn_index(one, Params{}, 1);
    CHECK_RESULTS(search(single, one[0], 10, 10, work), baseline::search(single, one[0], 10, 10));
    CHECK(search(single, one[0], 0, 10, work).empty());
}

TEST_CASE("task5 l2_squared of bytes is exact") {
    std::mt19937_64 rng(50);
    for (std::size_t dim = 0; dim <= 300; dim += dim < 70 ? 1 : 23) {
        std::vector<std::uint8_t> a(dim), b(dim);  // exactly dim bytes: AddressSanitizer sees reads past the end
        for (std::size_t i = 0; i < dim; ++i) {
            a[i] = static_cast<std::uint8_t>(rng() % 3 == 0 ? 255 * (rng() % 2) : rng() % 256);
            b[i] = static_cast<std::uint8_t>(rng() % 3 == 0 ? 255 * (rng() % 2) : rng() % 256);
        }
        INFO("dim = " << dim);
        CHECK(l2_squared(a.data(), b.data(), dim) == baseline::l2_squared(a.data(), b.data(), dim));
        CHECK(l2_squared(b.data(), a.data(), dim) == baseline::l2_squared(a.data(), b.data(), dim));
    }
}

TEST_CASE("task6 search_fast gives the results of the baseline") {
    const Vectors data = sift_like(800, 60), queries = sift_like(30, 61);
    const Hnsw index = knn_index(data, Params{4, 10, 62}, 6);
    Workspace work;
    for (std::size_t q = 0; q < queries.n; ++q)
        for (std::size_t k : {1, 10})
            for (std::size_t ef : {1, 10, 50}) {
                INFO("k = " << k << ", ef = " << ef);
                CHECK_RESULTS(search_fast(index, queries[q], k, ef, work), baseline::search(index, queries[q], k, ef));
            }
}

TEST_CASE("task7 search_batch gives the results of the baseline") {
    const Vectors data = sift_like(800, 70), queries = sift_like(41, 71);
    const Hnsw index = knn_index(data, Params{4, 10, 72}, 6);
    Results want(queries.n);
    for (std::size_t q = 0; q < queries.n; ++q) want[q] = baseline::search(index, queries[q], 10, 32);
    const int threads = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(t);
        INFO("threads = " << t);
        CHECK(search_batch(index, queries, 10, 32) == want);
        CHECK(search_batch(index, Vectors(0, 128), 10, 32).empty());
    }
    omp_set_num_threads(threads);
}

TEST_CASE("task8 the settings are possible") {
    const Settings s = tuned_settings();
    CHECK(s.params.m >= 2);
    CHECK(s.params.m <= 64);
    CHECK(s.params.ef_construction >= 1);
    CHECK(s.params.ef_construction <= 400);
    CHECK(s.ef >= 1);
}
