/* Figures for chapter 17 (Part III): caches, SIMD lanes, data layout, data
   races, false sharing, the parallel prefix sum and Amdahl's law. The text is
   in English: this file is loaded on the English pages (see `viz` in
   _config.yml). */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, VarsPanel, frame, s } = V;

  const cell = (id, x, y, label, cls = "", w = 30, h = 30) => ({ id, x, y, label, shape: "rect", w, h, rx: 6, cls: `${cls} is-mono` });
  const text = (id, x, y, t, cls = "", anchor) => ({ id, type: "text", x, y, text: t, cls, anchor });
  const box = (id, x, y, w, h, cls = "soft", over = false) => ({ id, type: "rect", x, y, w, h, cls, over });

  // A figure with tabs whose content is rebuilt when the tab changes.
  function tabbed(fig, opts, build) {
    let player = null;
    const ui = frame(fig, { ...opts, onTab: (k) => show(k) });
    function show(k) {
      if (player) player.destroy();
      ui.stage.textContent = "";
      ui.side.textContent = "";
      player = build(ui, k);
    }
    show(opts.tab);
    return ui;
  }

  /* ================================================= cache lines (17) */
  register("cache-lines", (fig) => {
    const COLS = 16;
    const ROWS = 4;
    const MISS_NS = 80;
    tabbed(fig, {
      title: "Reading a 4 × 16 matrix of ints through a cache",
      kicker: "Animation",
      tabs: [["rows", "Row by row"], ["cols", "Column by column"]],
      tab: "rows",
    }, (ui, mode) => {
      const sc = new Scene(ui.stage, { w: 580, h: 236 });
      const vars = new VarsPanel(ui.side, "Counters");
      const CW = 27;
      const X = (c) => 108 + c * CW;
      const Y = (r) => 40 + r * 36;
      const order = [];
      if (mode === "rows") for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) order.push([r, c]);
      else for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) order.push([r, c]);
      const frames = [];
      let cache = []; // line numbers, the most recently used last
      let hits = 0;
      let misses = 0;
      const snap = (cap, cur = null, hit = null) => {
        const nodes = [];
        const marks = [];
        for (let r = 0; r < ROWS; r++) {
          const inCache = cache.includes(r);
          marks.push(box(`line${r}`, X(0) - CW / 2 - 4, Y(r) - 15, COLS * CW + 8, 30, inCache ? "ok" : "soft"));
          marks.push(text(`lab${r}`, X(0) - CW / 2 - 12, Y(r), `line ${r}`, inCache ? "ok mono" : "faint mono", "end"));
          for (let c = 0; c < COLS; c++) {
            let cls = inCache ? "ok" : "floor";
            if (cur && cur[0] === r && cur[1] === c) cls = hit ? "okf" : "bad";
            nodes.push(cell(`m${r}-${c}`, X(c), Y(r), "", cls, CW - 5, 22));
          }
        }
        for (let c = 0; c < COLS; c += 4) marks.push(text(`col${c}`, X(c), Y(ROWS - 1) + 26, `${c}`, "faint mono"));
        marks.push(text("cachelab", X(0) - CW / 2 - 12, 206, "cache:", "mono", "end"));
        [0, 1].forEach((k) => {
          const l = cache[k];
          marks.push(box(`slot${k}`, X(0) - 10 + k * 128, 192, 116, 28, l == null ? "soft" : "ok"));
          marks.push(text(`slott${k}`, X(0) + 48 + k * 128, 206, l == null ? "empty" : `line ${l}`, l == null ? "faint mono" : "ok mono"));
        });
        marks.push(text("note", X(0) + 262, 206, "room for 2 lines", "faint", "start"));
        frames.push({ st: { nodes, edges: [], marks }, cap, vars: [
          { k: "reads", v: String(hits + misses) },
          { k: "hits", v: String(hits), cls: hit === true ? "ok" : null },
          { k: "misses", v: String(misses), cls: hit === false ? "hl" : null },
          { k: "time", v: `≈ ${hits + misses * MISS_NS} ns` },
        ] });
      };
      snap(mode === "rows"
        ? "Every row of the matrix is 16 ints = 64 bytes: exactly one **cache line**. This tiny cache has room for 2 lines. We read the matrix row by row."
        : "The same matrix, but now we read it column by column: `a[0][0]`, `a[1][0]`, `a[2][0]`, … Every read jumps 64 bytes ahead, to the next line.");
      for (const [r, c] of order) {
        const hit = cache.includes(r);
        if (hit) {
          hits++;
          cache = cache.filter((x) => x !== r).concat(r);
        } else {
          misses++;
          cache = cache.concat(r);
          if (cache.length > 2) cache.shift();
        }
        snap(hit
          ? `Read \`a[${r}][${c}]\`: line ${r} is in the cache. A **hit**: about 1 ns.`
          : `Read \`a[${r}][${c}]\`: line ${r} is not in the cache. A **miss**: the CPU loads the whole line from memory, about ${MISS_NS} ns.${cache.length === 2 && mode === "cols" ? " The line that was used least recently is thrown out." : ""}`, [r, c], hit);
      }
      snap(mode === "rows"
        ? `Done: ${misses} misses and ${hits} hits. One miss brings 16 ints, and the next 15 reads are hits. Reading memory in order is fast.`
        : `Done: ${misses} misses and ${hits} hits for the same 64 ints: about ${misses * MISS_NS} ns instead of ${4 * MISS_NS + 60} ns. Every line is loaded 16 times, because it is thrown out before we come back to it.`);
      const p = new Player(fig, { frames, interval: 520, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
      p.playWhenVisible();
      return p;
    });
  });

  /* =================================================== SIMD lanes (17) */
  register("simd-lanes", (fig) => {
    const A = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8];
    const B = [2, 7, 1, 8, 2, 8, 1, 8, 2, 8, 4, 5, 9, 0, 4, 5, 2, 3, 5];
    const n = A.length;
    const CODE = {
      scalar: `for (std::size_t i = 0; i < n; ++i)
    c[i] = a[i] + b[i];`,
      simd: `std::size_t i = 0;
for (; i + 8 <= n; i += 8) {  // 8 ints = 256 bits
    __m256i x = _mm256_loadu_si256((const __m256i*)(a + i));
    __m256i y = _mm256_loadu_si256((const __m256i*)(b + i));
    _mm256_storeu_si256((__m256i*)(c + i), _mm256_add_epi32(x, y));
}
for (; i < n; ++i)  // the last n % 8 values, one at a time
    c[i] = a[i] + b[i];`,
    };
    tabbed(fig, {
      title: "Adding two arrays of 19 ints",
      kicker: "Animation",
      tabs: [["scalar", "One at a time"], ["simd", "AVX2: 8 at a time"]],
      tab: "simd",
    }, (ui, mode) => {
      const sc = new Scene(ui.stage, { w: 580, h: 190 });
      const code = new CodePanel(ui.side, CODE[mode], "c++");
      const vars = new VarsPanel(ui.side, "State");
      const CW = 27;
      const X = (i) => 70 + i * CW;
      const rows = { a: 40, b: 84, c: 140 };
      const c = new Array(n).fill(null);
      const frames = [];
      let ops = 0;
      const snap = (cap, line, lo = null, hi = null) => {
        const nodes = [];
        const marks = [];
        for (const [name, y] of Object.entries(rows)) {
          marks.push(text(`l${name}`, 40, y, name, "mono big", "end"));
          for (let i = 0; i < n; i++) {
            const v = name === "a" ? A[i] : name === "b" ? B[i] : c[i];
            const active = lo != null && i >= lo && i < hi;
            const cls = name === "c" ? (v == null ? "ghost" : active ? "okf" : "ok") : active ? "act" : "";
            nodes.push(cell(`${name}${i}`, X(i), y, v == null ? "" : v, cls, CW - 4, 30));
          }
        }
        for (let i = 0; i < n; i += 4) marks.push(text(`ix${i}`, X(i), 172, String(i), "faint mono"));
        if (lo != null && hi - lo > 1) marks.push(box("reg", X(lo) - CW / 2 + 1, 18, (hi - lo) * CW - 2, 140, "cur", false));
        frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "i", v: lo == null ? "–" : String(lo) }, { k: "add instructions", v: String(ops) }] });
      };
      snap(mode === "simd"
        ? "An AVX2 register holds 256 bits: 8 ints of 32 bits. One instruction adds 8 pairs at once."
        : "The plain loop handles one element per round: 19 rounds and 19 additions.", []);
      if (mode === "scalar") {
        for (let i = 0; i < n; i++) {
          c[i] = A[i] + B[i];
          ops++;
          snap(`\`c[${i}] = ${A[i]} + ${B[i]} = ${c[i]}\``, 2, i, i + 1);
        }
        snap("Done after 19 additions. A compiler can often turn this loop into the AVX2 version for you: that is **automatic vectorization**.", []);
      } else {
        let i = 0;
        for (; i + 8 <= n; i += 8) {
          for (let k = i; k < i + 8; k++) c[k] = A[k] + B[k];
          ops++;
          snap(`Lanes ${i}–${i + 7}: two loads, **one** \`_mm256_add_epi32\` and one store handle 8 elements.`, [3, 4, 5], i, i + 8);
        }
        for (; i < n; i++) {
          c[i] = A[i] + B[i];
          ops++;
          snap(`Only ${n - i} value${n - i > 1 ? "s are" : " is"} left, fewer than 8: the second loop finishes them one at a time.`, [7, 8], i, i + 1);
        }
        snap(`Done with ${ops} add instructions instead of 19. For a long array the SIMD loop is up to 8 times faster, if memory can deliver the data fast enough.`, []);
      }
      const p = new Player(fig, { frames, interval: 900, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
      p.playWhenVisible();
      return p;
    });
  });

  /* =========================================== array of structs vs SoA */
  register("aos-soa", (fig) => {
    const CH = ["r", "g", "b", "a"];
    const COL = { r: "c4", g: "c2", b: "c5", a: "c3" };  // red, aqua, blue, yellow
    tabbed(fig, {
      title: "Loading pixels into an AVX2 register (32 bytes)",
      kicker: "Animation",
      tabs: [["aos", "Array of structs"], ["soa", "Struct of arrays"]],
      tab: "aos",
    }, (ui, mode) => {
      const sc = new Scene(ui.stage, { w: 580, h: mode === "aos" ? 230 : 280 });
      const CW = 15;
      const X = (i) => 104 + i * CW;
      const frames = [];
      const row = (idPrefix, y, chans, cls = "") => chans.map((ch, i) => cell(`${idPrefix}${i}`, X(i), y, "", `${COL[ch]} ${cls}`, CW - 3, 22));
      const NAMES = { r: "red", g: "green", b: "blue", a: "alpha" };
      const snap = (cap, rows, extra = []) => {
        const nodes = CH.map((ch, k) => cell(`lg${ch}`, 110 + k * 78, 14, "", COL[ch], 12, 12));
        const marks = CH.map((ch, k) => text(`lgt${ch}`, 122 + k * 78, 14, NAMES[ch], "mono", "start"));
        for (const r of rows) {
          nodes.push(...r.nodes);
          marks.push(text(`t${r.id}`, 92, r.y, r.label, "mono", "end"));
        }
        frames.push({ st: { nodes, edges: [], marks: marks.concat(extra) }, cap });
      };
      if (mode === "aos") {
        const mem = Array.from({ length: 32 }, (_, i) => CH[i % 4]);
        const memRow = { id: "mem", y: 52, label: "memory", nodes: row("m", 52, mem) };
        const ticks = Array.from({ length: 8 }, (_, p) => text(`px${p}`, X(4 * p) + 1.5 * CW, 76, `pixel ${p}`, "faint", "middle"));
        snap("**Array of structs** (AoS): `struct Rgba { uint8_t r, g, b, a; }`. 8 pixels are 32 bytes: R, G, B, A, R, G, B, A, …", [memRow], ticks);
        const reg = { id: "reg", y: 116, label: "register s", nodes: row("s", 116, mem) };
        snap("`_mm256_loadu_si256` copies the 32 bytes into one register. To blend, every byte needs the alpha of **its own** pixel, but alpha is only in every 4th byte.", [memRow, reg], ticks);
        const alpha = { id: "alp", y: 160, label: "alpha", nodes: row("al", 160, mem.map(() => "a")) };
        snap("`_mm256_shuffle_epi8(s, mask)` builds a second register: byte 3 of every pixel is copied to all 4 bytes of that pixel. This shuffle is the extra price of AoS.", [memRow, reg, alpha], ticks);
        const out = { id: "out", y: 204, label: "result", nodes: row("o", 204, mem, "hl") };
        snap("Now the same multiply, add and divide instructions blend all 32 bytes: 8 pixels per round (task 3).", [memRow, reg, alpha, out], ticks);
      } else {
        const planes = CH.map((ch, k) => ({ id: `p${ch}`, y: 46 + k * 30, label: `${ch} plane`, nodes: row(`p${ch}`, 46 + k * 30, Array(32).fill(ch)) }));
        const ticks = [0, 8, 16, 24].map((i) => text(`pt${i}`, X(i), 162, `pixel ${i}`, "faint", "start"));
        snap("**Struct of arrays** (SoA): the image is 4 planes. All red values are together, then all green values, and so on.", planes, ticks);
        const r1 = { id: "rr", y: 196, label: "register r", nodes: row("rr", 196, Array(32).fill("r")) };
        const r2 = { id: "ra", y: 226, label: "register a", nodes: row("ra", 226, Array(32).fill("a")) };
        snap("One load gives 32 red values, another one 32 alpha values. Every byte already meets its own alpha: **no shuffle** is needed.", planes.concat([r1, r2]), ticks);
        const out = { id: "ro", y: 256, label: "result", nodes: row("ro", 256, Array(32).fill("r"), "hl") };
        snap("Each round blends 32 values of one plane. The loop is so simple that the compiler vectorizes it automatically (task 2), and the alpha plane is shared by r, g and b.", planes.concat([r1, r2, out]), ticks);
      }
      const p = new Player(fig, { frames, interval: 2400, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
      return p;
    });
  });

  /* =================================================== data race (17) */
  register("data-race", (fig) => {
    const CODE = {
      race: `long sum = 5;
#pragma omp parallel for
for (int i = 0; i < 2; ++i)
    sum += 1;  // load, add, store`,
      reduction: `long sum = 5;
#pragma omp parallel for reduction(+ : sum)
for (int i = 0; i < 2; ++i)
    sum += 1;  // each thread has its own sum`,
    };
    tabbed(fig, {
      title: "Two threads add 1 to the same variable",
      kicker: "Animation",
      tabs: [["race", "Shared sum"], ["reduction", "reduction(+ : sum)"]],
      tab: "race",
    }, (ui, mode) => {
      const sc = new Scene(ui.stage, { w: 460, h: 230 });
      const code = new CodePanel(ui.side, CODE[mode], "c++");
      const frames = [];
      const snap = (cap, line, o) => {
        const nodes = [
          { id: "sum", x: 230, y: 50, shape: "rect", w: 110, h: 46, rx: 10, label: `sum = ${o.sum}`, cls: `is-mono ${o.sumCls || ""}` },
          { id: "t0", x: 95, y: 170, shape: "rect", w: 150, h: 66, rx: 12, label: o.r0 == null ? "" : `${mode === "race" ? "register" : "private sum"}: ${o.r0}`, cls: `is-mono ${o.c0 || ""}` },
          { id: "t1", x: 365, y: 170, shape: "rect", w: 150, h: 66, rx: 12, label: o.r1 == null ? "" : `${mode === "race" ? "register" : "private sum"}: ${o.r1}`, cls: `is-mono ${o.c1 || ""}` },
        ];
        const edges = (o.edges || []).map(([a, b, cls]) => ({ id: `${a}-${b}`, a, b, dir: true, cls }));
        const marks = [text("h0", 95, 124, "thread 0", "mono"), text("h1", 365, 124, "thread 1", "mono")];
        if (o.op0) marks.push(text("o0", 95, 220, o.op0, "cur mono"));
        if (o.op1) marks.push(text("o1", 365, 220, o.op1, "cur mono"));
        frames.push({ st: { nodes, edges, marks }, cap, line });
      };
      if (mode === "race") {
        snap("`sum += 1` is three machine steps: **load** sum into a register, **add** 1, **store** it back. Both threads do it, so we expect 5 + 2 = 7.", [4], { sum: 5 });
        snap("Thread 0 loads sum: its register holds 5.", [4], { sum: 5, r0: 5, c0: "c0", op0: "load", edges: [["sum", "t0", "act"]] });
        snap("Before thread 0 stores, thread 1 also loads sum. It still sees 5.", [4], { sum: 5, r0: 5, r1: 5, c0: "c0", c1: "c1", op1: "load", edges: [["sum", "t1", "act"]] });
        snap("Both threads add 1 in their own registers.", [4], { sum: 5, r0: 6, r1: 6, c0: "c0", c1: "c1", op0: "add", op1: "add" });
        snap("Thread 0 stores 6.", [4], { sum: 6, r0: 6, r1: 6, c0: "c0", c1: "c1", op0: "store", edges: [["t0", "sum", "act"]] });
        snap("Thread 1 also stores 6, over the result of thread 0. One addition is lost: **sum is 6, not 7**. This is a **data race**: two threads use the same memory at the same time, at least one of them writes, and nothing orders the accesses.", [4], { sum: 6, sumCls: "bad", r0: 6, r1: 6, c0: "c0", c1: "c1", op1: "store", edges: [["t1", "sum", "bad"]] });
        snap("The result depends on timing, so the bug may hide for weeks. ThreadSanitizer (the `tsan` preset) reports it the first time both accesses happen, even if the result happens to be right.", [2, 4], { sum: 6, sumCls: "bad", r0: 6, r1: 6, c0: "c0", c1: "c1" });
      } else {
        snap("With `reduction(+ : sum)` every thread gets its **own** sum, which starts from 0.", [2], { sum: 5, r0: 0, r1: 0, c0: "c0", c1: "c1" });
        snap("The threads add to their private sums at the same time. They never touch the same memory, so there is no race.", [4], { sum: 5, r0: 1, r1: 1, c0: "c0", c1: "c1", op0: "add", op1: "add" });
        snap("At the end of the loop, OpenMP adds the private sums to the shared one, one thread at a time.", [2], { sum: 6, r0: 1, r1: 1, c0: "ok", c1: "c1", edges: [["t0", "sum", "ok"]] });
        snap("**sum = 7**, every time. The threads synchronize only once, at the end, instead of once per addition.", [2], { sum: 7, sumCls: "ok", r0: 1, r1: 1, c0: "ok", c1: "ok", edges: [["t1", "sum", "ok"]] });
      }
      const p = new Player(fig, { frames, interval: 2200, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); } });
      return p;
    });
  });

  /* ================================================ false sharing (17) */
  register("false-sharing", (fig) => {
    tabbed(fig, {
      title: "Two counters, two threads, two cores",
      kicker: "Animation",
      tabs: [["shared", "Same cache line"], ["padded", "alignas(64)"]],
      tab: "shared",
    }, (ui, mode) => {
      const sc = new Scene(ui.stage, { w: 560, h: mode === "shared" ? 176 : 216 });
      const vars = new VarsPanel(ui.side, "Counters");
      const frames = [];
      const SW = 28;
      let transfers = 0;
      const incs = [0, 0];
      // One copy of a cache line: 8 slots of 8 bytes. The counters c[0] and c[1]
      // are in slots 0 and 1 of line L (shared) or in slot 0 of lines A and B (padded).
      const snap = (cap, owner, hl = null) => {
        const nodes = [];
        const marks = [];
        const lines = mode === "shared" ? ["L"] : ["A", "B"];
        [30, 300].forEach((x0, ci) => {
          marks.push(box(`core${ci}`, x0 - 16, 14, 250, 40 + lines.length * 52, ci === hl ? "cur" : "soft"));
          marks.push(text(`corel${ci}`, x0 + 109, 32, `core ${ci} · thread ${ci}`, "mono"));
          lines.forEach((L, li) => {
            const has = owner[L] === ci;
            const y = 82 + li * 52;
            marks.push(text(`own${ci}${L}`, x0 - 2, y - 22, has ? `line ${L}: may write` : `line ${L}: no valid copy`, has ? "ok" : "faint", "start"));
            for (let k = 0; k < 8; k++) {
              let t = null;
              if (mode === "shared" && k < 2) t = k;
              if (mode === "padded" && k === 0) t = L === "A" ? 0 : 1;
              const cls = !has ? "dim floor" : t == null ? "floor" : `c${t}`;
              nodes.push(cell(`k${ci}${L}${k}`, x0 + k * SW + 12, y, t == null ? "" : String(incs[t]), `${cls} is-small`, SW - 4, 26));
            }
          });
        });
        marks.push(text("l3", 280, mode === "shared" ? 160 : 200, mode === "shared"
          ? "c[0] and c[1] are 8 bytes each, next to each other: both are in line L"
          : "struct alignas(64) Counter: each counter has a line of its own", "faint"));
        frames.push({ st: { nodes, edges: [], marks }, cap, vars: [
          { k: "thread 0", v: String(incs[0]) }, { k: "thread 1", v: String(incs[1]) },
          { k: "line transfers", v: String(transfers), cls: transfers ? "hl" : null },
        ] });
      };
      if (mode === "shared") {
        const owner = { L: null };
        snap("Each thread increments its own counter. They never use the same variable, so there is no data race. But the two counters are in the same 64-byte cache line.", owner);
        for (let round = 0; round < 3; round++) {
          for (const t of [0, 1]) {
            const moved = owner.L !== t;
            if (moved && owner.L != null) transfers++;
            owner.L = t;
            incs[t]++;
            snap(moved
              ? `Thread ${t} writes c[${t}]. A core may write a line only if no other core has a copy, so the line moves to core ${t} and the other copy becomes invalid.${transfers > 1 ? " Again." : ""}`
              : `Thread ${t} writes again.`, owner, t);
          }
        }
        snap(`After ${incs[0] + incs[1]} increments the line has moved ${transfers} times. Each move takes about as long as 50–100 additions, so the "parallel" loop can be slower than one thread. This is **false sharing**.`, owner);
      } else {
        const owner = { A: null, B: null };
        snap("With `alignas(64)` every counter starts a new cache line: c[0] is in line A and c[1] in line B.", owner);
        for (let round = 0; round < 3; round++) {
          for (const t of [0, 1]) {
            const L = t === 0 ? "A" : "B";
            const first = owner[L] == null;
            owner[L] = t;
            incs[t]++;
            snap(first ? `Thread ${t} writes c[${t}]: core ${t} gets line ${L} and keeps it.` : `Thread ${t} writes again. Line ${L} is already here.`, owner, t);
          }
        }
        snap("No line moves between the cores. An even simpler fix: count in a local variable and write the result to c[t] once, at the end.", owner);
      }
      const p = new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
      return p;
    });
  });

  /* ============================================== parallel prefix sum */
  register("prefix-sum", (fig) => {
    const A = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3];
    const T = 4;
    const B = A.length / T;
    const CODE = `// pass 1, in parallel: thread t sums its block
for (i = begin; i < end; ++i) s += p[i];
sum[t] = s;
// one thread: the offset of each block
offset[0] = 0;
for (u = 1; u < T; ++u) offset[u] = offset[u - 1] + sum[u - 1];
// pass 2, in parallel: thread t scans its block
run = offset[t];
for (i = begin; i < end; ++i) {
    run += p[i];
    p[i] = run;
}`;
    const ui = frame(fig, { title: "Prefix sum with 4 threads", kicker: "Animation", split: true });
    const sc = new Scene(ui.stage, { w: 470, h: 240 });
    const code = new CodePanel(ui.side, CODE, "c++");
    const CW = 26;
    const X = (i) => 34 + i * CW + Math.floor(i / B) * 10;
    const out = new Array(A.length).fill(null);
    let sums = new Array(T).fill(null);
    let offs = null;
    const frames = [];
    const snap = (cap, line, hlStep = null) => {
      const nodes = [];
      const marks = [text("lin", 20, 20, "input", "faint", "start"), text("lout", 20, 170, "result", "faint", "start")];
      A.forEach((v, i) => {
        const t = Math.floor(i / B);
        nodes.push(cell(`a${i}`, X(i), 48, v, `c${t}`, CW - 4, 30));
        const o = out[i];
        nodes.push(cell(`o${i}`, X(i), 198, o == null ? "" : o, o == null ? "ghost" : hlStep != null && i % B === hlStep ? "okf is-small" : "ok is-small", CW - 4, 30));
      });
      for (let t = 0; t < T; t++) {
        const cx = (X(t * B) + X(t * B + B - 1)) / 2;
        marks.push(text(`th${t}`, cx, 78, `thread ${t}`, "faint mono"));
        if (sums[t] != null) nodes.push(cell(`s${t}`, cx, 116, `sum ${sums[t]}`, `c${t}`, 74, 28));
        if (offs) marks.push(text(`of${t}`, cx, 146, `starts at ${offs[t]}`, "done mono"));
      }
      frames.push({ st: { nodes, edges: [], marks }, cap, line });
    };
    snap("We want `p[i] = p[0] + … + p[i]`. The obvious loop is sequential: each result needs the previous one. Each of 4 threads gets one block of 4 values.", []);
    for (let t = 0; t < T; t++) sums[t] = A.slice(t * B, t * B + B).reduce((x, y) => x + y, 0);
    snap("**Pass 1**, in parallel: every thread sums its own block. Nothing depends on the other threads.", [2, 3]);
    offs = [0];
    for (let t = 1; t < T; t++) offs.push(offs[t - 1] + sums[t - 1]);
    snap(`One thread turns the 4 block sums into **offsets**: a block starts where all the blocks before it end (0, ${offs.slice(1).join(", ")}). This is a prefix sum too, but of only 4 values.`, [5, 6]);
    for (let k = 0; k < B; k++) {
      for (let t = 0; t < T; t++) {
        const i = t * B + k;
        out[i] = (k === 0 ? offs[t] : out[i - 1]) + A[i];
      }
      snap(k === 0 ? "**Pass 2**, in parallel: every thread scans its block again, starting from its offset." : `Step ${k + 1} of pass 2: all 4 threads write at the same time.`, [8, 9, 10, 11], k);
    }
    snap(`Done: the last value is ${out[out.length - 1]}, the sum of everything. Each value is read twice, so the speedup with T threads is less than T, especially when memory is the limit.`, []);
    const p = new Player(fig, { frames, interval: 1700, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); } });
    p.playWhenVisible();
  });

  /* ================================================== Amdahl's law (17) */
  register("amdahl", (fig) => {
    const PS = [0.5, 0.9, 0.95, 0.99];
    const COLORS = ["var(--vz-c3)", "var(--vz-c5)", "var(--vz-c4)", "var(--vz-c0)"];
    const THREADS = [1, 2, 4, 8, 16, 32, 64];
    const ui = frame(fig, {
      title: "Amdahl's law: speedup = 1 / ((1 − p) + p / T)",
      kicker: "Interactive",
      tabs: PS.map((p) => [String(p), `p = ${p}`]),
      tab: "0.9",
      onTab: (k) => show(+k),
    });
    const W = 560;
    const H = 300;
    const L = 52;
    const R = 24;
    const TOP = 18;
    const BOT = 46;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vz-svg", "aria-hidden": "true" }, ui.stage);
    const xs = (k) => L + (k / (THREADS.length - 1)) * (W - L - R);
    const ys = (v) => H - BOT - (v / 64) * (H - TOP - BOT);
    for (const v of [0, 16, 32, 48, 64]) {
      s("line", { x1: L, x2: W - R, y1: ys(v), y2: ys(v), class: "vz-gridline" }, svg);
      s("text", { x: L - 8, y: ys(v) + 4, class: "vz-tick", "text-anchor": "end" }, svg).textContent = String(v);
    }
    THREADS.forEach((t, k) => { s("text", { x: xs(k), y: H - BOT + 18, class: "vz-tick", "text-anchor": "middle" }, svg).textContent = String(t); });
    s("text", { x: (L + W - R) / 2, y: H - 8, class: "vz-tick", "text-anchor": "middle" }, svg).textContent = "threads T";
    s("text", { x: 14, y: ys(32), class: "vz-tick", "text-anchor": "middle", transform: `rotate(-90 14 ${ys(32)})` }, svg).textContent = "speedup";
    s("line", { x1: L, x2: W - R, y1: ys(0), y2: ys(0), class: "vz-axis" }, svg);
    const ideal = THREADS.map((t, k) => `${k ? "L" : "M"}${xs(k)} ${ys(t)}`).join("");
    s("path", { d: ideal, class: "vz-curve", style: "stroke: var(--fg-faint); stroke-dasharray: 5 5; stroke-width: 1.6" }, svg);
    s("text", { x: xs(6) - 6, y: ys(64) - 6, class: "vz-tick", "text-anchor": "end" }, svg).textContent = "perfect: T";
    const curves = PS.map((p, i) => {
      const d = THREADS.map((t, k) => `${k ? "L" : "M"}${xs(k)} ${ys(1 / ((1 - p) + p / t))}`).join("");
      const path = s("path", { d, class: "vz-curve", style: `stroke: ${COLORS[i]}` }, svg);
      const dots = THREADS.map((t, k) => s("circle", { cx: xs(k), cy: ys(1 / ((1 - p) + p / t)), r: 3.2, style: `fill: ${COLORS[i]}` }, svg));
      return { path, dots };
    });
    function show(p) {
      PS.forEach((q, i) => {
        curves[i].path.classList.toggle("is-faded", q !== p);
        curves[i].dots.forEach((d) => d.style.opacity = q === p ? 1 : 0.18);
      });
      const at64 = 1 / ((1 - p) + p / 64);
      const pct = Math.round((1 - p) * 100);
      ui.setCaption(`If ${pct} % of the work is sequential (p = ${p}), 64 threads give a speedup of only **${at64.toFixed(1)}**, and no number of threads can give more than **1 / (1 − p) = ${Math.round(1 / (1 - p))}**. To use many cores, the sequential part must be tiny.`);
    }
    show(0.9);
  });
})();
