add_library(w19 STATIC
  graph.cpp baseline.cpp baseline_scalar.cpp task2_geo.cpp task3_landmarks.cpp task4_alt.cpp
  task5_bidirectional.cpp task6_bidirectional_path.cpp task7_bound16.cpp task8_landmark_rows.cpp)
target_link_libraries(w19 PUBLIC common)
target_include_directories(w19 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The scalar baseline and task 7 are compiled without automatic vectorization.
set_source_files_properties(baseline_scalar.cpp task7_bound16.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w19_test test.cpp ../common/test_main.cpp)
target_link_libraries(w19_test PRIVATE w19 doctest::doctest)

add_executable(w19_bench bench.cpp)
target_link_libraries(w19_bench PRIVATE w19)

foreach(task RANGE 1 8)
  add_test(NAME w19.task${task} COMMAND w19_test "--test-case=task${task}*")
endforeach()
