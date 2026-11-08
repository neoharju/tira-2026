// Week 31: the parts that every other file uses: keys, sequence numbers,
// versions and their order, and the encoding of numbers in bytes.
#pragma once
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <string_view>

namespace w31 {

using Key = std::uint64_t;  // keys are 64-bit numbers, as in weeks 26-30
using Seq = std::uint64_t;  // sequence numbers: every write gets the next one

// The largest sequence number: a tag keeps the number in its top 56 bits.
inline constexpr Seq max_seq = (Seq{1} << 56) - 1;

// A version is a put (a key gets a value) or a delete. A delete is stored as
// a version too, a "tombstone": it hides the older versions of its key.
enum class Kind : std::uint8_t { del = 0, put = 1 };

// The tag of a version, as in LevelDB: the sequence number and the kind in
// one 64-bit number.
constexpr std::uint64_t make_tag(Seq seq, Kind kind) { return seq << 8 | static_cast<std::uint64_t>(kind); }
constexpr Seq tag_seq(std::uint64_t tag) { return tag >> 8; }
constexpr Kind tag_kind(std::uint64_t tag) { return static_cast<Kind>(tag & 0xFF); }

// One version of a key.
struct Entry {
    Key key = 0;
    Seq seq = 0;
    Kind kind = Kind::put;
    std::string value;  // empty for a delete

    friend bool operator==(const Entry&, const Entry&) = default;
};

// The internal order of versions: by key, smallest first, and the versions of
// one key by sequence number, newest (largest) first. The memtable, the tables
// and the compactions all keep this order. No two versions of a key have the
// same sequence number.
constexpr bool internal_less(Key a, Seq a_seq, Key b, Seq b_seq) { return a < b || (a == b && a_seq > b_seq); }
inline bool internal_less(const Entry& a, const Entry& b) { return internal_less(a.key, a.seq, b.key, b.seq); }

// The answer of a lookup: the newest version that the reader may see. A
// delete says that the key has no value, and that older data must not be
// searched.
struct Lookup {
    Kind kind = Kind::put;
    std::string value;

    friend bool operator==(const Lookup&, const Lookup&) = default;
};

// Bytes on the disk that are not what was written. The readers throw it.
struct Corruption : std::runtime_error {
    using std::runtime_error::runtime_error;
};

// Numbers in bytes, little-endian (the byte order of x86-64 and ARM, so a
// memcpy is enough). The bytes are in a std::string, which can hold any byte,
// also 0. std::memcpy of a small fixed size compiles to one load or store,
// and unlike a pointer cast it is correct for any address (chapter 27).
inline void put_u32(std::string& out, std::uint32_t v) {
    char b[4];
    std::memcpy(b, &v, 4);
    out.append(b, 4);
}
inline void put_u64(std::string& out, std::uint64_t v) {
    char b[8];
    std::memcpy(b, &v, 8);
    out.append(b, 8);
}
inline std::uint32_t get_u32(const char* p) {
    std::uint32_t v;
    std::memcpy(&v, p, 4);
    return v;
}
inline std::uint64_t get_u64(const char* p) {
    std::uint64_t v;
    std::memcpy(&v, p, 8);
    return v;
}

// A varint (LEB128, as in LevelDB and Protocol Buffers): 7 bits per byte,
// lowest bits first; the top bit of a byte says that more bytes follow. A
// 32-bit number takes 1 to 5 bytes: 100 takes one byte, 1000 two.
inline void put_varint32(std::string& out, std::uint32_t v) {
    while (v >= 128) {
        out.push_back(static_cast<char>(v | 128));
        v >>= 7;
    }
    out.push_back(static_cast<char>(v));
}

// Reads a varint from the start of `in` and removes its bytes from `in`.
// Returns false, and leaves `in` as it was, if `in` ends before the varint
// does or if the varint has more than 5 bytes.
inline bool get_varint32(std::string_view& in, std::uint32_t& v) {
    std::uint32_t result = 0;
    for (std::size_t i = 0; i < 5 && i < in.size(); ++i) {
        const auto byte = static_cast<unsigned char>(in[i]);
        result |= static_cast<std::uint32_t>(byte & 127) << (7 * i);
        if (byte < 128) {
            if (i == 4 && byte > 15) return false;  // more than 32 bits
            v = result;
            in.remove_prefix(i + 1);
            return true;
        }
    }
    return false;
}

}  // namespace w31
