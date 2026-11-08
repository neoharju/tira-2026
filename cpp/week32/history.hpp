// Week 32: histories of transactions, their check against snapshot isolation
// (task 7), and the stress test that records them (task 8, task8_stress.hpp).
#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "mvcc.hpp"

namespace w32 {

// One operation of a transaction, as the stress test saw it.
struct Op {
    enum Kind : std::uint8_t { read, write, erase };
    Kind kind = read;
    Key key = 0;
    std::optional<Value> value;  // a read: the value seen (nothing: no value); a write: the value written; an erase: nothing

    friend bool operator==(const Op&, const Op&) = default;
};

// A transaction: its snapshot, its commit timestamp (0 if it aborted), and its
// successful operations in order.
struct TxnRecord {
    Ts snapshot = 0;
    Ts commit = 0;
    std::vector<Op> ops;
};

using History = std::vector<TxnRecord>;

// Task 7. Checks a history against snapshot isolation with a sequential model:
//  1. A committed transaction has snapshot < commit, and no two committed
//     transactions have the same commit timestamp.
//  2. The state at timestamp s: start with no keys, and apply the writes and
//     erases of the committed transactions with commit <= s, in the order of
//     their commits, and in each transaction in the order of its operations.
//  3. A read sees the transaction's own last write or erase of the key before
//     the read, if there is one; otherwise the value of the key in the state
//     at the transaction's snapshot. This holds for aborted transactions too.
//  4. Two committed transactions that both write or erase a key must not
//     overlap: if A.commit < B.commit, then A.commit <= B.snapshot.
// Returns nothing if the history follows the rules, and otherwise a short
// description of the first problem that it finds.
std::optional<std::string> check_history(const History& h);

}  // namespace w32
