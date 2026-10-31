# Code for Parts III–V

This folder has the starting code for the tasks of weeks 17 and 18: one file
per task, tests for every task, and benchmarks with the speed goals. The task
descriptions are in the course material.

## What you need

- Linux (or WSL 2 on Windows) on an x86-64 computer with AVX2: Intel Haswell
  (2013) or AMD Zen (2017) or newer.
- GCC 16 (GCC 14 or 15 also works), CMake 3.25 or newer, and gdb.
- For the `tsan` preset: Clang with LLVM's OpenMP runtime and its sanitizer
  libraries.
- For AVX-512 code (week 18, task 5) on a computer without AVX-512:
  [Intel SDE](https://www.intel.com/content/www/us/en/developer/articles/tool/software-development-emulator.html),
  which runs a program as if the CPU had AVX-512 (slowly, so only for testing).

On Ubuntu 24.04:

```bash
sudo apt install g++-14 cmake gdb clang libomp-dev libclang-rt-18-dev linux-tools-generic
```

## Building and testing

There are three build presets:

| Preset | What it is for |
| --- | --- |
| `debug` | Writing code. AddressSanitizer and UndefinedBehaviorSanitizer stop the program at the first memory error or undefined behaviour. |
| `tsan` | Parallel code. ThreadSanitizer reports data races. Uses Clang. |
| `release` | Measuring. Full optimization, plus debug information for `perf` and gdb. |

```bash
cmake --preset debug
```

```bash
cmake --build --preset debug
```

```bash
ctest --preset debug
```

The same three commands work with `tsan` and `release`. If your default
compiler is older than GCC 14, choose one when you configure:

```bash
cmake --preset debug -DCMAKE_CXX_COMPILER=g++-14
```

Run the tests of one task:

```bash
ctest --preset debug -R w17.task3
```

or the test program directly, which shows more detail:

```bash
./build/debug/week17/w17_test -tc="task3*"
```

## Speed goals

The benchmarks compare your code with a simple baseline and print the
speedup and the goal:

```bash
./build/release/week17/w17_bench task3
```

Without an argument they run every task of the week. The goals were measured
on a 4-core Intel Xeon (Cascade Lake) machine. The parallel tasks use as many
threads as OpenMP does (`OMP_NUM_THREADS`, by default one per hardware
thread). Close other programs when you measure.

## Files

| Week | Task | File |
| --- | --- | --- |
| 17 | 1 | `week17/task1_moving_average.cpp` |
| 17 | 2–8 | `week17/task2_blend_plane.cpp` … `week17/task8_prefix_sum.cpp` |
| 18 | 1, 2, 3, 7 | `week18/task1_build_csr.cpp`, `task2_dijkstra.cpp`, `task3_shortest_path.cpp`, `task7_distances.cpp` |
| 18 | 4 | `week18/heap4.hpp` |
| 18 | 5, 6 | `week18/task5_min_child_avx512.cpp`, `week18/task6_min_child_avx2.cpp` |
| 18 | 8 | `week18/workspace.hpp` |

`tasks.hpp` in each week's folder says what each function must do. Do not
change the tests, the baselines or the benchmarks: the grader uses its own
copies.

The week 18 benchmarks use the DIMACS New York road network if you download
it with `tools/download_dimacs.sh`; otherwise they use a generated road
network of the same size.

Keep your solutions private: do not put them in a public repository.
