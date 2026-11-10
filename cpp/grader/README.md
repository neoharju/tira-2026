# The grader

This file is written in ASD-STE100 Simplified Technical English (Issue 9).

`grade.sh` grades one week of one submission on the course machine:

```bash
grader/grade.sh --week 17 --submission /srv/submissions/student42 --out /srv/results/student42/week17
```

It shows a summary. It writes the summary and the output of each step to the
`--out` folder.

## Procedure of the grader

1. The grader copies its own template (`--template`) to a new temporary
   folder. The default template is the folder above this folder.
2. It takes **only the task files** of the week from the submission:
   * the files `task*`, but not `tasks.hpp`;
   * the other files that the tasks tell students to change: `heap4.hpp`,
     `workspace.hpp` and `dijkstra.hpp` in week 18, `astar.hpp` in week 19,
     `witness.hpp` and `query.hpp` in week 20, and `lpm.hpp` in week 29.

   The tests, the benchmarks, the baselines, the input generators, the CMake
   files and `common/` are always the copies of the grader. The summary lists
   the changed files that the grader does not take. Thus students know why.
3. It makes a list of code for a person to examine. This is code that reads
   the environment, files, `/proc` or the state of the benchmark, inline
   assembly, and code that runs before `main()`. This code is not an error by
   itself.
4. In the sandbox, on the cores of `--cpus`, with a time limit for each step:
   1. It builds and runs the tests of the week in the `debug` preset (GCC 16,
      AddressSanitizer and UndefinedBehaviorSanitizer).
   2. It builds and runs the tests in the `tsan` preset (ThreadSanitizer).
   3. It builds the `release` preset, and it runs the benchmark `--runs`
      times with `TIRA_SEED=random`.
5. A task passes if its tests pass in the two presets and if more than half of
   the runs reach its speed goal.

## The sandbox

Each build and each run occurs in a
[bubblewrap](https://github.com/containers/bubblewrap) sandbox:

* It has new namespaces for the network, the processes, IPC, the host name,
  the users and the cgroups. Thus there is **no network**, and the code in the
  sandbox cannot see other processes.
* The system (`/usr`, `/etc`, the compilers) is **read-only**. `/home` and all
  other folders that the sandbox does not mount do not exist in it.
* The code can write only to the temporary copy of the template and to a
  private `/tmp`. The data sets (`TIRA_DATA`) are read-only.
* The code has no capabilities, it is in a new session (no access to the
  terminal), it is the user `nobody`, and the sandbox stops when the grader
  stops.
* `timeout` limits the time of each step, and `taskset` pins each step to the
  cores of the job. With `TIRA_MEMORY` (for example `24G`) and `systemd-run`, a
  cgroup limits the memory. Do not use `ulimit -v`, because the sanitizers
  reserve terabytes of address space.

Run the grader as a dedicated user without privileges. In the sandbox, the
code of the student is `nobody`. But outside the sandbox, its processes belong
to the user that started the grader.

The sandbox protects the machine and the other submissions. It cannot protect
the benchmark from the code of the student in the same process, because that
code can read the memory of the benchmark. The list of step 3 makes such code
visible. The new inputs of `TIRA_SEED=random` (see `CALIBRATION.md`) make it
useless.

## Requirements of the course machine

* GCC 16 (`TIRA_GCC`), Clang with the OpenMP runtime of LLVM (`TIRA_CLANG`),
  CMake, bubblewrap, `taskset` (util-linux) and Python 3.
* The sandbox does not download doctest. The grader downloads `doctest.h` one
  time, does a check of its SHA-256, keeps it in `TIRA_CACHE`, and copies it
  into the build folders.
* The kernel must allow user namespaces for users without privileges
  (`kernel.unprivileged_userns_clone=1` on Debian and Ubuntu). On Ubuntu 24.04,
  an AppArmor profile for `bwrap` is also necessary.
