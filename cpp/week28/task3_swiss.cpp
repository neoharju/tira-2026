// Task 3: find and insert of the Swiss table, as swiss.hpp describes, with
// the group functions of Group (ScalarGroup, or SseGroup of task 5). The
// lines at the end compile your code for both. Automatic vectorization is off
// for this file, so that ScalarGroup stays scalar.
#include "swiss.hpp"
#include "task5_group_sse.hpp"

namespace w28 {

template <class Group>
std::optional<Value> SwissMap<Group>::find(Key key) const {
    (void)key;  // TODO
    return std::nullopt;
}

template <class Group>
bool SwissMap<Group>::insert(Key key, Value value) {
    (void)key;  // TODO
    (void)value;
    return false;
}

template std::optional<Value> SwissMap<ScalarGroup>::find(Key) const;
template bool SwissMap<ScalarGroup>::insert(Key, Value);
template std::optional<Value> SwissMap<SseGroup>::find(Key) const;
template bool SwissMap<SseGroup>::insert(Key, Value);

}  // namespace w28
