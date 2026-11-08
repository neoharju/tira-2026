add_library(w29 STATIC
  art.cpp keys.cpp lpm.cpp node16_kernels.cpp task1_find.cpp task2_insert.cpp task3_scan.cpp task6_lpm.cpp
  task7_parallel_build.cpp)
target_link_libraries(w29 PUBLIC common)
target_include_directories(w29 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The tree and the Node16 benchmarks are compiled without automatic
# vectorization, so that ScalarSearch stays scalar and SimdSearch is your SIMD code.
set_source_files_properties(task1_find.cpp task2_insert.cpp task3_scan.cpp node16_kernels.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w29_test test.cpp ../common/test_main.cpp)
target_link_libraries(w29_test PRIVATE w29 doctest::doctest)

add_executable(w29_bench bench.cpp)
target_link_libraries(w29_bench PRIVATE w29)

foreach(task RANGE 1 8)
  add_test(NAME w29.task${task} COMMAND w29_test "--test-case=task${task}*")
endforeach()
