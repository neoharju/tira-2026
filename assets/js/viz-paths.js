/* Figures for chapter 18 (Part III): the CSR layout, Dijkstra with lazy
   deletion, d-ary heaps, the AVX-512 search for the smallest child and
   versioned distance arrays. The frames are computed by running the same
   algorithms as the C++ code of the chapter. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, VarsPanel, frame } = V;

  const cell = (id, x, y, label, cls = "", w = 34, h = 32) => ({ id, x, y, label, shape: "rect", w, h, rx: 7, cls: `${cls} is-mono` });
  const text = (id, x, y, t, cls = "", anchor) => ({ id, type: "text", x, y, text: t, cls, anchor });
  const box = (id, x, y, w, h, cls = "soft") => ({ id, type: "rect", x, y, w, h, cls });
  const INF = "∞";

  /* ============================================================ CSR */
  register("csr", (fig) => {
    const N = 5;
    const EDGES = [[2, 0, 4], [0, 1, 2], [3, 4, 1], [0, 2, 5], [2, 3, 3], [1, 3, 6], [4, 0, 2], [2, 1, 1]];
    const POS = [[52, 92], [168, 74], [58, 200], [172, 196], [116, 282]];
    const BEND = { "2-0": 0.18, "0-2": 0.18, "4-0": -0.28 };
    const ui = frame(fig, { title: "Building the CSR arrays with counting", kicker: "Animation" });
    const sc = new Scene(ui.stage, { w: 600, h: 320 });
    const vars = new VarsPanel(ui.side, "State");
    const XC = (i) => 252 + i * 44;
    const offset = new Array(N + 1).fill(0);
    let next = null;
    const target = new Array(EDGES.length).fill(null);
    const weight = new Array(EDGES.length).fill(null);
    const frames = [];
    const snap = (cap, o = {}) => {
      const nodes = POS.map(([x, y], v) => ({ id: `v${v}`, x, y, label: String(v), cls: o.node === v ? "cur" : o.nodes && o.nodes.includes(v) ? "act" : "" }));
      const edges = EDGES.map(([a, b, w], i) => ({ id: `e${i}`, a: `v${a}`, b: `v${b}`, dir: true, label: String(w), bend: BEND[`${a}-${b}`] || 0, cls: o.edge === i ? "act" : o.edges && o.edges.includes(i) ? "done" : "" }));
      const marks = [text("lel", 230, 22, "edge list (in input order)", "faint", "start"),
        text("lof", 230, 118, "offset", "faint", "start"), text("ltg", 230, 196, "target", "faint", "start"), text("lwt", 230, 264, "weight", "faint", "start")];
      EDGES.forEach(([a, b, w], i) => {
        nodes.push(cell(`c${i}`, XC(i), 50, `${a}→${b}`, o.edge === i ? "cur" : o.placed && o.placed.includes(i) ? "done" : "", 40, 30));
        marks.push(text(`cw${i}`, XC(i), 76, `w ${w}`, "faint mono"));
      });
      offset.forEach((v, k) => {
        nodes.push(cell(`o${k}`, XC(k), 146, v, o.off === k ? "okf" : o.offRange && k >= o.offRange[0] && k <= o.offRange[1] ? "ok" : ""));
        marks.push(text(`oi${k}`, XC(k), 170, String(k), "faint mono"));
      });
      target.forEach((v, k) => {
        const inRange = o.range && k >= o.range[0] && k < o.range[1];
        nodes.push(cell(`t${k}`, XC(k), 222, v == null ? "" : v, v == null ? "ghost" : o.slot === k ? "okf" : inRange ? "ok" : "", 34, 30));
        nodes.push(cell(`w${k}`, XC(k), 288, weight[k] == null ? "" : weight[k], weight[k] == null ? "ghost" : o.slot === k ? "okf" : inRange ? "ok" : "", 34, 30));
        marks.push(text(`ti${k}`, XC(k), 248, String(k), "faint mono"));
      });
      frames.push({ st: { nodes, edges, marks }, cap, vars: next ? [{ k: "next", v: `[${next.join(", ")}]` }] : [{ k: "next", v: "–" }] });
    };
    snap("A graph with 5 nodes and 8 arcs, given as a list in any order (as in a file). We want, for every node, its arcs next to each other in memory.");
    EDGES.forEach(([a, b], i) => {
      offset[a + 1]++;
      snap(`Pass 1: arc ${a}→${b} leaves node ${a}, so count it in \`offset[${a + 1}]\`.`, { edge: i, node: a, off: a + 1 });
    });
    for (let v = 0; v < N; v++) {
      offset[v + 1] += offset[v];
      snap(`Prefix sum: \`offset[${v + 1}] += offset[${v}]\`. Now node ${v}'s arcs will be at positions ${offset[v]}…${offset[v + 1] - 1}.`, { node: v, off: v + 1 });
    }
    next = offset.slice(0, N);
    snap("`next[u]` is the next free position for an arc of node u. It starts as a copy of `offset`.", { offRange: [0, N - 1] });
    const placed = [];
    EDGES.forEach(([a, b, w], i) => {
      const k = next[a]++;
      target[k] = b;
      weight[k] = w;
      placed.push(i);
      snap(`Pass 2: arc ${a}→${b} goes to position \`next[${a}]++\` = ${k}.`, { edge: i, node: a, slot: k, placed: placed.slice(), edges: placed.slice() });
    });
    snap(`Done in O(n + m) time. The arcs of node 2 are positions \`offset[2]\` … \`offset[3] - 1\` = 3 … 5, in the same order as in the input: targets 0, 3 and 1.`, { node: 2, range: [3, 6], offRange: [2, 3], placed, edges: [0, 4, 7] });
    const p = new Player(fig, { frames, interval: 1300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
    p.playWhenVisible();
  });

  /* ================================================ Dijkstra, lazy */
  register("dijkstra-lazy", (fig) => {
    const ARCS = [[0, 1, 4], [0, 2, 1], [1, 3, 1], [1, 4, 6], [2, 1, 2], [2, 3, 5], [3, 4, 3], [4, 5, 2]];
    const POS = [[40, 140], [150, 58], [150, 222], [262, 140], [372, 58], [424, 190]];
    const N = POS.length;
    const CODE = `heap.push(make_key(0, source));
while (!heap.empty()) {
    std::uint64_t key = heap.pop();
    Node u = key_node(key);
    Dist d = key_dist(key);
    if (d != dist[u]) continue;  // an old key
    for (each arc u -> v with weight w)
        if (d + w < dist[v]) {
            dist[v] = d + w;
            heap.push(make_key(d + w, v));
        }
}`;
    const ui = frame(fig, { title: "Dijkstra's algorithm with lazy deletion", kicker: "Animation", split: true });
    const sc = new Scene(ui.stage, { w: 460, h: 320 });
    const code = new CodePanel(ui.side, CODE, "c++");
    const vars = new VarsPanel(ui.side, "Counters");
    const dist = new Array(N).fill(Infinity);
    const settled = new Set();
    let heap = []; // [d, v], kept sorted for the picture
    let pops = 0;
    let stale = 0;
    const frames = [];
    const snap = (cap, line, o = {}) => {
      const nodes = POS.map(([x, y], v) => ({
        id: `v${v}`, x, y, label: String(v),
        sub: dist[v] === Infinity ? INF : String(dist[v]), subCls: o.changed === v ? "is-hl" : "",
        cls: o.u === v ? "cur" : settled.has(v) ? "done" : dist[v] !== Infinity ? "act" : "",
      }));
      const edges = ARCS.map(([a, b, w], i) => ({ id: `e${i}`, a: `v${a}`, b: `v${b}`, dir: true, label: String(w), cls: o.arc === i ? (o.better ? "act" : "bad") : "" }));
      const marks = [text("hl", 14, 286, "heap:", "mono", "start")];
      const sorted = heap.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      sorted.forEach(([d, v], k) => {
        const old = d !== dist[v] || settled.has(v) && o.u !== v;
        nodes.push(cell(`h${d}-${v}`, 92 + k * 66, 286, `(${d}, ${v})`, o.popped && o.popped[0] === d && o.popped[1] === v ? "cur" : old ? "ghost" : "", 60, 28));
      });
      frames.push({ st: { nodes, edges, marks }, cap, line, vars: [{ k: "pops", v: String(pops) }, { k: "old keys skipped", v: String(stale), cls: o.stale ? "hl" : null }, { k: "settled", v: String(settled.size) }] });
    };
    dist[0] = 0;
    heap.push([0, 0]);
    snap("The source 0 gets distance 0 and its key (0, 0) goes to the heap. A key is a pair (distance, node): `make_key(d, v)` packs it into one 64-bit number.", 1);
    while (heap.length) {
      heap.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const [d, u] = heap[0];
      const popped = heap.shift();
      pops++;
      heap.unshift(popped);
      const tie = heap.length > 1 && heap[1][0] === d;
      snap(`Pop the smallest key (${d}, ${u}).${tie ? ` Two keys have distance ${d}: the smaller node number comes first.` : ""}`, [3, 4, 5], { u, popped });
      heap.shift();
      if (d !== dist[u]) {
        stale++;
        snap(`(${d}, ${u}) is an **old key**: node ${u} already has distance ${dist[u]}. Skip it. This is lazy deletion: instead of removing old keys from the heap, we ignore them when they come out.`, 6, { popped, stale: true });
        continue;
      }
      settled.add(u);
      snap(`Node ${u} is **settled**: its distance ${d} is final. Now relax its arcs.`, 6, { u });
      ARCS.forEach(([a, b, w], i) => {
        if (a !== u) return;
        if (d + w < dist[b]) {
          const before = dist[b];
          dist[b] = d + w;
          heap.push([d + w, b]);
          snap(`${d} + ${w} = ${d + w} < ${before === Infinity ? INF : before}: node ${b} gets distance ${d + w} and the key (${d + w}, ${b}) is pushed.${before !== Infinity ? ` The old key (${before}, ${b}) stays in the heap.` : ""}`, [8, 9, 10], { u, arc: i, better: true, changed: b });
        } else {
          snap(`${d} + ${w} = ${d + w} is not smaller than ${dist[b]}: nothing changes.`, 8, { u, arc: i, better: false });
        }
      });
    }
    snap(`The heap is empty. ${pops} pops for ${N} nodes: ${stale} of them were old keys. With decrease-key there would be no old keys, but the heap would need to know where every node is.`, []);
    const p = new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
    p.playWhenVisible();
  });

  /* ======================================================= 4-ary heap */
  register("dary-heap", (fig) => {
    const D = 4;
    let a = [1, 6, 2, 8, 3, 9, 7, 12, 10, 5, 11, 4, 14];
    const ui = frame(fig, { title: "Removing the minimum from a 4-ary heap", kicker: "Animation" });
    const sc = new Scene(ui.stage, { w: 580, h: 300 });
    // positions of heap index i in the tree picture
    const TX = [300, 122, 347, 470, 540, 40, 95, 150, 205, 265, 320, 375, 430];
    const TY = (i) => (i === 0 ? 34 : i <= 4 ? 108 : 182);
    const AX = (i) => 70 + i * 36;
    const frames = [];
    let key = null; // the key that moves down
    let hole = null;
    const snap = (cap, o = {}) => {
      const nodes = [];
      const edges = [];
      const marks = [text("arr", 20, 262, "array", "faint", "start")];
      for (let i = 0; i < a.length; i++) {
        const v = a[i];
        const cls = o.cmp && o.cmp.includes(i) ? (o.best === i ? "okf" : "act") : i === hole ? "ghost" : o.done && o.done.includes(i) ? "done" : "";
        nodes.push({ id: `n${v == null ? "h" : v}`, x: TX[i], y: TY(i), label: v == null ? "" : String(v), cls, r: 16 });
        nodes.push(cell(`a${v == null ? "h" : v}`, AX(i), 262, v == null ? "" : v, cls, 32, 30));
        marks.push(text(`ai${i}`, AX(i), 286, String(i), "faint mono"));
        if (i > 0) edges.push({ id: `p${i}`, a: `n${a[Math.floor((i - 1) / D)] == null ? "h" : a[Math.floor((i - 1) / D)]}`, b: `n${v == null ? "h" : v}`, cls: o.cmp && o.cmp.includes(i) ? "act" : "" });
      }
      if (key != null) nodes.push({ id: `n${key}`, x: o.keyX != null ? o.keyX : 520, y: o.keyY != null ? o.keyY : 34, label: String(key), cls: "cur", r: 16 });
      if (key != null) marks.push(text("kl", (o.keyX != null ? o.keyX : 520) + 28, o.keyY != null ? o.keyY : 34, "key", "cur mono", "start"));
      frames.push({ st: { nodes, edges, marks }, cap });
    };
    snap("A 4-ary heap with 13 keys. The children of index i are 4i+1 … 4i+4, so the tree has only 3 levels. A binary heap with 13 keys has 4.");
    const top = a[0];
    a[0] = null;
    hole = 0;
    snap(`\`pop()\` removes the smallest key ${top} from the root. The root is now a hole.`);
    key = a[a.length - 1];
    a = a.slice(0, -1);
    snap(`The last key ${key} must find a new place: we move the hole down until ${key} fits.`);
    let i = 0;
    for (;;) {
      const c = D * i + 1;
      if (c >= a.length) break;
      const kids = [];
      for (let j = c; j < Math.min(c + D, a.length); j++) kids.push(j);
      const best = kids.reduce((x, y) => (a[y] < a[x] ? y : x));
      snap(`Compare the ${kids.length} children of the hole: ${kids.map((j) => a[j]).join(", ")}. The smallest is ${a[best]}.`, { cmp: kids, best });
      if (a[best] >= key) break;
      snap(`${a[best]} < ${key}, so ${a[best]} moves up into the hole, and the hole moves down to index ${best}.`, { cmp: [best], best });
      a[i] = a[best];
      a[best] = null;
      hole = best;
      i = best;
      snap(`The hole is at index ${i}.`);
    }
    a[i] = key;
    hole = null;
    const k = key;
    key = null;
    snap(`The hole has no children, so ${k} goes there. 2 levels with 4 comparisons each, against 3 levels with 2 comparisons each in a binary heap: about the same work, but fewer steps that depend on each other and fewer cache lines.`, { done: [i] });
    const p = new Player(fig, { frames, interval: 1800, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    p.playWhenVisible();
  });

  /* ============================================ AVX-512 smallest child */
  register("heap8-simd", (fig) => {
    const KIDS = [7, 4, 9, 6, 2, 8, 5, 3];
    const GRAND = [11, 12, 9, 15, 10, 13, 16, 14];
    const CODE = `__m512i k = _mm512_load_si512(a + 8 * h + 8);
__m512i m = _mm512_min_epu64(k, _mm512_shuffle_i64x2(k, k, 0x4E));
m = _mm512_min_epu64(m, _mm512_shuffle_i64x2(m, m, 0xB1));
m = _mm512_min_epu64(m, _mm512_shuffle_epi32(m, _MM_PERM_BADC));
__mmask8 is_min = _mm512_cmpeq_epu64_mask(k, m);
return 8 * h + 1 + std::countr_zero(unsigned(is_min));`;
    const ui = frame(fig, { title: "Finding the smallest of 8 children with AVX-512", kicker: "Animation" });
    const sc = new Scene(ui.stage, { w: 600, h: 352 });
    const code = new CodePanel(ui.side, CODE, "c++");
    const SX = (j) => 30 + j * 23.4 + Math.floor(j / 8) * 6;
    const LX = (j) => 140 + j * 58;
    const frames = [];
    const rows = [];
    const snap = (cap, line, o = {}) => {
      const nodes = [];
      const marks = [];
      for (let L = 0; L < 3; L++) {
        marks.push(box(`line${L}`, SX(8 * L) - 13, 32, 8 * 23.4 + 2, 34, o.line === L ? "cur" : "soft"));
        marks.push(text(`linel${L}`, SX(8 * L) + 3.5 * 23.4, 20, `cache line ${L}`, o.line === L ? "cur mono" : "faint mono"));
      }
      for (let j = 0; j < 24; j++) {
        let label = "";
        let cls = "ghost";
        if (j === 7) { label = "14"; cls = "act"; }
        else if (j >= 8 && j < 16) { label = String(KIDS[j - 8]); cls = o.win === j - 8 ? "okf" : ""; }
        else if (j >= 16) { label = String(GRAND[j - 16]); cls = ""; }
        nodes.push(cell(`s${j}`, SX(j), 49, label, `${cls} is-small`, 20, 26));
        if ([0, 7, 8, 15, 16, 23].includes(j)) marks.push(text(`si${j}`, SX(j), 76, String(j), "faint mono"));
      }
      marks.push(text("rootl", SX(7), 94, "root", "cur", "middle"));
      rows.forEach((r, ri) => {
        const y = 148 + ri * 46;
        marks.push(text(`rl${ri}`, 102, y, r.name, "mono", "end"));
        r.vals.forEach((v, j) => nodes.push(cell(`r${ri}-${j}`, LX(j), y, v, r.cls ? r.cls(j) : "", 46, 30)));
      });
      if (rows.length) for (let j = 0; j < 8; j++) marks.push(text(`lane${j}`, LX(j), 124, `lane ${j}`, "faint"));
      frames.push({ st: { nodes, edges: [], marks }, cap, line });
    };
    snap("The 8-ary heap keeps heap index h in slot h + 7. The children of the root (h = 0) are slots 8–15: **one** 64-byte cache line, so one load gets all of them. (Real keys are `(distance << 32) | node`; small numbers keep the picture readable.)", []);
    rows.push({ name: "k", vals: KIDS.slice() });
    snap("`_mm512_load_si512` loads the 8 children into a 512-bit register: one 64-bit key per lane.", 1, { line: 1 });
    const shuf = (m, f) => m.map((_, j) => m[f(j)]);
    let m = KIDS.slice();
    const steps = [
      { f: (j) => j ^ 4, name: "swap halves", cap: "Step 1: `_mm512_shuffle_i64x2(k, k, 0x4E)` swaps the two 256-bit halves, and `_mm512_min_epu64` keeps the smaller key of each lane.", line: 2 },
      { f: (j) => j ^ 2, name: "swap pairs", cap: "Step 2: swap neighbouring 128-bit pairs and take the minimum again.", line: 3 },
      { f: (j) => j ^ 1, name: "swap lanes", cap: "Step 3: swap neighbouring lanes. Now **every** lane holds the smallest key.", line: 4 },
    ];
    for (const st of steps) {
      const sh = shuf(m, st.f);
      const nm = m.map((v, j) => Math.min(v, sh[j]));
      rows.length = 1;
      rows.push({ name: st.name, vals: sh, cls: () => "ghost" });
      rows.push({ name: "m", vals: nm, cls: (j) => (nm[j] === 2 ? "ok" : "") });
      m = nm;
      snap(st.cap, st.line);
    }
    rows.length = 1;
    rows.push({ name: "m", vals: m, cls: () => "ok" });
    const mask = KIDS.map((v) => (v === m[0] ? 1 : 0));
    rows.push({ name: "is_min", vals: mask, cls: (j) => (mask[j] ? "okf" : "") });
    snap("`_mm512_cmpeq_epu64_mask(k, m)` compares lane by lane and gives an 8-bit **mask**: bit j is 1 if child j equals the minimum.", 5);
    snap("`std::countr_zero` counts the zero bits below the lowest 1 bit: 4. So the smallest child is child 4: heap index 8·0 + 1 + 4 = 5, in slot 12. If two children were equal, the lower bit (the left child) would win.", 6, { win: 4 });
    snap("No branches, and the same instructions for every node. But every step needs the result of the step before it, about 20 CPU cycles in a row. That is why the measurements in this chapter show only a small gain over a 4-ary heap.", [2, 3, 4, 5, 6], { win: 4 });
    const p = new Player(fig, { frames, interval: 2300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); } });
    p.playWhenVisible();
  });

  /* ===================================================== versioning */
  register("versioned", (fig) => {
    const N = 8;
    const CODE = `void begin_query() {
    ++current_;  // (but see the last step)
}
Dist dist(Node v) const {
    return version_[v] == current_ ? dist_[v] : INF;
}
void set_dist(Node v, Dist d) {
    dist_[v] = d;
    version_[v] = current_;
}`;
    const ui = frame(fig, { title: "Versioned distances: starting a query without clearing", kicker: "Animation", split: true });
    const sc = new Scene(ui.stage, { w: 450, h: 230 });
    const code = new CodePanel(ui.side, CODE, "c++");
    const vars = new VarsPanel(ui.side, "State");
    const X = (v) => 92 + v * 46;
    const dist = new Array(N).fill(null);
    const ver = new Array(N).fill(0);
    let cur = 0;
    const writes = 0;
    const frames = [];
    const snap = (cap, line, o = {}) => {
      const nodes = [];
      const marks = [text("ln", 24, 40, "node", "faint", "start"), text("ld", 24, 92, "dist_", "mono", "start"), text("lv", 24, 146, "version_", "mono", "start"), text("lr", 24, 200, "dist(v)", "mono", "start")];
      for (let v = 0; v < N; v++) {
        const valid = ver[v] === cur && cur !== 0;
        marks.push(text(`n${v}`, X(v), 40, String(v), "faint mono"));
        const hl = o.set && o.set.includes(v);
        nodes.push(cell(`d${v}`, X(v), 92, dist[v] == null ? "–" : dist[v], hl ? "okf" : dist[v] == null ? "ghost" : valid ? "ok" : "dim", 40, 32));
        nodes.push(cell(`ve${v}`, X(v), 146, ver[v], hl ? "okf" : valid ? "ok" : "", 40, 32));
        const shown = valid ? String(dist[v]) : INF;
        nodes.push(cell(`r${v}`, X(v), 200, shown, o.read === v ? (valid ? "okf" : "bad") : valid ? "ok" : "plain", 40, 32));
      }
      frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "current_", v: String(cur), cls: o.bump ? "hl" : null }, { k: "array writes to start queries", v: String(writes) }] });
    };
    snap("A workspace for 8 nodes. `dist(v)` is valid only if `version_[v]` equals `current_`, the number of the query. At first every version is 0.", [4, 5]);
    cur = 1;
    snap("`begin_query()` for query 1: only the counter changes. Writing INF to all nodes would cost O(n) for every query.", 2, { bump: true });
    [[0, 0], [1, 4], [3, 7]].forEach(([v, d]) => { dist[v] = d; ver[v] = cur; });
    snap("Query 1 sets distances for nodes 0, 1 and 3. `set_dist` also stores the version 1.", [7, 8, 9], { set: [0, 1, 3] });
    cur = 2;
    snap("`begin_query()` for query 2: `current_` becomes 2. The old values are still in memory, but their version is 1, so they now count as INF. Nothing was written.", 2, { bump: true });
    [[3, 0], [5, 2]].forEach(([v, d]) => { dist[v] = d; ver[v] = cur; });
    snap("Query 2 sets nodes 3 and 5.", [7, 8, 9], { set: [3, 5] });
    snap("`dist(1)`: `version_[1]` is 1, not 2, so the answer is INF, as if the array had been cleared.", 5, { read: 1 });
    snap("One problem is left: after 2^32 − 1 queries the 32-bit counter goes around to 0, and then the versions of very old queries can look current again. Task 8 asks you to handle this.", 2);
    const p = new Player(fig, { frames, interval: 2300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
    p.playWhenVisible();
  });
})();
