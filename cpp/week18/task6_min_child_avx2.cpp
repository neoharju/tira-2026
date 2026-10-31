// Task 6: find the smallest of the 8 children with AVX2 (see the chapter).
#include <immintrin.h>

#include <bit>

#include "heap8.hpp"

namespace w18 {

std::size_t MinChildAvx2::min_child(const std::uint64_t* a, std::size_t h) {
    (void)a;
    return 8 * h + 1;  // TODO: this always returns the first child
}

}  // namespace w18
