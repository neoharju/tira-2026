// Task 3: the lookup in a table, as table.hpp describes. std::partition_point
// does the binary search on the index. A crc finds bytes that the disk
// changed by accident, but anybody can compute a correct crc for any bytes:
// decode the block with decode_entry, which checks every length, and never
// read past the trailer.
#include <algorithm>

#include "crc32c.hpp"
#include "table.hpp"

namespace w31 {

std::optional<Lookup> Table::get(Key key, Seq snapshot) const {
    (void)key;  // TODO
    (void)snapshot;
    return std::nullopt;
}

}  // namespace w31
