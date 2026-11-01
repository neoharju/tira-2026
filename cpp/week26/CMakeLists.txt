add_library(w26 STATIC
  bplus.cpp baseline.cpp task1_find.cpp task2_insert.cpp task3_scan.cpp task4_erase.cpp task6_node_avx2.cpp
  task7_node_avx512.cpp task8_bulk_load.cpp)
target_link_libraries(w26 PUBLIC common)
target_include_directories(w26 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The SIMD node searches are compiled without automatic vectorization.
set_source_files_properties(task6_node_avx2.cpp task7_node_avx512.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w26_test test.cpp ../common/test_main.cpp)
target_link_libraries(w26_test PRIVATE w26 doctest::doctest)

add_executable(w26_bench bench.cpp)
target_link_libraries(w26_bench PRIVATE w26)

foreach(task RANGE 1 8)
  add_test(NAME w26.task${task} COMMAND w26_test "--test-case=task${task}*")
endforeach()

# The libFuzzer target, in the fuzz preset only (it needs Clang).
if(TIRA_FUZZ)
  add_executable(w26_fuzz fuzz.cpp)
  target_link_libraries(w26_fuzz PRIVATE w26)
  target_link_options(w26_fuzz PRIVATE -fsanitize=fuzzer)
endif()
