#!/usr/bin/env python3
"""Runs the benchmark of one week many times and calculates the speed goals.

    grader/calibrate.py --week 17 [--runs 20] [--cpus 0-3] [--threads 4] [--margin 0.85]

First, build the release preset with the reference solutions. CALIBRATION.md
gives the procedure. For each goal, the script shows the speedups of the runs,
their median, their 10th percentile, the spread in the runs, the goal from the
procedure, and the goal that bench.cpp has now.
"""
import argparse
import os
import re
import statistics
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--week", type=int, required=True)
parser.add_argument("--runs", type=int, default=20)
parser.add_argument("--cpus", default="0-3")
parser.add_argument("--threads", type=int, default=4)
parser.add_argument("--margin", type=float, default=0.85)
parser.add_argument("--build", default="build/release")
args = parser.parse_args()

bench = os.path.join(args.build, f"week{args.week}", f"w{args.week}_bench")
if not os.access(bench, os.X_OK):
    sys.exit(f"{bench} does not exist: build the release preset first")
env = dict(os.environ, TIRA_SEED="random", OMP_NUM_THREADS=str(args.threads), OMP_PROC_BIND="close", OMP_PLACES="cores")
line = re.compile(r"^(task\d+ .*?)\s+baseline .* speedup\s+([\d.]+)x ±\s*(\d+)%\s+goal\s+([\d.]+)x")

speedups, spreads, goals = {}, {}, {}
for r in range(args.runs):
    out = subprocess.run(["taskset", "-c", args.cpus, bench], env=env, capture_output=True, text=True).stdout
    for text in out.splitlines():
        m = line.match(text)
        if m:
            name = m.group(1).strip()
            speedups.setdefault(name, []).append(float(m.group(2)))
            spreads.setdefault(name, []).append(float(m.group(3)))
            goals[name] = float(m.group(4))
        elif "WRONG" in text:
            sys.exit(f"run {r + 1}: {text.strip()}\nThe reference solutions must be right before you calibrate.")
    print(f"run {r + 1} of {args.runs} done", file=sys.stderr)


def round_down(x):
    step = 0.05 if x < 2 else 0.1 if x < 10 else 1.0
    return int(x / step) * step


print(f"week {args.week}, {args.runs} runs, cores {args.cpus}, {args.threads} threads, margin {args.margin}\n")
print(f"{'goal':<36}{'median':>8}{'p10':>8}{'spread':>8}{'new goal':>10}{'now':>8}  reached")
for name, s in speedups.items():
    ordered = sorted(s)
    p10 = ordered[max(0, int(0.1 * len(ordered)) - 1)] if len(ordered) >= 10 else ordered[0]
    new = round_down(args.margin * p10)
    reached = sum(x >= new for x in s)
    flag = "" if statistics.median(spreads[name]) <= 15 else "  SPREAD TOO LARGE: find the cause first"
    print(f"{name:<36}{statistics.median(s):>7.2f}x{p10:>7.2f}x{statistics.median(spreads[name]):>7.0f}%"
          f"{new:>9.2f}x{goals[name]:>7.2f}x  {reached}/{len(s)}{flag}")
