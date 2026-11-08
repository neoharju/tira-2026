// Week 32: a second MVCC store, built in a very different way: every commit
// makes a full copy of the data (a std::map), and a transaction keeps a
// pointer to the copy of its snapshot. One mutex protects everything. It is
// slow, but its rules are easy to check, and it is correct.
//
// With a planted bug it becomes a "mutant" for the tests of your stress test
// (task 8): each Bug breaks snapshot isolation in one way. Every mutant still
// holds the mutex for all shared data, so ThreadSanitizer finds nothing: only
// a check of the values that the transactions saw can catch it.
#pragma once
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <utility>
#include <vector>

#include "mvcc.hpp"

namespace w32 {

enum class Bug {
    none,
    lost_update,     // commit does not check whether a newer version of a written key committed after the snapshot
    read_committed,  // reads see the newest committed data, not the snapshot
    dirty_read,      // reads see the writes of transactions that have not committed
    torn_commit,     // a commit publishes half of its writes, releases the mutex, and then publishes the rest
    eager_gc,        // reads look up the snapshot's copy by its timestamp, and gc() keeps only the newest copy
    keep_aborted,    // abort() makes the writes of the transaction visible anyway
};

template <Bug bug = Bug::none>
class CopyStore {
public:
    using Map = std::map<Key, Value>;
    struct Txn {
        TxnId id = 0;
        Ts snapshot = 0;
        std::shared_ptr<const Map> snap;              // the copy of its snapshot
        std::map<Key, std::optional<Value>> writes;  // its own writes (nothing: an erase)
    };

    CopyStore() { copies_.push_back({0, std::make_shared<const Map>()}); }

    Txn begin() {
        std::scoped_lock lock(mutex_);
        Txn t;
        t.id = ++next_;
        t.snapshot = copies_.back().first;
        t.snap = copies_.back().second;
        return t;
    }

    std::optional<Value> get(Txn& t, Key key) {
        if (const auto it = t.writes.find(key); it != t.writes.end()) return it->second;
        std::scoped_lock lock(mutex_);
        if constexpr (bug == Bug::dirty_read)
            for (const auto& [id, w] : pending_)
                if (const auto it = w.find(key); id != t.id && it != w.end()) return it->second;
        const Map* m = t.snap.get();
        if constexpr (bug == Bug::read_committed) m = copies_.back().second.get();
        if constexpr (bug == Bug::eager_gc) m = copy_at(t.snapshot);
        const auto it = m->find(key);
        if (it == m->end()) return std::nullopt;
        return it->second;
    }

    bool put(Txn& t, Key key, Value value) { return write(t, key, value); }
    bool erase(Txn& t, Key key) { return write(t, key, std::nullopt); }

    // First committer wins: the commit fails (returns 0) if a key that it
    // wrote has a version that committed after its snapshot.
    Ts commit(Txn& t) {
        std::unique_lock lock(mutex_);
        if constexpr (bug != Bug::lost_update)
            for (const auto& [key, v] : t.writes)
                if (const auto it = last_write_.find(key); it != last_write_.end() && it->second > t.snapshot) {
                    pending_.erase(t.id);
                    return 0;
                }
        if constexpr (bug == Bug::torn_commit) {
            if (t.writes.size() >= 2) {
                std::map<Key, std::optional<Value>> first(t.writes.begin(), std::next(t.writes.begin(), static_cast<long>(t.writes.size() / 2)));
                publish(first);
                lock.unlock();
                std::this_thread::yield();  // readers can begin now and see half of the writes
                lock.lock();
                std::map<Key, std::optional<Value>> rest(std::next(t.writes.begin(), static_cast<long>(t.writes.size() / 2)), t.writes.end());
                pending_.erase(t.id);
                return publish(rest);
            }
        }
        pending_.erase(t.id);
        return publish(t.writes);
    }

    void abort(Txn& t) {
        std::scoped_lock lock(mutex_);
        if constexpr (bug == Bug::keep_aborted)
            if (!t.writes.empty()) publish(t.writes);
        pending_.erase(t.id);
    }

    // A transaction keeps the copy of its snapshot alive itself (a
    // shared_ptr), so only the newest copy must stay in the list.
    std::size_t gc() {
        std::scoped_lock lock(mutex_);
        const std::size_t n = copies_.size() - 1;
        copies_.erase(copies_.begin(), copies_.end() - 1);
        return n;
    }

private:
    bool write(Txn& t, Key key, std::optional<Value> value) {
        t.writes[key] = value;
        if constexpr (bug == Bug::dirty_read) {
            std::scoped_lock lock(mutex_);
            pending_[t.id][key] = value;
        }
        return true;
    }

    // A new copy with these writes and the next timestamp (mutex held).
    Ts publish(const std::map<Key, std::optional<Value>>& writes) {
        const Ts ts = copies_.back().first + 1;
        auto next = writes.empty() ? copies_.back().second : std::make_shared<const Map>([&] {
            Map m = *copies_.back().second;
            for (const auto& [key, v] : writes) {
                if (v) m[key] = *v;
                else m.erase(key);
            }
            return m;
        }());
        for (const auto& [key, v] : writes) last_write_[key] = ts;
        copies_.push_back({ts, std::move(next)});
        return ts;
    }

    // The copy of timestamp ts, or the oldest copy that is left (the bug of eager_gc).
    const Map* copy_at(Ts ts) const {
        for (auto it = copies_.rbegin(); it != copies_.rend(); ++it)
            if (it->first <= ts) return it->second.get();
        return copies_.front().second.get();
    }

    std::mutex mutex_;
    std::vector<std::pair<Ts, std::shared_ptr<const Map>>> copies_;  // by timestamp
    std::map<Key, Ts> last_write_;                                   // the newest commit that wrote each key
    std::map<TxnId, std::map<Key, std::optional<Value>>> pending_;   // dirty_read only
    TxnId next_ = 0;
};

}  // namespace w32
