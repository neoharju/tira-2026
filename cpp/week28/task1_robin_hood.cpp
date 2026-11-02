// Task 1: find, insert and erase of the Robin Hood table, as robin_hood.hpp
// describes.
#include "robin_hood.hpp"

namespace w28 {

std::optional<Value> RobinHoodMap::find(Key key) const {
    (void)key;  // TODO
    return std::nullopt;
}

bool RobinHoodMap::insert(Key key, Value value) {
    (void)key;  // TODO
    (void)value;
    return false;
}

bool RobinHoodMap::erase(Key key) {
    (void)key;  // TODO
    return false;
}

}  // namespace w28
