add_library(w32 STATIC
  btree.cpp mvcc.cpp task1_find.cpp task2_insert.cpp task3_optimistic.cpp task4_get.cpp task5_write.cpp task6_gc.cpp task7_check.cpp)
target_link_libraries(w32 PUBLIC common)
target_include_directories(w32 PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(w32_test test.cpp ../common/test_main.cpp)
target_link_libraries(w32_test PRIVATE w32 doctest::doctest)

add_executable(w32_bench bench.cpp)
target_link_libraries(w32_bench PRIVATE w32)

foreach(task RANGE 1 8)
  add_test(NAME w32.task${task} COMMAND w32_test "--test-case=task${task}*")
endforeach()
