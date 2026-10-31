// Week 21: documents, tokens, the inverted index, BM25 impacts and generated
// data. This file is given (you do not need to change it).
#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace w21 {

using DocId = std::uint32_t;
using TermId = std::uint32_t;

constexpr bool is_word_char(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'); }
constexpr char to_lower(char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c - 'A' + 'a') : c; }

// Calls f(token) for every token of the text: a longest run of ASCII letters
// and digits, in lower case. All other bytes separate tokens. The token is a
// string_view into `buffer` and is valid until f returns.
template <class F>
void for_each_token(std::string_view text, std::string& buffer, F&& f) {
    std::size_t i = 0;
    const std::size_t n = text.size();
    while (i < n) {
        while (i < n && !is_word_char(text[i])) ++i;
        const std::size_t start = i;
        while (i < n && is_word_char(text[i])) ++i;
        if (i > start) {
            buffer.assign(text.data() + start, i - start);
            for (char& c : buffer) c = to_lower(c);
            f(std::string_view(buffer));
        }
    }
}

// An inverted index in CSR form, like the graphs of weeks 18-20: the postings
// of term t are the indices offset[t], ..., offset[t + 1] - 1 of docs and
// freqs. A posting says that term t occurs freqs[i] times in document docs[i].
struct Index {
    std::vector<std::string> terms;         // the text of every term
    std::vector<std::uint32_t> offset;      // terms.size() + 1 values, offset[0] == 0
    std::vector<DocId> docs;                // increasing within every term
    std::vector<std::uint32_t> freqs;       // one per posting, at least 1
    std::vector<std::uint32_t> doc_length;  // the number of tokens of every document

    TermId num_terms() const { return static_cast<TermId>(terms.size()); }
    DocId num_docs() const { return static_cast<DocId>(doc_length.size()); }
    std::span<const DocId> postings(TermId t) const { return {docs.data() + offset[t], offset[t + 1] - offset[t]}; }
    std::span<const std::uint32_t> frequencies(TermId t) const {
        return {freqs.data() + offset[t], offset[t + 1] - offset[t]};
    }
    friend bool operator==(const Index&, const Index&) = default;
};

// BM25 scores as integers. The impact of a posting (term t in document d) is
// round(1000 * idf(t) * f * (k1 + 1) / (f + k1 * (1 - b + b * len(d) / avg_len))),
// but at least 1, with k1 = 1.2, b = 0.75, f = the frequency of t in d and
// idf(t) = ln(1 + (N - n_t + 0.5) / (n_t + 0.5)), where N is the number of
// documents and n_t the number of documents that contain t. The score of a
// document for a query is the sum of its impacts for the terms of the query.
struct Scores {
    std::vector<std::uint32_t> impact;      // one per posting, like Index::docs
    std::vector<std::uint32_t> max_impact;  // the largest impact of every term (0 if it has no postings)
};
Scores bm25_scores(const Index& index);

// The k documents with the highest scores, best first: a larger score is
// better, and of two equal scores the smaller document.
struct Hit {
    DocId doc;
    std::uint32_t score;
    friend bool operator==(const Hit&, const Hit&) = default;
};
constexpr bool better(const Hit& a, const Hit& b) { return a.score > b.score || (a.score == b.score && a.doc < b.doc); }

// The word of rank r of the generated vocabulary: 1-3 syllables such as "ka",
// "tomi" or "rusabe". Different ranks give different words.
std::string word(std::uint32_t rank);

// Generated documents with the word statistics of English text: the words of
// a vocabulary of 50,000 words follow Zipf's law (the word of rank r has
// frequency proportional to 1 / (r + 1)), about 2 % of the tokens are numbers,
// and every document has min_tokens ... max_tokens tokens in sentences that
// start with a capital letter and end with a punctuation mark.
std::vector<std::string> generate_documents(std::size_t count, std::uint64_t seed, std::uint32_t min_tokens = 40,
                                            std::uint32_t max_tokens = 400);

// Random queries of 2-4 different terms that each occur in at least 2
// documents: every term is common (in at least 5 % of the documents), medium
// or rare (in less than 0.1 %), with equal probability.
std::vector<std::vector<TermId>> random_queries(const Index& index, std::size_t count, std::uint64_t seed);

// `count` different random values below `universe`, in increasing order.
std::vector<std::uint32_t> random_set(std::size_t count, std::uint32_t universe, std::uint64_t seed);

// Like random_set, but the values come in runs of about `run` consecutive
// values, as the ids of related documents often do.
std::vector<std::uint32_t> clustered_set(std::size_t count, std::uint32_t universe, std::uint32_t run, std::uint64_t seed);

}  // namespace w21
