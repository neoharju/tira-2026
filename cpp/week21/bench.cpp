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
    std::vector<std::string> d;  // Each round has new documents.
    Index want, got;
    auto t = tira::compare_fresh([&](std::uint64_t seed) { d = generate_documents(20000, seed); },
                                 [&] { want = baseline::build_index(d); }, [&] { got = build_index(d); },
                                 [&] { return got == want; }, 3, 211);
    return tira::report(task, t, 2.5);
}

bool bench_and() {
    const std::string_view task = "task2 AND queries";
    const Index& ix = query_index();
    for (const auto& q : queries())
        if (and_query(ix, q) != baseline::and_query(ix, q)) return wrong(task, "a result is not the baseline's");
    std::vector<std::vector<TermId>> q;  // Each round has new queries.
    std::vector<std::vector<DocId>> want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { q = random_queries(ix, 2000, seed); },
        [&] {
            want.clear();
            for (const auto& x : q) want.push_back(baseline::and_query(ix, x));
        },
        [&] {
            got.clear();
            for (const auto& x : q) got.push_back(and_query(ix, x));
        },
        [&] { return got == want; }, 7, 212);
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
    std::vector<std::vector<TermId>> q;  // Each round has new queries.
    std::vector<std::vector<Hit>> want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { q = random_queries(ix, 2000, seed); },
        [&] {
            want.clear();
            for (const auto& x : q) want.push_back(top_k(ix, scores(), x, 10));
        },
        [&] {
            got.clear();
            for (const auto& x : q) got.push_back(top_k_maxscore(ix, scores(), x, 10));
        },
        [&] { return got == want; }, 7, 214);
    return tira::report(task, t, 1.2);
}

// Pairs of sets over 2^24 values: dense with dense (bitmaps), dense with
// sparse, clustered with clustered (runs), and sparse with sparse (arrays).
struct SetPair {
    std::vector<std::uint32_t> a, b;
    Roaring ra, rb;
};
std::vector<SetPair> make_set_pairs(std::uint64_t seed) {
    const std::uint32_t u = 1u << 24;
    std::vector<SetPair> p;
    p.push_back({random_set(u / 5 * 2, u, seed + 1), random_set(u / 4, u, seed + 2), {}, {}});
    p.push_back({random_set(u / 4, u, seed + 3), random_set(u / 200, u, seed + 4), {}, {}});
    p.push_back({clustered_set(u / 4, u, 2000, seed + 5), clustered_set(u / 4, u, 3000, seed + 6), {}, {}});
    p.push_back({random_set(u / 100, u, seed + 7), random_set(u / 50, u, seed + 8), {}, {}});
    for (auto& x : p) x.ra = Roaring::from_sorted(x.a), x.rb = Roaring::from_sorted(x.b);
    return p;
}

bool bench_roaring() {
    const std::string_view task = "task5 Roaring intersection";
    std::vector<SetPair> pairs = make_set_pairs(0);
    for (const auto& p : pairs)
        if (intersect(p.ra, p.rb).to_vector() != baseline::intersect(p.a, p.b)) return wrong(task, "a result is not the baseline's");
    std::vector<std::vector<std::uint32_t>> want;
    std::vector<Roaring> got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { pairs = make_set_pairs(seed); },
        [&] {
            want.clear();
            for (const auto& p : pairs) want.push_back(baseline::intersect(p.a, p.b));
        },
        [&] {
            got.clear();
            for (const auto& p : pairs) got.push_back(intersect(p.ra, p.rb));
        },
        [&] {
            for (std::size_t i = 0; i < want.size(); ++i)
                if (got[i].to_vector() != want[i]) return false;
            return true;
        },
        7, 215);
    return tira::report(task, t, 8.0);
}

bool bench_simd() {
    const std::string_view task = "task6 intersection with AVX2";
    // About 1 million values each, with many (universe 2^22) or few (2^24) common values.
    using Lists = std::vector<std::pair<std::vector<std::uint32_t>, std::vector<std::uint32_t>>>;
    auto make = [](std::uint64_t seed) {
        return Lists{{random_set(1 << 20, 1 << 22, seed + 11), random_set(1 << 20, 1 << 22, seed + 12)},
                     {random_set(1 << 20, 1 << 24, seed + 13), random_set(1 << 20, 1 << 24, seed + 14)}};
    };
    Lists lists = make(0);
    std::vector<std::uint32_t> out((1 << 20) + 8), want((1 << 20) + 8);
    for (const auto& [a, b] : lists) {
        const std::size_t k = baseline::intersect_scalar(a, b, want.data());
        if (intersect_avx2(a, b, out.data()) != k || !std::equal(want.begin(), want.begin() + static_cast<std::ptrdiff_t>(k), out.begin()))
            return wrong(task, "a result is not the baseline's");
    }
    // Each pair of lists has its own output. The check compares all outputs after the round.
    std::vector<std::vector<std::uint32_t>> w(2, std::vector<std::uint32_t>((1 << 20) + 8)), g = w;
    std::size_t kw[2]{}, kg[2]{};
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { lists = make(seed); },
        [&] { for (std::size_t i = 0; i < 2; ++i) kw[i] = baseline::intersect_scalar(lists[i].first, lists[i].second, w[i].data()); },
        [&] { for (std::size_t i = 0; i < 2; ++i) kg[i] = intersect_avx2(lists[i].first, lists[i].second, g[i].data()); },
        [&] {
            for (std::size_t i = 0; i < 2; ++i)
                if (kg[i] != kw[i] || !std::equal(w[i].begin(), w[i].begin() + static_cast<std::ptrdiff_t>(kw[i]), g[i].begin())) return false;
            return true;
        },
        9, 216);
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
    std::vector<std::string> d;  // Each round has new documents.
    Index want, got;
    auto t = tira::compare_fresh(
        [&](std::uint64_t seed) { d = generate_documents(20000, seed); },
        [&] {  // your build_index_parallel on one thread
            omp_set_num_threads(1);
            want = build_index_parallel(d);
            omp_set_num_threads(all);
        },
        [&] { got = build_index_parallel(d); }, [&] { return got == want; }, 5, 218);
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
