// Speed goals for week 21 (tasks 3 and 7 have none). Run in the release
// build: ./w21_bench [task]. Tasks 2 and 4 first build an index of 100,000
// documents, which takes a few seconds.
// Every benchmark first checks your result: a wrong result is not timed.
// The goals were calibrated with GCC 16 on a 4-core machine with AVX-512.
#include <omp.h>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w21;

namespace {

// For building the index: 20,000 generated documents of 40-400 tokens
// (4.4 million tokens).
const std::vector<std::string>& docs() {
    static const auto d = generate_documents(20000, 21);
    return d;
}
const Index& index() {
    static const Index i = baseline::build_index(docs());
    return i;
}

// For the queries: 100,000 shorter documents (20-120 tokens), so that the
// posting lists are longer, and 2000 random queries.
const Index& query_index() {
    static const Index i = baseline::build_index(generate_documents(100000, 23, 20, 120));
    return i;
}
const Scores& scores() {
    static const Scores s = bm25_scores(query_index());
    return s;
}
const std::vector<std::vector<TermId>>& queries() {
    static const auto q = random_queries(query_index(), 2000, 22);
    return q;
}

bool wrong(std::string_view task, std::string_view what) {
    std::println("{:<32} WRONG: {} (run the tests)", task, what);
    return false;
}

bool bench_index() {
    const std::string_view task = "task1 build the index";
    if (build_index(docs()) != index()) return wrong(task, "the index is not the baseline's");
    auto t = tira::compare([] { tira::keep(baseline::build_index(docs())); }, [] { tira::keep(build_index(docs())); }, 3);
    return tira::report(task, t, 2.5);
}

bool bench_and() {
    const std::string_view task = "task2 AND queries";
    const Index& ix = query_index();
    for (const auto& q : queries())
        if (and_query(ix, q) != baseline::and_query(ix, q)) return wrong(task, "a result is not the baseline's");
    auto t = tira::compare([&] { for (const auto& q : queries()) tira::keep(baseline::and_query(ix, q)); },
                           [&] { for (const auto& q : queries()) tira::keep(and_query(ix, q)); }, 7);
    return tira::report(task, t, 2.2);
}

bool bench_maxscore() {
    const std::string_view task = "task4 top 10 with MaxScore";
    const Index& ix = query_index();
    for (const auto& q : queries()) {
        const auto want = baseline::top_k(ix, scores(), q, 10);
        if (top_k(ix, scores(), q, 10) != want) return wrong(task, "your top_k (task 3) is not right");
        if (top_k_maxscore(ix, scores(), q, 10) != want) return wrong(task, "a result is not the baseline's");
    }
    auto t = tira::compare([&] { for (const auto& q : queries()) tira::keep(top_k(ix, scores(), q, 10)); },
                           [&] { for (const auto& q : queries()) tira::keep(top_k_maxscore(ix, scores(), q, 10)); }, 7);
    return tira::report(task, t, 1.2);
}

// Pairs of sets over 2^24 values: dense with dense (bitmaps), dense with
// sparse, clustered with clustered (runs), and sparse with sparse (arrays).
struct SetPair {
    std::vector<std::uint32_t> a, b;
    Roaring ra, rb;
};
const std::vector<SetPair>& set_pairs() {
    static const auto pairs = [] {
        const std::uint32_t u = 1u << 24;
        std::vector<SetPair> p;
        p.push_back({random_set(u / 5 * 2, u, 1), random_set(u / 4, u, 2), {}, {}});
        p.push_back({random_set(u / 4, u, 3), random_set(u / 200, u, 4), {}, {}});
        p.push_back({clustered_set(u / 4, u, 2000, 5), clustered_set(u / 4, u, 3000, 6), {}, {}});
        p.push_back({random_set(u / 100, u, 7), random_set(u / 50, u, 8), {}, {}});
        for (auto& x : p) x.ra = Roaring::from_sorted(x.a), x.rb = Roaring::from_sorted(x.b);
        return p;
    }();
    return pairs;
}

bool bench_roaring() {
    const std::string_view task = "task5 Roaring intersection";
    for (const auto& p : set_pairs())
        if (intersect(p.ra, p.rb).to_vector() != baseline::intersect(p.a, p.b)) return wrong(task, "a result is not the baseline's");
    auto t = tira::compare([] { for (const auto& p : set_pairs()) tira::keep(baseline::intersect(p.a, p.b)); },
                           [] { for (const auto& p : set_pairs()) tira::keep(intersect(p.ra, p.rb)); }, 7);
    return tira::report(task, t, 8.0);
}

bool bench_simd() {
    const std::string_view task = "task6 intersection with AVX2";
    // About 1 million values each, with many (universe 2^22) or few (2^24) common values.
    static const std::vector<std::pair<std::vector<std::uint32_t>, std::vector<std::uint32_t>>> lists = {
        {random_set(1 << 20, 1 << 22, 11), random_set(1 << 20, 1 << 22, 12)},
        {random_set(1 << 20, 1 << 24, 13), random_set(1 << 20, 1 << 24, 14)}};
    static std::vector<std::uint32_t> out((1 << 20) + 8), want((1 << 20) + 8);
    for (const auto& [a, b] : lists) {
        const std::size_t k = baseline::intersect_scalar(a, b, want.data());
        if (intersect_avx2(a, b, out.data()) != k || !std::equal(want.begin(), want.begin() + static_cast<std::ptrdiff_t>(k), out.begin()))
            return wrong(task, "a result is not the baseline's");
    }
    auto t = tira::compare([] { for (const auto& [a, b] : lists) tira::keep(baseline::intersect_scalar(a, b, out.data())); },
                           [] { for (const auto& [a, b] : lists) tira::keep(intersect_avx2(a, b, out.data())); }, 9);
    return tira::report(task, t, 2.5);
}

bool bench_varint() {  // no goal: the size of the index, and the speed of decoding
    const std::string_view task = "task7 delta + varint";
    const Index& ix = index();
    std::vector<std::vector<std::uint8_t>> coded(ix.num_terms());
    std::size_t bytes = 0;
    for (TermId t = 0; t < ix.num_terms(); ++t) {
        coded[t] = encode(ix.postings(t));
        bytes += coded[t].size();
        const auto p = ix.postings(t);
        if (coded[t] != baseline::encode(p) || decode(coded[t], p.size()) != std::vector<DocId>(p.begin(), p.end()))
            return wrong(task, "a posting list does not come back");
    }
    auto t = tira::compare([&] { for (TermId x = 0; x < ix.num_terms(); ++x) tira::keep(baseline::decode(coded[x], ix.postings(x).size())); },
                           [&] { for (TermId x = 0; x < ix.num_terms(); ++x) tira::keep(decode(coded[x], ix.postings(x).size())); }, 5);
    std::println("{:<32} {:.2f} bytes per posting instead of 4; decoding {:.2f} ns per posting, {:.2f}x the baseline (no goal)", task,
                 static_cast<double>(bytes) / static_cast<double>(ix.docs.size()), t.yours * 1e9 / static_cast<double>(ix.docs.size()), t.speedup());
    return true;
}

bool bench_parallel() {
    const std::string_view task = "task8 parallel index";
    if (build_index_parallel(docs()) != index()) return wrong(task, "the index is not the baseline's");
    const int all = omp_get_max_threads();
    auto t = tira::compare(
        [&] {  // your build_index_parallel on one thread
            omp_set_num_threads(1);
            tira::keep(build_index_parallel(docs()));
            omp_set_num_threads(all);
        },
        [] { tira::keep(build_index_parallel(docs())); }, 5);
    return tira::report(task, t, 2.2);
}

}  // namespace

int main(int argc, char** argv) {
    tira::Benchmarks b{{{"task1", bench_index},
                        {"task2", bench_and},
                        {"task4", bench_maxscore},
                        {"task5", bench_roaring},
                        {"task6", bench_simd},
                        {"task7", bench_varint},
                        {"task8", bench_parallel}}};
    return b.run(argc, argv);
}
