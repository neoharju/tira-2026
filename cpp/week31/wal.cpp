// The given parts of the log: write batches and the simulated file.
#include "wal.hpp"

#include <algorithm>

namespace w31 {

std::string encode_batch(Seq first, std::span<const Entry> ops) {
    std::string out;
    put_u64(out, first);
    put_u32(out, static_cast<std::uint32_t>(ops.size()));
    for (const Entry& op : ops) {
        out.push_back(static_cast<char>(op.kind));
        put_u64(out, op.key);
        if (op.kind == Kind::put) {
            put_varint32(out, static_cast<std::uint32_t>(op.value.size()));
            out += op.value;
        }
    }
    return out;
}

bool decode_batch(std::string_view in, std::vector<Entry>& ops) {
    if (in.size() < 12) return false;
    const Seq first = get_u64(in.data());
    const std::uint32_t count = get_u32(in.data() + 8);
    in.remove_prefix(12);
    std::vector<Entry> got;
    for (std::uint32_t i = 0; i < count; ++i) {
        if (in.size() < 9) return false;
        const auto kind = static_cast<Kind>(in[0]);
        if (kind != Kind::put && kind != Kind::del) return false;
        Entry e{get_u64(in.data() + 1), first + i, kind, {}};
        in.remove_prefix(9);
        if (kind == Kind::put) {
            std::uint32_t n = 0;
            if (!get_varint32(in, n) || in.size() < n) return false;
            e.value.assign(in.substr(0, n));
            in.remove_prefix(n);
        }
        got.push_back(std::move(e));
    }
    if (!in.empty()) return false;
    ops.insert(ops.end(), std::make_move_iterator(got.begin()), std::make_move_iterator(got.end()));
    return true;
}

std::string SimFile::crash(std::mt19937_64& rng) const {
    const std::size_t unsynced = data_.size() - synced_;
    const std::size_t kept = synced_ + static_cast<std::size_t>(rng() % (unsynced + 1));
    std::string disk = data_.substr(0, kept);
    // Half of the time, up to 16 of the last bytes that were not synced are
    // garbage: a sector that was half written.
    if (kept > synced_ && rng() % 2 == 0) {
        const std::size_t n = std::min<std::size_t>(kept - synced_, 1 + rng() % 16);
        for (std::size_t i = kept - n; i < kept; ++i) disk[i] = static_cast<char>(rng());
    }
    return disk;
}

}  // namespace w31
