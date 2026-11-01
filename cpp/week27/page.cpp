// The given parts of the slotted page.
#include <algorithm>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "page.hpp"

namespace w27 {

SlottedPage::SlottedPage() {
    std::memset(bytes, 0, page_size);
    store16(2, static_cast<std::uint16_t>(page_size));
}

std::span<const std::byte> SlottedPage::get(SlotId slot) const {
    if (slot >= slot_count() || slot_offset(slot) == 0) return {};
    return {bytes + slot_offset(slot), slot_length(slot)};
}

void SlottedPage::validate() const {
    auto broken = [](const std::string& what) { throw std::logic_error("SlottedPage::validate: " + what); };
    const std::size_t n = slot_count(), end = free_end();
    if (header_size + slot_size * n > end) broken("the slots and the records overlap");
    if (end > page_size) broken("free_end is past the end of the page");
    std::vector<std::pair<std::size_t, std::size_t>> records;
    std::size_t live = 0;
    for (SlotId s = 0; s < n; ++s) {
        const std::size_t offset = slot_offset(s), length = slot_length(s);
        if (offset == 0) {
            if (length != 0) broken("free slot " + std::to_string(s) + " has a length");
            continue;
        }
        if (length == 0 || length > max_record) broken("slot " + std::to_string(s) + " has a bad length");
        if (offset < end || offset + length > page_size) broken("the record of slot " + std::to_string(s) + " is outside the records area");
        records.emplace_back(offset, offset + length);
        live += length;
    }
    std::ranges::sort(records);
    for (std::size_t i = 1; i < records.size(); ++i)
        if (records[i].first < records[i - 1].second) broken("two records overlap");
    if (garbage() != page_size - end - live) broken("garbage is not the size of the records area minus the live records");
}

}  // namespace w27
