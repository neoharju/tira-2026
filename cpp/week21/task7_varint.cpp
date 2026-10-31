// Task 7: delta and varint coding of posting lists.
#include "tasks.hpp"

namespace w21 {

std::vector<std::uint8_t> encode(std::span<const DocId> postings) {
    (void)postings;  // TODO
    return {};
}

std::vector<DocId> decode(std::span<const std::uint8_t> bytes, std::size_t count) {
    (void)bytes;  // TODO
    (void)count;
    return {};
}

}  // namespace w21
