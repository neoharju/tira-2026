add_library(w21 STATIC
  index.cpp roaring.cpp baseline.cpp baseline_scalar.cpp task1_index.cpp task2_and.cpp task3_top_k.cpp
  task4_maxscore.cpp task5_roaring.cpp task6_intersect_avx2.cpp task7_varint.cpp task8_parallel_index.cpp)
target_link_libraries(w21 PUBLIC common)
target_include_directories(w21 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baseline and task 6 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task6_intersect_avx2.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w21_test test.cpp ../common/test_main.cpp)
target_link_libraries(w21_test PRIVATE w21 doctest::doctest)

add_executable(w21_bench bench.cpp)
target_link_libraries(w21_bench PRIVATE w21)

foreach(task RANGE 1 8)
  add_test(NAME w21.task${task} COMMAND w21_test "--test-case=task${task}*")
endforeach()
