// Task 4: erase of the Swiss table with the empty-or-deleted rule of swiss.hpp.
#include "swiss.hpp"
#include "task5_group_sse.hpp"

namespace w28 {

template <class Group>
bool SwissMap<Group>::erase(Key key) {
    (void)key;  // TODO
    return false;
}

template bool SwissMap<ScalarGroup>::erase(Key);
template bool SwissMap<SseGroup>::erase(Key);

}  // namespace w28
