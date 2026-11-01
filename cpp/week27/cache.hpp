// Week 27: caches of keys, and the access traces that compare them. A cache
// holds at most `capacity` keys; access(k) returns true if k was in the cache
// (a hit), and otherwise puts k in, evicting another key if the cache is full.
#pragma once
#include <cstddef>
#include <cstdint>
#include <list>
#include <unordered_map>
#include <vector>

namespace w27 {

// Traces (traces.cpp). Keys are scrambled with mix, so that popular keys are
// not small numbers.
// `length` accesses to `keys` keys, where the key of rank i (0, 1, ...) has
// probability proportional to 1 / (i + 1)^alpha (Zipf's law).
std::vector<std::uint64_t> zipf_trace(std::size_t length, std::size_t keys, double alpha, std::uint64_t seed);
// A Zipf trace in which, after every `every` accesses, a scan of `scan`
// new keys is inserted; a scanned key is never used again.
std::vector<std::uint64_t> scan_trace(std::size_t length, std::size_t keys, double alpha, std::size_t every,
                                      std::size_t scan, std::uint64_t seed);
// The keys 0, 1, ..., keys - 1 again and again, `length` accesses.
std::vector<std::uint64_t> loop_trace(std::size_t length, std::size_t keys);
// A Zipf trace whose popular keys change completely every `phase` accesses.
std::vector<std::uint64_t> shifting_trace(std::size_t length, std::size_t keys, double alpha, std::size_t phase,
                                          std::uint64_t seed);

// The share of hits when the trace runs through the cache.
template <class Cache>
double hit_ratio(Cache& cache, const std::vector<std::uint64_t>& trace) {
    std::size_t hits = 0;
    for (std::uint64_t key : trace) hits += cache.access(key);
    return trace.empty() ? 0.0 : static_cast<double>(hits) / static_cast<double>(trace.size());
}

namespace baseline {
// LRU: evicts the key that was used least recently. A list of the keys in the
// order of their last access, and a hash map from a key to its place in it.
class LruCache {
public:
    explicit LruCache(std::size_t capacity) : capacity_(capacity) { where_.reserve(capacity); }
    bool access(std::uint64_t key) {
        if (const auto it = where_.find(key); it != where_.end()) {
            order_.splice(order_.begin(), order_, it->second);
            return true;
        }
        if (where_.size() == capacity_) {
            where_.erase(order_.back());
            order_.pop_back();
        }
        order_.push_front(key);
        where_.emplace(key, order_.begin());
        return false;
    }
    bool contains(std::uint64_t key) const { return where_.contains(key); }
    std::size_t size() const { return where_.size(); }

private:
    std::size_t capacity_;
    std::list<std::uint64_t> order_;  // the most recent first
    std::unordered_map<std::uint64_t, std::list<std::uint64_t>::iterator> where_;
};
}  // namespace baseline

}  // namespace w27
