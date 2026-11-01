/* Figures for Part IV, Storage Engines. Chapter 25: the memory hierarchy,
   search layouts (sorted, Eytzinger, a static B+ tree), prefetching, thread
   scaling and first touch. Chapter 26: a B+ tree that grows and shrinks, the
   fill of its pages, SIMD node search, differential fuzzing and bulk loading.
   The small examples run the algorithms of the chapters' C++ code; the charts
   show the measurements quoted in the text.
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
    let at = 5;
    let huge = false;
    const ui = frame(fig, { title: "How long one load waits", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 290, M = { l: 54, r: 18, t: 16, b: 42 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    slider(tools, "Data", { min: 0, max: DATA.length - 1, step: 1, value: at, format: (i) => size(DATA[i][0]) }, (i) => { at = i; draw(); });
    toggle(tools, "Pages", [[false, "4 KB"], [true, "2 MB"]], huge, (v) => { huge = v; draw(); });
    function size(kb) { return kb >= 1048576 ? `${kb / 1048576} GB` : kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`; }
    const X = (kb) => M.l + (Math.log2(kb) - 4) / (20 - 4) * (W - M.l - M.r);
    const Y = (ns) => H - M.b - (Math.log10(ns) - 0) / (Math.log10(400) - 0) * (H - M.t - M.b);
    function draw() {
      svg.textContent = "";
      // the levels of the hierarchy on our machine
      const bands = [[16, 48, "L1"], [48, 2048, "L2"], [2048, 1048576 * 1.3, "L3 and memory"]];
      bands.forEach(([a, b, name], i) => {
        rect(svg, X(Math.max(a, 16)), M.t, X(Math.min(b, 1048576)) - X(Math.max(a, 16)), H - M.t - M.b, `st-band b${i}`, 0);
        label(svg, (X(Math.max(a, 16)) + X(Math.min(b, 1048576))) / 2, M.t + 12, name, "st-band-lbl");
      });
      for (const ns of [1, 3, 10, 30, 100, 300]) {
        seg(svg, M.l, Y(ns), W - M.r, Y(ns), "st-grid");
        label(svg, M.l - 8, Y(ns), String(ns), "st-tick", "end");
      }
      for (const kb of [16, 256, 4096, 65536, 1048576]) label(svg, X(kb), H - M.b + 16, size(kb), "st-tick");
      label(svg, (M.l + W - M.r) / 2, H - 6, "size of the data that is read at random", "st-axis");
      const yl = label(svg, 14, (M.t + H - M.b) / 2, "ns per load", "st-axis");
      yl.setAttribute("transform", `rotate(-90 14 ${(M.t + H - M.b) / 2})`);
      for (const [col, cls] of [[1, "c5"], [2, "c0"]]) {
        if (col === 2 && !huge) continue;
        s("path", { d: DATA.map((d, i) => `${i ? "L" : "M"}${X(d[0]).toFixed(1)} ${Y(d[col]).toFixed(1)}`).join(""), class: `st-curve ${cls}` }, svg);
        DATA.forEach((d, i) => s("circle", { cx: X(d[0]), cy: Y(d[col]), r: i === at ? 6 : 3.5, class: `st-dot ${cls}${i === at ? " is-on" : ""}` }, svg));
      }
      const d = DATA[at];
      const ns = huge ? d[2] : d[1];
      const where = d[0] <= 48 ? "the L1 cache" : d[0] <= 2048 ? "the L2 cache" : d[0] <= 4096 ? "the L3 cache" : "the L3 cache and memory";
      ui.setCaption(`Data of **${size(d[0])}**, read in a random order where every load needs the one before: **${ns} ns** per load${huge ? " with 2 MB pages" : ""}, about ${Math.round(ns * 3)} clock cycles. It comes from ${where}. ${d[0] >= 16384 ? `Here the TLB misses too: with 2 MB pages this would take ${d[2]} ns instead of ${d[1]}.` : "Small data stay close to the core."}`);
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
    // The pages of the C++ tree: 64 keys, at least 32. The picture runs the
    // same rules on 20,000 keys; the captions give the C++ numbers for 1,000,000.
    const CAP = 64, N = 20000;
    const TEXT = {
      random: "**Keys in random order.** A full page splits into pages of 33 and 32 keys, and both fill up slowly until they split again. On average a page is about 70 % full (the theory says ln 2 = 69 %). Our C++ tree with 1,000,000 random keys: **70 %**, 24.9 bytes per key.",
      up: "**Keys in increasing order** (ids, times). Every new key goes to the last leaf. When it splits, the left page keeps 33 keys and never gets another one, so every page stays about half full: **52 %** in our C++ tree, 33.8 bytes per key. Databases split the last page unevenly in this case: PostgreSQL leaves 90 % on the left.",
      bulk: "**All keys at once** (the bulk load of bplus.cpp). Every leaf gets 64 keys; only the last two may share. **100 %**, 17.2 bytes per key in our C++ tree: the fewest pages and the lowest tree. It took about 10 ms for 1,000,000 keys, where inserts one by one took 60 ms (increasing keys) to 350 ms (random keys).",
      erased: "**A full tree after erasing a random half of its keys.** Pages get emptier until one falls below 32 keys; then it borrows a key or merges. **59 %** in our C++ tree, 29.0 bytes per key. The tree stays larger than a new one would be, so databases rebuild such an index from time to time (REINDEX in PostgreSQL).",
    };
    let mode = "random";
    const cache = {};
    function leavesOf(m) {
      if (cache[m]) return cache[m];
      const rng = mulberry32(69);
      const keys = Array.from({ length: N }, (_, i) => i * 7);
      let t;
      if (m === "bulk" || m === "erased") {
        t = bulkTree(CAP, keys);
        if (m === "erased") for (const k of shuffle(keys.slice(), rng).slice(0, N / 2)) t.erase(k);
      } else {
        t = new MiniTree(CAP);
        for (const k of m === "random" ? shuffle(keys.slice(), rng) : keys) t.insert(k);
      }
      const lv = t.levels();
      cache[m] = { fills: lv[lv.length - 1].map((n) => n.keys.length), height: t.height, size: t.size };
      return cache[m];
    }
    const ui = frame(fig, { title: "How full are the pages?", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 230, M = { l: 34, r: 12, t: 16, b: 30 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    toggle(tools, "Keys come", [["random", "in random order"], ["up", "in increasing order"], ["bulk", "all at once"], ["erased", "all at once, then half erased"]], mode, (m) => { mode = m; draw(); });
    function draw() {
      const { fills, height, size } = leavesOf(mode);
      svg.textContent = "";
      const X = (i) => M.l + i / fills.length * (W - M.l - M.r);
      const Y = (v) => H - M.b - v / CAP * (H - M.t - M.b);
      for (const [v, name] of [[0, "0"], [32, "32"], [64, "64"]]) {
        seg(svg, M.l, Y(v), W - M.r, Y(v), v === 32 ? "st-grid is-min" : "st-grid");
        label(svg, M.l - 6, Y(v), name, "st-tick", "end");
      }
      let d = `M${X(0).toFixed(1)} ${Y(0).toFixed(1)}`;
      fills.forEach((f, i) => { d += `V${Y(f).toFixed(1)}H${X(i + 1).toFixed(1)}`; });
      s("path", { d: `${d}V${Y(0).toFixed(1)}Z`, class: "st-area c5" }, svg);
      const avg = fills.reduce((a, b) => a + b, 0) / fills.length;
      seg(svg, M.l, Y(avg), W - M.r, Y(avg), "st-avg");
      label(svg, W - M.r - 4, Y(avg) - 9, `average ${Math.round(avg / CAP * 100)} % full`, "st-tick st-avg-lbl", "end");
      label(svg, (M.l + W - M.r) / 2, H - 8, `the ${fills.length} leaves, from the smallest keys to the largest`, "st-axis");
      const yl = label(svg, 12, (M.t + H - M.b) / 2, "keys in the leaf", "st-axis");
      yl.setAttribute("transform", `rotate(-90 12 ${(M.t + H - M.b) / 2})`);
      ui.setCaption(`${TEXT[mode]} The picture: ${size.toLocaleString("en-US")} keys in ${fills.length} leaves, ${height} levels.`);
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
})();
