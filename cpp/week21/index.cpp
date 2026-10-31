#include "index.hpp"

#include <algorithm>
#include <cmath>
#include <random>

namespace w21 {

namespace {

// Our own distributions: the algorithms of std::uniform_*_distribution are not
// fixed by the standard, and the generated data should be the same everywhere.
double unit(std::mt19937_64& rng) { return static_cast<double>(rng() >> 11) * 0x1.0p-53; }
std::uint64_t below(std::mt19937_64& rng, std::uint64_t n) { return rng() % n; }

constexpr char consonants[] = "bdfgklmnprstv";
constexpr char vowels[] = "aeiou";
constexpr std::uint32_t syllables = 13 * 5;
constexpr std::uint32_t vocabulary = 50000;

}  // namespace

Scores bm25_scores(const Index& index) {
    const double k1 = 1.2, b = 0.75;
    const double docs = index.num_docs();
    double total = 0;
    for (std::uint32_t len : index.doc_length) total += len;
    const double avg = total > 0 ? total / docs : 1;
    Scores s;
    s.impact.resize(index.docs.size());
    s.max_impact.assign(index.num_terms(), 0);
    for (TermId t = 0; t < index.num_terms(); ++t) {
        const double n = index.offset[t + 1] - index.offset[t];
        const double idf = std::log(1 + (docs - n + 0.5) / (n + 0.5));
        for (std::uint32_t i = index.offset[t]; i < index.offset[t + 1]; ++i) {
            const double f = index.freqs[i];
            const double len = index.doc_length[index.docs[i]];
            const double score = idf * f * (k1 + 1) / (f + k1 * (1 - b + b * len / avg));
            const auto impact = std::max<std::uint32_t>(1, static_cast<std::uint32_t>(std::lround(1000 * score)));
            s.impact[i] = impact;
            s.max_impact[t] = std::max(s.max_impact[t], impact);
        }
    }
    return s;
}

std::string word(std::uint32_t rank) {
    // Bijective base-65 numeration: every rank has its own string of syllables.
    std::string w;
    std::uint64_t x = std::uint64_t{rank} + 1;
    while (x > 0) {
        --x;
        const std::uint32_t syl = static_cast<std::uint32_t>(x % syllables);
        w += consonants[syl / 5];
        w += vowels[syl % 5];
        x /= syllables;
    }
    return w;
}

std::vector<std::string> generate_documents(std::size_t count, std::uint64_t seed, std::uint32_t min_tokens, std::uint32_t max_tokens) {
    static const auto words = [] {
        std::vector<std::string> w(vocabulary);
        for (std::uint32_t r = 0; r < vocabulary; ++r) w[r] = word(r);
        return w;
    }();
    static const auto cdf = [] {  // Zipf's law: weight 1 / (r + 1)
        std::vector<double> c(vocabulary);
        double sum = 0;
        for (std::uint32_t r = 0; r < vocabulary; ++r) c[r] = sum += 1.0 / (r + 1);
        return c;
    }();
    std::mt19937_64 rng(seed);
    std::vector<std::string> docs(count);
    for (std::string& doc : docs) {
        const std::uint64_t length = min_tokens + below(rng, std::uint64_t{std::max(min_tokens, max_tokens)} - min_tokens + 1);
        std::uint64_t sentence = 5 + below(rng, 11);  // tokens left in the sentence
        bool capital = true;
        for (std::uint64_t i = 0; i < length; ++i) {
            const std::size_t start = doc.size();
            if (unit(rng) < 0.02) {
                doc += std::to_string(below(rng, 10000));
            } else {
                const auto it = std::upper_bound(cdf.begin(), cdf.end(), unit(rng) * cdf.back());
                doc += words[std::min<std::size_t>(static_cast<std::size_t>(it - cdf.begin()), vocabulary - 1)];
            }
            if (capital) doc[start] = static_cast<char>(doc[start] >= 'a' && doc[start] <= 'z' ? doc[start] - 'a' + 'A' : doc[start]);
            capital = false;
            if (--sentence == 0 || i + 1 == length) {
                doc += ".?!."[below(rng, 4)];
                sentence = 5 + below(rng, 11);
                capital = true;
            } else if (unit(rng) < 0.08) {
                doc += ',';
            }
            if (i + 1 < length) doc += ' ';
        }
    }
    return docs;
}

std::vector<std::vector<TermId>> random_queries(const Index& index, std::size_t count, std::uint64_t seed) {
    const DocId n = index.num_docs();
    std::vector<TermId> bands[3];  // common, medium, rare
    for (TermId t = 0; t < index.num_terms(); ++t) {
        const std::uint64_t df = index.offset[t + 1] - index.offset[t];
        if (df < 2) continue;
        if (df * 20 >= n) bands[0].push_back(t);
        else if (df * 1000 >= n) bands[1].push_back(t);
        else bands[2].push_back(t);
    }
    std::vector<int> usable;
    for (int i = 0; i < 3; ++i)
        if (!bands[i].empty()) usable.push_back(i);
    const std::size_t available = bands[0].size() + bands[1].size() + bands[2].size();
    std::mt19937_64 rng(seed);
    std::vector<std::vector<TermId>> queries(count);
    if (available == 0) return queries;
    for (auto& q : queries) {
        const std::size_t size = std::min<std::size_t>(2 + below(rng, 3), available);
        while (q.size() < size) {
            const auto& band = bands[usable[below(rng, usable.size())]];
            const TermId t = band[below(rng, band.size())];
            if (std::ranges::find(q, t) == q.end()) q.push_back(t);
        }
    }
    return queries;
}

std::vector<std::uint32_t> random_set(std::size_t count, std::uint32_t universe, std::uint64_t seed) {
    count = std::min<std::size_t>(count, universe);
    std::mt19937_64 rng(seed);
    std::vector<std::uint32_t> v;
    v.reserve(count + count / 8);
    if (4 * std::uint64_t{count} >= universe) {
        // Dense: selection sampling (Knuth's Algorithm S), one pass over the values.
        std::uint64_t needed = count;
        for (std::uint64_t x = 0; needed > 0; ++x)
            if (below(rng, universe - x) < needed) v.push_back(static_cast<std::uint32_t>(x)), --needed;
        return v;
    }
    while (v.size() < count) {  // sparse: draw what is missing, then remove the repeated values
        for (std::size_t i = v.size(); i < count; ++i) v.push_back(static_cast<std::uint32_t>(below(rng, universe)));
        std::ranges::sort(v);
        v.erase(std::unique(v.begin(), v.end()), v.end());
    }
    return v;
}

std::vector<std::uint32_t> clustered_set(std::size_t count, std::uint32_t universe, std::uint32_t run, std::uint64_t seed) {
    count = std::min<std::size_t>(count, universe);
    run = std::max<std::uint32_t>(run, 1);
    std::mt19937_64 rng(seed);
    std::vector<std::uint32_t> v;
    v.reserve(count);
    const std::uint64_t runs = std::max<std::uint64_t>(1, (count + run - 1) / run);
    const std::uint64_t gap = (universe - count) / runs;  // the average free space before a run
    std::uint64_t p = 0;  // the first value that is still free
    while (v.size() < count) {
        const std::uint64_t left = count - v.size();
        p = std::min(p + (gap ? below(rng, 2 * gap + 1) : 0), std::uint64_t{universe} - left);
        const std::uint64_t length = std::min<std::uint64_t>(1 + below(rng, 2 * std::uint64_t{run}), left);
        for (std::uint64_t i = 0; i < length; ++i) v.push_back(static_cast<std::uint32_t>(p + i));
        p += length;
    }
    return v;
}

}  // namespace w21
