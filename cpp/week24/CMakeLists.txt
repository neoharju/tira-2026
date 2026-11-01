add_library(w24 STATIC
  vectors.cpp hnsw.cpp baseline.cpp baseline_scalar.cpp task1_select.cpp task2_search_layer.cpp task3_insert.cpp
  task4_search.cpp task5_distance.cpp task6_search_fast.cpp task7_batch.cpp task8_settings.cpp)
target_link_libraries(w24 PUBLIC common)
target_include_directories(w24 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baseline and task 5 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task5_distance.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w24_test test.cpp ../common/test_main.cpp)
target_link_libraries(w24_test PRIVATE w24 doctest::doctest)

add_executable(w24_bench bench.cpp)
target_link_libraries(w24_bench PRIVATE w24)

foreach(task RANGE 1 8)
  add_test(NAME w24.task${task} COMMAND w24_test "--test-case=task${task}*")
endforeach()
