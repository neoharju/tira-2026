// Task 6: product quantization. These call the slow baselines: write your
// own. The scan (pq_search) is where the time goes: m table lookups per
// vector, and most vectors are not among the best k.
#include "tasks.hpp"

namespace w23 {

std::vector<std::uint8_t> pq_encode(const ProductQuantizer& pq, const Dataset& data) {
    return baseline::pq_encode(pq, data);  // TODO
}

std::vector<float> pq_table(const ProductQuantizer& pq, const float* query) {
    return baseline::pq_table(pq, query);  // TODO
}

std::vector<Neighbor> pq_search(const ProductQuantizer& pq, std::span<const std::uint8_t> codes, std::span<const float> table,
                                std::size_t k) {
    return baseline::pq_search(pq, codes, table, k);  // TODO
}

}  // namespace w23
