// Task 6: the split-block Bloom filter in scalar code, exactly as bloom.hpp
// describes. Now insert does nothing and may_contain always says "maybe":
// that is a correct filter (it never says "no" for a key that is there), but
// it filters nothing.
#include "bloom.hpp"

namespace w31 {

void SplitBlockBloom::insert(std::uint64_t hash) {
    (void)hash;  // TODO
}

bool SplitBlockBloom::may_contain(std::uint64_t hash) const {
    (void)hash;  // TODO
    return true;
}

}  // namespace w31
