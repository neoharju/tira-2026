// The given LSM-tree store: the write path, the read path, flushes, and
// leveled compaction as in LevelDB.
#include "lsm.hpp"

#include <algorithm>
#include <memory>
#include <stdexcept>

#include "wal.hpp"

namespace w31 {

Lsm::Lsm(LsmOptions options) : levels(static_cast<std::size_t>(options.levels)), opt_(options), compact_pointer_(levels.size(), 0) {}

void Lsm::write(Key key, Kind kind, std::string_view value) {
    const Entry op{key, ++last_seq_, kind, std::string(value)};
    const std::size_t before = log_.size();
    append_record(log_, encode_batch(op.seq, std::span(&op, 1)));  // first the log...
    stats_.log_bytes += log_.size() - before;
    stats_.user_bytes += 8 + value.size();
    mem_.add(key, op.seq, kind, value);  // ...then the memtable
    if (mem_.bytes() >= opt_.memtable_bytes) flush();
}

void Lsm::put(Key key, std::string_view value) { write(key, Kind::put, value); }
void Lsm::del(Key key) { write(key, Kind::del, {}); }

Seq Lsm::snapshot() {
    snapshots_.insert(last_seq_);
    return last_seq_;
}

void Lsm::release(Seq snapshot) {
    const auto it = snapshots_.find(snapshot);
    if (it != snapshots_.end()) snapshots_.erase(it);
}

// Nothing: the key is not in this table. An empty value: it was deleted.
std::optional<std::optional<std::string>> Lsm::search(const Table& t, Key key, Seq snapshot) {
    if (key < t.smallest || key > t.largest) return std::nullopt;
    if (opt_.use_filters && !t.may_contain(key)) {
        ++stats_.filter_skips;
        return std::nullopt;
    }
    ++stats_.table_gets;
    const std::optional<Lookup> r = t.get(key, snapshot);
    if (!r) return std::nullopt;
    if (r->kind == Kind::del) return std::optional<std::string>{};
    return std::optional<std::string>{r->value};
}

std::optional<std::string> Lsm::get(Key key, Seq snapshot) {
    ++stats_.gets;
    if (const auto r = mem_.get(key, snapshot)) {
        if (r->kind == Kind::del) return std::nullopt;
        return r->value;
    }
    for (const File& f : levels[0])  // newest first: the tables of level 0 can overlap
        if (auto r = search(f.table, key, snapshot)) return *r;
    for (std::size_t l = 1; l < levels.size(); ++l) {  // at most one table per level
        const auto& files = levels[l];
        const auto it = std::partition_point(files.begin(), files.end(), [&](const File& f) { return f.table.largest < key; });
        if (it != files.end())
            if (auto r = search(it->table, key, snapshot)) return *r;
    }
    return std::nullopt;
}

void Lsm::flush() {
    if (mem_.size() == 0) return;
    TableBuilder b;
    for (std::uint32_t x = mem_.next(0, 0); x != 0; x = mem_.next(x, 0)) {
        const MemTable::Node& n = mem_.nodes[x];
        b.add(n.key, n.seq, n.kind, mem_.value(n));
    }
    std::string bytes = b.finish();
    stats_.flush_bytes += bytes.size();
    ++stats_.flushes;
    levels[0].insert(levels[0].begin(), File{Table::open(std::make_shared<const std::string>(std::move(bytes))), next_file_++});
    mem_ = MemTable(next_file_);
    log_.clear();  // the versions of the log are in a table now: start a new log
    maybe_compact();
}

void Lsm::crash_and_recover() {
    mem_ = MemTable(next_file_);
    const Recovered r = recover(log_);
    log_.resize(r.valid_bytes);
    for (const std::string& record : r.records) {
        std::vector<Entry> ops;
        if (!decode_batch(record, ops)) throw Corruption("a record of the log is not a write batch");
        for (const Entry& e : ops) {
            mem_.add(e.key, e.seq, e.kind, e.value);
            last_seq_ = std::max(last_seq_, e.seq);
        }
    }
}

// The level with the largest score compacts while a score is at least 1:
// level 0 by its number of tables, the others by their bytes against their
// limit. The last level has no limit.
void Lsm::maybe_compact() {
    for (;;) {
        int best = 0;
        double best_score = static_cast<double>(levels[0].size()) / static_cast<double>(opt_.level0_files);
        double limit = static_cast<double>(opt_.level1_bytes);
        for (std::size_t l = 1; l + 1 < levels.size(); ++l, limit *= 10) {
            std::size_t bytes = 0;
            for (const File& f : levels[l]) bytes += f.table.size();
            const double score = static_cast<double>(bytes) / limit;
            if (score > best_score) best = static_cast<int>(l), best_score = score;
        }
        if (best_score < 1.0) return;
        compact_level(best);
    }
}

// Level 0: all its tables and the tables of level 1 that overlap them.
// Level l > 0: one table, the next after the last compaction of the level
// (round robin, as in LevelDB), and the tables of level l + 1 that overlap it.
void Lsm::compact_level(int level) {
    const auto l = static_cast<std::size_t>(level);
    std::vector<File> upper;
    if (l == 0) {
        upper = levels[0];
    } else {
        const auto& files = levels[l];
        auto it = std::find_if(files.begin(), files.end(), [&](const File& f) { return f.table.smallest > compact_pointer_[l]; });
        if (it == files.end()) it = files.begin();
        upper = {*it};
    }
    Key lo = upper[0].table.smallest, hi = upper[0].table.largest;
    for (const File& f : upper) lo = std::min(lo, f.table.smallest), hi = std::max(hi, f.table.largest);
    std::vector<File> lower, stay;
    for (const File& f : levels[l + 1]) (f.table.largest < lo || f.table.smallest > hi ? stay : lower).push_back(f);
    for (const File& f : lower) lo = std::min(lo, f.table.smallest), hi = std::max(hi, f.table.largest);

    CompactionJob job;
    for (const File& f : upper) job.inputs.push_back(f.table);
    for (const File& f : lower) job.inputs.push_back(f.table);
    job.snapshots.assign(snapshots_.begin(), snapshots_.end());
    job.snapshots.erase(std::unique(job.snapshots.begin(), job.snapshots.end()), job.snapshots.end());
    job.bottom = true;  // unless a deeper level has data in [lo, hi]
    for (std::size_t d = l + 2; d < levels.size(); ++d)
        for (const File& f : levels[d])
            if (!(f.table.largest < lo || f.table.smallest > hi)) job.bottom = false;
    job.target_size = opt_.target_size;
    for (const Table& t : job.inputs) stats_.compaction_read_bytes += t.size();

    std::vector<std::string> out = opt_.parallel_compaction ? compact_parallel(job) : compact(job);
    ++stats_.compactions;
    for (std::string& bytes : out) {
        stats_.compaction_bytes += bytes.size();
        stay.push_back(File{Table::open(std::make_shared<const std::string>(std::move(bytes))), next_file_++});
    }
    std::ranges::sort(stay, [](const File& a, const File& b) { return a.table.smallest < b.table.smallest; });
    levels[l + 1] = std::move(stay);
    if (l == 0) {
        levels[0].clear();
    } else {
        std::erase_if(levels[l], [&](const File& f) { return f.number == upper[0].number; });
        compact_pointer_[l] = upper[0].table.largest;
    }
}

std::size_t Lsm::table_bytes() const {
    std::size_t bytes = 0;
    for (const auto& files : levels)
        for (const File& f : files) bytes += f.table.size();
    return bytes;
}

std::string Lsm::shape() const {
    std::string s;
    for (const auto& files : levels) s += (s.empty() ? "" : " ") + std::to_string(files.size());
    return s;
}

void Lsm::validate() const {
    for (std::size_t l = 1; l < levels.size(); ++l)
        for (std::size_t i = 0; i < levels[l].size(); ++i) {
            const Table& t = levels[l][i].table;
            if (t.versions == 0 || t.smallest > t.largest) throw std::logic_error("validate: an empty or broken table on level " + std::to_string(l));
            if (i > 0 && !(levels[l][i - 1].table.largest < t.smallest))
                throw std::logic_error("validate: the tables of level " + std::to_string(l) + " overlap or are not sorted");
        }
}

}  // namespace w31
