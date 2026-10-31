// Week 18: an 8-ary min-heap whose 8 children of a node are one cache line.
// The heap is given; in tasks 5 and 6 you write the function that finds the
// smallest child, with AVX-512 and with AVX2.
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <new>

namespace w18 {

// Heap index h (the root is 0) is stored in slot h + 7 of an array that starts
// at a 64-byte boundary. The children of h are the heap indices 8h+1, ...,
// 8h+8, so they are in the slots 8h+8, ..., 8h+15: one aligned cache line.
// Empty slots hold EMPTY, the largest key, so every group of 8 is full.
inline constexpr std::uint64_t EMPTY = ~std::uint64_t{0};

// Task 5. Returns the heap index of the smallest of the 8 children of h, the
// keys a[8h+8], ..., a[8h+15]. If several are equal, the leftmost one.
// a + 8h + 8 is a multiple of 64 bytes. Use AVX-512 instructions.
struct MinChildAvx512 {
    [[gnu::target("avx512f")]] static std::size_t min_child(const std::uint64_t* a, std::size_t h);
};

// Task 6. The same with AVX2 instructions (two 256-bit registers).
struct MinChildAvx2 {
    static std::size_t min_child(const std::uint64_t* a, std::size_t h);
};

// The same in plain C++, for comparison and for the tests.
struct MinChildScalar {
    static std::size_t min_child(const std::uint64_t* a, std::size_t h) {
        const std::uint64_t* c = a + 8 * h + 8;
        std::size_t best = 0;
        for (std::size_t j = 1; j < 8; ++j)
            if (c[j] < c[best]) best = j;
        return 8 * h + 1 + best;
    }
};

template <class Kernel>
class Heap8 {
public:
    Heap8() { grow(64); }
    ~Heap8() { ::operator delete(a_, std::align_val_t{64}); }
    Heap8(const Heap8&) = delete;
    Heap8& operator=(const Heap8&) = delete;

    bool empty() const { return n_ == 0; }
    std::size_t size() const { return n_; }
    void clear() {
        std::fill(a_, a_ + std::min(cap_, n_ + 7 + 16), EMPTY);
        n_ = 0;
    }

    void push(std::uint64_t key) {
        if (n_ + 7 + 16 > cap_) grow(2 * cap_);  // room for the new key's group of 8
        std::size_t h = n_++;
        while (h > 0) {  // move the hole up while the parent is larger
            std::size_t parent = (h - 1) / 8;
            std::uint64_t pk = a_[parent + 7];
            if (pk <= key) break;
            a_[h + 7] = pk;
            h = parent;
        }
        a_[h + 7] = key;
    }

    // Removes and returns the smallest key. The heap must not be empty.
    std::uint64_t pop() {
        std::uint64_t top = a_[7];
        --n_;
        std::uint64_t key = a_[n_ + 7];  // the last key fills the hole at the root
        a_[n_ + 7] = EMPTY;
        if (n_ == 0) return top;
        std::size_t h = 0;
        while (8 * h + 1 < n_) {  // while h has at least one child
            std::size_t c = Kernel::min_child(a_, h);
            std::uint64_t ck = a_[c + 7];
            if (ck >= key) break;
            a_[h + 7] = ck;
            h = c;
        }
        a_[h + 7] = key;
        return top;
    }

private:
    void grow(std::size_t slots) {
        auto* b = static_cast<std::uint64_t*>(::operator new(slots * sizeof(std::uint64_t), std::align_val_t{64}));
        std::fill(b, b + slots, EMPTY);
        if (a_) {
            std::memcpy(b, a_, cap_ * sizeof(std::uint64_t));
            ::operator delete(a_, std::align_val_t{64});
        }
        a_ = b;
        cap_ = slots;
    }

    std::uint64_t* a_ = nullptr;
    std::size_t n_ = 0;    // keys in the heap
    std::size_t cap_ = 0;  // slots in a_
};

}  // namespace w18
