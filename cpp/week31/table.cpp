// The given parts of the tables: the writer, opening a table, and the
// iterator.
#include "table.hpp"

#include <algorithm>
#include <cstring>
#include <stdexcept>

#include "crc32c.hpp"

namespace w31 {

namespace {

// The crc at the end of a block covers every byte before it.
bool crc_ok(std::string_view block) {
    return block.size() >= 4 && crc32c(block.substr(0, block.size() - 4)) == get_u32(block.data() + block.size() - 4);
}

}  // namespace

void TableBuilder::add(Key key, Seq seq, Kind kind, std::string_view value) {
    if (count_ > 0 && !internal_less(last_key_, last_seq_, key, seq)) throw std::logic_error("TableBuilder::add: the versions are not in the internal order");
    if (seq > max_seq) throw std::logic_error("TableBuilder::add: the sequence number is too large");
    if (count_ == 0) smallest_ = key;
    if (count_ == 0 || key != last_key_) keys_.push_back(key);
    put_u64(block_, key);
    put_u64(block_, make_tag(seq, kind));
    put_varint32(block_, static_cast<std::uint32_t>(value.size()));
    block_ += value;
    ++in_block_;
    ++count_;
    last_key_ = key;
    last_seq_ = seq;
    if (block_.size() >= block_size_) end_block();
}

void TableBuilder::end_block() {
    put_u64(index_, last_key_);
    put_u64(index_, last_seq_);
    put_u64(index_, out_.size());
    put_u32(index_, static_cast<std::uint32_t>(block_.size() + 8));
    put_u32(block_, in_block_);
    put_u32(block_, crc32c(block_));
    out_ += block_;
    block_.clear();
    in_block_ = 0;
}

std::string TableBuilder::finish() {
    if (in_block_ > 0) end_block();
    // The filter block: the words of the filter, then the trailer.
    SplitBlockBloom filter = SplitBlockBloom::for_keys(keys_.size());
    for (const Key k : keys_) filter.insert(hash_key(k));
    const std::uint64_t filter_offset = out_.size();
    std::string fb(filter.blocks.size() * sizeof(BloomBlock), '\0');
    std::memcpy(fb.data(), filter.blocks.data(), fb.size());
    put_u32(fb, static_cast<std::uint32_t>(filter.blocks.size()));
    put_u32(fb, crc32c(fb));
    out_ += fb;
    // The index block.
    const std::uint64_t index_offset = out_.size();
    std::string ib = std::move(index_);
    put_u32(ib, static_cast<std::uint32_t>(ib.size() / index_entry_size));
    put_u32(ib, crc32c(ib));
    out_ += ib;
    // The footer.
    put_u64(out_, filter_offset);
    put_u64(out_, fb.size());
    put_u64(out_, index_offset);
    put_u64(out_, ib.size());
    put_u64(out_, count_);
    put_u64(out_, smallest_);
    put_u64(out_, table_magic);
    std::string table = std::move(out_);
    *this = TableBuilder(block_size_);
    return table;
}

bool decode_entry(std::string_view& in, Key& key, Seq& seq, Kind& kind, std::string_view& value) {
    std::string_view p = in;
    if (p.size() < 16) return false;
    key = get_u64(p.data());
    const std::uint64_t tag = get_u64(p.data() + 8);
    kind = tag_kind(tag);
    seq = tag_seq(tag);
    if (kind != Kind::put && kind != Kind::del) return false;
    p.remove_prefix(16);
    std::uint32_t n = 0;
    if (!get_varint32(p, n) || p.size() < n) return false;
    value = p.substr(0, n);
    p.remove_prefix(n);
    in = p;
    return true;
}

Table Table::open(std::shared_ptr<const std::string> file) {
    if (!file) throw Corruption("no file");
    const std::string_view f = *file;
    if (f.size() < footer_size) throw Corruption("the file is too small for a footer");
    const char* foot = f.data() + f.size() - footer_size;
    const std::uint64_t filter_offset = get_u64(foot), filter_size = get_u64(foot + 8);
    const std::uint64_t index_offset = get_u64(foot + 16), index_size = get_u64(foot + 24);
    if (get_u64(foot + 48) != table_magic) throw Corruption("the magic number is wrong: this is not a table");
    // The parts must fill the file exactly: data | filter | index | footer.
    // Each check is written so that no sum can overflow.
    const std::uint64_t body = f.size() - footer_size;
    if (index_size < 8 || index_size > body || index_offset != body - index_size) throw Corruption("the index block is not where the footer says");
    if (filter_size < 8 || filter_size > index_offset || filter_offset != index_offset - filter_size) throw Corruption("the filter block is not where the footer says");
    const std::string_view ib = f.substr(index_offset, index_size);
    if (!crc_ok(ib)) throw Corruption("the crc of the index block is wrong");
    const std::uint32_t blocks = get_u32(ib.data() + ib.size() - 8);
    if (std::uint64_t{blocks} * index_entry_size + 8 != index_size) throw Corruption("the index block has a wrong size");

    Table t;
    t.index.reserve(blocks);
    std::uint64_t at = 0;
    for (std::uint32_t i = 0; i < blocks; ++i) {
        const char* p = ib.data() + i * index_entry_size;
        const IndexEntry e{get_u64(p), get_u64(p + 8), get_u64(p + 16), get_u32(p + 24)};
        if (e.offset != at || e.size < 8 || e.size > filter_offset - at) throw Corruption("a data block is not where the index says");
        if (e.last_seq > max_seq) throw Corruption("a sequence number in the index is too large");
        if (i > 0 && !internal_less(t.index.back().last_key, t.index.back().last_seq, e.last_key, e.last_seq)) throw Corruption("the index is not in order");
        at += e.size;
        t.index.push_back(e);
    }
    if (at != filter_offset) throw Corruption("the data blocks do not end where the filter block begins");
    const std::string_view fb = f.substr(filter_offset, filter_size);
    if (!crc_ok(fb)) throw Corruption("the crc of the filter block is wrong");
    const std::uint32_t filter_blocks = get_u32(fb.data() + fb.size() - 8);
    if (filter_blocks == 0 || std::uint64_t{filter_blocks} * sizeof(BloomBlock) + 8 != filter_size) throw Corruption("the filter block has a wrong size");
    t.filter.blocks.resize(filter_blocks);
    std::memcpy(t.filter.blocks.data(), fb.data(), std::size_t{filter_blocks} * sizeof(BloomBlock));
    t.versions = get_u64(foot + 32);
    if ((blocks == 0) != (t.versions == 0)) throw Corruption("the count of versions does not match the blocks");
    t.smallest = blocks ? get_u64(foot + 40) : 0;
    t.largest = blocks ? t.index.back().last_key : 0;
    t.file = std::move(file);
    return t;
}

void TableIterator::load(std::size_t block) {
    block_ = block;
    valid_ = false;
    if (block >= t_->index.size()) return;
    const std::string_view b = t_->block(block);
    if (!crc_ok(b)) throw Corruption("the crc of a data block is wrong");
    left_ = get_u32(b.data() + b.size() - 8);
    rest_ = b.substr(0, b.size() - 8);
    if (left_ == 0) throw Corruption("a data block has no versions");
    next();
}

void TableIterator::next() {
    if (left_ == 0) {
        if (!rest_.empty()) throw Corruption("a data block has bytes after its last version");
        load(block_ + 1);
        return;
    }
    if (!decode_entry(rest_, key_, seq_, kind_, value_)) throw Corruption("a data block has a broken version");
    --left_;
    valid_ = true;
}

void TableIterator::seek(Key key) {
    const auto& index = t_->index;
    const auto it = std::partition_point(index.begin(), index.end(), [&](const IndexEntry& e) { return e.last_key < key; });
    load(static_cast<std::size_t>(it - index.begin()));
    while (valid_ && key_ < key) next();
}

Table make_table(std::span<const Entry> entries, std::size_t block_size) {
    TableBuilder b(block_size);
    for (const Entry& e : entries) b.add(e.key, e.seq, e.kind, e.value);
    return Table::open(std::make_shared<const std::string>(b.finish()));
}

std::vector<Entry> table_entries(const Table& t) {
    std::vector<Entry> out;
    out.reserve(t.versions);
    TableIterator it(t);
    for (it.seek_to_first(); it.valid(); it.next()) out.push_back({it.key(), it.seq(), it.kind(), std::string(it.value())});
    return out;
}

}  // namespace w31
