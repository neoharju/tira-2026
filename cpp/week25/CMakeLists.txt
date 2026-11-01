add_library(w25 STATIC
  layout.cpp baseline.cpp task1_eytzinger.cpp task2_eytzinger_search.cpp task3_static_btree.cpp task4_search_avx2.cpp
  task5_search_avx512.cpp task6_prefetch.cpp task7_batch.cpp task8_parallel_build.cpp)
target_link_libraries(w25 PUBLIC common)
target_include_directories(w25 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The SIMD searches are compiled without automatic vectorization.
set_source_files_properties(task4_search_avx2.cpp task5_search_avx512.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w25_test test.cpp ../common/test_main.cpp)
target_link_libraries(w25_test PRIVATE w25 doctest::doctest)

add_executable(w25_bench bench.cpp)
target_link_libraries(w25_bench PRIVATE w25)

foreach(task RANGE 1 8)
  add_test(NAME w25.task${task} COMMAND w25_test "--test-case=task${task}*")
endforeach()
