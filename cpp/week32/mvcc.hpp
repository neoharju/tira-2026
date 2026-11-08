// Week 32: a key-value store with multi-version concurrency control (MVCC):
// version chains and snapshot reads (task 4), writes, commits and aborts with
// first-updater-wins (task 5), and garbage collection (task 6). The given
// parts are in mvcc.cpp.
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <shared_mutex>
#include <unordered_map>
#include <vector>

namespace w32 {

using Key = std::uint64_t;
using Value = std::uint64_t;
using Ts = std::uint64_t;     // a timestamp: commits get 1, 2, 3, ...
using TxnId = std::uint64_t;  // a transaction: 1, 2, 3, ...

// A version of a key: a value, or a delete. While its writer is active, the
// version is "pending" (commit == 0); when the writer commits, the version
// gets the commit timestamp. A chain holds the versions of a key from the
// newest to the oldest; only the newest version can be pending, because a
// pending version locks its key against other writers.
struct Version {
    Value value = 0;
    bool deleted = false;
    TxnId writer = 0;
    Ts commit = 0;  // 0: pending
    std::unique_ptr<Version> older;

    Version(Value v, bool del, TxnId w, std::unique_ptr<Version> o) : value(v), deleted(del), writer(w), older(std::move(o)) {}
    // Frees the older versions with a loop. The default destructor would free
    // a chain of a million versions with a million nested calls, and the
    // stack would overflow.
    ~Version() {
        std::unique_ptr<Version> p = std::move(older);
        while (p) p = std::move(p->older);
    }
};

// A transaction. Its snapshot is the newest commit timestamp when it began:
// it sees the versions with commit <= snapshot, and its own pending versions.
struct Txn {
    TxnId id = 0;
    Ts snapshot = 0;
    std::vector<Key> written;  // the keys of its pending versions, each once
    bool active = false;
};

// The store. Snapshot isolation: every transaction reads from its snapshot,
// and two transactions that write the same key cannot both commit unless one
// committed before the other began.
//
// The latches, and the order in which a thread may take them:
// active_mutex, then commit_latch, then the latch of one shard.
class MvccStore {
public:
    explicit MvccStore(std::size_t shards = 64);

    // Given. Starts a transaction: snapshot = last_commit.
    Txn begin();

    // Task 4. The value of the key that the transaction sees: its own
    // pending version if it has one, otherwise the newest version with
    // commit <= snapshot. Nothing if there is no such version, or if it is a
    // delete.
    std::optional<Value> get(const Txn& t, Key key);

    // Task 5. Writes a value (put) or a delete (erase) as a pending version.
    // If the transaction has a pending version of the key already, change it.
    // Returns false, and changes nothing, if another transaction has a
    // pending version of the key, or if the newest version of the key
    // committed after this transaction's snapshot ("first updater wins").
    // After false, the caller must abort the transaction.
    bool put(Txn& t, Key key, Value value);
    bool erase(Txn& t, Key key);
    // Task 5. Commits: the next timestamp, last_commit + 1, goes to every
    // pending version of the transaction, and only then becomes last_commit,
    // all while commit_latch is held exclusively. So a transaction that
    // begins later sees all of these versions, and one that began earlier
    // sees none of them. Returns the commit timestamp. A transaction without
    // writes commits too, and gets a timestamp.
    Ts commit(Txn& t);
    // Task 5. Removes the pending versions of the transaction, and ends it.
    void abort(Txn& t);

    // Task 6. Frees the versions that no transaction can see any more, and
    // returns how many it freed. The watermark is the oldest snapshot of an
    // active transaction, or last_commit if none is active: every reader now
    // and later has a snapshot >= the watermark. In each chain, keep the
    // newest version with 0 < commit <= watermark, and the versions above it;
    // free the versions below it. If that version is a delete and it is the
    // newest version of its key, free it too and remove the key.
    std::size_t gc();

    // Given: the number of versions in all chains (for the tests).
    std::size_t versions();

    // The state of the store, open for your code.
    struct alignas(64) Shard {
        std::shared_mutex latch;
        std::unordered_map<Key, std::unique_ptr<Version>> chains;  // the newest version of each key
    };
    Shard& shard_of(Key key) { return *shards[(key * 0x9E3779B97F4A7C15ULL) >> 58 & (shards.size() - 1)]; }
    std::vector<std::unique_ptr<Shard>> shards;

    std::shared_mutex commit_latch;  // begin takes it shared; commit exclusive
    Ts last_commit = 0;              // the newest commit timestamp (under commit_latch)

    std::mutex active_mutex;          // protects the two fields below
    std::multiset<Ts> active;         // the snapshots of the active transactions
    TxnId next_txn = 0;

    // Given: ends a transaction (removes its snapshot from `active`). commit
    // and abort call it last.
    void finish(Txn& t);
};

}  // namespace w32
