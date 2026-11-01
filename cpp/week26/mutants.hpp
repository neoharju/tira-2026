// Week 26: small ordered maps for testing your fuzz harness (task 5). This
// file is given. SortedVectorMap is correct; every Mutant has one bug, the
// kind of bug that a differential fuzzer must find. The grader has more of them.
#pragma once
#include <algorithm>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>

#include "bplus.hpp"

namespace w26 {

// An ordered map in a sorted vector: slow for big maps, but simple and right.
// It has the operations of BPlusTree, and validate() checks the order.
class SortedVectorMap {
public:
    bool insert(Key key, Value value) {
        const auto it = lower(key);
        if (it != v.end() && it->first == key) {
            it->second = value;
            return false;
        }
        v.insert(it, {key, value});
        return true;
    }
    bool erase(Key key) {
        const auto it = lower(key);
        if (it == v.end() || it->first != key) return false;
        v.erase(it);
        return true;
    }
    std::optional<Value> find(Key key) const {
        const auto it = lower(key);
        if (it == v.end() || it->first != key) return std::nullopt;
        return it->second;
    }
    void scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out) const {
        for (auto it = lower(lo); it != v.end() && it->first <= hi; ++it) out.push_back(*it);
    }
    std::size_t size() const { return v.size(); }
    void validate() const {
        for (std::size_t i = 1; i < v.size(); ++i)
            if (v[i - 1].first >= v[i].first) throw std::logic_error("SortedVectorMap: keys out of order");
    }

protected:
    std::vector<std::pair<Key, Value>> v;
    std::vector<std::pair<Key, Value>>::iterator lower(Key key) {
        return std::ranges::lower_bound(v, key, {}, &std::pair<Key, Value>::first);
    }
    std::vector<std::pair<Key, Value>>::const_iterator lower(Key key) const {
        return std::ranges::lower_bound(v, key, {}, &std::pair<Key, Value>::first);
    }
};

// Bug: inserting a key that is already there keeps the old value.
struct MutantKeepsOldValue : SortedVectorMap {
    bool insert(Key key, Value value) {
        const auto it = lower(key);
        if (it != v.end() && it->first == key) return false;
        v.insert(it, {key, value});
        return true;
    }
};

// Bug: erasing a key that is not there says that it was.
struct MutantEraseSaysYes : SortedVectorMap {
    bool erase(Key key) {
        SortedVectorMap::erase(key);
        return true;
    }
};

// Bug: the scan leaves out the key hi itself.
struct MutantScanWithoutHi : SortedVectorMap {
    void scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out) const {
        for (auto it = lower(lo); it != v.end() && it->first < hi; ++it) out.push_back(*it);
    }
};

// Bug: the size counts a key again when its value is replaced.
struct MutantSizeCountsReplace : SortedVectorMap {
    bool insert(Key key, Value value) {
        ++inserts;
        return SortedVectorMap::insert(key, value);
    }
    bool erase(Key key) {
        const bool erased = SortedVectorMap::erase(key);
        inserts -= erased;
        return erased;
    }
    std::size_t size() const { return inserts; }
    std::size_t inserts = 0;
};

// Bug: like a wrong split, the map loses its middle key when it gets its
// 65th key (only maps with more than one leaf of keys show it).
struct MutantLosesKeyOnSplit : SortedVectorMap {
    bool insert(Key key, Value value) {
        const bool added = SortedVectorMap::insert(key, value);
        if (added && v.size() == leaf_capacity + 1) v.erase(v.begin() + 32);
        return added;
    }
};

// Bug: the keys are ordered as signed numbers, so keys of 2^63 or more come
// before the small ones. find, insert and erase still work; scans do not.
struct MutantSignedOrder : SortedVectorMap {
    static bool before(const std::pair<Key, Value>& a, Key b) { return static_cast<std::int64_t>(a.first) < static_cast<std::int64_t>(b); }
    bool insert(Key key, Value value) {
        const auto it = std::lower_bound(v.begin(), v.end(), key, before);
        if (it != v.end() && it->first == key) {
            it->second = value;
            return false;
        }
        v.insert(it, {key, value});
        return true;
    }
    bool erase(Key key) {
        const auto it = std::lower_bound(v.begin(), v.end(), key, before);
        if (it == v.end() || it->first != key) return false;
        v.erase(it);
        return true;
    }
    std::optional<Value> find(Key key) const {
        const auto it = std::lower_bound(v.begin(), v.end(), key, before);
        if (it == v.end() || it->first != key) return std::nullopt;
        return it->second;
    }
    void scan(Key lo, Key hi, std::vector<std::pair<Key, Value>>& out) const {
        for (auto it = std::lower_bound(v.begin(), v.end(), lo, before); it != v.end() && it->first <= hi; ++it) out.push_back(*it);
    }
    void validate() const {}
};

// Bug: find misses the smallest key of the map.
struct MutantFindMissesFirst : SortedVectorMap {
    std::optional<Value> find(Key key) const {
        if (!v.empty() && v.front().first == key) return std::nullopt;
        return SortedVectorMap::find(key);
    }
};

}  // namespace w26
