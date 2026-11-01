add_library(w28 STATIC
  robin_hood.cpp task1_robin_find_insert.cpp task2_robin_erase.cpp task3_swiss.cpp task4_swiss_erase.cpp task6_batch.cpp
  task7_sharded.cpp task8_consistent.cpp)
target_link_libraries(w28 PUBLIC common)
target_include_directories(w28 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The Swiss table is compiled without automatic vectorization, so that
# ScalarGroup stays scalar and SseGroup is your SIMD code.
set_source_files_properties(task3_swiss.cpp task4_swiss_erase.cpp task6_batch.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w28_test test.cpp ../common/test_main.cpp)
target_link_libraries(w28_test PRIVATE w28 doctest::doctest)

add_executable(w28_bench bench.cpp)
target_link_libraries(w28_bench PRIVATE w28)

foreach(task RANGE 1 8)
  add_test(NAME w28.task${task} COMMAND w28_test "--test-case=task${task}*")
endforeach()
