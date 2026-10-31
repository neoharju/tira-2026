add_library(w18 STATIC
  graph.cpp baseline.cpp task1_build_csr.cpp task2_dijkstra.cpp task3_shortest_path.cpp
  task5_min_child_avx512.cpp task6_min_child_avx2.cpp task7_distances.cpp)
target_link_libraries(w18 PUBLIC common)
target_include_directories(w18 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(w18_test test.cpp ../common/test_main.cpp)
target_link_libraries(w18_test PRIVATE w18 doctest::doctest)

add_executable(w18_bench bench.cpp)
target_link_libraries(w18_bench PRIVATE w18)

foreach(task RANGE 1 8)
  add_test(NAME w18.task${task} COMMAND w18_test "--test-case=task${task}*")
endforeach()
# Without AVX-512 the test of task 5 cannot run; CTest shows it as skipped.
set_tests_properties(w18.task5 PROPERTIES SKIP_REGULAR_EXPRESSION "SKIPPED: no AVX-512")
