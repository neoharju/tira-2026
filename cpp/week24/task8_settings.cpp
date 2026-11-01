// Task 8: choose m, ef_construction and ef so that the benchmark reaches its
// goal of recall and speed (see bench.cpp). These are too small.
#include "tasks.hpp"

namespace w24 {

Settings tuned_settings() {
    Params params;
    params.m = 4;
    params.ef_construction = 10;
    return {params, 10};
}

}  // namespace w24
