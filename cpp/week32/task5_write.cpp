// Task 5: writes, commit and abort, as mvcc.hpp describes. A write holds the
// latch of its shard exclusively. commit holds commit_latch exclusively while
// it gives its timestamp to its versions (one shard latch at a time), and
// then sets last_commit. commit and abort call finish(t) last.
#include "mvcc.hpp"

namespace w32 {

bool MvccStore::put(Txn& t, Key key, Value value) {
    (void)t;  // TODO
    (void)key;
    (void)value;
    return false;
}

bool MvccStore::erase(Txn& t, Key key) {
    (void)t;  // TODO
    (void)key;
    return false;
}

Ts MvccStore::commit(Txn& t) {
    finish(t);  // TODO
    return 0;
}

void MvccStore::abort(Txn& t) {
    finish(t);  // TODO
}

}  // namespace w32
