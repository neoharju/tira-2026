# Plan: Parts III–VI

This file is written in ASD-STE100 Simplified Technical English (Issue 9).

This file is the agreed plan for new 5-credit courses. The courses continue
*Tietorakenteet ja algoritmit* (Osa I–II) on this site, in English, as weeks
17–40. Part VI (GPUs) comes after them.

**Status (November 2026):**

* Parts III and IV (weeks 17–32) are complete. They have 16 chapters with
  interactive figures and 128 tasks. Each task has starting code, tests, a
  benchmark and a calibrated goal in `cpp/`.
* Part V (weeks 33–40) is the next part. Section 7 gives its plan.
* Section 8 gives the plan of Part VI.
* Parts I–II will change to English and to C++ (section 13).

## 1. Overview

| Part | Weeks | Course | Content |
|---|---|---|---|
| III | 17–24 | Search at Scale | Shortest paths in road networks, text search, web search, vector search |
| IV | 25–32 | Storage Engines | The data structures in databases: B+ trees, buffer pools, hash tables, tries, spatial indexes, LSM trees, MVCC |
| V | 33–40 | Performance Engineering | Measurement and the CPU, advanced SIMD, sort algorithms, vectorized query execution, parsers and compression, concurrency, memory allocators and I/O, a capstone project |
| VI | 41–48 | GPU Programs | CUDA, the memory hierarchy of a GPU, tensor cores, GPU versions of the algorithms of Parts III–V (section 8) |

* **Prerequisites:** Osa I–II. A student can do the parts in any sequence.
  But the later parts use the tools and the hardware model of week 17, and
  some weeks use earlier weeks (section 2.8). The first week of each part
  shows the tools again.
* **Week format:** the same as in Osa I–II. Each week has one chapter, a
  lecture of 2 hours and 8 tasks.
* **Language:** English for the material, the tasks and the exam.

## 2. Design principles

### 2.1 SIMD and parallel code from the first week

Each week has an optimization part. In Parts III and IV, a typical week has
5–6 tasks on the algorithm and 2–3 tasks on its optimization. The first week
of each part (17, 25, 33) and all of Part V are only about optimization.

The optimization uses SIMD, threads or both. The algorithm of the week
decides which. No task is an artificial kernel. Each part has SIMD tasks in
at least five weeks and parallel tasks in at least five weeks.

### 2.2 The hardware model comes first

Week 17 teaches the model that all later optimizations use:

* latency and throughput;
* caches, cache lines and memory bandwidth;
* branch prediction;
* data layout: an array of structs or a struct of arrays.

Week 25 (memory) and week 33 (the CPU and measurement) give more detail. Thus Parts
IV and V can stand alone.

### 2.3 The SIMD ladder

| Weeks | Skill | Examples |
|---|---|---|
| 17 | automatic vectorization, `#pragma omp simd`, first intrinsics | RGBA blend with saturated arithmetic |
| 18–19 | compares, minimum and maximum, masks | AVX-512 8-ary heap, landmark bounds |
| 20, 23 | arithmetic, FMA, more than one accumulator | min-plus distance tables, vector distances |
| 21 | compare → movemask → shuffle | intersection of Roaring containers and posting lists |
| 22, 24 | memory-bound code: prefetch, gathers | PageRank, HNSW |
| 25–31 | search in a node, group probes, filters | static B-tree and B+ tree nodes, Count-Min sketch, Swiss tables, ART Node16, R-tree nodes, split-block Bloom filters |
| 33–40 | shuffles, `pshufb` tables, AVX-512 compress, sort networks, selection vectors, portable SIMD with `std::simd` | sort algorithms, query execution, parsers, compression |

Part IV also uses two scalar instructions: BMI2 `pdep`/`pext` for Morton keys
(week 30) and SSE4.2 `crc32` for checksums (week 31). The course teaches them
where it uses them. They are not SIMD.

### 2.4 The concurrency ladder

| Stage | Tools | Weeks |
|---|---|---|
| Data parallelism without shared mutable state | OpenMP `parallel for` and reductions, `std::jthread`, partition and merge, buffers for each thread, batches of independent queries | 17–24 |
| Mutual exclusion | `std::mutex`, `std::shared_mutex`, shards, latch coupling | 24 (bonus), 27–32 |
| Atomics and the memory model | `std::atomic`, memory orders, lock-free queues, work-stealing deques, optimistic lock coupling, memory reclamation, tests for lock-free code | 38 |
| Threads and memory together | caches for each thread in allocators, asynchronous I/O with completion queues | 39 |

Week 17 teaches ThreadSanitizer. Each parallel task must be clean under it.

### 2.5 AVX-512 where the algorithm must have it

AVX2 (x86-64-v3) is the baseline. The course uses AVX-512 only where AVX2
does not have the necessary instructions:

* the 8-ary heap in week 18: an unsigned 64-bit minimum and compares into a
  mask register (`vpminuq`, `vpcmpuq`). AVX2 does not have these.
* 64-bit keys in B+ tree nodes in week 26: AVX-512 compares 8 keys at a time,
  AVX2 compares only 4 signed keys.
* compress, mask registers and permutes with two sources, for filters,
  partitions, selection vectors and sort algorithms in Part V.

The course machine has AVX-512. If the x86 computer of a student does not have
AVX-512, the student does a check of the code with Intel SDE and measures on
the course machine. Students with ARM laptops (Apple silicon) use the
development server (section 9).

GCC selects the vector width of automatically vectorized loops from `-march`.
With GCC 16, `-march=x86-64-v4`, `-march=znver4` and `-march=znver5` give
512-bit loops. But `-march=sapphirerapids` gives 256-bit loops, unless you add
`-mprefer-vector-width=512`. Week 33 or 34 shows this with the vectorization
report, because it changes what "AVX-512 code" means for compiled loops.

### 2.6 Skeletons, not infrastructure

Each task has a skeleton. The skeleton already does the input and output, the
data load, the tests and the benchmark. It also has a scalar reference
implementation. The students write the algorithm and its optimized version.

### 2.7 Production code in each week

Each week gives code to read: the open-source system or the paper where the
algorithm is used in production.

### 2.8 Dependencies between weeks

The material refers to earlier weeks frequently. These are the main
dependencies:

* All weeks use the tools and the hardware model of week 17.
* Weeks 19–20 use the CSR graphs and the heaps of week 18.
* Week 36 uses the hash tables of week 28 and the sort algorithms of week 35.
* Week 37 implements the Stream VByte decoder that week 21 describes.
* Week 38 implements the optimistic lock coupling that week 32 describes. It
  tests it with the history checker of week 32.

If a student starts with Part IV or V, the student reads week 17 first.

### 2.9 Measurement is a part of each task

Students learn to measure before they optimize. The benchmark of each goal
cannot be tricked (section 4). Week 33 makes measurement a topic. It teaches
the noise of a machine, the statistics of a benchmark, tail latency, and the
tools that show where the time goes.

## 3. Tools

Week 17 introduces these tools, and all later weeks use them. The course
compiler is **GCC 16**. The goals are calibrated with it.

| Area | Tools |
|---|---|
| Language | C++23 with GCC 16 (`-std=c++23`; the default of GCC 16 is C++20); C++26 for `std::simd` in Part V |
| Build | CMake presets: `debug` (`-O0 -g`, AddressSanitizer and UBSanitizer), `tsan` (ThreadSanitizer), `release` (`-O3 -march=x86-64-v3`, AVX-512 targets where a task must have them) |
| Debugger | gdb: breakpoints, watchpoints, backtraces, SIMD registers (`p $zmm0`) |
| Sanitizers | AddressSanitizer, UndefinedBehaviorSanitizer, ThreadSanitizer |
| Profilers | `perf stat` (cycles, instructions, IPC, cache misses and branch misses; `-r` for more than one run), `perf record`, `perf report`, `perf annotate`; top-down analysis in week 33 |
| Vectorization | Compiler Explorer; GCC `-fopt-info-vec-optimized` and `-fopt-info-vec-missed` |
| Tests | doctest; random tests against reference implementations; libFuzzer from week 26; a check of histories against a sequential model from week 32 |
| Benchmarks | `tira::compare_fresh`: new inputs in each round, a check of each result, and the median and the spread of the round ratios (`cpp/CALIBRATION.md`) |
| Style | clang-format, clang-tidy |
| SIMD | automatic vectorization → `#pragma omp simd` → AVX2 and AVX-512 intrinsics → portable SIMD in Part V with `std::simd` |
| Parallel code | OpenMP and `std::jthread` → mutexes → `std::atomic` (Part V). Not `std::execution`: in the standard library of GCC, its parallel algorithms must have TBB. |

The `tsan` preset is the only exception to GCC. The OpenMP runtime of GCC
(libgomp) has no ThreadSanitizer instrumentation, and it gives false reports.
Thus `tsan` uses Clang and the OpenMP runtime of LLVM. GCC 16 builds all code
that the grader measures.

This table shows what GCC 16.2 (libstdc++, `-std=c++26`) has for Part V:

| Feature | GCC 16.2 | Result for the course |
|---|---|---|
| `std::simd` (`<simd>`, `std::simd::vec<T>`) | yes: 8 floats with AVX2, 16 with `-march=x86-64-v4` | Week 34 uses it. The material uses the C++26 names (`std::simd::vec`), not `std::experimental::simd`. |
| `<hazard_pointer>`, `<rcu>` | no | Week 38 implements epochs and hazard pointers, and the students read the code of Folly. |
| senders (`std::execution::just` and others) | no | The course does not use them. |
| `std::inplace_vector`, `<flat_map>`, `<mdspan>`, `<generator>` | yes | The starting code of Part V can use them. |
| contracts (`__cpp_contracts`) | yes | Optional in Part V. No task must have them. |

**The C++ self-study chapter** comes before the first part. It is C++ for
Python programmers. It teaches values and references, RAII, `std::vector`,
`std::span`, `std::string_view`, simple templates, undefined behaviour and
CMake. It has exercises, but no tasks with points. When Parts I–II change to
C++ (section 13), this chapter becomes a part of Part I.

## 4. Assessment

**Points:** Each week has 8 tasks of 1 point, thus 64 points for each part.
To pass, a student must have at least 5 points from each week. The grades are
the same as in Osa I–II: 40 points → 1, 45 → 2, 50 → 3, 55 → 4, 60 → 5.

**Automatic checks:** A program checks each task. There are no reports.

* Correctness: random tests and adversarial tests against reference
  implementations.
* Exact counts from deterministic runs, for example the number of settled
  nodes or of added shortcuts.
* Speed: a ratio to the baseline. Each round of a benchmark has **new
  inputs**, and the benchmark checks each result (`tira::compare_fresh`).
  Thus a program cannot keep earlier results and give them again. The grader
  uses `TIRA_SEED=random` and does 3 runs. A goal is reached if more than
  half of the runs reach it. `cpp/CALIBRATION.md` gives the procedure that
  sets the goals.
* Parallel tasks use a fixed number of threads on reserved cores. They must
  be clean under ThreadSanitizer.
* Each task must be clean under AddressSanitizer and UBSanitizer.
* The grader runs each submission in a sandbox (`cpp/grader/`). The sandbox
  has no network and a read-only system. The grader takes only the task files
  of the student. The tests, the benchmarks and the baselines are always the
  copies of the grader. The grader also makes a list of code for a person to
  examine: code that reads the environment, files or the state of the
  benchmark, and code that runs before `main()`.
* Osa I–II use CSES. CSES accepts C++. Thus tasks that only must give a
  correct output in a time limit can stay on CSES. Tasks with a speed ratio,
  parallel tasks and AVX-512 tasks must use the grader on the course machine.

**Variants for each student:** The grader gives each student different
inputs. For the fixed runs, `TIRA_SEED` comes from the student number. For the
graded runs, the inputs are random. The tests stay public. More variants for
each task are possible: a different size of the data, a different
distribution of the keys (uniform, Zipf, sorted, in clusters), or a different
constant (the `k` of top-k, the fan-out of a node). The student number selects
the variant. Each variant must keep the calibrated goal correct. Calibrate
with all variants (`CALIBRATION.md`, section 10).

**"Explain your `perf stat`":** A student can solve a task and not
understand the solution (see `tekoaly.md` and `tekoaly2.md`). Thus the course
adds a short check that the student understands the solution:

1. After the deadline, the course selects one or two tasks of each part for
   each student, at random.
2. The student brings the solution and its `perf stat` output to a talk of
   10 minutes with a teaching assistant. Or the student writes the answers
   under supervision.
3. The student tells which counter changed most against the baseline, why it
   changed, and what limits the code now (instructions, branches, cache
   misses or memory bandwidth).
4. If the student cannot explain the solution, the student loses the points
   of that task.

The exam (below) asks the same type of question about code that it shows.

**Exam:** The same as in Osa I–II: 2 hours on campus, with a pen and paper.
No computer, phone or notes. The exam has 5 tasks. To pass, a student must
solve tasks 1–3. Grade 4 or 5 also must have task 4, and grade 5 also must
have task 5. These are the proposed types of tasks:

1. a short C++ function, written on paper;
2. a trace of an algorithm of the part (Dijkstra with a 4-ary heap, a split
   of a B+ tree, a compaction);
3. a question about SIMD code or parallel code: what does a mask compute,
   where is the data race? Or two `perf stat` outputs of two versions of a
   function: what is the difference, and why?
4. a more difficult program;
5. a more difficult theoretical task: a proof (a consistent heuristic, a stop
   rule) or a calculation (false positive rates, amplification, Amdahl's
   law, Little's law).

**Exam language:** English. Examine the rules of the university about the
right of students to answer in Finnish or Swedish.

## 5. Part III — Search at Scale (weeks 17–24) — complete

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 17 | C++ Tools, Hardware and First Kernels | RGBA blend | reduction, histogram, prefix sum |
| 18 | Dijkstra at Scale | AVX-512 8-ary heap | batches of queries |
| 19 | A*, ALT and Bidirectional Search | landmark bounds | landmark preprocessing |
| 20 | Contraction Hierarchies | min-plus distance tables | contraction of independent sets |
| 21 | Text Search | intersection of Roaring containers and posting lists | index build in shards |
| 22 | PageRank | rank update | pull-based matrix–vector product |
| 23 | Vector Search I: Exact Search and Quantization | FMA distances, PQ fast scan | batches of queries |
| 24 | Vector Search II: Graph Indexes | byte distances, prefetch | parallel queries |

These are the tasks of the chapters. The task names are the titles in the
chapters. The chapters and `cpp/README.md` give the details.

| Week | Tasks |
|---|---|
| 17 | Find the bug · Let the compiler vectorize · Blend RGBA pixels with AVX2 · A parallel sum · Minimum and its position with `std::jthread` · A byte histogram · A histogram without contention · A parallel prefix sum |
| 18 | Build CSR by counting · Dijkstra for any heap · Stopping at the target · A 4-ary heap · The smallest child with AVX-512 · The smallest child with AVX2 · Queries in parallel · Versioned distances |
| 19 | A* search · The straight-line bound · Farthest-point landmarks · ALT · Bidirectional Dijkstra · Bidirectional paths · The ALT bound for 16 landmarks · Landmark rows in parallel |
| 20 | The shortcuts of one node · Contraction in a given order · Fast contraction · CH query · Unpacking paths · SIMD distance table · Parallel contraction · Parallel speedup |
| 21 | Build the index fast · AND queries · The best k documents · MaxScore · Roaring intersection · SIMD intersection · Gaps and varints · Parallel indexing |
| 22 | Push step · Pull step · PageRank · Personalized PageRank · SIMD update · Parallel pull step · Balance the work · An order for the caches |
| 23 | Distances with FMA · Brute force · A k-d tree · k-means · The inverted file · Product quantization · Fast scan · Many queries in parallel |
| 24 | Choosing the neighbours · Beam search · Inserting a node · Search · Distances of bytes · Prefetching · Parallel queries · Recall and work |

The texts to read and the bonuses are as in the first plan: Boost.Graph and
OSPF (18), Goldberg & Harrelson and the 15-puzzle (19), OSRM and PHAST (20),
Lucene and Roaring (21), Brin & Page and HyperBall (22), FAISS, ScaNN and
float16 (23), hnswlib, DiskANN and binary quantization (24).

## 6. Part IV — Storage Engines (weeks 25–32) — complete

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 25 | The Memory Hierarchy and Layouts | node search in a static B-tree | parallel searches, a build with first touch |
| 26 | B+ Trees | search in a node (AVX2 / AVX-512) | bulk load |
| 27 | Pages, Buffer Pool and Caching | blocked Count-Min sketch | sharded buffer pool, latches |
| 28 | Hash Tables | group probe of a Swiss table | sharded concurrent map |
| 29 | Tries and Radix Trees | ART nodes of 16 keys | parallel build |
| 30 | Spatial Indexes | node tests in an R-tree | STR bulk load, batches of queries |
| 31 | LSM Trees | split-block Bloom filter | subcompactions |
| 32 | Concurrency Control and MVCC | — | latch coupling, concurrent readers and writers |

These are the tasks of the chapters:

| Week | Tasks |
|---|---|
| 25 | The Eytzinger layout · The Eytzinger search · The static B+ tree · The B+ tree search with AVX2 · The B+ tree search with AVX-512 · Prefetching · Searches in parallel · Building in parallel |
| 26 | Find · Insert · Range scan · Erase · A differential fuzz harness · Node search with AVX2 · Node search with AVX-512 · Parallel bulk load |
| 27 | A slotted page · CLOCK replacement · The buffer pool · The frequency sketch · W-TinyLFU · A blocked sketch with SIMD · A sharded buffer pool · Latches and guards |
| 28 | Robin Hood hashing · Swiss table find and insert · Swiss table erase · The SSE2 group probe · Batches of lookups · Cuckoo hashing · A sharded map · Consistent hashing |
| 29 | Find · Insert · Range scan · Find a byte with SSE2 · The place of a byte with SSE2 · Longest-prefix match · A parallel build · Uneven ranges |
| 30 | Morton keys with BMI2 · Hilbert keys · Cells · STR bulk loading · Range and nearest-neighbour queries · The node test with AVX2 · Parallel STR · Batches of range queries |
| 31 | The write-ahead log · A skip-list memtable · Lookup in a table · CRC-32C with SSE4.2 · Compaction · A split-block Bloom filter · The filter with AVX2 · Subcompactions |
| 32 | Find and scan with latch coupling · Insert with safe nodes · Optimistic insert and erase · Snapshot reads · Writes, commits and aborts · Garbage collection · Checking a history · The stress test |

These are the changes against the first plan:

* Week 25 has parallel searches and a parallel build with first touch. It does
  not have a task on the scale of the bandwidth.
* Week 27 has latches and guards as its eighth task.
* Week 28 has batches of lookups and cuckoo hashing.
* Week 29 has a second parallel task with uneven ranges of keys.

The bonuses are as in the chapters: sort networks (26), page checksums (27), a
Bloom filter in one register (28), string keys (29), points in polygons (30),
Merkle trees (31) and write skew (32).

## 7. Part V — Performance Engineering (weeks 33–40)

Each week of Part V is about optimization. These are the changes against the
first plan:

* The two weeks on sort algorithms become one week.
* The topics of the week on parallel patterns go to other weeks. Week 17
  already has the parallel scan, and work stealing goes to week 38.
* Compression goes into the same week as parsers.

This gives space for three topics that industry uses each day: vectorized query
execution, memory allocators and real I/O. It also gives space for a capstone
project. Measurement becomes a topic in week 33.

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 33 | The CPU in Depth and How to Measure | more than one accumulator, 8×8 transpose | scale, roofline, noise |
| 34 | Advanced SIMD | shuffles, `pshufb`, compress, gathers, `std::simd` | — |
| 35 | Sort Algorithms | sort networks, vectorized partitions | parallel radix sort, samplesort |
| 36 | Vectorized Query Execution | selection vectors, filters with compress, hash probes in batches | morsel-driven parallelism |
| 37 | Fast Parsers and Compression | delimiter scans, JSON structural index, number parsers, Stream VByte, bit unpacking | parsers and compression in parallel chunks |
| 38 | Concurrency and Lock-Free Code | — | lock-free queues, work stealing, optimistic lock coupling, reclamation, tests |
| 39 | Memory Allocators and Real I/O | — | caches for each thread, asynchronous I/O |
| 40 | Capstone Project | as the project must have | as the project must have |

### Week 33 — The CPU in Depth and How to Measure

**Content:**

* pipelines, execution ports, micro-ops, tables of latency and throughput
  (uops.info), branch prediction, top-down analysis, the roofline model.
* **Measurement method:**
  * the noise of a machine: frequency scale, turbo, other processes, SMT
    siblings, thermal limits;
  * how to control the noise: pin the threads (`taskset`, `OMP_PLACES`), use
    a fixed governor;
  * a warm-up, and more than one run (`perf stat -r`);
  * medians, percentiles and the spread, not one number;
  * a comparison of two versions in alternate rounds, as `tira::compare_fresh`
    does;
  * why new inputs are necessary: caches, branch predictors, and programs
    that keep results.
* **Latency distributions:** p50, p99 and p99.9; the tail latency of a service
  under load; coordinated omission (Gil Tene), and why a closed-loop benchmark
  hides it; HdrHistogram.
* **Optimization by the compiler:** profile-guided optimization
  (`-fprofile-generate` and `-fprofile-use`), link-time optimization (`-flto`),
  and a change of the code layout after the link with BOLT. The week measures
  what each one changes.
* Dense linear algebra is the usual example of the roofline model. The course
  does not teach GEMM kernels. For GEMM kernels, students can do the course
  [LAFF-On Programming for High Performance](https://www.ulaff.net/) (Robert
  van de Geijn, Margaret Myers and Devangi Parikh, UT Austin). It builds a
  BLIS-style GEMM step by step.

**Tasks (8):**

| Task | Points |
|---|---|
| Setup and a stable measurement (pinned threads, a fixed governor, a spread below a limit) | 1 |
| Dependency chains: a SIMD sum with more than one accumulator | 1 |
| A rewrite without branches | 1 |
| A cache-blocked transpose with 8×8 AVX2 blocks | 2 |
| A latency histogram with p99 for a loop of requests, open-loop, without coordinated omission | 1 |
| PGO and LTO on a given program, and the counters that explain the gain | 1 |
| Parallel scale and the position on the roofline | 1 |

**Read:** uops.info; the top-down microarchitecture analysis of Intel; Gil
Tene, *How NOT to Measure Latency*; HdrHistogram; the BOLT paper (Panchenko et
al., CGO 2019); Brendan Gregg, *Systems Performance*.

### Week 34 — Advanced SIMD

**Content:**

* shuffles and permutes;
* `pshufb` lookup tables;
* AVX-512 masks, compress and expand;
* gathers and scatters;
* portable SIMD with `std::simd` (C++26, `<simd>`, `std::simd::vec<T>`, GCC 16
  with `-std=c++26`): what it compiles to, and where intrinsics are still
  necessary;
* the vector width that GCC selects (section 2.5).

**Tasks (8):** `pshufb` lookups (popcount, hexadecimal decoder) 2 · an AVX-512
compress filter 2 · gathers and a struct of arrays 2 · a portable version with
`std::simd` 2

**Read:** simdjson; Highway; the `std::simd` proposal (P1928).

### Week 35 — Sort Algorithms

This week has the content of the two weeks on sort algorithms in the first
plan.

**Content:**

* introsort (libstdc++), pdqsort (Go since 1.19), ipnsort and driftsort (Rust
  since 1.81), the merge policy of Powersort (CPython since 3.11), dual-pivot
  quicksort (Java): to read and to compare;
* LSD radix sort;
* sort networks (bitonic) in registers;
* vectorized partitions (AVX2 permutation tables, AVX-512 compress);
* parallel radix sort and samplesort;
* external merge sort with a loser tree, as a section.

**Tasks (8):** LSD radix sort 1 · parallel radix sort 1 · bitonic network 1 ·
vectorized partition 2 · vectorized quicksort 1 · parallel samplesort 1 ·
external merge sort 1

**Read:** x86-simd-sort (NumPy); vqsort of Highway; pdqsort; the
descriptions of driftsort and ipnsort.

### Week 36 — Vectorized Query Execution (new)

Databases and data frames execute their queries as loops over columns. In
this week, the students build the core of the engines of DuckDB, ClickHouse,
Velox and Polars. The week uses the hash tables of week 28 and the sort
algorithms of week 35.

**Content:**

* columnar data (Apache Arrow): validity bitmaps, offsets for strings,
  dictionary encoding;
* execution of one vector at a time (MonetDB/X100): a batch of 1024–2048
  rows, and why it is faster than one tuple at a time and than full
  materialization;
* selection vectors, and filters without branches (AVX-512 compress);
* hash aggregation (`GROUP BY`) with a Swiss table, and partial aggregates for
  each thread;
* hash joins: a build and a probe in batches with prefetch (week 28), and the
  radix-partitioned join that keeps each partition in the cache;
* morsel-driven parallelism (Leis et al., 2014): small units of work that
  each thread takes when it is free;
* compiled execution and vectorized execution, to read (HyPer and Vectorwise).

**Tasks (8):** a filter with a selection vector 1 · the same filter with
AVX-512 compress 1 · arithmetic on columns with nulls 1 · hash aggregation 2 ·
a hash join with batches of probes 1 · a radix-partitioned join 1 · parallel
aggregation with morsels 1

**Read:** Boncz, Zukowski & Nes, *MonetDB/X100* (CIDR 2005); Leis et al.,
*Morsel-Driven Parallelism* (SIGMOD 2014); Kersten et al., *Everything You
Always Wanted to Know About Compiled and Vectorized Queries* (VLDB 2018); the
execution engine of DuckDB; the columnar format of Apache Arrow.

### Week 37 — Fast Parsers and Compression

Parsers and decompressors both change a stream of bytes into values at the
speed of memory. They use the same tools: masks, `pshufb` tables and prefix
sums.

**Content:**

* SIMD scans for delimiters; a CSV splitter;
* a JSON structural index with masks for quotes and escapes (stage 1 of
  simdjson);
* UTF-8 validation (simdutf);
* **number parsers:**
  * integers with SWAR: 8 digits in one 64-bit word;
  * floating-point numbers with the Eisel–Lemire algorithm (fast_float, which
    is now in `std::from_chars` of GCC);
  * exact rounding, and why `strtod` is slow;
* bit packing, delta coding and frame-of-reference coding;
* the Stream VByte decoder with `pshufb` (week 21 describes it);
* the format of LZ4 and a decoder for it; zstd and Huffman coding, to read;
* parsers and compression in parallel chunks: where the boundary of a chunk
  can be.

**Tasks (8):** CSV splitter 1 · JSON structural index 2 · an integer parser
with SWAR 1 · a floating-point parser (Eisel–Lemire) 1 · SIMD bit unpacking 1
· Stream VByte 1 · a parser in parallel chunks 1

**Read:** simdjson; simdutf; Daniel Lemire, *Number Parsing at a Gigabyte per
Second* (2021) and fast_float; Lemire et al., Stream VByte; LZ4; zstd.

### Week 38 — Concurrency and Lock-Free Code

**Content:**

* the C++ memory model and the memory orders;
* atomics, false sharing and the cost of contention;
* lock-free queues: a ring buffer for one producer, and a queue for more than
  one producer;
* work stealing: the Chase–Lev deque, and a small task scheduler with it (from
  the week on parallel patterns in the first plan);
* memory reclamation: epochs and hazard pointers. The students implement them,
  because the library of GCC 16 has no `<hazard_pointer>` and no `<rcu>`.
* optimistic lock coupling on the B+ tree (week 32 describes it);
* **tests for lock-free code:**
  * ThreadSanitizer finds data races. It does not find a bug in code that
    uses atomics correctly but in the wrong sequence.
  * stress tests with many threads and small sizes;
  * a linearizability check of recorded histories against a sequential model
    (the checker of week 32, with more features);
  * litmus tests for memory orders;
  * mutants with weaker memory orders, which the tests must find, as in weeks
    26 and 32;
  * model checkers (GenMC, CDSChecker), to read.

**Tasks (8):** a ring buffer for one producer 1 · a queue for more than one
producer 1 · the Chase–Lev deque 1 · a work-stealing scheduler 1 · epoch-based
reclamation 1 · optimistic lock coupling on the B+ tree 1 · a linearizability
checker 1 · a stress test that finds the mutants 1

**Read:** Leis et al., *The ART of Practical Synchronization* (DaMoN 2016) and
LeanStore; Chase & Lev, *Dynamic Circular Work-Stealing Deque* (SPAA 2005); the
hazard pointers of Folly; crossbeam-epoch; Herlihy & Wing, *Linearizability*
(1990); Knossos of Jepsen, and Porcupine.

### Week 39 — Memory Allocators and Real I/O (new)

Each server controls two resources that Parts III–IV used without a look
inside: the memory from `new`, and the disk. (Part IV simulates the disk in
memory.)

**Content, allocators:**

* what `malloc` does: size classes, free lists, arenas, and when the memory
  goes back to the operating system;
* fragmentation, and why a service that runs for a long time becomes larger;
* caches for each thread (tcmalloc, jemalloc, mimalloc), and the cost when a
  thread frees memory of another thread;
* arena allocation and bump allocation, object pools, `std::pmr`;
* huge pages for allocators (week 25), and the measurement of an allocator
  with `perf` and with allocation counters.

**Content, I/O:**

* the page cache, `read` and `write`, `mmap`, and `O_DIRECT` with aligned
  buffers;
* `fsync` and `fdatasync`, what is durable and when (week 31), and group
  commit;
* asynchronous I/O with `io_uring`: submission queues and completion queues,
  batches, registered buffers and polled I/O; liburing;
* the bandwidth and the latency of an NVMe SSD at different queue depths
  (Little's law again), measured with `fio`.

**Tasks (8):** a bump arena and `std::pmr` 1 · a size-class allocator 1 ·
caches for each thread 1 · a measurement of fragmentation 1 · `O_DIRECT` reads
with aligned buffers 1 · a log with group commit 1 · a reader with `io_uring`
at a queue depth 1 · the buffer pool of week 27 on `io_uring` 1

**Read:** mimalloc (Leijen, Zorn & de Moura, 2019); jemalloc; tcmalloc; Axboe,
*Efficient IO with io_uring*; Haas & Leis, *What Modern NVMe Storage Can Do,
and How to Exploit It* (VLDB 2023).

**Infrastructure:** The course machine must have an NVMe SSD that the grader
can use for `O_DIRECT` and `io_uring`. The sandbox must allow `io_uring`
(section 9).

### Week 40 — Capstone Project (new)

Real performance work starts from a full program and a target, not from one
function. In the capstone, each student (or pair of students) receives a full
system of the course and a service-level goal. The student must reach the
goal.

**The task:** Select one system of the course: the LSM store of week 31, the
HNSW search of week 24, the route planner of weeks 18–20 or the query engine
of week 36. Run it as a service with a load generator. Make it reach a goal for
the throughput and the p99 latency on the course machine. All tests of the
system must still pass.

**Points (8):**

| Item | Points |
|---|---|
| A profile of the starting system that finds its bottleneck (`perf`, latency histograms) | 2 |
| The goal is reached. The grader measures it with new inputs and an open-loop load. | 3 |
| Correctness: the tests of the system, the sanitizers and a stress test | 1 |
| A short report (2 pages): what you measured, what you changed, what each change gave, and the counters that explain it | 2 |

**Rules:** The starting systems are the reference solutions of the earlier
weeks. Thus a student does not use their own earlier tasks. The report and a
talk of 10 minutes replace "Explain your `perf stat`" in this week.

**Read:** the USE method of Brendan Gregg; Dean & Barroso, *The Tail at
Scale* (CACM 2013).

## 8. Part VI — GPU Programs (weeks 41–48), plan

Part VI is a separate part after Part V. It does not change Parts III–V. These
are the proposed topics:

| Week | Topic |
|---|---|
| 41 | The GPU model: SIMT, warps, occupancy, the memory hierarchy; CUDA C++ and the tools (Nsight Systems, Nsight Compute, compute-sanitizer) |
| 42 | Memory-bound kernels: coalesced access, shared memory, reductions and scans on the GPU |
| 43 | Sort algorithms and hash tables on the GPU: radix sort (CUB), GPU hash tables |
| 44 | Graphs on the GPU: BFS and SSSP with frontiers (Gunrock) |
| 45 | Matrix units: tensor cores with WMMA and CUTLASS/CuTe; precision (FP16, BF16, FP8) |
| 46 | Vector search on the GPU: exact search as GEMM, IVF-PQ (FAISS GPU, cuVS CAGRA) |
| 47 | Query execution on the GPU: columns, filters, joins (cuDF, RAPIDS) |
| 48 | More than one GPU, and the link to the host: streams, copies at the same time as kernels, the basics of NCCL |

**Infrastructure:** one GPU node for development and a different GPU node for
the grader. The rules are the same as for the CPU grader: a sandbox, new
inputs and calibrated goals. Write the detailed plan after Part V.

## 9. Infrastructure

### Course machine

* x86-64 on bare metal. Virtual machines frequently hide the performance
  counters, and they add noise. (The goals of Parts III–IV were calibrated on a
  shared virtual machine with 4 cores. Calibrate them again on the course
  machine with `cpp/CALIBRATION.md`.)
* AVX2 and AVX-512 (F, VL, BW, DQ; VBMI2 for byte compress), BMI2 and SSE4.2.
  Older Intel server CPUs decrease the clock for 512-bit instructions. Ice Lake
  and later, and AMD Zen 4 and 5, decrease it almost not at all.
* At least 16 physical cores for the tasks on parallel scale, and memory for
  the data sets.
* **NUMA:** Weeks 25 and 39 teach NUMA placement. A machine with one socket
  cannot show it. Use a machine with two sockets, or an AMD EPYC with NPS2 or
  NPS4, at least for the development server.
* An NVMe SSD for the I/O tasks of week 39.
* `kernel.perf_event_paranoid` set to 2. Then students can use `perf`.
* GCC 16, Clang with the OpenMP runtime of LLVM (for the `tsan` preset), Intel
  SDE and bubblewrap.
* **The queue of the grader:**
  * It reserves cores for each job and pins the threads of the job.
  * It runs `cpp/grader/grade.sh`: the sandbox, the sanitizer builds, and the
    benchmarks with new inputs, 3 runs for each goal.
  * It runs as a user without privileges, with a memory limit (cgroups).
  * For week 39, it allows `io_uring` and a scratch file on the SSD in the
    sandbox.

### Development server

Some students do not have an x86 computer with AVX2, for example students
with Apple silicon laptops (Intel SDE does not run on them). These students
use a remote x86 machine to build, to use gdb and to use `perf`. Keep this
machine separate from the machine of the grader. Then interactive work does
not change the measurements.

### Template repository

* CMake presets (`debug`, `tsan`, `fuzz`, `release`), doctest, and scripts
  that download the data.
* For each task: a skeleton and a scalar reference implementation.
* **CI** (`.github/workflows/cpp.yml`):
  * GCC 16 builds of `release` and `debug`, with warnings as errors;
  * the ThreadSanitizer build;
  * the tests that the starting code must pass (week 17, the data loaders);
  * the benchmark harness;
  * the grader in its sandbox on week 17.
* **To do:** a private CI job that sends the reference solutions through the
  grader. Then the job does a check of each change of a benchmark against them.
  GitHub-hosted runners possibly do not have AVX-512. Thus the AVX-512 tests
  run on the course machine or under Intel SDE.
* The data loaders treat each file as input. They check each number, and they
  allocate no memory from a count without a check (the tests `w18.loader` and
  `w23.loader`).

### Data sets

| Data | Weeks | Licence |
|---|---|---|
| DIMACS 9th Challenge road networks (New York; all of the USA for stress tests) | 18–20 | public domain (from US Census TIGER/Line) |
| SNAP web graphs (web-Google) | 22 | free to use, with a citation |
| English Wikipedia articles | 21, 37 | CC BY-SA |
| SIFT10K and SIFT1M (TEXMEX) | 23–24 | examine the terms |
| OpenStreetMap extract of Finland | 30 | ODbL: attribution, share-alike for derived databases |
| RouteViews and APNIC BGP tables | 29 | public |
| Synthetic key-value workloads (a generator in the style of YCSB) | 26–32 | ours |
| Tables like TPC-H from a generator (`dbgen` of DuckDB) | 36 | ours (generated) |

**To do when the course publishes the data:**

1. Put a copy of each file on a course server.
2. Pin one version of each file. (The BGP table changes each day.)
3. Add a SHA-256 check of each file to the download scripts.

Now the scripts download from the original sites over HTTP and FTP without
checks, because no course uses the template yet.

## 10. Site integration

* **Complete:**
  * the collections `_material_3`–`_material_5` with `lang: en`;
  * the English interface (navigation, chapter header, search, code blocks,
    zen mode, figure player);
  * chapters 17–32 with their figures;
  * each page loads only the figure scripts of its figures, and the URL of an
    asset contains a hash of its content (`_scripts/asset-data.py`).
* **Chapter files:** each chapter is a file, for example `_material_5/33.md`:

  ```yaml
  ---
  title: 33. The CPU in Depth and How to Measure
  slug: week33
  glyph: osa14
  sections:
    - Good measurements
    - Latency distributions
  ---
  ```

* **Figures:** new modules for Part V (for example `viz-perf.js` and
  `viz-query.js`). Each figure registers itself as before. `_data/assets.yml`
  connects each figure to its module.
* **New pages:** see section 14.

## 11. Sequence of work

1. Prepare the course machine and the grader: the queue, the sanitizers, Intel
   SDE and bubblewrap (`cpp/grader/`).
2. Calibrate the goals of weeks 17–32 again on the course machine.
3. Write Part V in sequence. Write week 33 first, because it gives the
   measurement method of the part. Then write weeks 34–39, and then the
   capstone (40). The starting systems of the capstone are the reference
   solutions of earlier weeks.
4. Write Part VI (section 8) after Part V.
5. At the same time as steps 3–4, translate Parts I–II (section 13) and write
   the course pages (section 14).

Each week gives:

* the chapter and its figures;
* 8 tasks with skeletons, tests, reference solutions and calibrated goals;
* benchmarks that use `tira::compare_fresh` for each goal;
* at least 5 exam questions, and the questions for "Explain your `perf stat`".

## 12. Open questions

* Are the checks "Explain your `perf stat`" talks, or written answers under
  supervision? The number of students and of teaching assistants decides.
* Do students do the capstone alone or in pairs?
* Which variants does each task get (section 4)?

## 13. Translation of Parts I–II to English and C++

Parts I–II (*Osa I–II*, weeks 1–16) will change to English and to C++. Then
the full course uses one language and one programming language. This is the
plan:

* **Language:** The chapters, the tasks, the exam and the pages will be in
  English, in the style of Parts III–V: short sentences and one topic in each
  paragraph. The Finnish version stays available until the English version
  has run one time.
* **C++ from week 1:** The C++ self-study chapter (section 3) becomes the
  start of Part I. The examples and the tasks change from Python to C++23.
  Where the material compares languages (lists, dictionaries, `set`), it
  compares the C++ standard library (`std::vector`, `std::unordered_map`,
  `std::set`, `std::map`) with Python. Many students know Python.
* **Code checks:** Compile and run each C++ example, as for the Python
  examples (`CORRECTIONS.md`). The outputs must agree with the text. Do not
  use outputs that depend on the implementation, for example the sequence of
  an unordered container. If such an output is necessary, put a label on it.
* **Tasks:** All 128 tasks change to C++. If a task only must give a correct
  output in a time limit, it can stay on CSES, because CSES accepts C++. Set
  the time limits again for C++. Tasks that compare speed go to the grader of
  Parts III–V.
* **Figures:** The interactive figures replay the code of the course. When an
  example changes from Python to C++, the figure must replay the new code. The
  code panels already show C++ with colours.
* **Sequence:** Part I first. Then the first students of the C++ version can
  start from week 1.

## 14. Course logistics (for Parts III–V, and later Part VI)

The Finnish front page has course pages for Osa I–II. Parts III–V must have
English course pages too. The front page now shows only Osa I–II (2 × 5 op,
16 weeks, 128 tasks, Python). It must show all parts. Write these pages:

* **Completion:** the points for each week (8), the minimum of 5 points for
  each week, the grade limits, the exam, and what each grade must have
  (section 4).
* **Schedule:** the publication date of each week, the deadline, the times of
  the lectures, and the exam dates of each part.
* **Submissions and grades:** how to submit; what the grader does (the
  sandbox, the task files that it takes, new inputs, 3 runs for each goal);
  where to see the results; and the tolerance of the goals
  (`cpp/grader/README.md`, `cpp/CALIBRATION.md`).
* **The course machine and the development server:** how a student receives access,
  the rules of use, and what to do without an x86 computer with AVX2.
* **Rules for AI and for collaboration:** what is allowed, the checks "Explain
  your `perf stat`", and what occurs if a student cannot explain the solution.
* **A Finnish–English glossary** for students from Osa I–II.
* **Contact and help:** Discord channels for Parts III–VI, and the teachers.
