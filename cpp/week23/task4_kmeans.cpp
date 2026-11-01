// Task 4: k-means. This calls the slow baseline: write your own, with your
// l2_squared. Almost all the time goes to finding the nearest centroids.
#include "tasks.hpp"

namespace w23 {

Dataset kmeans(const Dataset& data, Dataset centroids, int iterations) {
    return baseline::kmeans(data, std::move(centroids), iterations);  // TODO
}

}  // namespace w23
