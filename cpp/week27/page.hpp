// Week 27: a slotted page, the format in which databases keep records of
// different sizes in one page of the disk. You write insert, erase and compact
// (task 1, in task1_slotted_page.cpp); the rest is given (page.cpp).
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <optional>
#include <span>

namespace w27 {

inline constexpr std::size_t page_size = 4096;
using SlotId = std::uint16_t;

// The 4096 bytes of a page: a header, an array of slots that grows up from the
// header, free space, and the records, which grow down from the end:
//
//   | header | slot 0 | slot 1 | ... | slot n-1 |  free space  |  records  |
//   0        8                      free_begin   free_end                4096
//
// - The header has four 16-bit numbers: n (the number of slots), free_end
//   (the first byte of the records area), garbage (bytes of erased records
//   that are still in the records area) and one that is not used.
//   free_begin is not stored: it is 8 + 4n.
// - A slot has two 16-bit numbers: the offset of its record in the page and
//   the record's length. A free slot has offset 0 and length 0: its record was
//   erased, and insert may give its id to a new record.
// - A record has 1 to max_record bytes.
// The page holds no pointers, only offsets, so it can be written to the disk
// and read back (or copied with memcpy) as it is.
struct SlottedPage {
    static constexpr std::size_t header_size = 8, slot_size = 4;
    static constexpr std::size_t max_record = page_size - header_size - slot_size;

    alignas(64) std::byte bytes[page_size];

    SlottedPage();  // an empty page: no slots, free_end = 4096, garbage = 0

    // Task 1. Stores a copy of the record and returns its slot id, or returns
    // nothing if the page has no room for it; then the page does not change.
    // The id is the smallest free slot if there is one, otherwise a new slot n.
    // The record goes just below free_end. If the free space between the slots
    // and the records is too small, but would be enough after compact(), insert
    // compacts the page first.
    std::optional<SlotId> insert(std::span<const std::byte> record);

    // Task 1. Erases the record of the slot and returns true, or returns false
    // if the slot does not exist or is free. The slot becomes free, and the
    // record's bytes become garbage.
    bool erase(SlotId slot);

    // Task 1. Moves the records together at the end of the page, so that the
    // garbage is 0 and the free space is one piece. The slot ids and the
    // records do not change.
    void compact();

    // The record of a slot, or an empty span if the slot is free or missing.
    std::span<const std::byte> get(SlotId slot) const;

    std::uint16_t slot_count() const { return load16(0); }
    std::uint16_t free_end() const { return load16(2); }
    std::uint16_t garbage() const { return load16(4); }
    std::size_t free_begin() const { return header_size + slot_size * slot_count(); }
    // The bytes that insert can use without compacting.
    std::size_t free_space() const { return free_end() - free_begin(); }

    // Checks the format: the slots, the records and the header agree. Throws
    // std::logic_error with a message if something is wrong.
    void validate() const;

    // The 16-bit numbers of the page (memcpy: the page has no alignment rules).
    std::uint16_t load16(std::size_t at) const {
        std::uint16_t v;
        std::memcpy(&v, bytes + at, sizeof v);
        return v;
    }
    void store16(std::size_t at, std::uint16_t v) { std::memcpy(bytes + at, &v, sizeof v); }
    // Slot s: its offset is at byte 8 + 4s and its length at byte 10 + 4s.
    std::uint16_t slot_offset(SlotId s) const { return load16(header_size + slot_size * s); }
    std::uint16_t slot_length(SlotId s) const { return load16(header_size + slot_size * s + 2); }
};

}  // namespace w27
