// Task 2: add and get of the skip list, as memtable.hpp describes. A search
// goes right on a level while the next node is smaller than the target in the
// internal order (internal_less), and down one level when it is not. add
// remembers the last node before the new one on each level: these nodes get
// the new node as their next node.
#include "memtable.hpp"

namespace w31 {

void MemTable::add(Key key, Seq seq, Kind kind, std::string_view value) {
    (void)key;  // TODO
    (void)seq;
    (void)kind;
    (void)value;
}

std::optional<Lookup> MemTable::get(Key key, Seq snapshot) const {
    (void)key;  // TODO
    (void)snapshot;
    return std::nullopt;
}

}  // namespace w31
