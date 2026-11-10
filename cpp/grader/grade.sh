#!/usr/bin/env bash
# Grades one week of one submission in a sandbox. See grader/README.md.
#
#   grader/grade.sh --week 17 --submission DIR --out DIR [options]
#
# DIR is the copy of the cpp folder (or of one week folder) of the student.
# The grader builds its own copy of the template (--template). The copy has
# only the task files of the student. The grader runs the tests and the
# benchmarks with bubblewrap: no network, no other processes, a read-only
# system, and no files outside the build folder.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
template=$(cd "$here/.." && pwd)
week="" submission="" out=""
cpus="0-3" threads=4 runs=3 step_timeout=1800
gcc="${TIRA_GCC:-g++}" clang="${TIRA_CLANG:-clang++}"
data="${TIRA_DATA:-}" cache="${TIRA_CACHE:-$HOME/.cache/tira-grader}"
memory="${TIRA_MEMORY:-}"

usage() {
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    cat <<'EOF'
Options:
  --template DIR   the copy of the cpp folder that the grader uses (default: the folder above this script)
  --cpus LIST      the cores of the job, for taskset (default 0-3)
  --threads N      OMP_NUM_THREADS for the tests and the benchmarks (default 4)
  --runs N         the number of benchmark runs; more than half must reach a goal (default 3)
  --timeout S      the time limit of each step, in seconds (default 1800)
Environment: TIRA_GCC (GCC 16), TIRA_CLANG, TIRA_DATA (the data folder, read-only),
TIRA_CACHE (the grader keeps doctest.h here), TIRA_MEMORY (for example 24G: a memory
limit with systemd-run, if it is available).
EOF
    exit 2
}

while [ $# -gt 0 ]; do
    case "$1" in
        --week) week=$2; shift 2 ;;
        --submission) submission=$2; shift 2 ;;
        --out) out=$2; shift 2 ;;
        --template) template=$(cd "$2" && pwd); shift 2 ;;
        --cpus) cpus=$2; shift 2 ;;
        --threads) threads=$2; shift 2 ;;
        --runs) runs=$2; shift 2 ;;
        --timeout) step_timeout=$2; shift 2 ;;
        *) usage ;;
    esac
done
[ -n "$week" ] && [ -n "$submission" ] && [ -n "$out" ] || usage
[[ "$week" =~ ^[0-9]+$ ]] && [ -d "$template/week$week" ] || { echo "no week $week in $template" >&2; exit 2; }
command -v bwrap > /dev/null || { echo "bubblewrap (bwrap) is needed" >&2; exit 2; }
if [ "$(id -u)" = 0 ]; then
    echo "warning: run the grader as an unprivileged user: in the sandbox, root outside is still root" >&2
fi

gcc=$(command -v "$gcc") clang=$(command -v "$clang")
mkdir -p "$out"
out=$(cd "$out" && pwd)
log="$out/grade.log"
: > "$log"

# ---------------------------------------------------------------- Files
#
# The grader takes only these files from the submission: the task files and
# the few other files that the tasks tell students to change. All other files
# (tests, benchmarks, baselines, generators, CMake files, common/) are the
# copies of the grader.
student_files() {
    (cd "$template/week$week" && ls task* 2> /dev/null | grep -v '^tasks\.hpp$')
    case "$week" in
        18) printf '%s\n' heap4.hpp workspace.hpp dijkstra.hpp ;;
        19) printf '%s\n' astar.hpp ;;
        20) printf '%s\n' witness.hpp query.hpp ;;
        29) printf '%s\n' lpm.hpp ;;
    esac
}

src="$submission"
[ -d "$submission/week$week" ] && src="$submission/week$week"
[ -d "$src" ] || { echo "no submission folder $src" >&2; exit 2; }

work=$(mktemp -d "${TMPDIR:-/tmp}/tira-grade.XXXXXX")
trap 'rm -rf "$work"' EXIT
tar -C "$template" --exclude=./build --exclude=./data --exclude=./grader -cf - . | tar -C "$work" -xf -

taken=() review=()
while read -r f; do
    s="$src/$f"
    [ -e "$s" ] || continue
    if [ -L "$s" ] || [ ! -f "$s" ]; then review+=("$f: not a regular file, not used"); continue; fi
    if [ "$(stat -c %s "$s")" -gt 1048576 ]; then review+=("$f: larger than 1 MB, not used"); continue; fi
    cp "$s" "$work/week$week/$f"
    taken+=("$f")
done < <(student_files)

# List the changed files that the grader does not take. Then the student knows why.
ignored=()
while read -r f; do
    [ -f "$template/week$week/$f" ] || continue
    printf '%s\n' "${taken[@]:-}" | grep -qx "$f" && continue
    cmp -s "$src/$f" "$template/week$week/$f" || ignored+=("$f")
done < <(cd "$src" && find . -maxdepth 1 -type f -printf '%f\n')

# List code for a person to examine. This code can read the state of the
# benchmark, the environment or files, or it can run before main(). It is not
# an error by itself. The teacher decides.
for f in "${taken[@]:-}"; do
    [ -n "$f" ] || continue
    while IFS= read -r line; do review+=("$f:$line"); done < <(
        grep -nE '\b(getenv|secure_getenv|environ|syscall|dlopen|dlsym|ptrace|mmap|fork|vfork|execv[pe]?|system|popen|fopen|open)\s*\(|std::(i|o)?fstream|/proc/|/dev/|tira::(detail|round_seed)|TIRA_SEED|__attribute__\s*\(\(\s*(constructor|destructor)|\basm\b|__asm__|init_priority|#\s*include\s*<(fstream|filesystem|cstdio)>' \
            "$work/week$week/$f" || true)
done

# ---------------------------------------------------------------- Sandbox

doctest_h="$cache/doctest-2.4.12.h"
doctest_sha=94029a7d32da24a56249658147dbd2b33ff0b9ed665295cbbaf19aafff5b0ced
if [ ! -f "$doctest_h" ] || ! echo "$doctest_sha  $doctest_h" | sha256sum -c --quiet - 2> /dev/null; then
    mkdir -p "$cache"
    curl -fsSL -o "$doctest_h.part" https://raw.githubusercontent.com/doctest/doctest/v2.4.12/doctest/doctest.h
    echo "$doctest_sha  $doctest_h.part" | sha256sum -c --quiet -
    mv "$doctest_h.part" "$doctest_h"
fi
for preset in debug tsan release; do  # CMake finds it there, thus it does not download it.
    mkdir -p "$work/build/$preset/_deps/doctest/doctest"
    cp "$doctest_h" "$work/build/$preset/_deps/doctest/doctest/doctest.h"
done

sandbox_args=(--unshare-all --die-with-parent --new-session --cap-drop ALL
    --uid 65534 --gid 65534 --hostname grader
    --ro-bind /usr /usr --ro-bind /etc /etc
    --proc /proc --dev /dev --tmpfs /tmp
    --ro-bind-try /sys/devices/system/cpu /sys/devices/system/cpu    # OMP_PLACES=cores reads the topology.
    --ro-bind-try /sys/devices/system/node /sys/devices/system/node
    --bind "$work" /grade --chdir /grade
    --clearenv --setenv PATH /usr/bin:/bin --setenv HOME /tmp --setenv LANG C.UTF-8
    --setenv OMP_NUM_THREADS "$threads" --setenv OMP_PROC_BIND close --setenv OMP_PLACES cores)
for d in bin sbin lib lib32 lib64; do
    if [ -L "/$d" ]; then sandbox_args+=(--symlink "$(readlink "/$d")" "/$d")
    elif [ -d "/$d" ]; then sandbox_args+=(--ro-bind "/$d" "/$d"); fi
done
for tool in "$gcc" "$clang"; do  # Mount a compiler outside /usr (for example GCC 16 in /opt) read-only.
    prefix=$(dirname "$(dirname "$(readlink -f "$tool")")")
    case "$prefix" in /usr | /usr/*) ;; *) sandbox_args+=(--ro-bind "$prefix" "$prefix") ;; esac
done
[ -n "$data" ] && [ -d "$data" ] && sandbox_args+=(--ro-bind "$(cd "$data" && pwd)" /grade/data)

limit=()
if [ -n "$memory" ] && command -v systemd-run > /dev/null; then
    limit=(systemd-run --user --scope --quiet -p "MemoryMax=$memory" -p MemorySwapMax=0)
fi

# Runs one step in the sandbox, on the cores of the job, with a time limit.
run() {
    local name=$1
    shift
    echo "== $name" >> "$log"
    local status=0
    "${limit[@]}" timeout --kill-after=10 "$step_timeout" taskset -c "$cpus" bwrap "${sandbox_args[@]}" -- "$@" > "$out/$name.txt" 2>&1 || status=$?
    tail -n 20 "$out/$name.txt" >> "$log"
    echo "   exit $status" >> "$log"
    return 0
}

targets=(--target "w${week}_test" --target "w${week}_bench")
run configure-debug cmake --preset debug -DCMAKE_CXX_COMPILER="$gcc"
run build-debug cmake --build --preset debug -j "$threads" "${targets[@]}"
run tests-debug ctest --preset debug -R "^w$week\." --timeout "$step_timeout"
run configure-tsan cmake --preset tsan -DCMAKE_CXX_COMPILER="$clang"
run build-tsan cmake --build --preset tsan -j "$threads" "${targets[@]}"
run tests-tsan ctest --preset tsan -R "^w$week\." --timeout "$step_timeout"
run configure-release cmake --preset release -DCMAKE_CXX_COMPILER="$gcc"
run build-release cmake --build --preset release -j "$threads" "${targets[@]}"
for r in $(seq 1 "$runs"); do
    run "bench-$r" env TIRA_SEED=random "./build/release/week$week/w${week}_bench"
done

# ---------------------------------------------------------------- Summary

python3 - "$out" "$week" "$runs" <<'EOF' > "$out/summary.txt"
import re, sys
out, week, runs = sys.argv[1], sys.argv[2], int(sys.argv[3])

def read(name):
    try:
        return open(f"{out}/{name}.txt", errors="replace").read()
    except FileNotFoundError:
        return ""

def ctest(name):
    status = {}
    for m in re.finditer(r"Test +#\d+: w\d+\.(\w+) \.+\s*(\*{3})?(\w+)", read(name)):
        status[m.group(1)] = "pass" if m.group(3) == "Passed" else m.group(3).lower()
    return status

debug, tsan = ctest("tests-debug"), ctest("tests-tsan")
speed = {}  # task -> list of run results: True (goal reached), False, or None (no goal).
for r in range(1, runs + 1):
    seen = {}
    for line in read(f"bench-{r}").splitlines():
        m = re.match(r"(task\d+)\b", line)
        if not m:
            continue
        t, line = m.group(1), line.rstrip()
        if "no goal" in line:
            ok = None
        elif line.endswith(" ok"):
            ok = True
        else:  # BELOW GOAL, WRONG, SKIPPED, NOT GRADED or not measured.
            ok = False
        if ok is not None or t not in seen:
            seen[t] = ok if seen.get(t, True) is not False else False
    for t, ok in seen.items():
        speed.setdefault(t, []).append(ok)

tasks = sorted(set(debug) | set(tsan) | set(speed), key=lambda t: (len(t), t))
print(f"week {week}: {runs} benchmark runs with new inputs (TIRA_SEED=random)\n")
print(f"{'task':<8}{'debug tests':<14}{'tsan tests':<14}{'speed goal':<16}result")
points = 0
for t in tasks:
    d, s = debug.get(t, "-"), tsan.get(t, "-")
    goal = speed.get(t, [])
    graded = [x for x in goal if x is not None]
    if not graded:
        g, g_ok = "none", True
    else:
        n = sum(graded)
        g, g_ok = f"{n}/{len(graded)} runs", n * 2 > runs
    ok = d == "pass" and s in ("pass", "-") and g_ok
    points += ok and t.startswith("task")
    print(f"{t:<8}{d:<14}{s:<14}{g:<16}{'PASS' if ok else 'FAIL'}")
print(f"\npoints: {points}")
EOF

{
    echo
    echo "files taken from the submission: ${taken[*]:-none}"
    [ ${#ignored[@]} -gt 0 ] && printf 'changed, but the grader uses its own copy: %s\n' "${ignored[*]}"
    if [ ${#review[@]} -gt 0 ]; then
        echo "for a person to review (not an error by itself):"
        printf '  %s\n' "${review[@]}"
    fi
} >> "$out/summary.txt"
cat "$out/summary.txt"
