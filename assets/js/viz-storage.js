/* Figures for Part IV, Storage Engines. Chapter 25: the memory hierarchy,
   search layouts (sorted, Eytzinger, a static B+ tree), prefetching, thread
   scaling and first touch. Chapter 26: a B+ tree that grows and shrinks, the
   fill of its pages, SIMD node search, differential fuzzing and bulk loading.
   The small examples run the algorithms of the chapters' C++ code; the charts
   show the measurements quoted in the text.
   Chapters 27 and 28: a slotted page, a buffer pool with CLOCK, a Count-Min
   sketch, W-TinyLFU, cache policies compared in the browser, open addressing,
   the Swiss table probe, hash flooding and consistent hashing.
   Part IV pages load this file through the `viz` list in _config.yml. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Player, frame, h, s } = V;

  /* -------------------------------------------------------------- helpers */
  function toolbar(ui) {
    const tools = h("div", { class: "viz-tools" });
    ui.main.after(tools);
    return tools;
  }
  function button(tools, text, onClick, cls = "") {
    const b = h("button", { type: "button", class: `viz-btn is-text ${cls}`, text });
    b.addEventListener("click", onClick);
    tools.appendChild(b);
    return b;
  }
  function toggle(tools, label, options, value, onChange) {
    if (label) tools.appendChild(h("span", { class: "viz-label", text: label }));
    const buttons = options.map(([key, text]) => {
      const b = h("button", { type: "button", class: "viz-btn is-text", text, "aria-pressed": String(key === value) });
      b.addEventListener("click", () => {
        buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        onChange(key);
      });
      tools.appendChild(b);
      return b;
    });
    return buttons;
  }
  function slider(tools, label, { min, max, step, value, format }, onInput) {
    const out = h("span", { class: "viz-label st-val" });
    const input = h("input", { type: "range", class: "viz-range st-slider", min, max, step, value, "aria-label": label });
    const show = () => {
      input.style.setProperty("--p", `${((input.value - min) / (max - min)) * 100}%`);
      out.textContent = format(+input.value);
    };
    input.addEventListener("input", () => { show(); onInput(+input.value); });
    tools.append(h("span", { class: "viz-label", text: label }), input, out);
    show();
    return input;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seg = (g, x1, y1, x2, y2, cls) => s("line", { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: cls }, g);
  const label = (g, x, y, text, cls = "st-lbl", anchor = "middle") => {
    const t = s("text", { x: x.toFixed(1), y: y.toFixed(1), class: cls, "text-anchor": anchor }, g);
    t.textContent = text;
    return t;
  };
  const rect = (g, x, y, w, hh, cls, rx = 4) => s("rect", { x: x.toFixed(1), y: y.toFixed(1), width: Math.max(0, w).toFixed(1), height: Math.max(0, hh).toFixed(1), rx, class: cls }, g);
  const svgBox = (parent, W, H, cls = "") => {
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: `st-svg ${cls}`, role: "img", "aria-hidden": "true" });
    parent.appendChild(svg);
    return svg;
  };
  const panel = (title, note, ...children) => h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: title }), note ? h("span", { text: note }) : null), ...children);
  const cells = (values, cls = () => "", name = null) =>
    h("div", { class: "st-cells" }, name ? h("span", { class: "st-rowname", text: name }) : null,
      ...values.map((v, i) => h("span", { class: `st-cell ${cls(i, v) || ""}`, text: v == null ? "" : String(v) })));

  /* ============================================ chapter 25: memory layouts */

  /* ------------------------------------------------- latency of the hierarchy */
  register("mem-latency", (fig) => {
    // ns per dependent load on our machine, 4 KB pages and 2 MB pages.
    const DATA = [[16, 1.8, 1.8], [32, 2.0, 2.0], [64, 3.4, 3.6], [256, 5.2, 5.1], [1024, 8.1, 7.6], [4096, 27.7, 26.2],
      [16384, 124.9, 103.3], [65536, 158.3, 145.9], [262144, 203.7, 169.5], [1048576, 245.9, 180.4]];
    let at = 9;
    let huge = true;
    const ui = frame(fig, { title: "How long one load waits", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 290, M = { l: 54, r: 18, t: 16, b: 42 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    slider(tools, "Data", { min: 0, max: DATA.length - 1, step: 1, value: at, format: (i) => size(DATA[i][0]) }, (i) => { at = i; draw(); });
    toggle(tools, "Pages", [[false, "4 KB only"], [true, "4 KB and 2 MB"]], huge, (v) => { huge = v; draw(); });
    function size(kb) { return kb >= 1048576 ? `${kb / 1048576} GB` : kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`; }
    const X = (kb) => M.l + (Math.log2(kb) - 4) / (20 - 4) * (W - M.l - M.r);
    // A linear scale: the cost of a miss to memory, and the gain of huge pages, in true proportion.
    const Y = (ns) => H - M.b - ns / 260 * (H - M.t - M.b);
    const line = (col) => DATA.map((d, i) => `${i ? "L" : "M"}${X(d[0]).toFixed(1)} ${Y(d[col]).toFixed(1)}`).join("");
    function draw() {
      svg.textContent = "";
      // the levels of the hierarchy on our machine
      const bands = [[16, 48, "L1"], [48, 2048, "L2"], [2048, 1048576 * 1.3, "L3 and memory"]];
      bands.forEach(([a, b, name], i) => {
        rect(svg, X(Math.max(a, 16)), M.t, X(Math.min(b, 1048576)) - X(Math.max(a, 16)), H - M.t - M.b, `st-band b${i}`, 0);
        label(svg, (X(Math.max(a, 16)) + X(Math.min(b, 1048576))) / 2, M.t + 12, name, "st-band-lbl");
      });
      for (const ns of [0, 50, 100, 150, 200, 250]) {
        seg(svg, M.l, Y(ns), W - M.r, Y(ns), "st-grid");
        label(svg, M.l - 8, Y(ns), String(ns), "st-tick", "end");
      }
      for (const kb of [16, 256, 4096, 65536, 1048576]) label(svg, X(kb), H - M.b + 16, size(kb), "st-tick");
      label(svg, (M.l + W - M.r) / 2, H - 6, "size of the data that is read at random (log scale)", "st-axis");
      const yl = label(svg, 14, (M.t + H - M.b) / 2, "ns per load", "st-axis");
      yl.setAttribute("transform", `rotate(-90 14 ${(M.t + H - M.b) / 2})`);
      if (huge) {
        // the time that 2 MB pages save: the area between the curves
        const back = DATA.slice().reverse().map((d) => `L${X(d[0]).toFixed(1)} ${Y(d[2]).toFixed(1)}`).join("");
        s("path", { d: `${line(1)}${back}Z`, class: "st-gap" }, svg);
      }
      for (const [col, cls] of [[1, "c5"], [2, "c0"]]) {
        if (col === 2 && !huge) continue;
        s("path", { d: line(col), class: `st-curve ${cls}` }, svg);
        DATA.forEach((d, i) => s("circle", { cx: X(d[0]), cy: Y(d[col]), r: i === at ? 6 : 3.5, class: `st-dot ${cls}${i === at ? " is-on" : ""}` }, svg));
      }
      const last = DATA[DATA.length - 1];
      label(svg, X(last[0]) - 8, Y(last[1]) - 10, "4 KB pages", "st-tick st-curve-lbl c5", "end");
      if (huge) label(svg, X(last[0]) - 8, Y(last[2]) + 16, "2 MB pages", "st-tick st-curve-lbl c0", "end");
      const d = DATA[at];
      const where = d[0] <= 48 ? "the L1 cache" : d[0] <= 2048 ? "the L2 cache" : d[0] <= 4096 ? "the L3 cache" : "the L3 cache and memory";
      const gain = d[1] - d[2];
      ui.setCaption(`Data of **${size(d[0])}**, read in a random order where every load needs the one before: **${d[1]} ns** per load, about ${Math.round(d[1] * 3)} clock cycles. The data come from ${where}. ${d[0] >= 16384
        ? `Here the TLB misses too. With 2 MB pages a load takes **${d[2]} ns**: ${gain.toFixed(0)} ns (${Math.round((100 * gain) / d[1])} %) less, the shaded area.`
        : "Small data stay close to the core, and the page size does not matter."}`);
    }
    draw();
  });

  /* ------------------------------------------------- sorted vs Eytzinger */
  // 15 keys, cache lines of 4 keys (a toy machine: real lines hold 16 ints).
  const KEYS15 = [3, 8, 12, 17, 21, 26, 30, 34, 39, 43, 48, 52, 57, 61, 66];
  function eytzingerOf(sorted) {
    const n = sorted.length;
    const e = new Array(n + 1).fill(null);
    let next = 0;
    (function fill(k) {
      if (k > n) return;
      fill(2 * k);
      e[k] = sorted[next++];
      fill(2 * k + 1);
    })(1);
    return e;
  }
  register("search-layouts", (fig) => {
    // 16 memory places in cache lines of 4. Sorted: the keys in places 0-14.
    // Eytzinger: place 0 unused (none), node k in place k, as in the C++ code.
    let layout = "sorted";
    let x = 35;
    const ui = frame(fig, { title: "The same tree, two layouts in memory", kicker: "Try it", split: true });
    ui.stage.classList.add("is-plain");
    const W = 520, H = 262;
    const svg = svgBox(ui.stage, W, H);
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    toggle(tools, "Layout", [["sorted", "sorted"], ["eytzinger", "Eytzinger"]], layout, (v) => { layout = v; player.setFrames(make()); });
    slider(tools, "x", { min: 0, max: 70, step: 1, value: x, format: (v) => String(v) }, (v) => { x = v; player.setFrames(make()); });
    // Tree node k (1-based BFS number) shows its key; its memory place depends on the layout.
    const inorder = [];  // inorder[k] = the place of node k's key in the sorted array
    let counter = 0;
    (function walk(k) { if (k > 15) return; walk(2 * k); inorder[k] = counter++; walk(2 * k + 1); })(1);
    const keyOf = (k) => KEYS15[inorder[k]];
    const placeOf = (k) => (layout === "sorted" ? inorder[k] : k);
    const lineOf = (k) => Math.floor(placeOf(k) / 4);
    // The lines that hold the first two levels (nodes 1-3), which every search reads.
    const topLines = () => new Set([1, 2, 3].map(lineOf));
    function make() {
      const frames = [];
      const touched = new Set();
      let k = 1, ans = null, step = 0;
      frames.push({ k: null, touched: new Set(), cap: `Search for the lower bound of **${x}** (the smallest key >= ${x}). The tree is the same in both layouts; only the places of the keys in memory differ. The dashed lines hold the first two levels, which every search reads.` });
      while (k <= 15) {
        const key = keyOf(k);
        touched.add(lineOf(k));
        step++;
        const right = key < x;
        if (!right) ans = key;
        frames.push({ k, touched: new Set(touched), ans, bits: k.toString(2), cap: `Step ${step}: compare with **${key}** at memory place ${placeOf(k)}, in line ${lineOf(k)}: ${right ? `${key} < ${x}, go right` : `${key} >= ${x}, remember it and go left`}.${layout === "eytzinger" ? ` k becomes 2k + ${right ? 1 : 0} = ${2 * k + (right ? 1 : 0)}.` : ""}` });
        k = 2 * k + (right ? 1 : 0);
      }
      const top = topLines().size;
      frames.push({ k: null, touched, ans, done: true, bits: k.toString(2),
        cap: `The answer is **${ans ?? "none"}**. ${layout === "sorted"
          ? `The first two levels of the tree, the keys that every search reads, are in **${top} different lines**: a cache must keep ${top} lines to keep them. In a big sorted array each key of the top levels has a line of its own.`
          : `The first two levels, the keys that every search reads, share **line ${[...topLines()][0]}**: one line in the cache keeps them for all searches. With real lines of 16 keys, line 0 holds the first 4 levels, and 4 MB of cache hold the top 20 levels instead of 16. In bits, k = ${k.toString(2)}: drop the trailing 1s and one 0 to get the node where the search last went left.`}` });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1300,
      apply: (f) => {
        svg.textContent = "";
        // the tree
        const pos = (k) => {
          const level = Math.floor(Math.log2(k)), first = 2 ** level, i = k - first, count = first;
          return [30 + (i + 0.5) * (W - 60) / count, 26 + level * 42];
        };
        for (let k = 2; k <= 15; k++) { const [x1, y1] = pos(Math.floor(k / 2)), [x2, y2] = pos(k); seg(svg, x1, y1, x2, y2, "st-edge"); }
        const path = new Set();
        if (f.k != null || f.done) {
          let k = 1;
          while (k <= 15) { path.add(k); if (k === f.k) break; k = 2 * k + (keyOf(k) < x ? 1 : 0); }
        }
        for (let k = 1; k <= 15; k++) {
          const [cx, cy] = pos(k);
          const on = k === f.k, seen = path.has(k) && !on;
          s("circle", { cx, cy, r: 13, class: `st-node${on ? " is-cur" : seen ? " is-seen" : ""}${f.ans === keyOf(k) && f.done ? " is-ans" : ""}` }, svg);
          label(svg, cx, cy + 0.5, String(keyOf(k)), "st-node-lbl");
        }
        // memory: 16 places in 4 lines
        const y0 = 196, cw = (W - 40) / 16, hot = topLines();
        for (let l = 0; l < 4; l++) {
          if (hot.has(l)) rect(svg, 20 + l * 4 * cw - 3, y0 - 4, 4 * cw + 4, 34, "st-hotline", 5);
          label(svg, 20 + (l * 4 + 2) * cw - 1, y0 + 44, `line ${l}`, f.touched.has(l) ? "st-tick is-read" : "st-tick");
        }
        for (let p = 0; p < 16; p++) {
          const k = layout === "sorted" ? (p < 15 ? inorder.indexOf(p) : -1) : p;
          const line = Math.floor(p / 4);
          const empty = k < 1;
          rect(svg, 20 + p * cw, y0, cw - 2, 26, `st-mem l${line % 2}${empty ? " is-unused" : ""}${f.touched.has(line) ? " is-line" : ""}${k === f.k ? " is-cur" : ""}`, 3);
          label(svg, 20 + p * cw + cw / 2 - 1, y0 + 13.5, empty ? (layout === "sorted" ? "" : "–") : String(keyOf(k)), "st-mem-lbl");
        }
        side.textContent = "";
        side.append(panel("search", null, h("div", { class: "st-kv" },
          h("span", { text: "lines read by this search" }), h("b", { text: String(f.touched.size) }),
          h("span", { text: "lines of the first two levels" }), h("b", { text: String(hot.size) }),
          h("span", { text: "answer so far" }), h("b", { text: f.ans == null ? "–" : String(f.ans) }),
          layout === "eytzinger" ? h("span", { text: "k in bits" }) : null, layout === "eytzinger" ? h("b", { class: "st-mono", text: f.bits ?? "1" }) : null)));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- prefetching four levels ahead */
  register("prefetch-lines", (fig) => {
    // An Eytzinger array of 63 keys; a cache line holds 16 keys: places 16k ... 16k + 15
    // are the 16 descendants of node k four levels below.
    const N = 63;
    const sorted = Array.from({ length: N }, (_, i) => 2 + i * 3);
    const E = eytzingerOf(sorted);
    let x = 70;
    const ui = frame(fig, { title: "Asking for memory four steps early", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 210;
    const wrap = h("div", { class: "st-scroll" });
    ui.stage.appendChild(wrap);
    const svg = svgBox(wrap, W, H);
    svg.style.minWidth = "500px";
    const tools = toolbar(ui);
    slider(tools, "x", { min: 0, max: 200, step: 1, value: x, format: (v) => String(v) }, (v) => { x = v; player.setFrames(make()); });
    function make() {
      const frames = [];
      let k = 1, step = 0;
      const asked = [];
      frames.push({ k: null, asked: [], cap: "64 places (0 is unused) in cache lines of 16 keys. Node k has its 16 descendants four levels down at the places 16k to 16k + 15: one whole cache line." });
      while (k <= N) {
        if (16 * k <= N) asked.push({ k, step });
        frames.push({ k, asked: asked.slice(), step, cap: 16 * k <= N
          ? `At node ${k} (key ${E[k]}): prefetch the line of places ${16 * k}–${16 * k + 15}. The search will be in it four steps later, and by then it has arrived from memory.`
          : `At node ${k} (key ${E[k]}): this line was asked for four steps ago${k >= 16 ? `, at node ${k >> 4}` : ""}, so the key is already in the cache.` });
        k = 2 * k + (E[k] < x ? 1 : 0);
        step++;
      }
      frames.push({ k: null, asked, done: true, cap: "With every line asked for four steps early, up to four loads of one search are on their way at the same time instead of one. On our machine this made the search of 2²⁷ keys 2.8 times faster." });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1400,
      apply: (f) => {
        svg.textContent = "";
        const cw = (W - 24) / 64, y0 = 110;
        const path = new Set();
        if (f.k != null) { let k = 1; while (k <= N) { path.add(k); if (k === f.k) break; k = 2 * k + (E[k] < x ? 1 : 0); } }
        for (let line = 0; line < 4; line++) {
          const a = f.asked.find((q) => q.k === line);  // node k asks for the line of places 16k ... 16k + 15
          rect(svg, 12 + line * 16 * cw, y0 - 6, 16 * cw - 1, 44, `st-linebox${a ? " is-asked" : ""}`, 5);
          label(svg, 12 + (line * 16 + 8) * cw, y0 + 52, `line ${line}: places ${line * 16}–${line * 16 + 15}`, "st-tick");
        }
        for (let p = 0; p < 64; p++) {
          const cls = p === 0 ? "is-unused" : p === f.k ? "is-cur" : path.has(p) ? "is-seen" : "";
          rect(svg, 12 + p * cw + 0.5, y0, cw - 1, 32, `st-slot ${cls}`, 1.5);
        }
        // level labels above the array
        for (let lv = 0; lv < 6; lv++) {
          const a = 2 ** lv, b = Math.min(2 ** (lv + 1) - 1, 63);
          seg(svg, 12 + a * cw + 1, 86, 12 + (b + 1) * cw - 1, 86, "st-level");
          if (lv >= 3) label(svg, 12 + (a + b + 1) / 2 * cw, 76, `level ${lv}`, "st-tick");
        }
        label(svg, 12 + 4 * cw, 76, "0–2", "st-tick");
        f.asked.forEach((q) => {
          if (q.k === f.k || !f.k) return;
          const from = 12 + (q.k + 0.5) * cw, to = 12 + (16 * q.k + 8) * cw;
          s("path", { d: `M${from} ${y0 - 8} C ${from} ${y0 - 60}, ${to} ${y0 - 60}, ${to} ${y0 - 8}`, class: "st-arrow" }, svg);
        });
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- the static B+ tree */
  register("static-btree", (fig) => {
    // B = 4 keys per node for the picture (16 in the tasks), 5 children per node.
    const B = 4, F = 5;
    const keys = Array.from({ length: 30 }, (_, i) => 2 + i * 3 + (i % 2));  // 2 ... 90
    const NONE = "∞";
    const leaves = [];
    const count0 = Math.floor(keys.length / B) + 1;
    const padded = keys.concat(Array(count0 * B - keys.length).fill(Infinity));
    for (let i = 0; i < count0; i++) leaves.push(padded.slice(i * B, i * B + B));
    const levels = [leaves];
    let under = 1;
    while (levels[levels.length - 1].length > 1) {
      const below = levels[levels.length - 1];
      const nodes = [];
      for (let t = 0; t < Math.ceil(below.length / F); t++) {
        const node = [];
        for (let i = 0; i < B; i++) {
          const child = t * F + i;
          node.push(child < below.length ? padded[Math.min((child + 1) * under, count0) * B - 1] : Infinity);
        }
        nodes.push(node);
      }
      levels.push(nodes);
      under *= F;
    }
    let x = 50;
    const ui = frame(fig, { title: "A static B+ tree: one compare per node", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 720, H = 250, SLOT = 20;
    const wrap = h("div", { class: "st-scroll" });
    ui.stage.appendChild(wrap);
    const svg = svgBox(wrap, W, H);
    svg.style.minWidth = "540px";
    const lanes = h("div", { class: "st-lanes" });
    ui.stage.appendChild(lanes);
    const tools = toolbar(ui);
    slider(tools, "x", { min: 0, max: 95, step: 1, value: x, format: (v) => String(v) }, (v) => { x = v; player.setFrames(make()); });
    const show = (k) => (k === Infinity ? NONE : String(k));
    function make() {
      const frames = [{ level: null, cap: `${keys.length} keys in leaves of ${B} (then one padding key, ∞), and above them nodes of ${B} keys and ${F} children. Key i of a node is the largest key under child i. Search for x = ${x}.` }];
      let t = 0;
      for (let lv = levels.length - 1; lv >= 0; lv--) {
        const node = levels[lv][t];
        const mask = node.map((k) => (k < x ? 1 : 0));
        const less = mask.reduce((a, b) => a + b, 0);
        frames.push({ level: lv, t, mask, less, cap: lv > 0
          ? `Level ${lv}: compare x with the ${B} keys of the node at once (one SIMD compare). ${less} key${less === 1 ? " is" : "s are"} < ${x}, so go to child ${less}.`
          : `The leaf: ${less} key${less === 1 ? " is" : "s are"} < ${x}, so the answer is the key at place ${less}: **${show(node[less])}**.` });
        if (lv > 0) t = t * F + less;
      }
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1500,
      apply: (f) => {
        svg.textContent = "";
        const top = levels.length - 1;
        const nodeW = SLOT * B, gapY = 78;
        const pos = levels.map((lvl, lv) => lvl.map((_, t) => {
          const count = lvl.length;
          return [10 + (t + 0.5) * (W - 20) / count - nodeW / 2, 16 + (top - lv) * gapY];
        }));
        // edges
        for (let lv = top; lv > 0; lv--) levels[lv].forEach((_, t) => {
          for (let c = 0; c < F; c++) {
            const child = t * F + c;
            if (child >= levels[lv - 1].length) break;
            const [px, py] = pos[lv][t], [cx, cy] = pos[lv - 1][child];
            seg(svg, px + (c + 0.5) * nodeW / F, py + 24, cx + nodeW / 2, cy, "st-edge");
          }
        });
        // the path so far
        const onPath = new Set();
        if (f.level != null) {
          let t = 0;
          for (let lv = top; lv >= f.level; lv--) {
            onPath.add(`${lv}:${t}`);
            if (lv > f.level) t = t * F + levels[lv][t].filter((k) => k < x).length;
          }
        }
        levels.forEach((lvl, lv) => lvl.forEach((node, t) => {
          const [nx, ny] = pos[lv][t];
          const cur = f.level === lv && f.t === t;
          rect(svg, nx, ny, nodeW, 24, `st-bnode${cur ? " is-cur" : onPath.has(`${lv}:${t}`) ? " is-seen" : ""}`, 4);
          node.forEach((k, i) => {
            if (i) seg(svg, nx + i * SLOT, ny + 3, nx + i * SLOT, ny + 21, "st-sep");
            const cls = cur ? (f.mask[i] ? "st-key is-less" : "st-key is-geq") : "st-key";
            label(svg, nx + i * SLOT + SLOT / 2, ny + 12.5, show(k), cls);
          });
        }));
        lanes.textContent = "";
        if (f.level != null) {
          const node = levels[f.level][f.t];
          lanes.append(cells(node.map(show), () => "", "keys"), cells(node.map(() => x), () => "is-dim", "x"),
            cells(f.mask, (i) => (f.mask[i] ? "is-hit" : ""), "key < x"), cells([f.less], () => "is-cur", "popcount"));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- threads */
  register("thread-scaling", (fig) => {
    // Speedup over one thread with 2 and 4 threads (absolute values in the labels).
    const SERIES = [
      { name: "reading 1 MB (L2)", cls: "c5", v: [27.4, 53.9, 91.3], unit: "GB/s" },
      { name: "reading 1 GB (memory)", cls: "c1", v: [8.0, 14.1, 25.6], unit: "GB/s" },
      { name: "searches, 512 MB", cls: "c2", v: [200, 87, 56], unit: "ns per search", lower: true },
      { name: "building the tree", cls: "c0", v: [417, 215, 145], unit: "ms", lower: true },
    ];
    const ui = frame(fig, { title: "What more threads give", kicker: "Measured" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 270, M = { l: 40, r: 12, t: 14, b: 54 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const legend = h("div", { class: "st-legend" }, ...SERIES.map((sr) => h("span", { class: `st-lkey ${sr.cls}`, text: sr.name })));
    ui.stage.appendChild(legend);
    const speed = (sr, i) => (sr.lower ? sr.v[0] / sr.v[i] : sr.v[i] / sr.v[0]);
    const Y = (v) => H - M.b - v / 4.2 * (H - M.t - M.b);
    for (const v of [1, 2, 3, 4]) {
      seg(svg, M.l, Y(v), W - M.r, Y(v), v === 4 ? "st-grid is-ideal" : "st-grid");
      label(svg, M.l - 8, Y(v), `${v}×`, "st-tick", "end");
    }
    const groupW = (W - M.l - M.r) / 3;
    ["1 thread", "2 threads", "4 threads"].forEach((name, g) => {
      label(svg, M.l + (g + 0.5) * groupW, H - M.b + 16, name, "st-tick");
      SERIES.forEach((sr, k) => {
        const bw = groupW / (SERIES.length + 1.5), x0 = M.l + g * groupW + (k + 0.75) * bw;
        const v = speed(sr, g);
        rect(svg, x0, Y(v), bw - 3, Y(0) - Y(v), `st-bar ${sr.cls}`, 2);
        const t = s("title", {}, svg.lastChild);
        t.textContent = `${sr.name}, ${name}: ${sr.v[g]} ${sr.unit} (${v.toFixed(1)}×)`;
        if (g === 2) label(svg, x0 + (bw - 3) / 2, Y(v) - 7, `${v.toFixed(1)}`, "st-tick");
      });
    });
    label(svg, (M.l + W - M.r) / 2, H - 8, "speedup over one thread (4× would be perfect)", "st-axis");
    ui.setCaption("Reading from the L2 cache scales well: every core has its own L2. Reading from memory also gets 3.2 times faster, because one core alone cannot keep enough loads on their way to use the memory fully. The searches scale best (3.6×): they wait for memory most of the time, and every thread adds its own waiting loads.");
  });

  /* ------------------------------------------------- first touch */
  register("first-touch", (fig) => {
    let mode = "one";
    const PAGES = 16;
    const ui = frame(fig, { title: "First touch decides where a page lives", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 230;
    const svg = svgBox(ui.stage, W, H);
    const tools = toolbar(ui);
    toggle(tools, "Fill the array", [["one", "with one thread"], ["all", "with all threads"]], mode, (m) => { mode = m; player.setFrames(make()); });
    function make() {
      const frames = [];
      const owner = new Array(PAGES).fill(null);
      frames.push({ owner: owner.slice(), step: 0, cap: "A new array of 16 pages has no memory yet. A page gets memory when it is first written, on the memory node (socket) of the thread that writes it." });
      if (mode === "one") {
        for (let p = 0; p < PAGES; p++) {
          owner[p] = 0;
          frames.push({ owner: owner.slice(), cap: "Thread 0 writes the whole array, so every page lands on socket 0." });
        }
      } else {
        for (let i = 0; i < 4; i++) {  // four threads at the same time; thread t has pages 4t ... 4t + 3
          for (let t = 0; t < 4; t++) owner[4 * t + i] = t < 2 ? 0 : 1;
          frames.push({ owner: owner.slice(), cap: "The four threads write their own quarters at the same time (a static schedule), so each page lands on the socket of its thread." });
        }
      }
      frames.push({ owner: owner.slice(), reading: true, cap: mode === "one"
        ? "Now the threads read their halves. The threads of socket 1 read all of their pages **from the other socket**, through the link between the sockets: slower, and that link is shared."
        : "Now every thread reads pages on its own socket. Our test machine has one socket, so there the rule matters less, but the page faults still happen in the thread that touches first: our parallel build was 2.9 times faster." });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 700,
      apply: (f) => {
        svg.textContent = "";
        for (let sk = 0; sk < 2; sk++) {
          const x0 = 20 + sk * 280;
          rect(svg, x0, 12, 240, 80, `st-socket s${sk}`, 10);
          label(svg, x0 + 120, 28, `socket ${sk}`, "st-band-lbl");
          for (let c = 0; c < 2; c++) {
            rect(svg, x0 + 20 + c * 110, 40, 90, 38, "st-core", 6);
            label(svg, x0 + 65 + c * 110, 60, `thread ${sk * 2 + c}`, "st-tick");
          }
          rect(svg, x0, 150, 240, 64, `st-socket s${sk}`, 10);
          label(svg, x0 + 120, 226, `memory of socket ${sk}`, "st-tick");
        }
        // pages placed in the memory of their socket
        const placed = [[], []];
        f.owner.forEach((o, p) => { if (o != null) placed[o].push(p); });
        placed.forEach((list, sk) => list.forEach((p, i) => {
          const x0 = 20 + sk * 280 + 12 + (i % 8) * 28, y0 = 160 + Math.floor(i / 8) * 24;
          rect(svg, x0, y0, 24, 20, `st-page p${p < PAGES / 2 ? 0 : 1}`, 3);
          label(svg, x0 + 12, y0 + 10.5, String(p), "st-page-lbl");
        }));
        if (f.reading) {
          for (let sk = 0; sk < 2; sk++) {
            const from = 20 + sk * 280 + 120, mem = f.owner.slice(sk * 8, sk * 8 + 8).every((o) => o === sk) ? sk : 0;
            const to = 20 + mem * 280 + 120;
            s("path", { d: `M${to} 150 L${from} 92`, class: mem === sk ? "st-read" : "st-read is-remote" }, svg);
          }
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ================================================ chapter 26: B+ trees */

  // A small B+ tree with the rules of the C++ tree of chapter 26: keys under
  // child i are <= keys[i] < keys under child i + 1; the child of x is the
  // number of keys < x. Every operation returns a list of events for the pictures.
  class MiniTree {
    constructor(cap) {
      this.cap = cap;
      this.min = Math.floor(cap / 2);
      this.ids = 0;
      this.root = this.leaf();
      this.height = 1;
      this.size = 0;
    }
    leaf() { return { id: this.ids++, leaf: true, keys: [], next: null, prev: null }; }
    inner() { return { id: this.ids++, leaf: false, keys: [], children: [] }; }
    static place(keys, x) { let i = 0; while (i < keys.length && keys[i] < x) i++; return i; }
    path(x) {
      const path = [];
      let node = this.root;
      while (!node.leaf) { const c = MiniTree.place(node.keys, x); path.push([node, c]); node = node.children[c]; }
      return { path, leaf: node };
    }
    has(x) { const { leaf } = this.path(x); const i = MiniTree.place(leaf.keys, x); return i < leaf.keys.length && leaf.keys[i] === x; }
    insert(x) {
      const ev = [];
      const { path, leaf } = this.path(x);
      const i = MiniTree.place(leaf.keys, x);
      if (i < leaf.keys.length && leaf.keys[i] === x) return [{ type: "exists", node: leaf.id }];
      leaf.keys.splice(i, 0, x);
      this.size++;
      ev.push({ type: "insert", node: leaf.id });
      if (leaf.keys.length <= this.cap) return ev;
      const right = this.leaf();
      const stay = Math.ceil((this.cap + 1) / 2);
      right.keys = leaf.keys.splice(stay);
      right.next = leaf.next;
      right.prev = leaf;
      if (leaf.next) leaf.next.prev = right;
      leaf.next = right;
      let sep = leaf.keys[leaf.keys.length - 1], child = right;
      ev.push({ type: "split", node: leaf.id, other: right.id, sep });
      for (let d = path.length - 1; d >= 0; d--) {
        const [node, c] = path[d];
        node.keys.splice(c, 0, sep);
        node.children.splice(c + 1, 0, child);
        if (node.keys.length <= this.cap) return ev;
        const r = this.inner();
        const half = Math.floor(this.cap / 2);
        const up = node.keys[half];
        r.keys = node.keys.splice(half + 1);
        node.keys.length = half;
        r.children = node.children.splice(half + 1);
        sep = up;
        child = r;
        ev.push({ type: "split", node: node.id, other: r.id, sep });
      }
      const top = this.inner();
      top.keys = [sep];
      top.children = [this.root, child];
      this.root = top;
      this.height++;
      ev.push({ type: "root", node: top.id });
      return ev;
    }
    erase(x) {
      const ev = [];
      const { path, leaf } = this.path(x);
      const i = MiniTree.place(leaf.keys, x);
      if (i >= leaf.keys.length || leaf.keys[i] !== x) return [{ type: "missing" }];
      leaf.keys.splice(i, 1);
      this.size--;
      ev.push({ type: "erase", node: leaf.id });
      if (path.length === 0 || leaf.keys.length >= this.min) return ev;
      let [parent, c] = path[path.length - 1];
      const left = c > 0 ? parent.children[c - 1] : null, right = c < parent.keys.length ? parent.children[c + 1] : null;
      if (left && left.keys.length > this.min) {
        leaf.keys.unshift(left.keys.pop());
        parent.keys[c - 1] = left.keys[left.keys.length - 1];
        ev.push({ type: "borrow", node: leaf.id, other: left.id });
        return ev;
      }
      if (right && right.keys.length > this.min) {
        leaf.keys.push(right.keys.shift());
        parent.keys[c] = leaf.keys[leaf.keys.length - 1];
        ev.push({ type: "borrow", node: leaf.id, other: right.id });
        return ev;
      }
      const k = c > 0 ? c - 1 : c;
      const a = parent.children[k], b = parent.children[k + 1];
      a.keys.push(...b.keys);
      a.next = b.next;
      if (b.next) b.next.prev = a;
      parent.keys.splice(k, 1);
      parent.children.splice(k + 1, 1);
      ev.push({ type: "merge", node: a.id, other: b.id });
      for (let d = path.length - 1; ; d--) {
        const node = path[d][0];
        if (d === 0) {
          if (node.keys.length === 0) { this.root = node.children[0]; this.height--; ev.push({ type: "shrink" }); }
          return ev;
        }
        if (node.keys.length >= this.min) return ev;
        const [g, gc] = path[d - 1];
        const sl = gc > 0 ? g.children[gc - 1] : null, sr = gc < g.keys.length ? g.children[gc + 1] : null;
        if (sl && sl.keys.length > this.min) {
          node.keys.unshift(g.keys[gc - 1]);
          node.children.unshift(sl.children.pop());
          g.keys[gc - 1] = sl.keys.pop();
          ev.push({ type: "borrow", node: node.id, other: sl.id });
          return ev;
        }
        if (sr && sr.keys.length > this.min) {
          node.keys.push(g.keys[gc]);
          node.children.push(sr.children.shift());
          g.keys[gc] = sr.keys.shift();
          ev.push({ type: "borrow", node: node.id, other: sr.id });
          return ev;
        }
        const kk = gc > 0 ? gc - 1 : gc;
        const A = g.children[kk], Bn = g.children[kk + 1];
        A.keys.push(g.keys[kk], ...Bn.keys);
        A.children.push(...Bn.children);
        g.keys.splice(kk, 1);
        g.children.splice(kk + 1, 1);
        ev.push({ type: "merge", node: A.id, other: Bn.id });
      }
    }
    scan(lo, hi) {
      const { path, leaf } = this.path(lo);
      const out = [], visited = [];
      let node = leaf, i = MiniTree.place(leaf.keys, lo);
      while (node) {
        visited.push(node.id);
        for (; i < node.keys.length; i++) { if (node.keys[i] > hi) return { path: path.map((p) => p[0].id), visited, out }; out.push(node.keys[i]); }
        node = node.next;
        i = 0;
      }
      return { path: path.map((p) => p[0].id), visited, out };
    }
    levels() {
      const lv = [];
      let row = [this.root];
      while (row.length) { lv.push(row); row = row[0].leaf ? [] : row.flatMap((n) => n.children); }
      return lv;
    }
  }

  // Draws a MiniTree: the levels from the root down, the slots of every page
  // (empty slots show how full it is), the links between the leaves.
  function drawTree(svg, tree, { mark = {}, slotW = 20, gap = 10, top = 14, rowH = 64, path = [], visited = [] } = {}) {
    const lv = tree.levels();
    const leaves = lv[lv.length - 1];
    const pageW = tree.cap * slotW;
    const W = Math.max(320, leaves.length * (pageW + gap) + gap);
    const H = top + lv.length * rowH + 12;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.textContent = "";
    const x = new Map();
    leaves.forEach((n, i) => x.set(n.id, gap + i * (pageW + gap)));
    for (let d = lv.length - 2; d >= 0; d--)
      for (const n of lv[d]) {
        const a = x.get(n.children[0].id), b = x.get(n.children[n.children.length - 1].id);
        x.set(n.id, (a + b) / 2);
      }
    const y = (d) => top + d * rowH;
    const onPath = new Set(path), seen = new Set(visited);
    lv.forEach((row, d) => row.forEach((n) => {
      if (n.leaf) return;
      n.children.forEach((c, i) => seg(svg, x.get(n.id) + (i + 0.5) * pageW / n.children.length, y(d) + 22, x.get(c.id) + pageW / 2, y(d + 1), onPath.has(n.id) && onPath.has(c.id) ? "st-edge is-on" : "st-edge"));
    }));
    leaves.forEach((n, i) => {
      if (i + 1 < leaves.length) s("path", { d: `M${x.get(n.id) + pageW} ${y(lv.length - 1) + 11}h${gap}`, class: seen.has(n.id) && seen.has(leaves[i + 1].id) ? "st-link is-on" : "st-link" }, svg);
    });
    lv.forEach((row, d) => row.forEach((n) => {
      const cls = mark[n.id] ? ` is-${mark[n.id]}` : onPath.has(n.id) || seen.has(n.id) ? " is-seen" : "";
      rect(svg, x.get(n.id), y(d), pageW, 22, `st-page${n.leaf ? " is-leaf" : ""}${cls}`, 4);
      for (let i = 0; i < tree.cap; i++) {
        if (i) seg(svg, x.get(n.id) + i * slotW, y(d) + 3, x.get(n.id) + i * slotW, y(d) + 19, "st-sep");
        if (i < n.keys.length) label(svg, x.get(n.id) + (i + 0.5) * slotW, y(d) + 11.5, String(n.keys[i]), "st-key");
        else rect(svg, x.get(n.id) + i * slotW + 3, y(d) + 4, slotW - 6, 14, "st-empty", 2);
      }
    }));
    return { W, H };
  }

  // The sizes of the pages of one level, as split_level in bplus.cpp: full
  // pages from the left, and the last two share if the last would be too small.
  function splitLevel(total, full, minimum) {
    const sizes = [];
    for (let left = total; left > 0; left -= Math.min(left, full)) sizes.push(Math.min(left, full));
    if (sizes.length >= 2 && sizes[sizes.length - 1] < minimum) {
      const both = sizes[sizes.length - 2] + sizes[sizes.length - 1];
      sizes[sizes.length - 2] = Math.ceil(both / 2);
      sizes[sizes.length - 1] = Math.floor(both / 2);
    }
    return sizes;
  }
  // bulk_load of bplus.cpp for a MiniTree: the leaves, then the levels above.
  function bulkTree(cap, sorted) {
    const t = new MiniTree(cap);
    if (!sorted.length) return t;
    let level = [], next = 0;
    for (const size of splitLevel(sorted.length, cap, t.min)) {
      const leaf = t.leaf();
      leaf.keys = sorted.slice(next, next + size);
      next += size;
      const prev = level[level.length - 1];
      if (prev) { prev.next = leaf; leaf.prev = prev; }
      level.push(leaf);
    }
    let largest = level.map((n) => n.keys[n.keys.length - 1]);  // the largest key under each page
    while (level.length > 1) {
      const up = [], upLargest = [];
      let child = 0;
      for (const size of splitLevel(level.length, cap + 1, t.min + 1)) {
        const node = t.inner();
        node.children = level.slice(child, child + size);
        node.keys = largest.slice(child, child + size - 1);
        child += size;
        up.push(node);
        upLargest.push(largest[child - 1]);
      }
      level = up;
      largest = upLargest;
      t.height++;
    }
    t.root = level[0];
    t.size = sorted.length;
    return t;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ------------------------------------------------- a B+ tree that changes */
  register("bplus-ops", (fig) => {
    const CAP = 4, MAX_KEYS = 36;
    const START = [42, 17, 63, 8, 29, 51, 75, 33, 12, 58, 21, 88];
    let rng, tree, nextUp;
    function reset() {
      rng = mulberry32(26);
      tree = new MiniTree(CAP);
      nextUp = 100;
      for (const k of START) tree.insert(k);
    }
    reset();
    const ui = frame(fig, { title: "A B+ tree with pages of 4 keys", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "st-scroll" });
    ui.stage.appendChild(wrap);
    const svg = svgBox(wrap, 600, 200, "st-tree");
    const tools = toolbar(ui);
    const describe = (ev, what) => {
      if (ev[0].type === "exists") return `${what} is already there: insert only replaces its value.`;
      if (ev[0].type === "missing") return `${what}.`;
      const splits = ev.filter((e) => e.type === "split").length;
      const parts = [];
      if (splits) parts.push("the leaf had 4 keys, so it split (orange): 3 keys stay, 2 move to a new leaf, and the largest key on the left goes up to the parent");
      if (splits > 1) parts.push(`${splits > 2 ? "the inner nodes above were" : "the parent was"} full too and split: the middle key moves up`);
      if (ev.some((e) => e.type === "root")) parts.push("the root split, so a new root was made: the tree grew one level, at the top");
      const borrows = ev.filter((e) => e.type === "borrow").length, merges = ev.filter((e) => e.type === "merge").length;
      if (borrows) parts.push("a page had only 1 key, so it took one from its neighbor, and the key in the parent between them changed (purple)");
      if (merges) parts.push(`a page had only 1 key and its neighbor had no key to give, so the two pages became one (purple)${merges > 1 ? "; the parent lost a key and had to merge too" : ""}`);
      if (ev.some((e) => e.type === "shrink")) parts.push("the root was left with one child, and that child became the root: the tree lost a level");
      return parts.length ? `${what}: ${parts.join("; ")}.` : `${what}: the leaf had room, so only that page changed (blue).`;
    };
    function show(ev, caption, extra = {}) {
      const mark = {};
      for (const e of ev || []) {
        if (e.type === "split" || e.type === "root") { mark[e.node] = "split"; if (e.other != null) mark[e.other] = "split"; }
        else if (e.type === "merge" || e.type === "borrow") mark[e.node] = mark[e.other] = "merge";
        else if (e.type === "insert" || e.type === "erase") mark[e.node] = mark[e.node] || "cur";
      }
      const { W } = drawTree(svg, tree, { mark, ...extra });
      svg.style.minWidth = `${Math.round(W * 0.8)}px`;
      svg.style.maxWidth = `${Math.round(W * 1.3)}px`;
      ui.setCaption(`${caption} Now: ${tree.size} keys, ${tree.height} level${tree.height > 1 ? "s" : ""}.`);
    }
    const full = () => tree.size >= MAX_KEYS;
    const act = (name, f) => button(tools, name, () => { const [ev, what] = f(); show(ev, describe(ev, what)); });
    act("Insert random", () => {
      if (full()) return [[{ type: "missing" }], `The figure keeps at most ${MAX_KEYS} keys: erase some, or reset`];
      let k = 1 + Math.floor(rng() * 99);
      for (let t = 0; t < 300 && tree.has(k); t++) k = 1 + Math.floor(rng() * 99);
      return [tree.insert(k), `Inserted ${k}`];
    });
    act("Insert increasing", () => {
      if (full()) return [[{ type: "missing" }], `The figure keeps at most ${MAX_KEYS} keys: erase some, or reset`];
      const k = nextUp++;
      return [tree.insert(k), `Inserted ${k}, larger than every key`];
    });
    act("Erase random", () => {
      const all = tree.scan(-Infinity, Infinity).out;
      if (!all.length) return [[{ type: "missing" }], "The tree is empty"];
      const k = all[Math.floor(rng() * all.length)];
      return [tree.erase(k), `Erased ${k}`];
    });
    button(tools, "Scan", () => {
      const all = tree.scan(-Infinity, Infinity).out;
      const lo = all.length ? all[Math.floor(rng() * all.length)] - 1 : 0, hi = lo + 12 + Math.floor(rng() * 20);
      const r = tree.scan(lo, hi);
      const { W } = drawTree(svg, tree, { path: r.path.concat(r.visited.slice(0, 1)), visited: r.visited });
      svg.style.minWidth = `${Math.round(W * 0.8)}px`;
      svg.style.maxWidth = `${Math.round(W * 1.3)}px`;
      ui.setCaption(`Scan [${lo}, ${hi}]: one search goes down to the leaf where ${lo} would be, then the scan follows the links between the leaves (green) until a key is larger than ${hi}. Found ${r.out.length} key${r.out.length === 1 ? "" : "s"}${r.out.length ? ` (${r.out.join(", ")})` : ""} in ${r.visited.length} leaf page${r.visited.length > 1 ? "s" : ""}.`);
    });
    button(tools, "Reset", () => { reset(); show(null, "Back to the twelve keys of the start."); });
    show(null, "Twelve keys in pages of at most 4 keys. Every page except the root has at least 2. Insert, erase and scan, and watch which pages change.");
  });

  /* ------------------------------------------------- how full the pages are */
  register("fill-factor", (fig) => {
    // Pages of at most 8 keys (at least 4), with the rules of the C++ tree: a
    // full leaf that gets a 9th key splits into 5 and 4 keys.
    const CAP = 8, MAX = 320;
    let order = "random", rng, tree, pool, next, last;
    function reset() {
      rng = mulberry32(26);
      tree = new MiniTree(CAP);
      pool = Array.from({ length: MAX }, (_, i) => (i + 1) * 3);
      if (order === "random") shuffle(pool, rng);
      next = 0;
      last = { text: order === "random" ? "An empty tree. The keys will come in a random order." : "An empty tree. The keys will come in increasing order, like ids or times.", mark: {} };
    }
    reset();
    const ui = frame(fig, { title: "How full are the pages?", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 200, M = { l: 30, r: 10, t: 12, b: 26 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const stats = h("div", { class: "st-kv st-fill-stats" });
    ui.stage.appendChild(stats);
    const tools = toolbar(ui);
    toggle(tools, "Keys come", [["random", "in random order"], ["up", "in increasing order"]], order, (o) => { order = o; reset(); draw(); });
    tools.appendChild(h("span", { class: "viz-sep" }));
    const insert = (count) => {
      const mark = {};
      let splits = 0, lastKey = null, leftKeys = 0;
      for (let i = 0; i < count && next < pool.length; i++) {
        lastKey = pool[next++];
        const ev = tree.insert(lastKey);
        for (const e of ev) {
          if (e.type === "insert") mark[e.node] = mark[e.node] || "cur";
          if (e.type === "split") { mark[e.node] = mark[e.other] = "split"; splits++; leftKeys = CAP + 1 - Math.floor((CAP + 1) / 2); }
        }
      }
      if (lastKey == null) return { text: `The figure stops at ${MAX} keys. Erase some, or start again.`, mark: {} };
      if (count === 1)
        return splits
          ? { text: `Inserted ${lastKey}. The leaf was full, so it split (orange): ${leftKeys} keys stay, ${CAP + 1 - leftKeys} move to a new leaf. Both pages are now about half full.${order === "up" ? ` The keys come in increasing order, so no later key goes to the left page: it stays ${leftKeys} of ${CAP} full for ever.` : " Later keys fill both of them again."}`, mark }
          : { text: `Inserted ${lastKey} into a leaf with room (blue).`, mark };
      return { text: `Inserted ${count} keys; ${splits} leaf split${splits === 1 ? "" : "s"}.`, mark: {} };
    };
    button(tools, "Insert 1", () => { last = insert(1); draw(); }, "is-primary");
    button(tools, "Insert 20", () => { last = insert(20); draw(); });
    button(tools, "Insert all", () => { last = insert(MAX); draw(); });
    button(tools, "Erase 20", () => {
      const keys = tree.scan(-Infinity, Infinity).out;
      if (!keys.length) { last = { text: "The tree is empty.", mark: {} }; draw(); return; }
      const mark = {};
      let merges = 0, borrows = 0;
      for (const k of shuffle(keys, rng).slice(0, 20)) for (const e of tree.erase(k)) {
        if (e.type === "merge") { merges++; mark[e.node] = "merge"; }
        if (e.type === "borrow") { borrows++; mark[e.node] = "merge"; }
      }
      last = { text: `Erased ${Math.min(20, keys.length)} random keys. The pages got emptier; ${borrows} page${borrows === 1 ? "" : "s"} borrowed a key and ${merges} pair${merges === 1 ? "" : "s"} of pages merged (purple), because a page must keep at least ${CAP / 2} keys.`, mark };
      draw();
    });
    button(tools, "Bulk load", () => {
      const keys = tree.scan(-Infinity, Infinity).out;
      tree = bulkTree(CAP, keys);
      last = { text: `The same ${keys.length} keys, loaded at once from sorted order: every leaf is full, only the last two may share.`, mark: {} };
      draw();
    });
    button(tools, "Reset", () => { reset(); draw(); });
    function draw() {
      const lv = tree.levels();
      const leaves = lv[lv.length - 1];
      const n = tree.size;
      svg.textContent = "";
      const cw = (W - M.l - M.r) / Math.max(leaves.length, 24);
      const ch = (H - M.t - M.b) / CAP;
      const Y = (v) => H - M.b - v * ch;
      for (const v of [0, CAP / 2, CAP]) {
        seg(svg, M.l, Y(v), W - M.r, Y(v), v === CAP / 2 ? "st-grid is-min" : "st-grid");
        label(svg, M.l - 6, Y(v), String(v), "st-tick", "end");
      }
      leaves.forEach((leaf, i) => {
        const x = M.l + i * cw;
        const cls = last.mark[leaf.id] ? ` is-${last.mark[leaf.id]}` : "";
        rect(svg, x + 1, Y(CAP), Math.max(1, cw - 2), CAP * ch, `st-leafbox${cls}`, 2);
        if (leaf.keys.length) rect(svg, x + 1, Y(leaf.keys.length), Math.max(1, cw - 2), leaf.keys.length * ch, `st-leaffill${cls}`, 2);
      });
      const fill = n && leaves.length ? n / (leaves.length * CAP) : 0;
      if (n) {
        seg(svg, M.l, Y(fill * CAP), W - M.r, Y(fill * CAP), "st-avg");
        label(svg, W - M.r - 4, Y(fill * CAP) - 8, `average ${Math.round(fill * 100)} % full`, "st-tick st-avg-lbl", "end");
      }
      label(svg, (M.l + W - M.r) / 2, H - 6, "the leaves, from the smallest keys to the largest", "st-axis");
      stats.textContent = "";
      const best = Math.ceil(n / CAP);
      for (const [k, v] of [["keys", n], ["leaves", leaves.length], ["full leaves would need", best], ["levels", tree.height]]) stats.append(h("span", { text: k }), h("b", { text: String(v) }));
      ui.setCaption(`${last.text} ${n ? `Now ${n} keys in ${leaves.length} leaves: on average **${Math.round(fill * 100)} %** full.` : ""}`);
    }
    draw();
  });

  /* ------------------------------------------------- SIMD node search */
  register("node-search", (fig) => {
    // A node of 16 keys; the last four are >= 2^63 when "large keys" is on.
    const SMALL = [3, 8, 12, 19, 23, 31, 36, 40, 47, 52, 58, 61, 67, 72, 80, 91];
    let large = false, isa = "avx2", flip = true, x = 50;
    const ui = frame(fig, { title: "Searching a node with SIMD", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-lanesbox" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    toggle(tools, "SIMD", [["avx2", "AVX2: 4 per compare"], ["avx512", "AVX-512: 8 per compare"]], isa, (v) => { isa = v; player.setFrames(make()); });
    toggle(tools, "Keys", [[false, "small"], [true, "some ≥ 2⁶³"]], large, (v) => { large = v; player.setFrames(make()); });
    const flipButtons = toggle(tools, "AVX2", [[true, "flip the top bit"], [false, "no flip"]], flip, (v) => { flip = v; player.setFrames(make()); });
    slider(tools, "x", { min: 0, max: 100, step: 1, value: x, format: (v) => String(v) }, (v) => { x = v; player.setFrames(make()); });
    const keys = () => SMALL.map((k, i) => (large && i >= 12 ? { big: true, v: k } : { big: false, v: k }));
    const show = (k) => (k.big ? `2⁶³+${k.v}` : String(k.v));
    // As signed 64-bit numbers, keys >= 2^63 are negative.
    const signedLess = (k) => (k.big ? true : k.v < x);  // key < x?
    const unsignedLess = (k) => (k.big ? false : k.v < x);
    function make() {
      const ks = keys();
      const width = isa === "avx2" ? 4 : 8;
      const frames = [{ group: -1, total: 0, cap: `The 16 keys of a node, in increasing order${large ? " (the last four are 2⁶³ or more)" : ""}, and x = ${x}. The answer is the number of keys < x.` }];
      let total = 0;
      for (let g = 0; g < 16 / width; g++) {
        const res = ks.slice(g * width, g * width + width).map((k) => (isa === "avx2" && !flip ? signedLess(k) : unsignedLess(k)));
        total += res.filter(Boolean).length;
        frames.push({ group: g, width, res, total, cap: `Compare ${width} keys with x in one instruction${isa === "avx2" ? (flip ? " (after flipping the top bit of both, the signed compare gives the unsigned answer)" : " (a signed compare)") : " (an unsigned compare into a mask register)"}: ${res.filter(Boolean).length} are < x. Running count: ${total}.` });
      }
      const right = ks.filter(unsignedLess).length;
      frames.push({ group: 99, width, total, right, cap: total === right
        ? `The answer: **${total}** keys are < x, so x belongs at place ${total}. No branch depends on where the keys change, so the CPU never guesses wrong. On our machine, 64 keys: 17 ns with AVX2, 14.5 ns with AVX-512, 52 ns with std::lower_bound.`
        : `**Wrong**: the count is ${total}, but only ${right} keys are < x. Without the flip, AVX2 compares signed numbers, and a key of 2⁶³ or more looks negative, so it seems smaller than x. Flip the top bit of both sides first.` });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1500,
      apply: (f) => {
        flipButtons.forEach((b) => (b.disabled = isa !== "avx2"));
        box.textContent = "";
        const ks = keys();
        const width = isa === "avx2" ? 4 : 8;
        const less = (k) => (isa === "avx2" && !flip ? signedLess(k) : unsignedLess(k));
        const regs = h("div", { class: "st-regs" });
        for (let g = 0; g < 16 / width; g++) {
          const part = ks.slice(g * width, g * width + width);
          const done = f.group === 99 || (f.group >= 0 && g <= f.group);
          const bits = part.map(less);
          regs.append(h("div", { class: `st-reg${f.group === g ? " is-cur" : ""}` },
            h("span", { class: "st-reghead", text: `compare ${g + 1}: keys ${g * width}–${g * width + width - 1}` }),
            cells(part.map(show), (i) => (part[i].big ? "is-big" : "")),
            cells(part.map((k, i) => (done ? (bits[i] ? "1" : "0") : "")), (i) => (done && bits[i] ? (unsignedLess(part[i]) ? "is-hit" : "is-bad") : "")),
            h("span", { class: `st-sum${done && part.some((k, i) => bits[i] && !unsignedLess(k)) ? " is-bad" : ""}`, text: done ? `+${bits.filter(Boolean).length}` : "" })));
        }
        box.append(regs, h("div", { class: "st-count" }, h("span", { text: "keys < x" }), h("b", { text: String(f.total) })));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- differential fuzzing */
  register("fuzz-loop", (fig) => {
    // Operations decoded from bytes, applied to the map under test and to std::map.
    const OPS = [["insert", 5, 50], ["insert", 9, 90], ["find", 9], ["insert", 5, 55], ["scan", 4, 9], ["erase", 7], ["insert", 70, 7], ["scan", 0, 99], ["erase", 5], ["find", 5]];
    // The first byte picks the operation: 0 insert, 1 erase, 2 find, 3 scan.
    const BYTES = ["00 05 32", "00 09 5a", "02 09", "00 05 37", "03 04 09", "01 07", "00 46 07", "03 00 63", "01 05", "02 05"];
    let bug = "none";
    const ui = frame(fig, { title: "Differential fuzzing", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-fuzz" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    toggle(tools, "Map under test", [["none", "correct"], ["scan", "bug: scan leaves out hi"], ["value", "bug: keeps the old value"], ["erase", "bug: erase says yes"]], bug, (b) => { bug = b; player.setFrames(make()); });
    function run(op, m, model) {
      const [name, a, b] = op;
      const show = (r) => (Array.isArray(r) ? `[${r.join(", ")}]` : String(r));
      if (name === "insert") {
        const fresh = !model.has(a);
        model.set(a, b);
        const had = m.has(a);
        if (!(bug === "value" && had)) m.set(a, b);
        return [show(!had), show(fresh)];
      }
      if (name === "erase") {
        const want = model.delete(a);
        const got = m.delete(a);
        return [show(bug === "erase" ? true : got), show(want)];
      }
      if (name === "find") return [show(m.has(a) ? m.get(a) : "none"), show(model.has(a) ? model.get(a) : "none")];
      const pick = (mm, strict) => [...mm.keys()].sort((p, q) => p - q).filter((k) => k >= a && (strict ? k < b : k <= b)).map((k) => `${k}:${mm.get(k)}`);
      return [show(pick(m, bug === "scan")), show(pick(model, false))];
    }
    function make() {
      const m = new Map(), model = new Map();
      const frames = [{ upto: -1, rows: [], cap: "The fuzzer gives bytes; the harness reads them as operations, runs each one on the map under test and on std::map, and compares the answers." }];
      const rows = [];
      for (let i = 0; i < OPS.length; i++) {
        const [got, want] = run(OPS[i], m, model);
        const same = got === want;
        rows.push({ op: OPS[i], bytes: BYTES[i], got, want, same });
        frames.push({ upto: i, rows: rows.slice(), cap: same ? `Operation ${i + 1}: both answer ${want}.` : `Operation ${i + 1}: **different answers** (${got} against ${want}). The harness returns false, libFuzzer stops, and saves these bytes as a crash file that repeats the bug.` });
        if (!same) break;
      }
      if (rows.every((r) => r.same)) frames.push({ upto: OPS.length, rows, cap: "All answers agree. libFuzzer now changes the bytes (flips bits, inserts, copies parts), keeps the inputs that reach new code, and tries again: thousands of times per second." });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1300,
      apply: (f) => {
        box.textContent = "";
        const table = h("table", { class: "st-fuzztable" }, h("tr", {}, h("th", { text: "bytes" }), h("th", { text: "operation" }), h("th", { text: "your map" }), h("th", { text: "std::map" })));
        OPS.forEach((op, i) => {
          const r = f.rows[i];
          const opText = op[0] === "insert" ? `insert ${op[1]} → ${op[2]}` : op[0] === "scan" ? `scan [${op[1]}, ${op[2]}]` : `${op[0]} ${op[1]}`;
          table.append(h("tr", { class: r ? (r.same ? "is-ok" : "is-bad") : "is-todo" }, h("td", { class: "st-mono", text: BYTES[i] }), h("td", { text: opText }), h("td", { text: r ? r.got : "" }), h("td", { text: r ? r.want : "" })));
        });
        box.append(table);
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- bulk loading */
  register("bulk-load", (fig) => {
    const CAP = 4, N = 29, THREADS = 3;
    const keys = Array.from({ length: N }, (_, i) => 2 + i * 3);
    const sizes = splitLevel(N, CAP, CAP / 2);
    const start = [0];
    sizes.forEach((sz) => start.push(start[start.length - 1] + sz));
    const L = sizes.length;
    const per = Math.ceil(L / THREADS);
    const frames = [{ leaves: 0, upper: 0, cap: `${N} sorted keys and pages of ${CAP}. The sizes of all leaves are known before any is filled: full pages, and the last two share if the last would get fewer than ${CAP / 2}. Prefix sums give where each leaf's keys start.` }];
    for (let r = 1; r <= per; r++) frames.push({ leaves: r, upper: 0, cap: `${THREADS} threads fill leaves at the same time, each its own run of leaves (a static schedule): every thread copies its keys and writes the links. Each thread is also the first to touch its pages.` });
    frames.push({ leaves: per, upper: 1, cap: "The level above is made from the largest key of every leaf, again in parallel: its pages are independent too." });
    frames.push({ leaves: per, upper: 2, cap: "Up to the root. On our machine, 16,000,000 keys took 187 ms on one thread and 81 ms on four (2.3 times faster). Inserting them one by one would take seconds." });
    // the upper levels
    const level1 = [];
    let first = 0;
    for (const size of splitLevel(L, CAP + 1, CAP / 2 + 1)) {
      level1.push(Array.from({ length: size }, (_, i) => first + i));
      first += size;
    }
    const ui = frame(fig, { title: "Bulk loading, bottom up", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const pageW = CAP * 18, gap = 8;
    const W = L * (pageW + gap) + gap, H = 170;
    const wrap = h("div", { class: "st-scroll" });
    ui.stage.appendChild(wrap);
    const svg = svgBox(wrap, W, H, "st-tree");
    svg.style.minWidth = "520px";
    new Player(fig, {
      frames, interval: 1400,
      apply: (f) => {
        svg.textContent = "";
        const xl = (l) => gap + l * (pageW + gap);
        const y0 = 118;
        for (let l = 0; l < L; l++) {
          const thread = Math.floor(l / per), filled = l - thread * per < f.leaves;
          rect(svg, xl(l), y0, pageW, 22, `st-page is-leaf${filled ? ` t${thread}` : ""}`, 4);
          for (let i = 0; i < CAP; i++) {
            if (i) seg(svg, xl(l) + i * 18, y0 + 3, xl(l) + i * 18, y0 + 19, "st-sep");
            if (filled && i < sizes[l]) label(svg, xl(l) + i * 18 + 9, y0 + 11.5, String(keys[start[l] + i]), "st-key");
          }
          if (l === 0 || Math.floor((l - 1) / per) !== thread) label(svg, xl(l) + 4, y0 + 36, `thread ${thread}`, "st-tick", "start");
          // the link to the next leaf, written by the thread of this leaf
          if (filled && l + 1 < L) s("path", { d: `M${xl(l) + pageW} ${y0 + 11}h${gap}`, class: "st-link" }, svg);
        }
        if (f.upper >= 1) {
          level1.forEach((kids, t) => {
            const a = xl(kids[0]), b = xl(kids[kids.length - 1]) + pageW, x0 = (a + b) / 2 - pageW / 2;
            kids.forEach((c) => seg(svg, x0 + pageW / 2, 84, xl(c) + pageW / 2, y0, "st-edge"));
            rect(svg, x0, 62, pageW, 22, "st-page", 4);
            kids.slice(0, -1).forEach((c, i) => label(svg, x0 + i * 18 + 9, 73.5, String(keys[start[c + 1] - 1]), "st-key"));
          });
        }
        if (f.upper >= 2 && level1.length > 1) {
          const centers = level1.map((kids) => (xl(kids[0]) + xl(kids[kids.length - 1]) + pageW) / 2);
          const x0 = (centers[0] + centers[centers.length - 1]) / 2 - pageW / 2;
          centers.forEach((c) => seg(svg, x0 + pageW / 2, 30, c, 62, "st-edge"));
          rect(svg, x0, 8, pageW, 22, "st-page", 4);
          level1.slice(0, -1).forEach((kids, i) => label(svg, x0 + i * 18 + 9, 19.5, String(keys[start[kids[kids.length - 1] + 1] - 1]), "st-key"));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ============================================ chapter 27: pages, buffer pool, caching */

  /* ------------------------------------------------- a slotted page */
  register("slotted-page", (fig) => {
    // A toy page of 512 bytes (real pages have 4096), with the rules of page.hpp.
    const PAGE = 512, HEADER = 8, SLOT = 4;
    let page, size = 24;
    const freeBegin = () => HEADER + SLOT * page.slots.length;
    const freeGap = () => page.freeEnd - freeBegin();
    function compact() {
      const live = page.slots.filter((x) => x.off).sort((a, b) => b.off - a.off);
      let end = PAGE;
      for (const x of live) {
        end -= x.len;
        x.off = end;
      }
      page.freeEnd = end;
      page.garbage = 0;
    }
    // What an insert of len bytes would do: the slot, the bytes it needs, and whether it fits.
    function plan(len) {
      let slot = page.slots.findIndex((x) => x.off === 0);
      const fresh = slot < 0;
      if (fresh) slot = page.slots.length;
      const need = len + (fresh ? SLOT : 0);
      return { slot, fresh, need, fits: freeGap() >= need, afterCompact: freeGap() < need && freeGap() + page.garbage >= need };
    }
    function insert(len) {
      const r = plan(len);
      if (!r.fits && !r.afterCompact) return r;
      if (r.afterCompact) compact();
      page.freeEnd -= len;
      if (r.fresh) page.slots.push({ off: 0, len: 0 });
      page.slots[r.slot] = { off: page.freeEnd, len };
      return r;
    }
    function reset() {
      page = { freeEnd: PAGE, garbage: 0, slots: [] };
      for (const len of [40, 72, 28, 56, 36]) insert(len);
    }
    reset();
    const ui = frame(fig, { title: "A slotted page", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 118, X0 = 16, X1 = 624;
    const svg = svgBox(ui.stage, W, H, "st-page-svg");
    const bytes = h("div", { class: "st-bytes" });
    const list = h("div", { class: "st-slotlist" });
    ui.stage.append(bytes, list);
    const tools = toolbar(ui);
    slider(tools, "Record size", { min: 8, max: 120, step: 4, value: size, format: (v) => `${v} bytes` }, (v) => { size = v; draw(); });
    const insertBtn = button(tools, "Insert", () => {
      const r = insert(size);
      ui.setCaption(r.fits || r.afterCompact
        ? `Inserted ${size} bytes as slot ${r.slot}: ${r.fresh ? `a new slot, so the slot array grew by ${SLOT} bytes` : "it reused the smallest free slot"}. The record went just below free_end.${r.afterCompact ? " The free space was too small, but with the garbage it was enough, so the page compacted first." : ""}`
        : `Does not fit: the record needs ${size} bytes${r.fresh ? ` plus ${SLOT} for a new slot, ${r.need} bytes in all` : ""}, and the page has only ${freeGap()} bytes of free space and ${page.garbage} bytes of garbage. A database puts the record into another page. Erase a record (click it), or choose a smaller size.`);
      draw();
    }, "is-primary");
    button(tools, "Compact", () => {
      compact();
      ui.setCaption("Compacted: the records moved together at the end of the page, the garbage became free space, and every record kept its slot number.");
      draw();
    });
    button(tools, "Reset", () => { reset(); ui.setCaption("Five records in a page of 512 bytes (a real page has 4096). Click a record to erase it."); draw(); });
    const bx = (b) => X0 + (b / PAGE) * (X1 - X0);
    function erase(i) {
      const len = page.slots[i].len;
      page.garbage += len;
      page.slots[i] = { off: 0, len: 0 };
      ui.setCaption(`Erased slot ${i}: its ${len} bytes are garbage now, and the slot is free for the next insert. Nothing moved, so the record ids of the other records stay valid.`);
      draw();
    }
    function draw() {
      svg.textContent = "";
      const y = 22, hh = 40;
      rect(svg, bx(0), y, bx(PAGE) - bx(0), hh, "st-pg-free", 3);
      rect(svg, bx(0), y, bx(HEADER) - bx(0), hh, "st-pg-header", 2);
      page.slots.forEach((x, i) => rect(svg, bx(HEADER + SLOT * i) + 0.5, y + 4, bx(SLOT) - bx(0) - 1, hh - 8, x.off ? `st-pg-slot c${i % 6}` : "st-pg-slot is-free", 1));
      // garbage: the records area minus the live records
      const live = page.slots.filter((x) => x.off).sort((a, b) => a.off - b.off);
      let at = page.freeEnd;
      for (const x of [...live, { off: PAGE, len: 0 }]) {
        if (x.off > at) rect(svg, bx(at), y, bx(x.off) - bx(at), hh, "st-pg-garbage", 0);
        at = Math.max(at, x.off + x.len);
      }
      page.slots.forEach((x, i) => {
        if (!x.off) return;
        const r = rect(svg, bx(x.off) + 0.5, y, bx(x.off + x.len) - bx(x.off) - 1, hh, `st-pg-rec c${i % 6} is-click`, 2);
        r.addEventListener("click", () => erase(i));
        r.appendChild(s("title", {})).textContent = `slot ${i}: ${x.len} bytes at offset ${x.off}. Click to erase.`;
        if (bx(x.off + x.len) - bx(x.off) > 18) label(svg, (bx(x.off) + bx(x.off + x.len)) / 2, y + hh / 2, String(i), "st-pg-lbl");
      });
      const marks = [[0, "0", 0, "start"], [PAGE, String(PAGE), 0, "end"], [freeBegin(), "free_begin", 1, "start"], [page.freeEnd, "free_end", 1, "end"]];
      marks.forEach(([b, name, ln, anchor]) => {
        seg(svg, bx(b), y + hh, bx(b), y + hh + 6 + 14 * ln, "st-grid");
        label(svg, bx(b) + (anchor === "start" ? 3 : -3) * ln, y + hh + 16 + 14 * ln, name, "st-tick", anchor);
      });
      label(svg, bx(HEADER / 2), y - 9, "header", "st-tick", "start");
      // the bytes of the page, and what the next insert needs
      const r = plan(size);
      const used = live.reduce((a, x) => a + x.len, 0);
      bytes.textContent = "";
      for (const [k, v, cls] of [["header", HEADER, ""], ["slot array", SLOT * page.slots.length, ""], ["free space", freeGap(), "is-free"], ["garbage", page.garbage, "is-garbage"], ["records", used, ""]])
        bytes.append(h("span", { class: `st-byte ${cls}` }, h("i", { text: k }), h("b", { text: `${v} B` })));
      bytes.append(h("span", { class: `st-byte is-need ${r.fits ? "is-ok" : r.afterCompact ? "is-warn" : "is-bad"}` }, h("i", { text: "next insert needs" }),
        h("b", { text: `${size}${r.fresh ? ` + ${SLOT}` : ""} = ${r.need} B: ${r.fits ? "fits" : r.afterCompact ? "fits after compacting" : "does not fit"}` })));
      insertBtn.disabled = false;
      list.textContent = "";
      const row = cells(page.slots.map((x, i) => (x.off ? `${i}: ${x.off}+${x.len}` : `${i}: free`)), (i) => (page.slots[i].off ? `c${i % 6} is-click` : "is-dim"), "slots");
      row.querySelectorAll(".st-cell").forEach((el, i) => { if (page.slots[i].off) el.addEventListener("click", () => erase(i)); });
      list.append(row);
    }
    ui.setCaption("Five records in a page of 512 bytes (a real page has 4096). The slots grow from the left, the records from the right; each record has the colour of its slot. Choose a size and insert, or click a record to erase it.");
    draw();
  });

  /* ------------------------------------------------- a buffer pool with CLOCK */
  register("buffer-pool", (fig) => {
    const FRAMES = 4;
    // The requests: read or write page p; `until`: a long scan keeps the page
    // pinned until that request (its index in this list).
    const REQUESTS = [{ p: 1 }, { p: 2 }, { p: 3, until: 9 }, { p: 4, write: true }, { p: 2 }, { p: 5 }, { p: 2 }, { p: 6 }, { p: 2 }, { p: 7 }, { p: 2 }];
    const frames = [];
    {
      const fr = Array.from({ length: FRAMES }, () => ({ page: null, pins: 0, ref: 0, dirty: false }));
      const where = new Map();
      let hand = 0, unused = 0;
      const n = { hits: 0, misses: 0, reads: 0, writes: 0 };
      const held = [];  // [frame, until]
      const snap = (k, cap, focus = {}) => frames.push({ fr: fr.map((f) => ({ ...f })), hand: focus.handAt ?? hand, req: k, n: { ...n }, cap, focus });
      snap(-1, `A buffer pool with ${FRAMES} frames, and a list of requests. The hand of CLOCK starts at frame 0. Every request pins its page while it is used; page 3 stays pinned while a long scan reads it.`);
      REQUESTS.forEach((r, k) => {
        for (let i = held.length - 1; i >= 0; i--) if (held[i][1] === k) { fr[held[i][0]].pins--; held.splice(i, 1); snap(k, `The scan is done with page 3: it is unpinned, so CLOCK may evict it again.`, { frame: where.get(3) }); }
        const verb = r.write ? "Write" : "Read";
        if (where.has(r.p)) {
          const f = where.get(r.p);
          fr[f].ref = 1;
          n.hits++;
          if (r.write) fr[f].dirty = true;
          snap(k, `${verb} page ${r.p}: it is in frame ${f}, a **hit**. Its reference bit is set (it may be set already). That is all: no list to update, no lock.`, { frame: f, hit: true });
          return;
        }
        n.misses++;
        let f;
        if (unused < FRAMES) {
          f = unused++;
          snap(k, `${verb} page ${r.p}: not in the pool, a **miss**. Frame ${f} has never held a page, so it is free.`, { frame: f });
        } else {
          snap(k, `${verb} page ${r.p}: not in the pool, a **miss**. Every frame holds a page, so CLOCK must find a victim. The hand starts at frame ${hand}.`, { frame: hand });
          for (;;) {
            const g = fr[hand];
            const at = hand;
            if (g.pins > 0) {
              hand = (hand + 1) % FRAMES;
              snap(k, `Frame ${at} (page ${g.page}) is pinned: someone uses its bytes now. Skip it; its bit stays as it is.`, { frame: at, skip: true, handAt: at });
              continue;
            }
            if (g.ref) {
              g.ref = 0;
              hand = (hand + 1) % FRAMES;
              snap(k, `Frame ${at} (page ${g.page}): its bit was 1, so the page was used since the hand passed last. **Second chance**: clear the bit and move on.`, { frame: at, clear: true, handAt: at });
              continue;
            }
            hand = (hand + 1) % FRAMES;
            f = at;
            snap(k, `Frame ${at} (page ${g.page}): its bit is 0, so the page was not used for a whole turn of the hand. It is the **victim**.`, { frame: at, victim: true, handAt: at });
            break;
          }
          const old = fr[f];
          if (old.dirty) {
            n.writes++;
            snap(k, `Page ${old.page} is dirty: it was changed in memory. It is written to the disk first, or the change would be lost.`, { frame: f, victim: true, write: true, handAt: f });
          }
          where.delete(old.page);
        }
        n.reads++;
        fr[f] = { page: r.p, pins: 1, ref: 1, dirty: !!r.write };
        where.set(r.p, f);
        if (r.until) held.push([f, r.until]);
        else fr[f].pins = 0;
        snap(k, `Page ${r.p} is read from the disk into frame ${f}, and its bit is set.${r.write ? " The request changes it: the page is dirty now." : ""}${r.until ? " The scan keeps it pinned." : ""} The hand stays at frame ${hand} for the next miss.`, { frame: f, load: true });
      });
      frames[frames.length - 1].cap += ` In all: ${n.hits} hits and ${n.misses} misses. Page 2 is used often, so its bit is set again before the hand comes back: it was never evicted.`;
    }
    const ui = frame(fig, { title: "A buffer pool with CLOCK", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-clock" });
    ui.stage.appendChild(box);
    new Player(fig, {
      frames, interval: 1800,
      apply: (f) => {
        box.textContent = "";
        box.append(cells(REQUESTS.map((r) => `${r.write ? "W" : "R"} ${r.p}`), (i) => (i === f.req ? "is-cur" : i < f.req ? "is-dim" : ""), "requests"));
        const row = h("div", { class: "st-frames" });
        f.fr.forEach((fr, i) => {
          const on = f.focus.frame === i;
          const state = on ? (f.focus.victim ? " is-victim" : f.focus.load ? " is-load" : f.focus.hit ? " is-hit" : f.focus.skip ? " is-skip" : " is-cur") : "";
          row.append(h("div", { class: `st-frame-box${state}` },
            h("div", { class: "st-fhand", text: f.hand === i ? "▼ hand" : "" }),
            h("div", { class: "st-frame-name", text: `frame ${i}` }),
            h("div", { class: "st-frame-page", text: fr.page == null ? "empty" : `page ${fr.page}` }),
            h("div", { class: "st-frame-flags" },
              h("span", { class: `st-flag${fr.ref ? " is-on" : ""}`, text: `bit ${fr.ref}` }),
              h("span", { class: `st-flag${fr.pins ? " is-pin" : ""}`, text: fr.pins ? "pinned" : "unpinned" }),
              h("span", { class: `st-flag${fr.dirty ? " is-dirty" : ""}`, text: fr.dirty ? "dirty" : "clean" }))));
        });
        box.append(row, h("div", { class: "st-wrap", text: "after the last frame, the hand goes back to frame 0" }));
        box.append(h("div", { class: "st-kv" },
          h("span", { text: "hits" }), h("b", { text: String(f.n.hits) }),
          h("span", { text: "misses" }), h("b", { text: String(f.n.misses) }),
          h("span", { text: "pages read" }), h("b", { text: String(f.n.reads) }),
          h("span", { text: "pages written" }), h("b", { text: String(f.n.writes) })));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- a Count-Min sketch */
  register("count-min", (fig) => {
    const KEYS = "ABCDEFGH".split(""), ROWS = 4, WIDTH = 16;
    const WEIGHTS = [8, 5, 4, 3, 2, 2, 1, 1];  // how often "20 random" draws each key
    // the counter of a key in each row (fixed, with some collisions)
    const POS = KEYS.map((k, i) => Array.from({ length: ROWS }, (_, r) => (Math.imul(i * 2654435761 + r * 40503 + 7, 2246822519) >>> 27) % WIDTH));
    let counters, truth, conservative = false, last = null, rng;
    function reset() {
      counters = Array.from({ length: ROWS }, () => new Array(WIDTH).fill(0));
      truth = new Array(KEYS.length).fill(0);
      last = null;
      rng = mulberry32(5);
    }
    function addRandom(n) {
      const total = WEIGHTS.reduce((a, b) => a + b, 0);
      for (let k = 0; k < n; k++) {
        let u = rng() * total, i = 0;
        while (u >= WEIGHTS[i]) u -= WEIGHTS[i++];
        add(i);
      }
      last = null;
    }
    reset();
    const estimate = (i) => Math.min(...POS[i].map((j, r) => counters[r][j]));
    function add(i) {
      const m = estimate(i);
      POS[i].forEach((j, r) => { if (!conservative || counters[r][j] === m) counters[r][j] = Math.min(15, counters[r][j] + 1); });
      truth[i]++;
      last = i;
    }
    const ui = frame(fig, { title: "A Count-Min sketch", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-cm" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    KEYS.forEach((k, i) => button(tools, k, () => { add(i); draw(); }));
    button(tools, "20 random", () => { addRandom(20); draw(); });
    toggle(tools, "Update", [[false, "all 4"], [true, "conservative"]], conservative, (v) => { conservative = v; reset(); addRandom(20); draw(); });
    button(tools, "Halve all", () => { counters.forEach((row) => row.forEach((c, j) => (row[j] = c >> 1))); last = null; draw(true); });
    button(tools, "Reset", () => { reset(); addRandom(20); draw(); });
    function draw(halved = false) {
      box.textContent = "";
      for (let r = 0; r < ROWS; r++)
        box.append(cells(counters[r], (j) => {
          if (last == null || POS[last][r] !== j) return counters[r][j] ? "" : "is-dim";
          return counters[r][j] === estimate(last) ? "is-hit" : "is-cur";
        }, `row ${r + 1}`));
      const table = h("div", { class: "st-cm-keys" });
      table.append(cells(KEYS, (i) => (i === last ? "is-cur" : ""), "key"), cells(truth, () => "", "seen"),
        cells(KEYS.map((_, i) => estimate(i)), (i) => (estimate(i) > truth[i] ? "is-bad" : "is-hit"), "estimate"));
      box.append(table);
      if (halved) {
        ui.setCaption("Aging: every counter was halved (rounded down). The sketch now remembers half as much of the past, so new popular keys can win against old ones. (The seen row shows the true counts before halving.)");
      } else if (last == null) {
        ui.setCaption(`${truth.reduce((x, y) => x + y, 0)} keys counted so far. Add keys and watch their 4 counters, one in each row. ${conservative ? "With the conservative update, only the counters that are equal to the smallest one grow." : "Every addition adds one to all 4 counters of the key."} The estimate (the smallest of the 4) is red where other keys made it too large.`);
      } else {
        const vals = POS[last].map((j, r) => counters[r][j]);
        ui.setCaption(`Key ${KEYS[last]}: its counters are ${vals.join(", ")}, so the estimate is the smallest, ${estimate(last)}; it was really seen ${truth[last]} time${truth[last] === 1 ? "" : "s"}. ${estimate(last) < truth[last] ? "The counters stop at 15, like the 4-bit counters of TinyLFU: it only needs to know which key is more popular." : estimate(last) > truth[last] ? "Another key shares each of its counters, so every counter is too large." : "At least one of its counters is shared with no other key, so the estimate is right."}`);
      }
    }
    addRandom(20);
    draw();
  });

  // W-TinyLFU with the rules of task5_wtinylfu.hpp and exact frequencies (with
  // aging), for the figures. Lists are Maps in recency order: the first entry
  // is the least recent, the last the most recent.
  class WTinyLfuSim {
    constructor(capacity) {
      this.capacity = capacity;
      this.windowMax = Math.max(1, Math.floor(capacity / 100));
      this.protectedMax = Math.floor(((capacity - this.windowMax) * 8) / 10);
      this.window = new Map();
      this.probation = new Map();
      this.prot = new Map();
      this.freq = new Map();
      this.additions = 0;
      this.sample = 10 * capacity;
    }
    count(k) { return this.freq.get(k) || 0; }
    increment(k) {
      this.freq.set(k, Math.min(15, this.count(k) + 1));
      if (++this.additions === this.sample) {
        for (const [key, c] of this.freq) { if (c >> 1) this.freq.set(key, c >> 1); else this.freq.delete(key); }
        this.additions >>= 1;
      }
    }
    // Returns an event: {hit, where} or {miss, candidate, victim, admitted, evicted}.
    access(k) {
      this.increment(k);
      if (this.window.has(k)) { this.window.delete(k); this.window.set(k, 1); return { hit: true, where: "window" }; }
      if (this.prot.has(k)) { this.prot.delete(k); this.prot.set(k, 1); return { hit: true, where: "protected" }; }
      if (this.probation.has(k)) {
        this.probation.delete(k);
        this.prot.set(k, 1);
        let demoted = null;
        if (this.prot.size > this.protectedMax) {
          demoted = this.prot.keys().next().value;
          this.prot.delete(demoted);
          this.probation.set(demoted, 1);
        }
        return { hit: true, where: "probation", demoted };
      }
      this.window.set(k, 1);
      const ev = { hit: false };
      if (this.window.size > this.windowMax) {
        const c = this.window.keys().next().value;
        this.window.delete(c);
        ev.candidate = c;
        if (this.probation.size + this.prot.size < this.capacity - this.windowMax) {
          this.probation.set(c, 1);
          ev.admitted = c;
        } else {
          const list = this.probation.size ? this.probation : this.prot;
          const v = list.keys().next().value;
          ev.victim = v;
          if (this.count(c) > this.count(v)) {
            list.delete(v);
            this.probation.set(c, 1);
            ev.admitted = c;
            ev.evicted = v;
          } else {
            ev.evicted = c;
          }
        }
      }
      return ev;
    }
    contains(k) { return this.window.has(k) || this.probation.has(k) || this.prot.has(k); }
  }

  /* ------------------------------------------------- W-TinyLFU step by step */
  register("wtinylfu", (fig) => {
    const CAP = 10;  // window 1, protected at most 7
    const TRACE = "a b c a d b e a c f b a g d c b x1 a x2 x3 b x4 x5 c x6 a x7 b c".split(" ");
    const frames = [];
    {
      const sim = new WTinyLfuSim(CAP);
      const snap = () => ({ window: [...sim.window.keys()].reverse(), probation: [...sim.probation.keys()].reverse(), prot: [...sim.prot.keys()].reverse(), freq: new Map(sim.freq) });
      frames.push({ ...snap(), k: null, cap: "A cache of 10 keys: a window of 1 key, and a main part of 9 with a protected list of at most 7. The popular keys a, b and c come back often; x1 ... x7 are a scan: each is used once." });
      for (const k of TRACE) {
        const ev = sim.access(k);
        let cap;
        if (ev.hit) {
          cap = ev.where === "probation"
            ? `${k}: a hit in probation, so ${k} moves up to protected.${ev.demoted ? ` Protected is too large: its oldest key ${ev.demoted} goes back to probation.` : ""}`
            : `${k}: a hit in ${ev.where}; ${k} becomes the most recent there.`;
        } else if (!ev.candidate) {
          cap = `${k}: a miss; ${k} enters the window.`;
        } else if (!ev.victim) {
          cap = `${k}: a miss; ${k} enters the window and pushes out ${ev.candidate}, which goes to probation: the main part still has room.`;
        } else {
          const won = ev.admitted === ev.candidate;
          cap = `${k}: a miss; ${k} enters the window and pushes out ${ev.candidate}. The main part is full, so ${ev.candidate} (seen ${sim.count(ev.candidate)} time${sim.count(ev.candidate) === 1 ? "" : "s"}) meets the victim ${ev.victim} (seen ${sim.count(ev.victim)} times): ${won ? `${ev.candidate} wins, ${ev.victim} is evicted.` : `${ev.victim} stays, ${ev.candidate} is evicted.`}`;
        }
        frames.push({ ...snap(), k, ev, cap });
      }
      frames[frames.length - 1].cap += " The scan passed through the window, and a, b and c are still in the cache.";
    }
    const ui = frame(fig, { title: "W-TinyLFU", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-wtl" });
    ui.stage.appendChild(box);
    new Player(fig, {
      frames, interval: 1600,
      apply: (f) => {
        box.textContent = "";
        const show = (keys, max, name) => {
          const vals = keys.map((k) => `${k} · ${f.freq.get(k) || 0}`);
          while (vals.length < max) vals.push("");
          return cells(vals, (i) => {
            const k = keys[i];
            if (k == null) return "is-empty";
            if (f.ev && f.ev.victim === k) return "is-victim";
            if (f.ev && f.ev.candidate === k) return "is-cand";
            return k === f.k ? "is-cur" : "";
          }, name);
        };
        box.append(show(f.window, 1, "window"), show(f.probation, CAP - 1, "probation"), show(f.prot, 7, "protected"));
        const ev = f.ev;
        if (ev && ev.evicted) box.append(h("div", { class: "st-evicted" }, h("span", { text: "evicted" }), h("b", { text: ev.evicted })));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- LRU, CLOCK and W-TinyLFU */
  register("cache-policies", (fig) => {
    const N = 60000, KEYS = 3000;
    function zipfSampler(n, alpha, rng) {
      const cdf = new Float64Array(n);
      let sum = 0;
      for (let i = 0; i < n; i++) cdf[i] = sum += 1 / Math.pow(i + 1, alpha);
      return () => {
        const u = rng() * sum;
        let lo = 0, hi = n - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
        return lo;
      };
    }
    const scramble = (x) => Math.imul(x ^ 0x5bd1e995, 2654435761) >>> 0;
    const TRACES = {
      zipf: () => { const rng = mulberry32(1), z = zipfSampler(KEYS, 0.9, rng); return Array.from({ length: N }, () => scramble(z())); },
      scans: () => {
        const rng = mulberry32(2), z = zipfSampler(KEYS, 0.9, rng), t = [];
        let fresh = 1e7;
        while (t.length < N) {
          for (let i = 0; i < 3000 && t.length < N; i++) t.push(scramble(z()));
          for (let i = 0; i < 1500 && t.length < N; i++) t.push(fresh++);
        }
        return t;
      },
      loop: () => Array.from({ length: N }, (_, i) => scramble(i % 500)),
      shifting: () => { const rng = mulberry32(4), z = zipfSampler(KEYS, 0.9, rng); return Array.from({ length: N }, (_, i) => scramble(z() + KEYS * Math.floor(i / 15000))); },
    };
    const NAMES = { zipf: "Zipf's law", scans: "Zipf's law and scans", loop: "a loop over 500 keys", shifting: "popular keys change" };
    const cache = {};
    const traceOf = (name) => (cache[name] ||= TRACES[name]());
    function lru(trace, cap) {
      const m = new Map();
      let hits = 0;
      for (const k of trace) {
        if (m.has(k)) { hits++; m.delete(k); m.set(k, 1); continue; }
        if (m.size === cap) m.delete(m.keys().next().value);
        m.set(k, 1);
      }
      return hits / trace.length;
    }
    function clock(trace, cap) {
      const where = new Map(), page = new Array(cap), ref = new Uint8Array(cap);
      let hand = 0, used = 0, hits = 0;
      for (const k of trace) {
        const f = where.get(k);
        if (f !== undefined) { hits++; ref[f] = 1; continue; }
        let g;
        if (used < cap) g = used++;
        else {
          while (ref[hand]) { ref[hand] = 0; hand = (hand + 1) % cap; }
          g = hand;
          hand = (hand + 1) % cap;
          where.delete(page[g]);
        }
        page[g] = k;
        ref[g] = 1;
        where.set(k, g);
      }
      return hits / trace.length;
    }
    function wtinylfu(trace, cap) {
      const sim = new WTinyLfuSim(cap);
      let hits = 0;
      for (const k of trace) hits += sim.access(k).hit ? 1 : 0;
      return hits / trace.length;
    }
    // Belady's OPT: on a miss, evict the key whose next use is the farthest
    // in the future. No real cache knows the future; OPT shows the best
    // possible hit ratio. A max-heap of [next use, key] with lazy deletion.
    function opt(trace, cap) {
      const nextUse = new Array(trace.length);
      const seen = new Map();
      for (let i = trace.length - 1; i >= 0; i--) { nextUse[i] = seen.has(trace[i]) ? seen.get(trace[i]) : Infinity; seen.set(trace[i], i); }
      const when = new Map();  // key in the cache -> its next use
      const heap = [];
      const push = (x) => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] >= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] > heap[m][0]) m = l; if (r < heap.length && heap[r][0] > heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      let hits = 0;
      trace.forEach((k, i) => {
        if (when.has(k)) hits++;
        else if (when.size === cap) {
          for (;;) { const [t, v] = pop(); if (when.get(v) === t) { when.delete(v); break; } }  // skip stale entries
        }
        when.set(k, nextUse[i]);
        push([nextUse[i], k]);
      });
      return hits / trace.length;
    }
    let trace = "scans", size = 300;
    const ui = frame(fig, { title: "LRU, CLOCK and W-TinyLFU", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 236, M = { l: 112, r: 60, t: 14, b: 26 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    toggle(tools, "Trace", Object.keys(NAMES).map((k) => [k, NAMES[k]]), trace, (v) => { trace = v; draw(); });
    slider(tools, "Cache size", { min: 50, max: 800, step: 50, value: size, format: (v) => `${v} keys` }, (v) => { size = v; draw(); });
    function draw() {
      const t = traceOf(trace);
      const res = [["LRU", lru(t, size), "c5"], ["CLOCK", clock(t, size), "c1"], ["W-TinyLFU", wtinylfu(t, size), "c2"], ["OPT (knows the future)", opt(t, size), "is-opt"]];
      svg.textContent = "";
      const X = (v) => M.l + v * (W - M.l - M.r);
      for (const v of [0, 0.25, 0.5, 0.75, 1]) { seg(svg, X(v), M.t, X(v), H - M.b, "st-grid"); label(svg, X(v), H - M.b + 14, `${v * 100} %`, "st-tick"); }
      const bh = (H - M.t - M.b) / res.length;
      res.forEach(([name, v, cls], i) => {
        const y = M.t + i * bh + 8;
        label(svg, M.l - 10, y + (bh - 16) / 2, name === "OPT (knows the future)" ? "OPT" : name, "st-axis-name", "end");
        rect(svg, X(0), y, X(v) - X(0), bh - 16, `st-bar ${cls}`, 3);
        label(svg, X(v) + 6, y + (bh - 16) / 2, `${(v * 100).toFixed(1)} %`, "st-tick", "start");
      });
      const [l, c, w, o] = res.map((r) => r[1]);
      const pct = (v) => `${(v * 100).toFixed(1)} %`;
      let why;
      if (trace === "loop") {
        why = size >= 500
          ? `The loop has 500 keys and the cache has room for all of them: after the first round every policy hits (${pct(l)}).`
          : `Why is LRU at ${pct(l)}? The loop uses the keys 1, 2, ..., 500 and starts again. After 500 accesses, the key that comes next is always the one that was used longest ago, and LRU has just evicted exactly that key. CLOCK does the same. OPT shows that ${pct(o)} was possible: keep ${size - 1} keys of the loop for ever and let the others pass. W-TinyLFU gets ${pct(w)}, because a new key must be used more often than the victim to enter.`;
      } else {
        why = { zipf: "With Zipf's law alone, recency is a good guess, but frequency is better.", scans: "Every scan of 1500 new keys pushes popular keys out of LRU and CLOCK; W-TinyLFU lets the scans pass through its window.", shifting: "The popular keys change after every 15,000 accesses: aging lets W-TinyLFU forget the old ones." }[trace];
        why += ` OPT, which knows the future, gets ${pct(o)}: no real policy can beat it.`;
      }
      ui.setCaption(`Hit ratios for ${NAMES[trace]}: ${N.toLocaleString("en-US")} accesses, a cache of ${size} keys, computed in your browser. ${why}`);
    }
    draw();
  });

  /* ============================================ chapter 28: hash tables */

  // A 32-bit mixing hash for the figures (the finalizer of MurmurHash3, 32 bits).
  const mix32 = (x) => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
  };

  /* ------------------------------------------------- linear probing and Robin Hood */
  register("open-addressing", (fig) => {
    // 13 keys in 16 slots, with the home slots that their hashes give. Both
    // tables get the same keys in the same order.
    const SIZE = 16;
    const KEYS = [["A", 2], ["B", 2], ["C", 3], ["D", 2], ["E", 4], ["F", 7], ["G", 3], ["H", 8], ["I", 2], ["J", 9], ["K", 12], ["L", 12], ["M", 5]];
    const lin = new Array(SIZE).fill(null), rh = new Array(SIZE).fill(null);
    const copy = (t) => t.map((x) => x && { ...x });
    const frames = [{ lin: copy(lin), rh: copy(rh), cap: "Two empty tables of 16 slots. The same 13 keys go into both: on the top with linear probing, at the bottom with Robin Hood hashing. Each slot shows its key and how far the key is from its home slot." }];
    const walkTo = (t, home, stop) => { const w = []; for (let i = home, d = 0; ; i = (i + 1) % SIZE, d++) { w.push(i); if (stop(t[i], d)) return w; } };
    for (const [k, home] of KEYS) {
      const walkL = walkTo(lin, home, (x) => !x);
      const endL = walkL[walkL.length - 1];
      lin[endL] = { k, d: walkL.length - 1 };
      let key = k, d = 0, j = home;
      const walkR = [], swaps = [];
      for (;;) {
        walkR.push(j);
        if (!rh[j]) { rh[j] = { k: key, d }; break; }
        if (rh[j].d < d) {
          swaps.push({ at: j, out: rh[j].k, outD: rh[j].d, inn: key, inD: d });
          const o = rh[j];
          rh[j] = { k: key, d };
          key = o.k;
          d = o.d;
        }
        j = (j + 1) % SIZE;
        d++;
      }
      const lt = walkL.length > 1 ? `slots ${home}–${endL - 1} are taken, so ${k} goes to slot ${endL}, ${walkL.length - 1} from home` : `slot ${home} is free`;
      const rt = swaps.length
        ? swaps.map((x) => `at slot ${x.at}, ${x.out} is ${x.outD} from home but ${x.inn} is already ${x.inD}, so ${x.inn} takes the slot and ${x.out} walks on`).join("; ")
        : "no key on the way is closer to its home than the newcomer, so the walk is the same";
      frames.push({ lin: copy(lin), rh: copy(rh), home, walkL, walkR, swaps: swaps.map((x) => x.at), cur: k, cap: `Insert **${k}**, home slot ${home}. Linear probing: ${lt}. Robin Hood: ${rt}.` });
    }
    const dist = (t) => t.filter(Boolean).map((x) => x.d);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const [dl, dr] = [dist(lin), dist(rh)];
    frames.push({ lin: copy(lin), rh: copy(rh), cap: `Both tables are full to 13 of 16 slots. The total distance from home is ${sum(dl)} in both: Robin Hood only moves keys inside a run. But the longest distance is **${Math.max(...dl)}** with linear probing (key M) and only **${Math.max(...dr)}** with Robin Hood: no key is far from home.` });
    // Look up M (in the table) and Z (not in the table, home slot 3).
    const findL = (k, home) => walkTo(lin, home, (x) => !x || x.k === k);
    const findR = (k, home) => walkTo(rh, home, (x, d) => !x || x.k === k || x.d < d);
    const mL = findL("M", 5), mR = findR("M", 5);
    frames.push({ lin: copy(lin), rh: copy(rh), home: 5, walkL: mL, walkR: mR, cur: "M", look: true, cap: `Look up **M** (home slot 5). Linear probing reads ${mL.length} slots, Robin Hood ${mR.length}: M is closer to home there.` });
    const zL = findL("Z", 3), zR = findR("Z", 3);
    const stopAt = zR[zR.length - 1];
    frames.push({ lin: copy(lin), rh: copy(rh), home: 3, walkL: zL, walkR: zR, look: true, cap: `Look up **Z** (home slot 3), which is not in the table. Linear probing must walk to an empty slot: ${zL.length} slots. Robin Hood stops at slot ${stopAt}: ${rh[stopAt].k} there is ${rh[stopAt].d} from home, but Z would already be ${zR.length - 1}. If Z were in the table, it would have taken this slot. ${zR.length} slots.` });
    const ui = frame(fig, { title: "Linear probing and Robin Hood", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-oa" });
    ui.stage.appendChild(box);
    const row = (name, t, walk, swaps, f) => h("div", { class: "st-cells" }, h("span", { class: "st-rowname", text: name }),
      ...t.map((x, i) => h("span", { class: `st-cell ${x ? `d${Math.min(x.d, 4)}` : "is-empty"}${walk.has(i) ? " is-walk" : ""}${swaps.has(i) ? " is-swap" : ""}${x && x.k === f.cur && !f.look ? " is-cur" : ""}` },
        x ? h("b", { text: x.k }) : null, x ? h("small", { text: `+${x.d}` }) : null)));
    new Player(fig, {
      frames, interval: 1800,
      apply: (f) => {
        box.textContent = "";
        box.append(h("div", { class: "st-cells" }, h("span", { class: "st-rowname", text: "slot" }),
          ...Array.from({ length: SIZE }, (_, i) => h("span", { class: `st-cell is-index${i === f.home ? " is-home" : ""}`, text: i === f.home ? `${i} ⌂` : String(i) }))));
        box.append(row("linear", f.lin, new Set(f.walkL || []), new Set(), f), row("Robin Hood", f.rh, new Set(f.walkR || []), new Set(f.swaps || []), f));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- the Swiss table probe */
  const SWISS_CODE = `std::optional<Value> find(Key key) const {
    const std::uint64_t h = hash_key(key, seed);
    const auto h2 = static_cast<std::int8_t>(h & 127);  // H2
    std::size_t g = (h >> 7) & (groups() - 1);          // H1
    for (std::size_t step = 1;; ++step) {
        const auto* p = reinterpret_cast<const __m128i*>(&ctrl[16 * g]);
        const __m128i bytes = _mm_loadu_si128(p);
        const __m128i eq = _mm_cmpeq_epi8(bytes, _mm_set1_epi8(h2));
        for (unsigned m = _mm_movemask_epi8(eq); m != 0; m &= m - 1) {
            const std::size_t s = 16 * g + std::countr_zero(m);
            if (slots[s].key == key)
                return slots[s].value;
        }
        const __m128i empty = _mm_cmpeq_epi8(bytes, _mm_set1_epi8(kEmpty));
        if (_mm_movemask_epi8(empty) != 0)
            return std::nullopt;
        g = (g + step) & (groups() - 1);
    }
}`;
  register("swiss-probe", (fig) => {
    const GROUPS = 4, G = 16, EMPTY = -128;
    const hashOf = (k) => mix32(Math.imul(k, 2654435761) >>> 0);
    const H1 = (x) => (x >>> 7) % GROUPS, H2 = (x) => x & 127;
    const ctrl = new Array(GROUPS * G).fill(EMPTY), keys = new Array(GROUPS * G).fill(null);
    function insert(k) {
      const x = hashOf(k);
      let g = H1(x);
      for (let step = 1; step <= GROUPS; step++) {
        for (let j = 0; j < G; j++) if (ctrl[g * G + j] === EMPTY) { ctrl[g * G + j] = H2(x); keys[g * G + j] = k; return; }
        g = (g + step) % GROUPS;
      }
    }
    const home = (k) => H1(hashOf(k));
    const has = (k) => keys.includes(k);
    // Group 2 gets 16 keys (full); groups 0, 1 and 3 get some keys each.
    let k = 100;
    const want = [9, 10, 16, 6];
    const count = [0, 0, 0, 0];
    while (count.some((c, g) => c < want[g])) { const g = home(k); if (count[g] < want[g]) { insert(k); count[g]++; } k++; }
    // present: in group 0 after a key with the same H2 (a false match first)
    let present = 5000, partner = -1;
    for (;; present++) {
      if (home(present) !== 0 || has(present)) continue;
      partner = keys.findIndex((x, i) => x != null && i < G && ctrl[i] === H2(hashOf(present)));
      if (partner >= 0) break;
    }
    insert(present);
    // missing: home group 1, not in the table, with a false match there
    let missing = 7000;
    while (home(missing) !== 1 || has(missing) || !ctrl.slice(G, 2 * G).includes(H2(hashOf(missing)))) missing++;
    // behind: home group 2 (full), so it lands in group 3
    let behind = 9000;
    while (home(behind) !== 2 || has(behind)) behind++;
    insert(behind);
    const hex = (b) => (b & 255).toString(16).toUpperCase().padStart(2, "0");
    let target = present;
    function make() {
      const x = hashOf(target), h2 = H2(x);
      const fr = [];
      const st = { group: -1, show: 0, m: null, slot: -1, found: -1, wrong: [], empty: false };
      const push = (line, cap, o = {}) => { Object.assign(st, o); fr.push({ ...st, wrong: st.wrong.slice(), line, cap }); };
      push([2, 3, 4], `Look up key **${target}**. Its hash is 0x${(x >>> 0).toString(16).padStart(8, "0")} (32 bits in this picture, 64 in the code). The low 7 bits are **H2 = ${h2}** (0x${hex(h2)}); the other bits, H1, choose the first group: **group ${H1(x)}**.`, { group: H1(x) });
      let g = H1(x);
      for (let step = 1; step <= GROUPS; step++) {
        const c = ctrl.slice(g * G, g * G + G);
        push([6, 7], `Load the 16 control bytes of group ${g} into one 128-bit register: one instruction. 0x80 is an empty slot; 0x00–0x7F are the H2 of full slots.`, { group: g, show: 1, m: null, slot: -1, wrong: [] });
        const eqBits = c.map((b) => (b === h2 ? 1 : 0));
        const mask = eqBits.reduce((a, bit, j) => a | (bit << j), 0);
        push([8], `_mm_set1_epi8 puts H2 = 0x${hex(h2)} in all 16 bytes, and _mm_cmpeq_epi8 compares the 16 pairs of bytes at once: 0xFF where they are equal, 0x00 elsewhere.`, { show: 2 });
        push([9], `_mm_movemask_epi8 takes the top bit of each byte: the 16-bit mask 0b${mask.toString(2).padStart(16, "0")}. Bit j is 1 when slot j may hold the key.${mask ? "" : " Here no bit is set: no slot of this group can hold the key."}`, { show: 3, m: mask });
        let m = mask;
        while (m) {
          const j = 31 - Math.clz32(m & -m);
          const slot = g * G + j;
          if (keys[slot] === target) {
            push([10, 11, 12], `countr_zero(m) = ${j}: slot ${slot}. Its key is ${target}: **found**, after ${st.wrong.length + 1} key compare${st.wrong.length ? "s" : ""}.`, { slot, found: slot });
            return fr;
          }
          st.wrong.push(slot);
          m &= m - 1;
          push([10, 11, 9], `countr_zero(m) = ${j}: slot ${slot}. Its key is ${keys[slot]}, not ${target}: a **false match**, the same 7 bits by chance (probability 1/128 for each full slot). m &= m − 1 clears that bit.`, { slot, m });
        }
        const empties = c.filter((b) => b === EMPTY).length;
        if (empties) {
          push([14, 15, 16], `No candidate is left. A compare with kEmpty (0x80) and a movemask find ${empties} empty slot${empties > 1 ? "s" : ""} in group ${g}, so the search stops: key ${target} **is not in the table**. An insert would have used this group.`, { show: 4, empty: true });
          return fr;
        }
        const ng = (g + step) % GROUPS;
        push([14, 15, 17], `Group ${g} has no empty slot: when it was full, a key with this home went on to the next group. So the search goes on: g + ${step} = group ${ng}.`, { show: 4 });
        g = ng;
      }
      return fr;
    }
    const ui = frame(fig, { title: "A lookup in a Swiss table", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-swiss" });
    ui.stage.appendChild(box);
    const code = new V.CodePanel(ui.side, SWISS_CODE, "c++");
    const tools = toolbar(ui);
    toggle(tools, "Look up", [["present", "a key in the table"], ["missing", "a missing key"], ["behind", "a key behind a full group"]], "present", (v) => {
      target = v === "present" ? present : v === "missing" ? missing : behind;
      player.setFrames(make());
    });
    const player = new Player(fig, {
      frames: make(), interval: 2200,
      apply: (f) => {
        box.textContent = "";
        const x = hashOf(target), h2 = H2(x);
        // all groups, small: where the probe is
        box.append(h("div", { class: "st-groups" }, ...Array.from({ length: GROUPS }, (_, g) => h("div", { class: `st-group${g === f.group ? " is-cur" : ""}` },
          h("span", { text: `group ${g}` }), h("i", {}, ...ctrl.slice(g * G, g * G + G).map((b) => h("u", { class: b === EMPTY ? "is-empty" : "" })))))));
        if (f.group >= 0 && f.show >= 1) {
          const c = ctrl.slice(f.group * G, f.group * G + G);
          const base = f.group * G;
          const cl = (j) => (f.found === base + j ? " is-hit" : f.wrong.includes(base + j) ? " is-bad" : f.slot === base + j ? " is-cur" : "");
          box.append(cells(c.map((_, j) => base + j), () => "is-index", "slot"));
          box.append(cells(c.map(hex), (j) => `${c[j] === EMPTY ? "is-empty" : ""}${cl(j)}`, "ctrl"));
          if (f.show >= 2) {
            box.append(cells(c.map(() => hex(h2)), () => "is-dim", "set1(h2)"));
            box.append(cells(c.map((b) => (b === h2 ? "FF" : "00")), (j) => (c[j] === h2 ? "is-on" : "is-dim"), "cmpeq"));
          }
          if (f.show >= 3 && f.m != null) box.append(cells(c.map((_, j) => String((f.m >> j) & 1)), (j) => ((f.m >> j) & 1 ? "is-on" : "is-dim"), "m"));
          if (f.wrong.length || f.found >= 0) box.append(cells(c.map((_, j) => (f.wrong.includes(base + j) || f.found === base + j ? String(keys[base + j]) : "")), (j) => cl(j) || "is-dim", "key"));
          if (f.show >= 4) box.append(cells(c.map((b) => (b === EMPTY ? "FF" : "00")), (j) => (c[j] === EMPTY ? "is-on" : "is-dim"), "== 0x80"));
        }
        code.set(f.line);
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- hash flooding */
  register("hash-flooding", (fig) => {
    const BUCKETS = 64, KEYS = 256;
    let hash = "identity", shift = 8;
    const sup = (n) => String(n).replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    const ui = frame(fig, { title: "Hash flooding", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 210, M = { l: 34, r: 10, t: 14, b: 30 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    toggle(tools, "Hash", [["identity", "the identity"], ["mix", "a mixing hash"]], hash, (v) => { hash = v; draw(); });
    slider(tools, "Keys i · 2ᵏ, k =", { min: 0, max: 12, step: 1, value: shift, format: (v) => String(v) }, (v) => { shift = v; draw(); });
    function draw() {
      const load = new Array(BUCKETS).fill(0);
      for (let i = 0; i < KEYS; i++) {
        const key = i * 2 ** shift;
        load[(hash === "identity" ? key : mix32(key)) % BUCKETS]++;
      }
      const max = Math.max(...load);
      svg.textContent = "";
      const Y = (v) => H - M.b - (v / Math.max(8, max)) * (H - M.t - M.b);
      for (const v of [0, Math.max(8, max)]) { seg(svg, M.l, Y(v), W - M.r, Y(v), "st-grid"); label(svg, M.l - 6, Y(v), String(v), "st-tick", "end"); }
      const bw = (W - M.l - M.r) / BUCKETS;
      load.forEach((v, b) => rect(svg, M.l + b * bw + 1, Y(v), bw - 2, Y(0) - Y(v), `st-bar ${hash === "identity" && max > 16 ? "c4" : "c5"}`, 1));
      label(svg, (M.l + W - M.r) / 2, H - 8, `the ${BUCKETS} buckets of a table whose size is a power of two`, "st-axis");
      // a lookup in a chained bucket compares (load + 1) / 2 keys on average for a key in the table
      const work = load.reduce((a, v) => a + (v * (v + 1)) / 2, 0) / KEYS;
      ui.setCaption(hash === "identity"
        ? `${KEYS} keys i · 2${sup(shift)} and the identity as the hash: the bucket is the low 6 bits of the key, and ${shift >= 6 ? "they are all 0" : `only the low ${6 - shift} bits can differ`}. The fullest bucket has ${max} keys; a lookup compares ${work.toFixed(1)} keys on average.${shift >= 6 ? " Every insert walks over all earlier keys: the time grows with the square of the number of keys." : ""}`
        : `The same ${KEYS} keys with a mixing hash: every bit of the key changes about half of the bits of the hash, so the buckets fill evenly. The fullest bucket has ${max} keys; a lookup compares ${work.toFixed(1)} keys on average.`);
    }
    draw();
  });

  /* ------------------------------------------------- consistent hashing */
  register("hash-ring", (fig) => {
    const NAMES = "ABCDEF";
    const KEYS = Array.from({ length: 24 }, (_, i) => mix32(i * 7919 + 13) / 4294967296);  // key positions on the ring, 0 ... 1
    let servers = [0, 1, 2], points = 1, last = null;
    const pointsOf = (list) => list.flatMap((srv) => Array.from({ length: points }, (_, v) => ({ t: mix32((srv + 1) * 1000003 + v * 7777) / 4294967296, srv, v }))).sort((x, y) => x.t - y.t);
    const ringOwner = (list) => { const ps = pointsOf(list); return KEYS.map((k) => (ps.find((q) => q.t >= k) || ps[0]).srv); };
    const modOwner = (list) => KEYS.map((k) => list[Math.floor(k * 4294967296) % list.length]);
    const ui = frame(fig, { title: "Consistent hashing", kicker: "Try it", split: true });
    ui.stage.classList.add("is-plain");
    const W = 320, H = 320, C = 160, R = 118;
    const svg = svgBox(ui.stage, W, H, "st-ring");
    const strip = h("div", { class: "st-modstrip" });
    ui.stage.appendChild(strip);
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    function change(what, f) {
      const before = { ring: ringOwner(servers), mod: modOwner(servers) };
      f();
      last = { what, before, ring: ringOwner(servers), mod: modOwner(servers) };
      draw();
    }
    button(tools, "Add a server", () => {
      if (servers.length >= 6) { ui.setCaption("At most 6 servers in this picture."); return; }
      const srv = [0, 1, 2, 3, 4, 5].find((x) => !servers.includes(x));
      change(`Server ${NAMES[srv]} joined`, () => { servers.push(srv); servers.sort((x, y) => x - y); });
    }, "is-primary");
    button(tools, "Remove a server", () => {
      if (servers.length <= 2) { ui.setCaption("Keep at least 2 servers."); return; }
      const srv = servers[Math.floor(servers.length / 2)];
      change(`Server ${NAMES[srv]} left`, () => { servers = servers.filter((x) => x !== srv); });
    });
    slider(tools, "Points per server", { min: 0, max: 3, step: 1, value: 0, format: (v) => String(2 ** v) }, (v) => { points = 2 ** v; last = null; draw(); });
    const ang = (t) => t * 2 * Math.PI;
    const at = (t, r) => [C + r * Math.sin(ang(t)), C - r * Math.cos(ang(t))];
    const arc = (t0, t1, r) => {
      const [x0, y0] = at(t0, r), [x1, y1] = at(t1, r);
      const large = (t1 - t0 + 1) % 1 > 0.5 ? 1 : 0;
      return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    };
    function draw() {
      svg.textContent = "";
      const ps = pointsOf(servers);
      // the arc before each point belongs to the point's server
      ps.forEach((q, i) => {
        const prev = ps[(i + ps.length - 1) % ps.length];
        const t0 = ps.length === 1 ? q.t + 1e-6 : prev.t;
        s("path", { d: arc(t0, q.t, R), class: `st-arc c${q.srv % 6}` }, svg);
      });
      const own = ringOwner(servers);
      const moved = last ? new Set(KEYS.map((_, i) => i).filter((i) => last.ring[i] !== last.before.ring[i])) : new Set();
      KEYS.forEach((k, i) => {
        const [x, y] = at(k, R - 16);
        s("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: moved.has(i) ? 5.5 : 3.6, class: `st-keydot c${own[i] % 6}${moved.has(i) ? " is-moved" : ""}` }, svg);
      });
      for (const q of ps) {
        const [x, y] = at(q.t, R);
        s("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 8, class: `st-point c${q.srv % 6}` }, svg);
        const [lx, ly] = at(q.t, R + 17);
        label(svg, lx, ly, points > 1 ? `${NAMES[q.srv]}${q.v + 1}` : NAMES[q.srv], `st-point-lbl c${q.srv % 6}`);
      }
      label(svg, C, C - 6, "keys go clockwise", "st-tick");
      label(svg, C, C + 10, "to the next point", "st-tick");
      // the same keys with hash % n
      const mod = modOwner(servers);
      const movedMod = last ? new Set(KEYS.map((_, i) => i).filter((i) => last.mod[i] !== last.before.mod[i])) : new Set();
      strip.textContent = "";
      strip.append(cells(KEYS.map((_, i) => NAMES[own[i]]), (i) => `c${own[i] % 6}${moved.has(i) ? " is-moved" : ""}`, "ring"));
      strip.append(cells(KEYS.map((_, i) => NAMES[mod[i]]), (i) => `c${mod[i] % 6}${movedMod.has(i) ? " is-moved" : ""}`, "hash % n"));
      const load = servers.map((srv) => own.filter((o) => o === srv).length);
      const mean = KEYS.length / servers.length;
      side.textContent = "";
      side.append(panel("keys per server (ring)", `mean ${mean.toFixed(1)}`, h("div", { class: "st-loads" },
        ...servers.map((srv, i) => h("div", { class: "st-load" }, h("span", { text: `server ${NAMES[srv]}` }),
          h("i", { class: `c${srv % 6}`, style: `width:${Math.min(100, (load[i] / (2 * mean)) * 100).toFixed(0)}%` }), h("b", { text: String(load[i]) }))))));
      if (last) {
        const joined = last.what.includes("joined");
        ui.setCaption(`${last.what}. On the ring, **${moved.size} of ${KEYS.length}** keys moved (the large dots), all of them ${joined ? "to the new server: they were on the arcs just before its points" : "from the server that left, to the next point on the ring"}. With hash % n, **${movedMod.size} of ${KEYS.length}** keys moved (the outlined cells), most of them between servers that did not change.`);
      } else {
        const max = Math.max(...load);
        ui.setCaption(`Each server has ${points} point${points > 1 ? "s" : ""} on the ring, and a key belongs to the server of the first point at or after it, clockwise: the colour of its arc. The busiest server has ${max} keys, ${(max / mean).toFixed(2)} times the mean. More points per server (virtual nodes) make the arcs, and the loads, more equal. Add or remove a server to see which keys move.`);
      }
    }
    draw();
  });

  /* ------------------------------------------------- cuckoo hashing */
  register("cuckoo", (fig) => {
    // 16 slots as 16 buckets of 1, 8 buckets of 2 or 4 buckets of 4. Every key
    // has two buckets, from two parts of its hash.
    const KEYS = "ABCDEFGHIJKLMNOP".split("");
    const MAX_KICKS = 20;
    let per = 2;
    function make() {
      const B = 16 / per;
      const two = (k) => { const x = mix32(k.charCodeAt(0) * 2654435761 + 12345); let b2 = (x >>> 16) % B; const b1 = x % B; if (b2 === b1) b2 = (b1 + 1) % B; return [b1, b2]; };
      const table = Array.from({ length: B }, () => []);
      const rng = mulberry32(7);
      const frames = [];
      const info = KEYS.map((k) => [k, ...two(k)]);
      const snap = (o) => frames.push({ table: table.map((b) => b.slice()), B, info, ...o });
      snap({ cap: `${B} bucket${B > 1 ? "s" : ""} of ${per} slot${per > 1 ? "s" : ""}: 16 slots. Every key has two buckets (the two numbers after it in the list), and it must be in one of them.`, done: 0 });
      let done = 0, failed = null;
      for (const k of KEYS) {
        const [b1, b2] = two(k);
        if (table[b1].length < per || table[b2].length < per) {
          const b = table[b1].length < per ? b1 : b2;
          table[b].push(k);
          done++;
          snap({ cur: k, cand: [b1, b2], put: b, cap: `Insert **${k}**: its buckets are ${b1} and ${b2}. Bucket ${b} has a free slot, so ${k} goes there.`, done });
          continue;
        }
        snap({ cur: k, cand: [b1, b2], cap: `Insert **${k}**: its buckets ${b1} and ${b2} are both full. Kick a key out of bucket ${b1}.`, done });
        let hand = k, b = b1, kicks = 0, ok = false;
        const path = [];
        while (kicks < MAX_KICKS) {
          const j = Math.floor(rng() * per);
          const out = table[b][j];
          table[b][j] = hand;
          kicks++;
          const [o1, o2] = two(out);
          const next = o1 === b ? o2 : o1;
          path.push(b);
          if (table[next].length < per) {
            table[next].push(out);
            ok = true;
            snap({ cur: hand, cand: [b, next], kick: out, put: next, path: path.slice(), cap: `${hand} takes the place of **${out}** in bucket ${b}. The other bucket of ${out} is ${next}, and it has room: ${out} moves there. ${kicks} kick${kicks > 1 ? "s" : ""} in all.`, done: done + 1 });
            break;
          }
          snap({ cur: hand, cand: [b, next], kick: out, inHand: [out, next], path: path.slice(), cap: `${hand} takes the place of **${out}** in bucket ${b}. The other bucket of ${out} is ${next}, but it is full too, so ${out} kicks a key out there.`, done });
          hand = out;
          b = next;
        }
        if (!ok) {
          failed = { key: hand, at: done };
          snap({ cur: hand, cap: `After ${MAX_KICKS} kicks there is still a key without a slot (${hand}): the keys go round in a circle. Here the table must grow, or get a new hash function, and all keys are inserted again. It held **${done} of 16** keys, ${Math.round((100 * done) / 16)} %.`, done, fail: true });
          break;
        }
        done++;
      }
      if (!failed) snap({ cap: `All 16 keys fit: the table is 100 % full.`, done });
      // a lookup reads two buckets and nothing else
      const any = frames[frames.length - 1].table.flat()[0];
      if (any) {
        const [l1, l2] = two(any);
        snap({ cur: any, cand: [l1, l2], look: true, cap: `Look up **${any}**: read bucket ${l1} and bucket ${l2}, compare at most ${2 * per} keys, done. No other place can hold ${any}: a lookup never reads more than two buckets, and both addresses are known before the first load.`, done });
      }
      return frames;
    }
    const ui = frame(fig, { title: "Cuckoo hashing", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-cuckoo" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    toggle(tools, "Slots per bucket", [[1, "1"], [2, "2"], [4, "4"]], per, (v) => { per = v; player.setFrames(make()); });
    const player = new Player(fig, {
      frames: make(), interval: 1500,
      apply: (f) => {
        box.textContent = "";
        const placed = new Set(f.table.flat());
        box.append(cells(f.info.map(([k, a, b]) => `${k}: ${a}, ${b}`), (i) => (f.info[i][0] === f.cur ? "is-cur" : placed.has(f.info[i][0]) ? "" : "is-dim"), "key: buckets"));
        const cand = new Set(f.cand || []);
        box.append(h("div", { class: "st-buckets" }, ...f.table.map((b, i) => h("div", { class: `st-bucket${cand.has(i) ? (f.look ? " is-look" : " is-cand") : ""}${f.put === i ? " is-put" : ""}` },
          h("span", { class: "st-bucket-name", text: String(i) }),
          ...Array.from({ length: per }, (_, j) => h("span", { class: `st-cslot${b[j] == null ? " is-empty" : b[j] === f.cur ? " is-cur" : b[j] === f.kick ? " is-kick" : ""}`, text: b[j] || "" }))))));
        box.append(h("div", { class: "st-kv" }, h("span", { text: "in hand" }), h("b", { text: f.inHand ? `${f.inHand[0]} → bucket ${f.inHand[1]}` : "–" }),
          h("span", { text: "keys in the table" }), h("b", { text: `${f.done} of 16` }), h("span", { text: "full" }), h("b", { text: `${Math.round((100 * f.done) / 16)} %` })));
        ui.setCaption(f.cap);
      },
    });
  });
})();
