// Task 4: erase a key. A page that falls below 32 keys borrows from a sibling
// that has more than 32, or merges with a sibling; a merge removes a key and a
// child from the parent, which may then fall below 32 too. A root without keys
// gives its place to its only child.
#include "tasks.hpp"

namespace w26 {

bool BPlusTree::erase(Key key) {
    (void)key;  // TODO
    return false;
}

}  // namespace w26
