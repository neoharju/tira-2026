// Task 7: the split-block Bloom filter with AVX2: the same bits as task 6.
// Put x in all 8 lanes, multiply by the 8 salts in one instruction, shift the
// products right by 27, and shift 1 left by these 8 numbers (each lane by its
// own amount): that is the mask of the 8 bits. insert ORs the mask into the
// block; may_contain tests that the block has every bit of the mask
// (_mm256_testc_si256). Automatic vectorization is off for this file. Now
// these call your scalar code.
#include <immintrin.h>

#include "bloom.hpp"

namespace w31 {

void SplitBlockBloom::insert_avx2(std::uint64_t hash) {
    insert(hash);  // TODO
}

bool SplitBlockBloom::may_contain_avx2(std::uint64_t hash) const {
    return may_contain(hash);  // TODO
}

}  // namespace w31
