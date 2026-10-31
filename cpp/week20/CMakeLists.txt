add_library(w20 STATIC
  graph.cpp ch.cpp table.cpp baseline.cpp baseline_scalar.cpp task1_shortcuts.cpp task2_contract.cpp
  task4_query.cpp task5_path.cpp task6_min_plus.cpp task7_parallel.cpp)
target_link_libraries(w20 PUBLIC common)
target_include_directories(w20 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baseline and task 6 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task6_min_plus.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w20_test test.cpp ../common/test_main.cpp)
target_link_libraries(w20_test PRIVATE w20 doctest::doctest)

add_executable(w20_bench bench.cpp)
target_link_libraries(w20_bench PRIVATE w20)

foreach(task RANGE 1 8)
  add_test(NAME w20.task${task} COMMAND w20_test "--test-case=task${task}*")
endforeach()
