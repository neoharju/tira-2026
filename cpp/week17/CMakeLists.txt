add_library(w17 STATIC
  task1_moving_average.cpp task2_blend_plane.cpp task3_blend_rgba.cpp task4_sum.cpp
  task5_argmin.cpp task6_histogram.cpp task7_histogram16.cpp task8_prefix_sum.cpp
  pixel.cpp baseline.cpp baseline_scalar.cpp)
target_link_libraries(w17 PUBLIC common)
target_include_directories(w17 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baselines and task 3 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task3_blend_rgba.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w17_test test.cpp ../common/test_main.cpp)
target_link_libraries(w17_test PRIVATE w17 doctest::doctest)

add_executable(w17_bench bench.cpp)
target_link_libraries(w17_bench PRIVATE w17)

foreach(task RANGE 1 8)
  add_test(NAME w17.task${task} COMMAND w17_test "--test-case=task${task}*")
endforeach()
