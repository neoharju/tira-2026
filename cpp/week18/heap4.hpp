// Task 4: a 4-ary min-heap of 64-bit keys. Replace the std::priority_queue
// with your own array: the children of index i are 4i+1, 4i+2, 4i+3, 4i+4
// and the parent of index i > 0 is (i - 1) / 4.
#pragma once
#include <cstdint>
#include <functional>
#include <queue>
#include <vector>

namespace w18 {

class Heap4 {
public:
    void push(std::uint64_t key) { q_.push(key); }
    // Removes and returns the smallest key. The heap must not be empty.
    std::uint64_t pop() {
        std::uint64_t key = q_.top();
        q_.pop();
        return key;
    }
    bool empty() const { return q_.empty(); }
    std::size_t size() const { return q_.size(); }
    void clear() { q_ = {}; }

private:
    std::priority_queue<std::uint64_t, std::vector<std::uint64_t>, std::greater<>> q_;
};

}  // namespace w18
