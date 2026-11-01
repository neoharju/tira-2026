// Task 6: lookups in batches. Now this calls find for one key after another,
// and every lookup in a large table waits for its cache misses alone. Work on
// a batch of keys at a time: first compute the hashes of the batch and
// prefetch the first group of every key (the control bytes and the slots),
// then probe the keys of the batch.
#include "swiss.hpp"
#include "task5_group_sse.hpp"

namespace w28 {

template <class Group>
void SwissMap<Group>::find_batch(std::span<const Key> keys, std::span<std::optional<Value>> out) const {
    for (std::size_t i = 0; i < keys.size(); ++i) out[i] = find(keys[i]);  // TODO
}

template void SwissMap<ScalarGroup>::find_batch(std::span<const Key>, std::span<std::optional<Value>>) const;
template void SwissMap<SseGroup>::find_batch(std::span<const Key>, std::span<std::optional<Value>>) const;

}  // namespace w28
