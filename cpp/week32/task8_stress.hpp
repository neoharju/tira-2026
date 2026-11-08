// Task 8: a stress test for MVCC stores. It is a template, so that the tests
// can run it on your MvccStore and on the stores of copy_store.hpp, among them
// the mutants with planted bugs.
#pragma once
#include <atomic>
#include <optional>
#include <random>
#include <string>
#include <thread>
#include <vector>

#include "history.hpp"

namespace w32 {

struct StressOptions {
    int threads = 4;
    int transactions = 3000;  // per thread
    int keys = 8;             // few keys, so that transactions often meet
    std::uint64_t seed = 1;
};

// Task 8. Runs `threads` threads at the same time, each with `transactions`
// random transactions on the store, records the history, and checks it with
// check_history of task 7. Returns what check_history returns. Make every
// written value unique, so that a read tells which write it saw. The store has
// the interface of MvccStore and CopyStore:
//   auto t = store.begin();              // t.snapshot is its snapshot
//   std::optional<Value> v = store.get(t, key);
//   bool ok = store.put(t, key, value);  // false: the transaction must abort
//   bool ok = store.erase(t, key);
//   Ts ts = store.commit(t);             // 0: the commit failed and the transaction aborted
//   store.abort(t);
//   store.gc();
template <class Store>
std::optional<std::string> stress(Store& store, const StressOptions& options) {
    (void)store;  // TODO
    (void)options;
    return std::nullopt;
}

}  // namespace w32
