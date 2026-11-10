# Code for Parts III–V

This file is written in ASD-STE100 Simplified Technical English (Issue 9).

This folder has the starting code for the tasks of weeks 17–32. It has one
file for each task, tests for each task, and benchmarks with the speed goals.
The course material gives the descriptions of the tasks.

## Equipment

* Linux (or WSL 2 on Windows) on an x86-64 computer with AVX2: Intel Haswell
  (2013), AMD Zen (2017) or newer.
* GCC 16, CMake 3.25 or newer, and gdb. GCC 14 and GCC 15 also compile the
  code. But the speed goals come from GCC 16, and other compilers give other
  speedups (week 18 has an example). Measure with GCC 16.
* For the `tsan` and `fuzz` presets: Clang with the OpenMP runtime of LLVM and
  its sanitizer libraries. These libraries include libFuzzer.
* For AVX-512 code (week 18 task 5, week 25 task 5, week 26 task 7) on a
  computer without AVX-512:
  [Intel SDE](https://www.intel.com/content/www/us/en/developer/articles/tool/software-development-emulator.html).
  It runs a program as if the CPU has AVX-512. It is slow, thus use it only
  for tests.

On Ubuntu 24.04, install the other tools from the package manager:

```bash
sudo apt install g++-14 cmake gdb clang libomp-dev libclang-rt-18-dev linux-tools-generic
```

`g++-14` is necessary also if you use GCC 16. Clang (the `tsan` preset) uses
the standard library of the newest GCC in the system. The library of GCC 13,
the default GCC of Ubuntu 24.04, has no `<print>`.

Ubuntu 24.04 has no package for GCC 16. You can install it from
[conda-forge](https://conda-forge.org/) with micromamba, without root
rights, into the folder `~/gcc16`:

```bash
curl -Ls https://conda.anaconda.org/conda-forge/linux-64/micromamba-2.10.0-0.tar.bz2 | tar -xj bin/micromamba
```

```bash
./bin/micromamba create -y -p ~/gcc16 -c conda-forge gxx=16.2 gcc=16.2 libsanitizer=16.2
```

Then the compiler is `~/gcc16/bin/g++`. The programs that it builds find its
libraries (`libstdc++`, `libgomp` and the sanitizers) in `~/gcc16/lib`. No
other settings are necessary.

## How to build and test

There are four build presets:

| Preset | Use |
| --- | --- |
| `debug` | When you write code. AddressSanitizer and UndefinedBehaviorSanitizer stop the program at the first memory error or undefined behaviour. |
| `tsan` | For parallel code. ThreadSanitizer shows data races. This preset uses Clang. |
| `fuzz` | For fuzz tests with libFuzzer (from week 26), with AddressSanitizer and UndefinedBehaviorSanitizer. This preset uses Clang. |
| `release` | When you measure. Full optimization, and debug information for `perf` and gdb. |

```bash
cmake --preset debug -DCMAKE_CXX_COMPILER=$HOME/gcc16/bin/g++
```

```bash
cmake --build --preset debug
```

```bash
ctest --preset debug
```

The same three commands work with `release`. The `tsan` and `fuzz` presets
always use Clang. Thus configure them without `-DCMAKE_CXX_COMPILER`.

Without that option, `debug` and `release` use your default C++ compiler.
On Ubuntu 24.04 it is GCC 13, which is too old. CMake keeps the compiler in
the build folder, thus you must give the option only one time. To change the
compiler of a build folder that exists, add `--fresh` to the configure
command.

To run the tests of one task, use:

```bash
ctest --preset debug -R w17.task3
```

Or run the test program. It shows more detail:

```bash
./build/debug/week17/w17_test -tc="task3*"
```

Week 26 has a fuzz target. To fuzz it for a minute, use the commands below.
libFuzzer keeps the interesting inputs in the folder `corpus`. If an input
breaks your code, libFuzzer saves it as a `crash-...` file. You can run that
file again.

```bash
cmake --preset fuzz && cmake --build --preset fuzz --target w26_fuzz
```

```bash
mkdir -p corpus && ./build/fuzz/week26/w26_fuzz -max_total_time=60 corpus
```

```bash
./build/fuzz/week26/w26_fuzz crash-...
```

## Speed goals

The benchmarks compare your code with a simple baseline. They show the speedup
and the goal:

```bash
./build/release/week17/w17_bench task3
```

Without an argument, a benchmark program does all tasks of the week. The
goals come from GCC 16 on an Intel Xeon (Emerald Rapids) with 4 cores and
AVX-512. The parallel tasks use as many threads as OpenMP (`OMP_NUM_THREADS`;
the default is one thread for each hardware thread). Stop other programs
before you measure.

Each round of a goal has **new inputs**, and the benchmark does a check of
your result in each round. Thus a program cannot keep the result of an
earlier call and give it again. The speedup is the median of the rounds. The
number after `±` shows the difference between the rounds (the spread between
the 25th and the 75th percentile). A large spread shows that the machine is
busy.

`TIRA_SEED` selects the inputs:

| `TIRA_SEED` | Inputs |
| --- | --- |
| not set | The same inputs in each run. Use this to compare your own versions. |
| a number | Other fixed inputs. The course can give you your own number. |
| `random` | New random inputs in each round. The grader uses this. |

```bash
TIRA_SEED=random ./build/release/week17/w17_bench task3
```

The grader (`grader/README.md`) builds its own copy of this folder with only
your task files in it. It runs the copy in a sandbox on the course machine.
`CALIBRATION.md` gives the procedure that sets the goals.

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
| 25 | 1–8 | `week25/task1_eytzinger.cpp` … `week25/task8_parallel_build.cpp` |
| 26 | 1–4, 6–8 | `week26/task1_find.cpp` … `week26/task4_erase.cpp`, `week26/task6_node_avx2.cpp` … `week26/task8_bulk_load.cpp` |
| 26 | 5 | `week26/task5_fuzz.hpp` (a template; the tests and `fuzz.cpp` use it) |
| 27 | 1–4, 6–8 | `week27/task1_slotted_page.cpp` … `week27/task4_sketch.cpp`, `week27/task6_blocked_sketch.cpp` … `week27/task8_guards.cpp` |
| 27 | 5 | `week27/task5_wtinylfu.hpp` (a class template) |
| 28 | 1–3, 5–8 | `week28/task1_robin_hood.cpp` … `week28/task3_swiss_erase.cpp`, `week28/task5_batch.cpp` … `week28/task8_consistent.cpp` |
| 28 | 4 | `week28/task4_group_sse.hpp` |
| 29 | 1–3, 6, 7 | `week29/task1_find.cpp` … `week29/task3_scan.cpp`, `week29/task6_lpm.cpp`, `week29/task7_parallel_build.cpp` |
| 29 | 4, 5 | `week29/task4_find16.hpp`, `week29/task5_lower16.hpp` |
| 29 | 8 | `week29/task7_parallel_build.cpp` |
| 30 | 1–5, 7, 8 | `week30/task1_morton.cpp` … `week30/task5_queries.cpp`, `week30/task7_str_parallel.cpp`, `week30/task8_batch.cpp` |
| 30 | 6 | `week30/task6_node_avx2.hpp` |
| 31 | 1–8 | `week31/task1_wal.cpp` … `week31/task8_subcompactions.cpp` |
| 32 | 1–7 | `week32/task1_find.cpp` … `week32/task7_check.cpp` |
| 32 | 8 | `week32/task8_stress.hpp` (a template; the tests use it) |

`tasks.hpp` in the folder of each week tells what each function must do. Do
not change the tests, the baselines or the benchmarks. The grader uses its
own copies.

## Data

* **Weeks 18 and 19:** the DIMACS road network of New York, if you download it
  with `tools/download_dimacs.sh`. If not, a generated road network of the
  same size.
* **Week 20:** always generated grids (25,600 and 40,000 nodes), because the
  baseline contraction is slow.
* **Week 21:** generated documents. Their words follow Zipf's law.
* **Week 22:** the SNAP web graph web-Google, if you download it with
  `tools/download_snap.sh`. If not, a generated web graph of the same size.
* **Weeks 23 and 24:** the first vectors of SIFT1M, if you download it with
  `tools/download_sift.sh`. If not, generated vectors that are similar to SIFT
  (200,000 for week 23 and 100,000 for week 24).
* **Weeks 25–28:** generated keys and access traces.
* **Week 29:** generated keys. Task 6 uses the IPv4 BGP table of
  `tools/download_bgp.sh` if you download it. If not, a generated table with
  the same mix of prefix lengths.
* **Week 30:** generated points that follow the towns of Finland.
* **Weeks 31 and 32:** generated keys, values and transactions. In week 32,
  all tasks use threads. Thus run all of its tests in the `tsan` preset too.

Keep your solutions private. Do not put them in a public repository.
