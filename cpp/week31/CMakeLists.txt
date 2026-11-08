add_library(w31 STATIC
  baseline.cpp bloom.cpp lsm.cpp memtable.cpp table.cpp wal.cpp workload.cpp task1_wal.cpp task2_memtable.cpp
  task3_table_get.cpp task4_crc32c.cpp task5_compact.cpp task6_bloom.cpp task7_bloom_avx2.cpp task8_subcompactions.cpp)
target_link_libraries(w31 PUBLIC common)
target_include_directories(w31 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# The baselines and the filters are compiled without automatic vectorization,
# so that the scalar code stays scalar and the AVX2 filter is your SIMD code.
set_source_files_properties(baseline.cpp bloom.cpp task6_bloom.cpp task7_bloom_avx2.cpp PROPERTIES COMPILE_OPTIONS "${TIRA_NO_VECTORIZE}")

add_executable(w31_test test.cpp ../common/test_main.cpp)
target_link_libraries(w31_test PRIVATE w31 doctest::doctest)

add_executable(w31_bench bench.cpp)
target_link_libraries(w31_bench PRIVATE w31)

foreach(task RANGE 1 8)
  add_test(NAME w31.task${task} COMMAND w31_test "--test-case=task${task}*")
endforeach()
add_test(NAME w31.store COMMAND w31_test "--test-case=store*")
