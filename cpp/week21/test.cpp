// Tests for week 21. Run one task's tests with: ./w21_test -tc="task5*"
#include <doctest/doctest.h>
#include <omp.h>

#include <algorithm>
#include <bit>
#include <iterator>
#include <random>

#include "tasks.hpp"
#include "tira.hpp"

using namespace w21;

namespace {

const std::vector<std::string>& sample_docs() {
    static const auto docs = generate_documents(600, 5);
    return docs;
}

const Index& sample_index() {
    static const Index index = baseline::build_index(sample_docs());
    return index;
}

std::vector<std::uint32_t> std_intersection(std::span<const std::uint32_t> a, std::span<const std::uint32_t> b) {
    std::vector<std::uint32_t> out;
    std::set_intersection(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(out));
    return out;
}

// Documents where many have the same score: copies of a few texts.
std::vector<std::string> tied_docs() {
    std::vector<std::string> docs;
    const char* texts[] = {"ka lo", "ka", "lo mi", "ka ka lo", "mi"};
    for (int i = 0; i < 40; ++i) docs.emplace_back(texts[i * 7 % 5]);
    return docs;
}

void check_valid(const Roaring& r) {
    REQUIRE(r.keys.size() == r.containers.size());
    for (std::size_t i = 0; i < r.keys.size(); ++i) {
        CAPTURE(i);
        if (i > 0) CHECK(r.keys[i - 1] < r.keys[i]);
        const Container& c = r.containers[i];
        CHECK(c.cardinality > 0);
        if (c.kind == Container::Array) {
            CHECK(c.cardinality <= ARRAY_MAX);
            CHECK(c.array.size() == c.cardinality);
            CHECK(std::ranges::adjacent_find(c.array, std::greater_equal<>{}) == c.array.end());
            CHECK(c.bitmap.empty());
        } else if (c.kind == Container::Bitmap) {
            CHECK(c.cardinality > ARRAY_MAX);
            REQUIRE(c.bitmap.size() == BITMAP_WORDS);
            std::uint32_t ones = 0;
            for (std::uint64_t w : c.bitmap) ones += static_cast<std::uint32_t>(std::popcount(w));
            CHECK(ones == c.cardinality);
            CHECK(c.array.empty());
        } else {
            FAIL("a run container in the result");
        }
    }
}

}  // namespace

TEST_CASE("task1: build the index") {
    // The format: terms in the order of their first appearance, lower case.
    std::vector<std::string> docs = {"The cat sat. The CAT!", "", "a dog, the dog... 42", "..."};
    const Index want = baseline::build_index(docs);
    CHECK(want.terms == std::vector<std::string>{"the", "cat", "sat", "a", "dog", "42"});
    CHECK(want.offset == std::vector<std::uint32_t>{0, 2, 3, 4, 5, 6, 7});
    CHECK(want.docs == std::vector<DocId>{0, 2, 0, 0, 2, 2, 2});
    CHECK(want.freqs == std::vector<std::uint32_t>{2, 1, 2, 1, 1, 2, 1});
    CHECK(want.doc_length == std::vector<std::uint32_t>{5, 0, 5, 0});
    CHECK(build_index(docs) == want);
    CHECK(build_index({}) == baseline::build_index({}));
    CHECK(build_index(tied_docs()) == baseline::build_index(tied_docs()));
    CHECK(build_index(sample_docs()) == sample_index());
}

TEST_CASE("task2: intersection and AND queries") {
    std::mt19937_64 rng(2);
    for (int round = 0; round < 600; ++round) {
        const std::size_t na = rng() % 60, nb = rng() % (round % 4 == 0 ? 20000 : 80);
        const std::uint32_t universe = round % 3 == 0 ? 1 + static_cast<std::uint32_t>(rng() % 300) : 1u << (10 + round % 22);
        auto a = random_set(na, universe, rng()), b = random_set(nb, universe, rng());
        if (round % 2) std::swap(a, b);
        CAPTURE(round);
        CHECK(intersect(a, b) == baseline::intersect(a, b));
    }
    const std::vector<DocId> x = {0, 5, 2147483648u, 4294967295u}, y = {0, 6, 2147483648u, 4294967295u};
    CHECK(intersect(x, y) == std::vector<DocId>{0, 2147483648u, 4294967295u});
    CHECK(intersect(x, {}).empty());

    const Index& index = sample_index();
    for (const auto& q : random_queries(index, 400, 3)) CHECK(and_query(index, q) == baseline::and_query(index, q));
    CHECK(and_query(index, {}).empty());
    for (TermId t : {0u, 1u, 7u}) {
        const std::vector<TermId> one = {t}, twice = {t, t};
        CHECK(and_query(index, one) == baseline::and_query(index, one));
        CHECK(and_query(index, twice) == baseline::and_query(index, twice));
    }
}

TEST_CASE("task3: top k") {
    const Index& index = sample_index();
    const Scores scores = bm25_scores(index);
    const auto queries = random_queries(index, 200, 4);
    for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{3}, std::size_t{10}, std::size_t{100000}}) {
        CAPTURE(k);
        for (const auto& q : queries) CHECK(top_k(index, scores, q, k) == baseline::top_k(index, scores, q, k));
    }
    CHECK(top_k(index, scores, {}, 10).empty());
    const Index tied = baseline::build_index(tied_docs());  // equal scores: the smaller document first
    const Scores tied_scores = bm25_scores(tied);
    for (const auto& q : std::vector<std::vector<TermId>>{{0}, {1}, {0, 1}, {1, 2}, {2, 0, 1}})
        for (std::size_t k : {1, 5, 13, 40})
            CHECK(top_k(tied, tied_scores, q, k) == baseline::top_k(tied, tied_scores, q, k));
}

TEST_CASE("task4: top k with MaxScore") {
    const Index& index = sample_index();
    const Scores scores = bm25_scores(index);
    const auto queries = random_queries(index, 300, 5);
    for (std::size_t k : {std::size_t{0}, std::size_t{1}, std::size_t{2}, std::size_t{10}, std::size_t{100000}}) {
        CAPTURE(k);
        for (const auto& q : queries) CHECK(top_k_maxscore(index, scores, q, k) == baseline::top_k(index, scores, q, k));
    }
    CHECK(top_k_maxscore(index, scores, {}, 10).empty());
    const Index tied = baseline::build_index(tied_docs());
    const Scores tied_scores = bm25_scores(tied);
    for (const auto& q : std::vector<std::vector<TermId>>{{0}, {1}, {0, 1}, {1, 2}, {2, 0, 1}})
        for (std::size_t k : {1, 2, 5, 13, 40})
            CHECK(top_k_maxscore(tied, tied_scores, q, k) == baseline::top_k(tied, tied_scores, q, k));
}

TEST_CASE("task5: Roaring intersection") {
    std::mt19937_64 rng(5);
    const std::uint32_t u = 1u << 17;  // two containers
    auto make = [&](int kind) -> std::vector<std::uint32_t> {
        switch (kind) {
            case 0: return random_set(rng() % 3000, u, rng());                         // arrays
            case 1: return random_set(rng() % 50000, u, rng());                        // bitmaps
            case 2: return random_set(10500 + rng() % 15000, u, rng());                // sparse bitmaps
            case 3: return clustered_set(rng() % 37000, u, 1 + rng() % 3000, rng());   // runs
            case 4: return random_set(rng() % 40, u, rng());                           // tiny
            case 5: {  // a whole container, and values next to it
                std::vector<std::uint32_t> v = {7, 65535};
                for (std::uint32_t x = 1u << 16; x < 2u << 16; ++x) v.push_back(x);
                v.push_back(2u << 16);
                return v;
            }
            default: {  // many keys, and the largest value
                auto v = random_set(rng() % 200, 0xFFFFFFFFu, rng());
                if (v.empty() || v.back() != 0xFFFFFFFFu) v.push_back(0xFFFFFFFFu);
                return v;
            }
        }
    };
    for (int kx = 0; kx < 7; ++kx) {
        for (int ky = 0; ky < 7; ++ky) {
            for (int repeat = 0; repeat < 2; ++repeat) {
                const auto x = make(kx), y = make(ky);
                const Roaring a = Roaring::from_sorted(x), b = Roaring::from_sorted(y);
                CAPTURE(kx);
                CAPTURE(ky);
                const Roaring c = intersect(a, b);
                check_valid(c);
                CHECK(c.to_vector() == std_intersection(x, y));
            }
        }
    }
    CHECK(intersect(Roaring{}, Roaring::from_sorted(make(1))).keys.empty());
}

TEST_CASE("task6: intersection with AVX2") {
    std::mt19937_64 rng(6);
    for (int round = 0; round < 4000; ++round) {
        std::size_t na = rng() % 40, nb = rng() % 40;
        if (round % 10 == 0) na = rng() % 3000, nb = rng() % 3000;
        const std::uint32_t universe = round % 3 == 0 ? 64 : round % 3 == 1 ? 1000 : 0xFFFFFFFFu;
        const auto a = random_set(na, universe, rng()), b = random_set(nb, universe, rng());
        std::vector<std::uint32_t> out(std::min(a.size(), b.size()) + 8);
        out.resize(intersect_avx2(a, b, out.data()));
        CAPTURE(round);
        CHECK(out == std_intersection(a, b));
    }
    const std::vector<std::uint32_t> a = {0, 1, 2147483647u, 2147483648u, 4294967294u, 4294967295u};
    const std::vector<std::uint32_t> b = {1, 2147483648u, 4294967295u};
    std::vector<std::uint32_t> out(b.size() + 8);
    out.resize(intersect_avx2(a, b, out.data()));
    CHECK(out == std::vector<std::uint32_t>{1, 2147483648u, 4294967295u});
}

TEST_CASE("task7: delta and varint coding") {
    std::vector<std::vector<DocId>> lists = {{}, {0}, {127}, {128}, {0, 1, 2}, {4294967295u}, {0, 4294967295u},
                                            {16383, 16384, 2097151, 2097152, 268435455, 268435456}};
    std::mt19937_64 rng(7);
    for (int round = 0; round < 300; ++round)
        lists.push_back(random_set(rng() % 1000, round % 2 ? 0xFFFFFFFFu : 1u << (8 + round % 20), rng()));
    for (TermId t = 0; t < sample_index().num_terms(); t += 7) {
        auto p = sample_index().postings(t);
        lists.emplace_back(p.begin(), p.end());
    }
    for (const auto& p : lists) {
        CAPTURE(p.size());
        const auto bytes = encode(p);
        CHECK(bytes == baseline::encode(p));
        CHECK(decode(bytes, p.size()) == p);
    }
}

TEST_CASE("task8: building the index in parallel") {
    const std::vector<std::vector<std::string>> corpora = {
        {}, {"one"}, {"a b", "b c"}, {"", "x", "", "x y", "Y"}, tied_docs(), generate_documents(150, 8), sample_docs()};
    std::vector<Index> want;
    for (const auto& c : corpora) want.push_back(baseline::build_index(c));
    const int saved = omp_get_max_threads();
    for (int t : {1, 2, 3, 4, 7}) {
        omp_set_num_threads(t);
        CAPTURE(t);
        for (std::size_t i = 0; i < corpora.size(); ++i) CHECK(build_index_parallel(corpora[i]) == want[i]);
    }
    omp_set_num_threads(saved);
}
