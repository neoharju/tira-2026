// The given parts of the MVCC store: shards, begin, finish and versions.
#include "mvcc.hpp"

#include <bit>
#include <stdexcept>

namespace w32 {

MvccStore::MvccStore(std::size_t count) {
    if (count == 0 || count > 64 || !std::has_single_bit(count)) throw std::invalid_argument("the number of shards must be a power of two, 1 ... 64");
    for (std::size_t i = 0; i < count; ++i) shards.push_back(std::make_unique<Shard>());
}

Txn MvccStore::begin() {
    // In the order of the latches: active_mutex, then commit_latch. Holding
    // both, the snapshot is taken and registered in one step, so gc() never
    // sees a moment where this snapshot exists but is not in `active`.
    std::scoped_lock a(active_mutex);
    std::shared_lock c(commit_latch);
    Txn t;
    t.id = ++next_txn;
    t.snapshot = last_commit;
    t.active = true;
    active.insert(t.snapshot);
    return t;
}

void MvccStore::finish(Txn& t) {
    std::scoped_lock a(active_mutex);
    if (const auto it = active.find(t.snapshot); it != active.end() && t.active) active.erase(it);
    t.active = false;
    t.written.clear();
}

std::size_t MvccStore::versions() {
    std::size_t n = 0;
    for (auto& s : shards) {
        std::shared_lock lock(s->latch);
        for (const auto& [key, head] : s->chains)
            for (const Version* v = head.get(); v; v = v->older.get()) ++n;
    }
    return n;
}

}  // namespace w32
