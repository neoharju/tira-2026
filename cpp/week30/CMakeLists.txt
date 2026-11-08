add_library(w30 STATIC
  baseline.cpp kernels.cpp points.cpp rtree.cpp task1_morton.cpp task2_hilbert.cpp task3_cells.cpp task4_str.cpp
  task5_queries.cpp task7_str_parallel.cpp task8_batch.cpp)
target_link_libraries(w30 PUBLIC common)
target_include_directories(w30 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The baselines, the queries and the node-test benchmark are compiled without
# automatic vectorization, so that the scalar code stays scalar and SimdTest is
# your SIMD code.
set_source_files_properties(baseline.cpp kernels.cpp task5_queries.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w30_test test.cpp ../common/test_main.cpp)
target_link_libraries(w30_test PRIVATE w30 doctest::doctest)

add_executable(w30_bench bench.cpp)
target_link_libraries(w30_bench PRIVATE w30)

foreach(task RANGE 1 8)
  add_test(NAME w30.task${task} COMMAND w30_test "--test-case=task${task}*")
endforeach()
