# Calibration of the speed goals

This document is written in ASD-STE100 Simplified Technical English (Issue 9).

## 1. Purpose

Each speed goal is a ratio. The ratio compares the time of the baseline with
the time of the student's code. This document gives the procedure that sets
each goal on the course machine.

A correct goal has two properties:

* The reference solution reaches the goal in almost all runs.
* The starting code and slow solutions do not reach the goal.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Baseline | The simple code in `baseline*.cpp`. The benchmark compares the student's code with it. |
| Reference solution | The teacher's solution of a task. It is not in the public repository. |
| Starting code | The code of a task in the template, before a student changes it. |
| Round | One measurement of the baseline and the student's code. Each round has new inputs. |
| Run | One start of a benchmark program (`wNN_bench`). A run has a warm-up round and some rounds. |
| Speedup | The median, over the rounds of one run, of the baseline time divided by the student's time. |
| Spread | The difference between the 75th and the 25th percentile of the round ratios, divided by the speedup. The benchmark shows it after `±`. |
| p10 | The 10th percentile of the speedups of many runs. |
| Margin | A number below 1. It keeps a goal below the p10 of the reference solution. This procedure uses 0.85. |

## 3. How the benchmark measures

Each goal uses `tira::compare_fresh` (`common/tira.hpp`). In each round, the
benchmark does these steps:

1. It makes new inputs. This step has no time measurement.
2. It measures the time of the baseline and the time of the student's code.
   The order of the two changes in each round.
3. It compares the result of the student's code with the correct result. If
   the result is not correct, the benchmark shows `WRONG`.

New inputs in each round make sure that a program cannot keep a result and
give it again. The environment variable `TIRA_SEED` controls the
inputs:

| `TIRA_SEED` | Inputs |
| --- | --- |
| Not set | The same inputs in each run. Use this to compare your own runs. |
| A number | Other fixed inputs. Each student can get a different number. |
| `random` | New random inputs in each round. The grader uses this. |

## 4. Equipment

* The course machine. Do not use a virtual machine. Use the same machine
  that the grader uses.
* GCC 16 and the `release` preset of the template.
* The reference solutions of the week.
* The data sets of the week in `data/` (see `cpp/README.md`). If the data
  sets are not there, the benchmark uses generated data, and the goals are
  different.
* `grader/calibrate.py`.

## 5. Procedure A: Prepare the machine

1. Stop all other jobs on the machine. Also stop the queue of the grader.
2. Set the CPU frequency governor to `performance`.
3. Set turbo to the state that the grader uses. Record this state.
4. Select the cores for the measurement. Use the cores that the grader uses
   (`--cpus`).
5. Make sure that no other process uses the other hardware thread of these
   cores.
6. Make sure that transparent huge pages have the same mode as on the grader.
   The default mode of the course is `madvise`.
7. Record these data: the CPU model, the microcode version, the kernel
   version, the GCC version and the commit of the template.

## 6. Procedure B: Measure the reference solutions

1. Copy the reference solutions of the week into a copy of the template.
2. Build the `release` preset with GCC 16:

   ```bash
   cmake --preset release -DCMAKE_CXX_COMPILER=g++-16
   ```

   ```bash
   cmake --build --preset release --target w17_bench
   ```

3. Make sure that the tests of the week pass in the `debug` and `tsan`
   presets. If a test fails, stop. Repair the reference solution first.
4. Start the calibration script. It does 20 runs with `TIRA_SEED=random`:

   ```bash
   grader/calibrate.py --week 17 --runs 20 --cpus 0-3 --threads 4
   ```

5. Examine the column `spread` of each goal. If the spread is more than 15 %,
   find the cause before you continue. Possible causes are:
   * other processes on the machine;
   * a frequency that changes;
   * a measurement that is too short. Make the input larger, or increase the
     number of rounds.

## 7. Procedure C: Calculate the goal

1. Read the p10 of the reference solution from the output of the script.
2. Multiply the p10 by the margin (0.85).
3. Round the result down: to 0.05 below 2, to 0.1 below 10, and to 1 above 10.
   The script shows this value as `new goal`.
4. Make sure that the reference solution reaches the new goal in at least 19
   of 20 runs. The column `reached` shows this number.
5. Measure the starting code with the same script. Make sure that the starting
   code does not reach 70 % of the new goal.
6. If you have a slow solution (for example, a solution without SIMD in a SIMD
   task), measure it too. Make sure that it does not reach the new goal.
7. If step 5 or step 6 fails, do not decrease the margin. Change the task or the
   benchmark: for example, use a larger input.

## 8. Procedure D: Record and publish the goals

1. Write each new goal in the call of `tira::report` in `weekNN/bench.cpp`.
2. Change the line "The goals were calibrated with ..." at the top of
   `bench.cpp`. Write the machine and the compiler.
3. Write the results in the calibration log of the course. For each goal,
   write the median, the p10, the spread, the new goal and the result of the
   starting code.
4. Change the numbers in the chapter, if the chapter gives the goal.
5. Do a check of the grader with the reference solutions:

   ```bash
   grader/grade.sh --week 17 --submission ref/ --out results/ref-week17
   ```

6. Make sure that the summary shows `PASS` for each task.

## 9. When to calibrate again

Do the procedures again when one of these items changes:

* the course machine, its BIOS settings or its kernel;
* the compiler or its version;
* a benchmark, a baseline or an input generator;
* a data set;
* the number of threads or the cores of the grader.

Also do the procedures again before each course starts.

## 10. Inputs for each student

The grader can give each student different fixed inputs: set `TIRA_SEED` to a
number that comes from the student number. Then the results of each student are
reproducible, and students cannot share expected outputs.

Calibrate with `TIRA_SEED=random`. Then the goals are correct for all seeds.

## 11. Notes

* The parallel goals are for the number of threads of the grader. If the
  grader uses more threads, calibrate again.
* Each goal compares with the baseline in the same run. Thus slow changes of
  the machine have a small effect. Fast changes increase the spread.
* The benchmark of a goal fails if the student's result is not correct in a
  round. A slow solution that is correct gets `BELOW GOAL`. An incorrect
  solution gets `WRONG`.
