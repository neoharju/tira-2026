# Code for Parts III–V

This folder has the starting code for the tasks of weeks 17–24: one file per
task, tests for every task, and benchmarks with the speed goals. The task
descriptions are in the course material.

## What you need

- Linux (or WSL 2 on Windows) on an x86-64 computer with AVX2: Intel Haswell
  (2013) or AMD Zen (2017) or newer.
- GCC 16, CMake 3.25 or newer, and gdb. GCC 14 and 15 also compile the
  code, but the speed goals were measured with GCC 16, and other compilers
  give other speedups (week 18 has an example). Measure with GCC 16.
- For the `tsan` preset: Clang with LLVM's OpenMP runtime and its sanitizer
  libraries.
- For AVX-512 code (week 18, task 5) on a computer without AVX-512:
  [Intel SDE](https://www.intel.com/content/www/us/en/developer/articles/tool/software-development-emulator.html),
  which runs a program as if the CPU had AVX-512 (slowly, so only for testing).

On Ubuntu 24.04, install the other tools from the package manager:

```bash
sudo apt install g++-14 cmake gdb clang libomp-dev libclang-rt-18-dev linux-tools-generic
```

`g++-14` is needed even if you use GCC 16: Clang (the `tsan` preset) uses the
standard library of the newest GCC installed in the system, and the library of
Ubuntu's default GCC 13 has no `<print>`.

Ubuntu 24.04 has no package for GCC 16. You can install it from
[conda-forge](https://conda-forge.org/) with micromamba, without root rights,
into the folder `~/gcc16`:

```bash
curl -Ls https://conda.anaconda.org/conda-forge/linux-64/micromamba-2.10.0-0.tar.bz2 | tar -xj bin/micromamba
```

```bash
./bin/micromamba create -y -p ~/gcc16 -c conda-forge gxx=16.2 gcc=16.2 libsanitizer=16.2
```

The compiler is then `~/gcc16/bin/g++`. The programs that it builds find its
libraries (`libstdc++`, `libgomp` and the sanitizers) in `~/gcc16/lib`
without further settings.

## Building and testing

There are three build presets:

| Preset | What it is for |
| --- | --- |
| `debug` | Writing code. AddressSanitizer and UndefinedBehaviorSanitizer stop the program at the first memory error or undefined behaviour. |
| `tsan` | Parallel code. ThreadSanitizer reports data races. Uses Clang. |
| `release` | Measuring. Full optimization, plus debug information for `perf` and gdb. |

```bash
cmake --preset debug -DCMAKE_CXX_COMPILER=$HOME/gcc16/bin/g++
```

```bash
cmake --build --preset debug
```

```bash
ctest --preset debug
```

The same three commands work with `release`. The `tsan` preset always uses
Clang, so configure it without `-DCMAKE_CXX_COMPILER`. Without that option,
`debug` and `release` use your default C++ compiler (GCC 13 on Ubuntu 24.04,
which is too old). CMake remembers the compiler in the build folder, so the
option is needed only the first time; to change the compiler of a folder that
already exists, add `--fresh` to the configure command.

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
with GCC 16 on a 4-core Intel Xeon (Emerald Rapids) with AVX-512. The parallel
tasks use as many threads as OpenMP does (`OMP_NUM_THREADS`, by default one per
hardware thread). Close other programs when you measure.

## Files

| Week | Task | File |
| --- | --- | --- |
| 17 | 1 | `week17/task1_moving_average.cpp` |
| 17 | 2–8 | `week17/task2_blend_plane.cpp` … `week17/task8_prefix_sum.cpp` |
| 18 | 1, 2, 3, 7 | `week18/task1_build_csr.cpp`, `task2_dijkstra.cpp`, `task3_shortest_path.cpp`, `task7_distances.cpp` |
| 18 | 4 | `week18/heap4.hpp` |
| 18 | 5, 6 | `week18/task5_min_child_avx512.cpp`, `week18/task6_min_child_avx2.cpp` |
| 18 | 8 | `week18/workspace.hpp` |
| 19 | 1 | `week19/astar.hpp` |
| 19 | 2–8 | `week19/task2_geo.cpp` … `week19/task8_landmark_rows.cpp` |
| 20 | 1, 2, 6, 7 | `week20/task1_shortcuts.cpp`, `task2_contract.cpp`, `task6_min_plus.cpp`, `task7_parallel.cpp` |
| 20 | 3 | `week20/witness.hpp` (and `task2_contract.cpp`) |
| 20 | 4, 5 | `week20/query.hpp`, `task4_query.cpp`, `task5_path.cpp` |
| 20 | 8 | `week20/task7_parallel.cpp` |
| 21 | 1–8 | `week21/task1_index.cpp` … `week21/task8_parallel_index.cpp` (task 2 also has `and_query`) |
| 22 | 1–6, 8 | `week22/task1_push.cpp` … `week22/task6_pull_parallel.cpp`, `week22/task8_order.cpp` |
| 22 | 7 | `week22/task6_pull_parallel.cpp` |
| 23 | 1–8 | `week23/task1_distance.cpp` … `week23/task8_batch.cpp` (task 6 has three functions) |
| 24 | 1–8 | `week24/task1_select.cpp` … `week24/task8_settings.cpp` |

`tasks.hpp` in each week's folder says what each function must do. Do not
change the tests, the baselines or the benchmarks: the grader uses its own
copies.

The week 18 and 19 benchmarks use the DIMACS New York road network if you
download it with `tools/download_dimacs.sh`; otherwise they use a generated
road network of the same size. The week 20 benchmarks always use generated
grids (25,600 and 40,000 nodes), because the baseline contraction is slow.
Week 21 uses generated documents whose words follow Zipf's law. Week 22 uses
the SNAP web graph web-Google if you download it with
`tools/download_snap.sh`; otherwise a generated web graph of the same size.
Weeks 23 and 24 use the first vectors of SIFT1M if you download it with
`tools/download_sift.sh`; otherwise SIFT-like generated vectors (200,000 for
week 23 and 100,000 for week 24).

Keep your solutions private: do not put them in a public repository.
