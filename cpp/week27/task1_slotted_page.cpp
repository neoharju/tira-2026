// Task 1: insert, erase and compact of the slotted page, as page.hpp
// describes. Keep the header, the slots and the records consistent:
// SlottedPage::validate() checks them in the tests.
#include "page.hpp"

namespace w27 {

std::optional<SlotId> SlottedPage::insert(std::span<const std::byte> record) {
    (void)record;  // TODO
    return std::nullopt;
}

bool SlottedPage::erase(SlotId slot) {
    (void)slot;  // TODO
    return false;
}

void SlottedPage::compact() {
    // TODO
}

}  // namespace w27
