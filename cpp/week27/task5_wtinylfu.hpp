// Task 5: W-TinyLFU, the cache policy of Caffeine (Einziger, Friedman and
// Manes, 2017). Now this is a plain LRU cache: it is correct, but it keeps
// every new key and so it loses its popular keys to scans. Rewrite it:
//
//  - A window: an LRU list of max(1, capacity / 100) keys. Every new key
//    enters here.
//  - A main part for the other keys: a segmented LRU with a protected list
//    of at most 80 % of the main part and a probation list for the rest.
//  - A frequency sketch (task 4) that counts every access: access(k) first
//    calls sketch.increment(k).
//
// access(k), after the increment:
//  - k in the window: k moves to the front (most recent end) of the window. A hit.
//  - k in probation: k moves to the front of protected. If protected is then
//    too large, its last key moves to the front of probation. A hit.
//  - k in protected: k moves to the front of protected. A hit.
//  - Otherwise (a miss) k goes to the front of the window. If the window is
//    then too large, its last key c leaves the window. If the main part has
//    room, c goes to the front of probation. Otherwise TinyLFU decides: the
//    victim v is the last key of probation (of protected if probation is
//    empty); if sketch.estimate(c) > sketch.estimate(v), v is evicted and c
//    goes to the front of probation, otherwise c is evicted.
//
// Use the same rules, so that every correct solution gives the same hits.
#pragma once
#include <cstddef>
#include <cstdint>
#include <list>
#include <unordered_map>

#include "sketch.hpp"

namespace w27 {

template <class Sketch = FrequencySketch>
class WTinyLfu {
public:
    explicit WTinyLfu(std::size_t capacity) : capacity_(capacity), sketch_(sketch_for_cache<Sketch>(capacity)) {}

    // True on a hit; on a miss the key is put in the cache.
    bool access(std::uint64_t key) {
        sketch_.increment(key);
        if (const auto it = where_.find(key); it != where_.end()) {  // TODO: this is LRU
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
    const Sketch& sketch() const { return sketch_; }

private:
    std::size_t capacity_;
    Sketch sketch_;
    std::list<std::uint64_t> order_;
    std::unordered_map<std::uint64_t, std::list<std::uint64_t>::iterator> where_;
};

}  // namespace w27
