// Task 5: the inverted file index. These call the slow baselines: write your
// own. Build the lists with a counting sort (week 21), and keep the best k
// in a heap.
#include "tasks.hpp"

namespace w23 {

Ivf build_ivf(const Dataset& data, Dataset centroids) {
    return baseline::build_ivf(data, std::move(centroids));  // TODO
}

std::vector<Neighbor> search_ivf(const Ivf& ivf, const float* query, std::size_t k, std::size_t nprobe) {
    return baseline::search_ivf(ivf, query, k, nprobe);  // TODO
}

}  // namespace w23
