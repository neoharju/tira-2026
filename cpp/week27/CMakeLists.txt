add_library(w27 STATIC
  page.cpp buffer_pool.cpp traces.cpp sharded.cpp baseline.cpp task1_slotted_page.cpp task2_clock.cpp
  task3_buffer_pool.cpp task4_sketch.cpp task6_blocked_sketch.cpp task7_sharded.cpp task8_guards.cpp)
target_link_libraries(w27 PUBLIC common)
target_include_directories(w27 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The SIMD sketch is compiled without automatic vectorization.
set_source_files_properties(task6_blocked_sketch.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w27_test test.cpp ../common/test_main.cpp)
target_link_libraries(w27_test PRIVATE w27 doctest::doctest)

add_executable(w27_bench bench.cpp)
target_link_libraries(w27_bench PRIVATE w27)

foreach(task RANGE 1 8)
  add_test(NAME w27.task${task} COMMAND w27_test "--test-case=task${task}*")
endforeach()
