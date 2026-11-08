#include "workload.hpp"

#include <algorithm>

namespace w31 {

std::string random_value(std::mt19937_64& rng, std::size_t min_size, std::size_t max_size) {
    std::string v(min_size + static_cast<std::size_t>(rng() % (max_size - min_size + 1)), '\0');
    for (char& c : v) c = static_cast<char>(rng());
    return v;
}

std::vector<Entry> random_writes(std::size_t n, Key keys, double deletes, std::uint64_t seed, Seq first, std::size_t min_value, std::size_t max_value) {
    std::mt19937_64 rng(seed);
    std::bernoulli_distribution del(deletes);
    std::vector<Entry> v;
    v.reserve(n);
    for (std::size_t i = 0; i < n; ++i) {
        const Key key = keys == 0 ? rng() : rng() % keys;
        if (del(rng))
            v.push_back({key, first + i, Kind::del, {}});
        else
            v.push_back({key, first + i, Kind::put, random_value(rng, min_value, max_value)});
    }
    return v;
}

std::vector<Entry> sorted(std::vector<Entry> v) {
    std::ranges::sort(v, [](const Entry& a, const Entry& b) { return internal_less(a, b); });
    return v;
}

std::vector<Table> overlapping_tables(const std::vector<Entry>& writes, std::size_t count, std::uint64_t seed) {
    std::mt19937_64 rng(seed);
    std::vector<std::vector<Entry>> parts(count);
    for (const Entry& e : writes) parts[rng() % count].push_back(e);
    std::vector<Table> tables;
    for (auto& p : parts)
        if (!p.empty()) tables.push_back(make_table(sorted(std::move(p))));
    return tables;
}

}  // namespace w31
