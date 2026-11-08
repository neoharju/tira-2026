// Task 7: the check of a history, as history.hpp describes. Sort the committed
// transactions by their commit timestamps, and keep for each key the list of
// its committed values with their timestamps: the value of a key at a
// snapshot is then a binary search in its list. Rule 4 compares each writer of
// a key with the writer of the same key just before it.
#include <algorithm>
#include <map>
#include <unordered_map>

#include "history.hpp"

namespace w32 {

std::optional<std::string> check_history(const History& h) {
    (void)h;  // TODO
    return std::nullopt;
}

}  // namespace w32
