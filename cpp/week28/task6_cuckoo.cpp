// Task 6: find, insert and erase of the cuckoo table, as cuckoo.hpp
// describes. A lookup reads only the two buckets of the key: compute both
// before you read either, so that the two cache misses overlap.
#include "cuckoo.hpp"

namespace w28 {

std::optional<Value> CuckooMap::find(Key key) const {
    (void)key;  // TODO
    return std::nullopt;
}

bool CuckooMap::insert(Key key, Value value) {
    (void)key;  // TODO
    (void)value;
    return false;
}

bool CuckooMap::erase(Key key) {
    (void)key;  // TODO
    return false;
}

}  // namespace w28
