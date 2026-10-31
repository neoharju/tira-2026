add_library(w22 STATIC
  graph.cpp baseline.cpp baseline_scalar.cpp task1_push.cpp task2_pull.cpp task3_pagerank.cpp
  task4_personalized.cpp task5_update_avx2.cpp task6_pull_parallel.cpp task8_order.cpp)
target_link_libraries(w22 PUBLIC common)
target_include_directories(w22 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baseline and task 5 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task5_update_avx2.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w22_test test.cpp ../common/test_main.cpp)
target_link_libraries(w22_test PRIVATE w22 doctest::doctest)

add_executable(w22_bench bench.cpp)
target_link_libraries(w22_bench PRIVATE w22)

foreach(task RANGE 1 8)
  add_test(NAME w22.task${task} COMMAND w22_test "--test-case=task${task}*")
endforeach()
