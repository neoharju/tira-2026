add_library(w23 STATIC
  vectors.cpp baseline.cpp baseline_scalar.cpp task1_distance.cpp task2_knn.cpp task3_kdtree.cpp task4_kmeans.cpp
  task5_ivf.cpp task6_pq.cpp task7_fast_scan.cpp task8_batch.cpp)
target_link_libraries(w23 PUBLIC common)
target_include_directories(w23 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baselines and tasks 1 and 7 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task1_distance.cpp task7_fast_scan.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w23_test test.cpp ../common/test_main.cpp)
target_link_libraries(w23_test PRIVATE w23 doctest::doctest)

add_executable(w23_bench bench.cpp)
target_link_libraries(w23_bench PRIVATE w23)

foreach(task RANGE 1 8)
  add_test(NAME w23.task${task} COMMAND w23_test "--test-case=task${task}*")
endforeach()
