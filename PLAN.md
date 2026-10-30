# Plan: Parts III–V

Three new 5-credit courses that continue *Tietorakenteet ja algoritmit* (Osa I–II)
on this site, in English, as weeks 17–40. This file is the agreed plan; none of
the material is written yet. The site already supports the English parts
(collections `_material_3`–`_material_5` with `lang: en`).

## 1. Overview

| Part | Weeks | Course | Content |
|---|---|---|---|
| III | 17–24 | Search at Scale | Shortest paths on road networks, text and web search, vector search |
| IV | 25–32 | Storage Engines | The data structures inside databases: B+ trees, buffer pools, hash tables, tries, spatial indexes, LSM trees, MVCC |
| V | 33–40 | Performance Engineering | The CPU in depth, advanced SIMD, sorting, parsing, concurrency, parallel patterns, compression |

- **Prerequisites:** Osa I–II (Python). The three parts are independent and can be
  taken in any order. Students learn C++ from a self-study chapter before their
  first part (section 3), and the first week of each part revisits the tools.
- **Week format:** as in Osa I–II: one chapter, a 2-hour lecture and 8 tasks.
- **Language:** English for the material, tasks and exam.

## 2. Design principles

### 2.1 SIMD and parallelism from the first week

Every week has an optimization part. In Parts III and IV a week typically has
5–6 tasks on the algorithm and 2–3 on its optimization; the first week of each
part (17, 25, 33) and all of Part V are about optimization throughout. The
optimization uses SIMD, threads or both, whichever the week's algorithm
actually benefits from; no task is a contrived kernel added to tick a box. Each
part has SIMD tasks in at least five weeks and parallel tasks in at least five
weeks.

### 2.2 The hardware model comes first

Week 17 teaches the model every later optimization relies on:

- latency vs throughput;
- caches, cache lines and memory bandwidth;
- branch prediction;
- data layout: array of structs vs struct of arrays.

Weeks 25 (memory) and 33 (CPU) go deeper, so Parts IV and V stand on their own.

### 2.3 The SIMD ladder

| Weeks | Skill | Examples |
|---|---|---|
| 17 | auto-vectorization, `#pragma omp simd`, first intrinsics | RGBA blending with saturating arithmetic |
| 18–19 | compares, min/max, masks | AVX-512 8-ary heap, landmark bounds |
| 20, 23 | arithmetic, FMA, several accumulators | min-plus distance tables, vector distances |
| 21 | compare → movemask → shuffle | Roaring and posting-list intersection |
| 22, 24 | memory-bound code: prefetching, gathers | PageRank, HNSW |
| 25–31 | searching inside nodes, group probes, filters | static B-tree and B+ tree nodes, the Count-Min sketch, Swiss tables, ART Node16, R-tree nodes, split-block Bloom filters |
| 33–40 | shuffles, `pshufb` tables, AVX-512 compress, sorting networks, portable SIMD | sorting, parsing, compression |

Part IV also uses two scalar instructions: BMI2 `pdep`/`pext` for Morton keys
(week 30) and SSE4.2's `crc32` for checksums (week 31). They are taught where
they are used but do not count as SIMD.

### 2.4 The concurrency ladder

| Stage | Tools | Weeks |
|---|---|---|
| Data parallelism without shared mutable state | OpenMP `parallel for` and reductions, `std::jthread`, partition-then-merge, per-thread buffers, batches of independent queries | 17–24 |
| Mutual exclusion | `std::mutex`, `std::shared_mutex`, sharding, latch coupling | 24 (bonus), 27–32 |
| Atomics and the memory model | `std::atomic`, memory orders, lock-free queues, optimistic lock coupling, memory reclamation | 38–40 |

ThreadSanitizer is taught in week 17, and every parallel task must run clean
under it. GCC's OpenMP runtime (libgomp) is not instrumented for
ThreadSanitizer and produces false reports, so race-checking builds use Clang
with LLVM's OpenMP runtime, whose Archer tool tells ThreadSanitizer about
OpenMP's synchronization.

### 2.5 AVX-512 where the algorithm needs it

AVX2 (x86-64-v3) is the baseline. AVX-512 is used where AVX2 lacks what the
kernel needs:

- the 8-ary heap in week 18: unsigned 64-bit minimum and compares into a mask
  register (`vpminuq`, `vpcmpuq`), which AVX2 does not have;
- 64-bit keys in B+ tree nodes in week 26: 8 keys per compare, where AVX2
  compares 4 signed keys;
- compress, mask registers and two-source permutes for filtering,
  partitioning and sorting in Part V.

The course machine has AVX-512. Students whose own x86 computers lack it check
correctness with Intel SDE and measure on the course machine. Students with ARM
laptops (Apple silicon) use the development server (section 8).

### 2.6 Skeletons, not infrastructure

Every task comes with a skeleton that already does the input/output, data
loading, tests and benchmarking, plus a scalar reference implementation.
Students write the algorithm and its optimized version.

### 2.7 Production code every week

Each week names code to read: the open-source system or paper where the
algorithm runs in production.

## 3. Tools

Introduced in week 17 and used in every week after it:

| Area | Tools |
|---|---|
| Language | C++23 with GCC 16 (`-std=c++23`; GCC 16 defaults to C++20) |
| Build | CMake presets: `debug` (`-O0 -g`, AddressSanitizer + UBSanitizer), `tsan` (Clang, `-fsanitize=thread`, LLVM OpenMP), `release` (`-O3 -march=x86-64-v3`, AVX-512 targets where a task needs them) |
| Debugging | gdb: breakpoints, watchpoints, backtraces, SIMD registers (`p $zmm0`) |
| Sanitizers | AddressSanitizer, UndefinedBehaviorSanitizer, ThreadSanitizer |
| Profiling | `perf stat` (cycles, instructions, IPC, cache and branch misses), `perf record`, `perf report`, `perf annotate` |
| Vectorization | Compiler Explorer; GCC `-fopt-info-vec-optimized` and `-fopt-info-vec-missed`; Clang `-Rpass=loop-vectorize` and `-Rpass-missed=loop-vectorize` |
| Testing | doctest; randomized tests against reference implementations; libFuzzer from week 26 |
| Benchmarking | nanobench |
| Style | clang-format, clang-tidy |
| SIMD | auto-vectorization → `#pragma omp simd` → AVX2 and AVX-512 intrinsics → portable SIMD in Part V (`std::simd` needs GCC 16 with `-std=c++26`; with C++23, `std::experimental::simd`; Highway) |
| Parallelism | OpenMP and `std::jthread` → mutexes → `std::atomic` (Part V). Not `std::execution`: with GCC's standard library its parallel algorithms need TBB |

**C++ self-study chapter** (before the first part): C++ for Python programmers.
It covers values and references, RAII, `std::vector`, `std::span`,
`std::string_view`, basic templates, undefined behaviour and building with
CMake. It has practice exercises but no graded tasks.

## 4. Assessment

- **Points:** each week has 8 tasks of 1 point, 64 per part. Passing requires
  at least 5 points from every week. Grades follow Osa I–II: 40 points → 1,
  45 → 2, 50 → 3, 55 → 4, 60 → 5.
- **Automatic checking:** every task is checked by a program, with no reports.
  - Correctness: randomized and adversarial tests against reference
    implementations.
  - Exact counts from deterministic runs, such as nodes settled or shortcuts
    added.
  - Speed: a ratio to the reference implementation. The grader measures it on
    the course machine, alternating student and reference runs.
  - Parallel tasks run with a fixed thread count on reserved cores and must be
    clean under ThreadSanitizer.
  - Every task must be clean under AddressSanitizer and UBSanitizer.
  - Osa I–II use CSES. Tasks that only need correct output within a time limit
    can stay there, since CSES accepts C++; speed-ratio, parallel and AVX-512
    tasks need the grader on the course machine.
- **Exam:** as in Osa I–II: 2 hours on campus, pen and paper, no computer,
  phone or notes, 5 tasks. Tasks 1–3 are required to pass, task 4 is required
  for grade 4 or 5, and task 5 for grade 5. Proposed task types:
  1. a short C++ function written on paper;
  2. tracing an algorithm of the part (Dijkstra with a 4-ary heap, a B+ tree
     split, a compaction);
  3. reading SIMD or parallel code: what a mask computes, where the data race
     is;
  4. a harder programming task;
  5. a harder theoretical task: a proof (a consistent heuristic, a stopping
     rule) or a calculation (false-positive rates, amplification, Amdahl's
     law).
- **Exam language:** English. Check the university's rules on students'
  right to answer in Finnish or Swedish.

## 5. Part III — Search at Scale (weeks 17–24)

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 17 | C++ Tools, Hardware and First Kernels | RGBA blending | reduction, histogram, prefix sum |
| 18 | Dijkstra at Scale | AVX-512 8-ary heap | batches of queries |
| 19 | A*, ALT and Bidirectional Search | landmark bounds | landmark preprocessing |
| 20 | Contraction Hierarchies | min-plus distance tables | contraction of independent sets |
| 21 | Text Search | Roaring and posting-list intersection | sharded indexing |
| 22 | PageRank | rank update | pull-based matrix–vector product |
| 23 | Vector Search I: Exact Search and Quantization | FMA distances, PQ fast scan | batches of queries |
| 24 | Vector Search II: Graph Indexes | distances, prefetching | parallel queries |

### Week 17 — C++ Tools, Hardware and First Kernels

- **Content:**
  - the tools of section 3 and the hardware model of section 2.2;
  - auto-vectorization and the vectorization report;
  - `#pragma omp simd` and the first AVX2 intrinsics;
  - OpenMP `parallel for` and reductions, and the same reduction with
    `std::jthread` and per-thread partial sums, to show what OpenMP does;
  - Amdahl's law;
  - data races and ThreadSanitizer.
- **SIMD:** blending two RGBA images with saturating 8-bit arithmetic, step by
  step: scalar, auto-vectorized, intrinsics. Array of structs vs struct of arrays.
- **Parallel:**
  - a reduction;
  - a histogram with per-thread copies, contrasted with atomics and false sharing;
  - a two-pass prefix sum.
- **Tasks (8):** setup and a bug found with AddressSanitizer and gdb 1 · RGBA
  SIMD 2 · parallel reduction 2 · histogram without contention 2 · parallel
  prefix sum 1

### Week 18 — Dijkstra at Scale

- **Content:** graphs in compressed sparse row (CSR) arrays; Dijkstra with a
  binary heap; lazy deletion vs decrease-key; d-ary heaps.
- **SIMD (AVX-512):**
  - The heap stores 64-bit keys `(distance << 32) | node`. Comparing keys
    compares distances first and node ids second, so the order in which nodes
    are settled is deterministic and the grader can check it exactly. A popped
    key gives back both the distance and the node, and stale keys are skipped
    (lazy deletion).
  - The root is at slot 7 of a 64-byte-aligned array, so the 8 children of
    every node fill one aligned cache line: one 512-bit load.
  - Sift-down takes the minimum of the 8 children with
    `_mm512_reduce_min_epu64` (a short tree of permutes and
    `_mm512_min_epu64`); `_mm512_cmpeq_epu64_mask` against that minimum and
    `std::countr_zero` give the child's position, with no branch per child.
  - Empty slots hold `UINT64_MAX`, so the last, partly filled group needs no
    special case.
  - For comparison, the same heap in AVX2 needs two registers per group and
    `_mm256_cmpgt_epi64` with blends, because AVX2 has no 64-bit min. That
    compare is signed, so distances must stay below 2³¹ there. Students measure
    the 4-ary heap and both 8-ary heaps on the course machine.
- **Parallel:** batches of independent queries with OpenMP. Each thread has its
  own workspace with versioned distance arrays, so nothing is reset between
  queries.
- **Tasks (8):** CSR loader 1 · Dijkstra 2 · 4-ary heap 1 · AVX-512 8-ary heap
  (with the AVX2 version for comparison) 2 · parallel batch 2
- **Read:** Boost.Graph's default 4-ary heap (`d_ary_heap_indirect`); OSPF and
  IS-IS shortest-path-first routing.
- **Bonus:** radix heap.

### Week 19 — A*, ALT and Bidirectional Search

- **Content:** A* and consistent heuristics; a geometric heuristic scaled by the
  minimum of w(e)/geo(e) over all edges, which makes it consistent; ALT with
  farthest-point landmarks; bidirectional Dijkstra and its stopping rule
  (top_f + top_b ≥ μ).
- **SIMD:** the ALT lower bound on d(v,t): the maximum over 8 landmarks L of
  d(L,t) − d(L,v) and d(v,L) − d(t,L), with AVX2 on 32-bit distances stored
  per node (8 landmarks in one register).
- **Parallel:** landmark preprocessing, one Dijkstra per landmark.
- **Tasks (8):** A* 2 · ALT 2 · bidirectional search with random tests 2 · SIMD
  landmark bound 1 · parallel preprocessing 1
- **Read:** Goldberg & Harrelson, *Computing the shortest path: A\* search meets
  graph theory* (SODA 2005).
- **Bonus:** IDA* and beam search on the 15-puzzle, with the Manhattan distance
  computed by `_mm_sad_epu8`.

### Week 20 — Contraction Hierarchies

- **Content:** node ordering (edge difference), witness searches, shortcuts, the
  upward search and the query. Contraction hierarchies vs multi-level Dijkstra
  (customizable route planning) for live traffic.
- **SIMD:** many-to-many distance tables as a min-plus product over the upward
  search spaces.
- **Parallel:** contraction of independent node sets; the sets are given.
- **Tasks (8):** contraction with a given order 3 · query with tests against
  Dijkstra 2 · SIMD distance table 1 · parallel contraction 2
- **Read:** OSRM: `osrm-contract` for contraction hierarchies;
  `osrm-partition` and `osrm-customize` for multi-level Dijkstra.

### Week 21 — Text Search

- **Content:**
  - tokenization, the inverted index and posting lists;
  - AND/OR queries with galloping intersection;
  - BM25 ranking and top-k with a heap;
  - posting-list compression with delta + varint, and Stream VByte (SIMD
    decoding) as a section; week 40 implements it;
  - Roaring bitmaps with array, bitmap and run containers.
- **SIMD:** intersecting Roaring containers and sorted posting lists with SIMD
  compares.
- **Parallel:** sharded index construction and merging.
- **Tasks (8):** index and AND queries 2 · BM25 top-k 2 · Roaring bitmaps with
  SIMD intersection 2 · compression 1 · sharded parallel indexing 1
- **Read:** Lucene (Elasticsearch, OpenSearch, Solr); Roaring bitmaps (Lucene,
  Spark, Druid, ClickHouse).

### Week 22 — PageRank

- **Content:** link analysis, power iteration, dangling nodes, damping,
  convergence, personalized PageRank.
- **SIMD:** the rank update and convergence norms.
- **Parallel:** a pull-based matrix–vector product over CSR, with no atomics;
  the memory-bandwidth limit; vertex reordering for locality.
- **Tasks (8):** PageRank 3 · personalized PageRank 1 · SIMD update 1 ·
  parallel product 2 · vertex reordering 1
- **Read:** Brin & Page, *The Anatomy of a Large-Scale Hypertextual Web Search
  Engine* (1998).

### Week 23 — Vector Search I: Exact Search and Quantization

- **Content:**
  - vectors and distances (L2, inner product, cosine);
  - batched brute-force kNN with top-k;
  - k-d trees, which are exact and fast in 2–3 dimensions but useless in 128 (the
    curse of dimensionality);
  - the inverted file index (IVF) with k-means;
  - product quantization and asymmetric distance computation;
  - SimHash for near-duplicates, as a section.
- **SIMD:** FMA distance kernels with several accumulators; product-quantization
  "fast scan", where 4-bit codes look up distance tables with `vpshufb`.
- **Parallel:** batches of queries.
- **Tasks (8):** SIMD brute force with top-k 2 · k-d tree 1 · IVF 2 · product
  quantization with SIMD table lookups 2 · parallel batch 1
- **Read:** FAISS (`IndexIVFPQ` and the fast-scan indexes), ScaNN; Jégou,
  Douze & Schmid, *Product quantization for nearest neighbor search* (2011);
  André et al., PQ fast scan (VLDB 2015).
- **Bonus:** SimHash with popcount Hamming distances; LSH.

### Week 24 — Vector Search II: Graph Indexes

- **Content:**
  - navigable small-world graphs;
  - HNSW: layers, `M`, `efConstruction`, `efSearch`, heuristic neighbour
    selection;
  - recall vs queries per second;
  - DiskANN (Vamana) as reading.
- **SIMD:** distance kernels inside HNSW and prefetching of neighbour vectors.
- **Parallel:** queries in parallel.
- **Tasks (8):** HNSW 4 · SIMD distances and prefetching 2 · parallel queries 1
  · recall and speed threshold 1
- **Read:** hnswlib (`hnswalg.h`), FAISS `IndexHNSW`; Qdrant, Weaviate, Milvus;
  Microsoft DiskANN.
- **Bonus:** parallel HNSW construction with per-node locks; hybrid search
  (BM25 + vectors with reciprocal rank fusion).

## 6. Part IV — Storage Engines (weeks 25–32)

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 25 | The Memory Hierarchy and Layouts | static B-tree node search | bandwidth scaling, NUMA |
| 26 | B+ Trees | in-node search (AVX2 / AVX-512) | bulk loading |
| 27 | Pages, Buffer Pool and Caching | blocked Count-Min sketch | sharded buffer pool |
| 28 | Hash Tables | Swiss-table group probe | sharded concurrent map |
| 29 | Tries and Radix Trees | ART 16-key nodes | parallel build |
| 30 | Spatial Indexes | R-tree node tests | bulk loading, batched queries |
| 31 | LSM Trees | split-block Bloom filter | subcompactions |
| 32 | Concurrency Control and MVCC | — | latch coupling, concurrent readers and writers |

### Week 25 — The Memory Hierarchy and Layouts

- **Content:** the tools again (for students starting with Part IV); caches,
  TLB, prefetching, NUMA, the I/O model; binary-search layouts (sorted,
  Eytzinger, static B-tree); the cache-oblivious idea.
- **SIMD:** searching a 16-key static B-tree node with one or two vector compares.
- **Parallel:** memory bandwidth scaling with threads; NUMA placement.
- **Tasks (8):** Eytzinger search 2 · SIMD static B-tree 3 · prefetching 1 ·
  bandwidth scaling 2
- **Read:** Khuong & Morin, *Array Layouts for Comparison-Based Searching* (2017).

### Week 26 — B+ Trees

- **Content:** fan-out and height, splits and merges, leaf links and range
  scans, bulk loading; differential fuzzing against `std::map` with libFuzzer.
- **SIMD:** in-node search, with AVX2 for 32-bit keys and AVX-512 for 64-bit keys.
- **Parallel:** bulk loading from sorted runs.
- **Tasks (8):** insert/find 2 · range scan 1 · delete with merging 1 · fuzz
  harness 1 · SIMD in-node search 2 · parallel bulk load 1
- **Read:** InnoDB; PostgreSQL `nbtree/README`; SQLite `btree.c`;
  `absl::btree_map`; the Linux maple tree; OSS-Fuzz.

### Week 27 — Pages, Buffer Pool and Caching

- **Content:**
  - slotted pages;
  - the buffer pool: page table, pin/unpin, dirty pages, write-back;
  - replacement policies: LRU, CLOCK, LRU-K (reading) and W-TinyLFU (an LRU
    window plus a Count-Min admission sketch).
- **SIMD:** a blocked Count-Min sketch: all counters of a key lie in one
  64-byte block, which is read, incremented and minimized with vector
  instructions.
- **Parallel:** a sharded buffer pool with latches and concurrent clients.
- **Tasks (8):** slotted page 1 · buffer pool with CLOCK 2 · W-TinyLFU with a
  Count-Min sketch 2 · SIMD blocked Count-Min sketch 1 · sharded concurrent
  buffer pool 2
- **Read:** the PostgreSQL buffer manager (clock sweep); the InnoDB buffer pool
  (LRU with midpoint insertion); Caffeine (W-TinyLFU).
- **Bonus:** HyperLogLog.

### Week 28 — Hash Tables

- **Content:**
  - open addressing: linear probing, Robin Hood, cuckoo;
  - Swiss tables: control bytes with 7-bit hash fragments, groups, tombstones;
  - hash function quality and hash flooding;
  - consistent hashing: a ring with virtual nodes, and jump consistent hash;
    replication with quorums (N, R, W) as reading.
- **SIMD:** the Swiss-table group probe (16 control bytes with SSE2).
- **Parallel:** a sharded concurrent map with mutexes.
- **Tasks (8):** Robin Hood 2 · Swiss table 2 · SIMD group probe 2 · sharded
  concurrent map 1 · consistent hashing 1
- **Read:** Abseil `raw_hash_set.h`; Folly F14; DeCandia et al., *Dynamo:
  Amazon's Highly Available Key-value Store* (SOSP 2007: consistent hashing,
  quorums, Merkle trees), and Cassandra; Lamping & Veach, *A Fast, Minimal
  Memory, Consistent Hash Algorithm* (2014).

### Week 29 — Tries and Radix Trees

- **Content:**
  - tries and radix (Patricia) trees;
  - the adaptive radix tree (ART): node types 4, 16, 48 and 256, path
    compression, lazy expansion;
  - longest-prefix match for IP routing.
- **SIMD:** searching ART's 16-key nodes with SIMD, as in the ART paper.
- **Parallel:** parallel build by key ranges.
- **Tasks (8):** ART 3 · longest-prefix match on a BGP table 1 · SIMD Node16
  search 2 · parallel build 2
- **Read:** Leis, Kemper & Neumann, *The Adaptive Radix Tree* (ICDE 2013);
  DuckDB's ART indexes; Linux `fib_trie` (LC-trie).

### Week 30 — Spatial Indexes

- **Content:**
  - space-filling curves (Z-order/Morton, Hilbert) to index points with a B+ tree;
  - geohash;
  - R-trees with STR bulk loading, range queries and nearest-neighbour queries;
  - hexagonal grids (H3) and S2 cells.
- **Bit manipulation:** Morton keys by bit interleaving with BMI2
  `pdep`/`pext`. They are fast on Intel and on AMD Zen 3 or newer, and slow
  (microcoded) on older AMD.
- **SIMD:** testing a node's 8 rectangles against a query with vector compares
  (struct-of-arrays node layout).
- **Parallel:** STR bulk loading and batched queries.
- **Tasks (8):** Morton and Hilbert keys with BMI2 2 · R-tree with STR bulk
  loading 2 · R-tree range and kNN queries 1 · SIMD node tests 1 · geohash and H3
  cell queries 1 · parallel batched queries 1
- **Read:** PostGIS (R-trees over GiST); SQLite's R*Tree module; Redis GEO
  (geohash); Uber H3; Google S2.

### Week 31 — LSM Trees

- **Content:**
  - the write-ahead log and `fsync`;
  - the memtable as a skip list;
  - the SSTable format: data, index and filter blocks, checksums;
  - flushes, leveled and tiered compaction;
  - write, read and space amplification; tombstones;
  - Bloom filters: the formula and blocked filters.
- **SIMD:** the split-block Bloom filter (Parquet's layout: a key sets one bit
  in each 32-bit word of one 256-bit block).
- **Hardware instruction:** CRC32C block checksums with SSE4.2's `crc32`.
- **Parallel:** parallel subcompactions.
- **Tasks (8):** write-ahead log and skip-list memtable 2 · SSTable writer and
  reader with index block and CRC32C 2 · leveled compaction 1 · split-block
  Bloom filter 2 · parallel subcompactions 1
- **Read:** LevelDB `doc/impl.md`; RocksDB (FastLocalBloom and Ribbon filters);
  Cassandra; the Bigtable paper; the Parquet Bloom filter specification.
- **Bonus:** Merkle-tree anti-entropy between two stores.

### Week 32 — Concurrency Control and MVCC

- **Content:**
  - latches vs locks;
  - latch coupling ("crabbing") in B+ trees and B-link trees (Lehman–Yao);
  - MVCC: version chains, snapshot reads, timestamps, garbage collection;
  - optimistic lock coupling as reading (implemented in week 38).
- **Parallel:** a concurrent B+ tree with `std::shared_mutex` latch coupling;
  snapshot reads under concurrent writers.
- **Tasks (8):** latch-coupled B+ tree 3 · MVCC snapshot reads 3 · concurrent
  stress test, clean under ThreadSanitizer and checked against a sequential
  model 2
- **Read:** PostgreSQL `nbtree/README` (Lehman–Yao) and its MVCC; InnoDB undo
  logs; RocksDB snapshots.

## 7. Part V — Performance Engineering (weeks 33–40)

Every week in Part V is about optimization.

| Week | Topic | SIMD | Parallel |
|---|---|---|---|
| 33 | The CPU in Depth | several accumulators, 8×8 transpose | scaling, roofline |
| 34 | Advanced SIMD | shuffles, `pshufb`, compress, gathers, portable SIMD | — |
| 35 | Sorting in Production | — | parallel radix sort |
| 36 | SIMD and Parallel Sorting | sorting networks, vectorized quicksort | samplesort |
| 37 | Fast Parsing | delimiter scans, JSON structural index | chunked parsing |
| 38 | Concurrency | — | lock-free queues, optimistic lock coupling |
| 39 | Parallel Patterns | — | work stealing, parallel scan, BFS |
| 40 | Compression | bit unpacking, Stream VByte | block compression |

### Week 33 — The CPU in Depth

- **Content:** the tools again (for students starting with Part V); pipelines,
  execution ports, micro-ops, latency and throughput tables, branch
  prediction, top-down analysis, the roofline model.
- **Tasks (8):** setup 1 · dependency chains: a SIMD sum with several
  accumulators 2 · branchless rewrite 2 · cache-blocked transpose with 8×8
  AVX2 blocks 2 · parallel scaling and roofline placement 1
- **Read:** uops.info; Intel's top-down microarchitecture analysis.

### Week 34 — Advanced SIMD

- **Content:**
  - shuffles and permutes;
  - `pshufb` lookup tables;
  - AVX-512 masks, compress and expand;
  - gathers and scatters;
  - portable SIMD: `std::simd` (C++26; GCC 16 with `-std=c++26`), Highway, and
    NEON through Highway.
- **Tasks (8):** `pshufb` lookups (popcount, hex decoding) 2 · AVX-512 compress
  filter 2 · gathers vs struct of arrays 2 · portable version with `std::simd`
  or Highway 2
- **Read:** simdjson; Highway.

### Week 35 — Sorting in Production

- **Content:**
  - introsort (libstdc++);
  - pdqsort (Go since 1.19);
  - ipnsort and driftsort (Rust since 1.81);
  - Powersort's merge policy (CPython since 3.11);
  - dual-pivot quicksort (Java);
  - LSD radix sort;
  - external merge sort with a loser tree.
- **Tasks (8):** LSD radix sort 2 · parallel radix sort 2 · hybrid sort 2 ·
  external merge sort 2
- **Read:** the sort implementations of these libraries.

### Week 36 — SIMD and Parallel Sorting

- **Content:** sorting networks (bitonic); vectorized partitioning (AVX2
  permutation tables, AVX-512 compress); parallel samplesort.
- **Tasks (8):** bitonic network 2 · vectorized quicksort 3 · parallel
  samplesort 3
- **Read:** x86-simd-sort; Highway's vqsort.

### Week 37 — Fast Parsing

- **Content:**
  - SIMD scanning for delimiters;
  - integer parsing with SWAR;
  - JSON structural indexing with quote and escape masks;
  - UTF-8 validation;
  - parsing in parallel chunks.
- **Tasks (8):** CSV splitter 2 · integer parsing 2 · JSON structural index 3
  · parallel chunked parsing 1
- **Read:** simdjson; simdutf.

### Week 38 — Concurrency

- **Content:**
  - the C++ memory model and memory orders;
  - atomics and false sharing;
  - lock-free queues;
  - memory reclamation: epochs, hazard pointers;
  - optimistic lock coupling.
- **Tasks (8):** single-producer ring buffer 2 · multi-producer queue 2 ·
  optimistic lock coupling on the B+ tree 2 · epoch-based reclamation 1 ·
  false-sharing fix 1
- **Read:** Leis et al., *The ART of Practical Synchronization* (DaMoN 2016)
  and LeanStore; Folly's hazard pointers; crossbeam-epoch.

### Week 39 — Parallel Patterns

- **Content:** work stealing, task graphs, parallel scan and reduce, load
  balancing, NUMA; direction-optimizing BFS.
- **Tasks (8):** parallel scan 2 · work-stealing scheduler 3 · parallel frontier
  BFS 3
- **Read:** oneTBB; Ligra; the GAP benchmark suite (Beamer et al.).

### Week 40 — Compression

- **Content:** bit packing, delta and frame-of-reference coding, Stream VByte,
  LZ77 and LZ4's format; Huffman coding and zstd as reading.
- **Tasks (8):** SIMD bit unpacking 3 · Stream VByte 2 · LZ77 2 · parallel
  block compression 1
- **Read:** LZ4; zstd; Lemire et al., Stream VByte.

## 8. Infrastructure

### Course machine

- x86-64 on bare metal, because virtual machines often hide the performance
  counters.
- AVX2 and AVX-512 (F, VL, BW, DQ; VBMI2 for byte compress), BMI2 and SSE4.2.
  Older Intel server CPUs lower the clock for 512-bit instructions; Ice Lake
  and later, and AMD Zen 4 and 5, barely do. Calibrate thresholds on the
  machine itself.
- At least 16 physical cores for the scaling tasks, and memory for the data
  sets.
- `kernel.perf_event_paranoid` set to 2, so students can use `perf`.
- GCC 16, Clang with LLVM's OpenMP runtime (for ThreadSanitizer), and Intel SDE.
- **Grading queue:**
  - reserves cores for each job and pins its threads;
  - alternates student and reference runs and compares the ratio;
  - runs the sanitizer builds as part of grading.

### Development server

Students without an x86 computer with AVX2, for example on Apple silicon
laptops (where Intel SDE does not run either), need a remote x86 machine for
building, gdb and `perf`. Keep it separate from the grading machine, so that
interactive use does not disturb the measurements.

### Template repository

- CMake presets (`debug`, `tsan`, `release`), doctest, nanobench and a script
  that downloads the data.
- For every task: a skeleton and a scalar reference implementation.
- CI runs the correctness tests. GitHub-hosted runners may lack AVX-512, so
  AVX-512 tests run on the course machine or under Intel SDE.

### Data sets

| Data | Weeks | Licence |
|---|---|---|
| DIMACS 9th Challenge road networks (New York; full USA for stress tests) | 18–20 | public domain (derived from US Census TIGER/Line) |
| SNAP web graphs (web-Google) | 22 | free to use, with citation |
| English Wikipedia articles | 21, 37 | CC BY-SA |
| SIFT10K and SIFT1M (TEXMEX) | 23–24 | check the terms |
| OpenStreetMap extract of Finland | 30 | ODbL: attribution, share-alike for derived databases |
| RouteViews BGP tables | 29 | public |
| Synthetic key-value workloads (YCSB-style generator) | 26–32 | ours |

## 9. Site integration

- **Already done:** collections `_material_3`–`_material_5` with `lang: en`,
  and the English interface (navigation, chapter header, search, code blocks,
  zen mode, figure player).
- **Chapter files:** each chapter is a file such as `_material_3/17.md`:

  ```yaml
  ---
  title: 17. C++ Tools, Hardware and First Kernels
  slug: week17
  glyph: osa14
  sections:
    - The hardware model
    - Auto-vectorization
  ---
  ```

- **Figures:** new modules for Parts III–V (for example `viz-routing.js`,
  `viz-storage.js`, `viz-perf.js`), loaded only on pages with figures and
  captioned in English.
- **New pages:** a Finnish–English glossary for students coming from Osa I–II,
  and English course pages for Parts III–V (completion, schedule, exam).

## 10. Build order

1. Set up the course machine and the grader: queue, sanitizers, Intel SDE.
2. Write the template repository and the C++ self-study chapter.
3. Finish weeks 17–18 completely (chapters, figures, tasks, reference
   solutions, calibrated thresholds)
4. Write the rest of Part III, then Part IV, then Part V.

Each week delivers:

- the chapter and its figures;
- 8 tasks with skeletons, tests, reference solutions and calibrated thresholds;
- at least 5 exam questions.

