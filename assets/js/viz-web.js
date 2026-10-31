/* Figures for chapters 21–22: text search (the inverted index, intersections
   with galloping and SIMD, BM25, MaxScore, varints and Roaring bitmaps) and
   PageRank (the random surfer, power iteration, push and pull, forward push
   and the order of the nodes). The small examples run the algorithms of the
   chapters' C++ code, so the numbers in the captions are those of the code.
   Part III pages load this file through the `viz` list in _config.yml. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, frame, h, s, reduced } = V;

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
  // A group of buttons where exactly one is pressed.
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
  // A labelled slider with its value shown next to it.
  function slider(tools, label, { min, max, step, value, format }, onInput) {
    const out = h("span", { class: "viz-label wb-val" });
    const input = h("input", { type: "range", class: "viz-range wb-slider", min, max, step, value, "aria-label": label });
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
  const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const box = (title, ...children) => h("div", { class: "wb-box" }, h("div", { class: "wb-box-head", text: title }), ...children);
  const cells = (values, cls = () => "", label = null) =>
    h("div", { class: "wb-cells" }, label ? h("span", { class: "wb-rowname", text: label }) : null,
      ...values.map((v, i) => h("span", { class: `wb-cell ${cls(i, v) || ""}`, text: v == null ? "" : String(v) })));

  /* =================================================== chapter 21: text */

  /* ------------------------------------------------- the inverted index */
  register("inverted-index", (fig) => {
    const DOCS = ["Red shoes and red socks.", "Running shoes!", "Red running shoes"];
    const toks = DOCS.map((d) => [...d.matchAll(/[A-Za-z0-9]+/g)].map((m) => ({ text: m[0], start: m.index })));
    const frames = [];
    const terms = [];
    const id = new Map();
    const posts = [];  // {t, d, f} in document order
    const last = [];   // last[t]: the latest posting of term t
    const snap = (o) => frames.push({ terms: terms.slice(), posts: posts.map((p) => ({ ...p })), ...o });
    snap({ phase: "start", cap: "Three documents. We read them token by token: a token is a run of letters and digits, in lower case." });
    toks.forEach((list, d) => list.forEach((tk, i) => {
      const w = tk.text.toLowerCase();
      let t = id.get(w);
      const isNew = t === undefined;
      if (isNew) { t = terms.length; id.set(w, t); terms.push(w); last.push(-1); }
      let p = last[t];
      let added = false;
      if (p >= 0 && posts[p].d === d) posts[p].f++;
      else { p = posts.length; last[t] = p; posts.push({ t, d, f: 1 }); added = true; }
      const cap = isNew ? `“${w}” is a new term: the dictionary gives it the next id, **${t}**. Its first posting: document ${d}, count 1.`
        : added ? `“${w}” is term ${t}. It is new in document ${d}, so it gets a new posting.`
          : `“${w}” occurs again in document ${d}: the count of its latest posting grows to **${posts[p].f}**.`;
      snap({ phase: "token", d, i, t, p, cap });
    }));
    const T = terms.length;
    const count = new Array(T).fill(0);
    posts.forEach((p) => count[p.t]++);
    const offset = [0];
    for (let t = 0; t < T; t++) offset.push(offset[t] + count[t]);
    snap({ phase: "count", count, cap: `${posts.length} postings in document order. Now a counting sort by term, as for the arcs of a graph in week 18: first count the postings of every term.` });
    snap({ phase: "count", count, offset, cap: "A prefix sum of the counts gives **offset**: the postings of term t go to the positions offset[t], …, offset[t + 1] − 1." });
    const docs = new Array(posts.length).fill(null);
    const freqs = new Array(posts.length).fill(null);
    const next = offset.slice(0, T);
    posts.forEach((p, k) => {
      const at = next[p.t]++;
      docs[at] = p.d;
      freqs[at] = p.f;
      snap({ phase: "place", count, offset, docs: docs.slice(), freqs: freqs.slice(), at, k, cap: `Posting ${k} (term ${p.t}, document ${p.d}) goes to position **${at}**, the next free place of term ${p.t}.` });
    });
    const shoes = id.get("shoes");
    snap({ phase: "done", count, offset, docs, freqs, term: shoes,
      cap: `Done. The postings of “shoes” (term ${shoes}) are at positions ${offset[shoes]}–${offset[shoes + 1] - 1}: documents ${andList(docs.slice(offset[shoes], offset[shoes + 1]).map(String))}. They are in increasing order without any sorting, because the counting sort is stable.` });

    const ui = frame(fig, { title: "Building an inverted index", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "wb-ix" });
    ui.stage.appendChild(wrap);
    new Player(fig, {
      frames, interval: 1400,
      apply: (f) => {
        wrap.textContent = "";
        const docBox = box("documents", ...DOCS.map((text, d) => {
          const line = h("div", { class: "wb-doc" }, h("span", { class: "wb-rowname", text: `${d}` }));
          let pos = 0;
          toks[d].forEach((tk, i) => {
            if (tk.start > pos) line.appendChild(document.createTextNode(text.slice(pos, tk.start)));
            const read = f.phase !== "start" && (f.phase !== "token" || d < f.d || (d === f.d && i <= f.i));
            const cur = f.phase === "token" && d === f.d && i === f.i;
            line.appendChild(h("span", { class: `wb-tok${read ? " is-done" : ""}${cur ? " is-cur" : ""}`, text: tk.text }));
            pos = tk.start + tk.text.length;
          });
          if (pos < text.length) line.appendChild(document.createTextNode(text.slice(pos)));
          return line;
        }));
        const dict = h("table", { class: "wb-dict" }, h("tr", {}, h("th", { text: "term" }), h("th", { text: "id" })),
          ...f.terms.map((w, t) => h("tr", { class: (f.phase === "token" && f.t === t) || (f.phase === "done" && f.term === t) ? "is-hl" : "" }, h("td", { text: w }), h("td", { text: String(t) }))));
        const chips = h("div", { class: "wb-chips" }, ...f.posts.map((p, k) => h("span", {
          class: `wb-chip${(f.phase === "token" && f.p === k) || (f.phase === "place" && f.k === k) ? " is-cur" : ""}${f.phase === "place" && k < f.k ? " is-done" : ""}`,
        }, h("b", { text: f.terms[p.t] }), ` d${p.d} ×${p.f}`)));
        if (!f.posts.length) chips.appendChild(h("span", { class: "wb-empty", text: "(none yet)" }));
        wrap.append(docBox, box("dictionary", dict), box("postings in document order", chips));
        if (f.count) {
          const arr = h("div", { class: "wb-arrays" });
          arr.appendChild(cells(f.count, (i) => (f.phase === "done" && f.term === i ? "is-hl" : ""), "count"));
          if (f.offset) arr.appendChild(cells(f.offset, (i) => (f.phase === "done" && (f.term === i || f.term + 1 === i) ? "is-hl" : ""), "offset"));
          if (f.docs) {
            const inTerm = (i) => f.phase === "done" && i >= f.offset[f.term] && i < f.offset[f.term + 1];
            arr.appendChild(cells(f.docs, (i, v) => (v == null ? "is-empty" : i === f.at && f.phase === "place" ? "is-new" : inTerm(i) ? "is-hl" : ""), "docs"));
            arr.appendChild(cells(f.freqs, (i, v) => (v == null ? "is-empty" : i === f.at && f.phase === "place" ? "is-new" : inTerm(i) ? "is-hl" : ""), "freqs"));
          }
          wrap.appendChild(box("CSR arrays", arr));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------- merge versus galloping */
  register("intersect-gallop", (fig) => {
    const B = Array.from({ length: 60 }, (_, i) => 3 + Math.floor(i * 3.7) + (i % 3));
    const A = [B[9], B[33] + 1, B[57]];
    function mergeFrames() {
      const fr = [];
      let i = 0;
      let j = 0;
      let c = 0;
      const out = [];
      fr.push({ i, j, passed: -1, out: [], c, cap: "The merge keeps one position in each list and always moves the smaller value forward." });
      while (i < A.length && j < B.length) {
        const j0 = j;
        while (j < B.length && B[j] < A[i]) { j++; c++; }
        if (j > j0) fr.push({ i, j, from: j0, out: out.slice(), c, cap: `${A[i]} is larger than ${j - j0} value${j - j0 > 1 ? "s" : ""} of b: one comparison each. **${c}** comparisons so far.` });
        if (j === B.length) break;
        c++;
        if (B[j] === A[i]) {
          out.push(A[i]);
          fr.push({ i, j, hit: j, out: out.slice(), c, cap: `${A[i]} is in both lists: output it and move both. **${c}** comparisons.` });
          i++;
          j++;
        } else {
          fr.push({ i, j, miss: true, out: out.slice(), c, cap: `${A[i]} is not in b (the next value is ${B[j]}): move on in a. **${c}** comparisons.` });
          i++;
        }
      }
      fr.push({ i: -1, j: -1, out: out.slice(), c, done: true, cap: `Done: {${out.join(", ")}} with **${c}** comparisons. The merge walked through almost all of the long list.` });
      return fr;
    }
    function gallopFrames(mergeCount) {
      const fr = [];
      let lo = 0;
      let c = 0;
      const out = [];
      fr.push({ i: 0, j: -1, out: [], c, cap: "Galloping searches each value of the short list a in the long list b, starting where the previous search ended." });
      for (let i = 0; i < A.length; i++) {
        const x = A[i];
        const probes = [];
        let hi = lo;
        let step = 1;
        const start = lo;
        while (hi < B.length && B[hi] < x) { probes.push(hi); c++; lo = hi + 1; hi += step; step *= 2; }
        if (hi < B.length) { probes.push(hi); c++; }
        fr.push({ i, j: -1, probes: probes.slice(), out: out.slice(), c, cap: `Search ${x} from position ${start}: jump 1, 2, 4, … positions until a value is at least ${x}${probes.length > 1 ? ` (positions ${andList(probes.map(String))})` : ""}. **${c}** comparisons so far.` });
        let a = lo;
        let b = Math.min(hi, B.length);
        const range = [a, b];
        while (a < b) { const m = (a + b) >> 1; c++; if (B[m] < x) a = m + 1; else b = m; }
        lo = a;
        const found = lo < B.length && B[lo] === x;
        if (found) out.push(x);
        fr.push({ i, j: lo, range, hit: found ? lo : -1, out: out.slice(), c, cap: `A binary search between positions ${range[0]} and ${range[1] - 1} finds ${found ? `**${x}** at position ${lo}: output it` : `that ${x} is not in b`}. **${c}** comparisons.` });
      }
      fr.push({ i: -1, j: -1, out: out.slice(), c, done: true, cap: `Done: {${out.join(", ")}} with **${c}** comparisons instead of the merge's ${mergeCount}. For a long list b of n values and a short list of m values, galloping takes O(m log(n/m)) comparisons.` });
      return fr;
    }
    const merged = mergeFrames();
    const sets = { merge: merged, gallop: gallopFrames(merged[merged.length - 1].c) };
    let tab = "merge";
    const ui = frame(fig, { title: "Intersecting a short list with a long one", kicker: "Animation", tabs: [["merge", "Merge"], ["gallop", "Galloping"]], tab, onTab: (k) => { tab = k; player.setFrames(sets[k]); } });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "wb-lists" });
    ui.stage.appendChild(wrap);
    const player = new Player(fig, {
      frames: sets[tab], interval: 1500,
      apply: (f) => {
        wrap.textContent = "";
        wrap.appendChild(cells(A, (i) => (i === f.i ? "is-ptr" : f.out.includes(A[i]) ? "is-hit" : i < f.i || f.done ? "is-dim" : ""), "a"));
        wrap.appendChild(cells(B, (j) => {
          if (f.hit === j) return "is-hit";
          if (f.probes && f.probes.includes(j)) return "is-probe";
          if (f.range && j >= f.range[0] && j < f.range[1]) return "is-range";
          if (f.from != null && j >= f.from && j < f.j) return "is-probe";
          if (j === f.j) return "is-ptr";
          if (f.out.includes(B[j])) return "is-hit";
          return "";
        }, "b"));
        wrap.appendChild(h("div", { class: "wb-count" }, h("b", { text: String(f.c) }), " comparisons"));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- SIMD intersection lanes */
  register("simd-intersect", (fig) => {
    const A = [3, 7, 12, 18, 21, 27, 30, 34];
    const B = [5, 7, 13, 18, 24, 27, 29, 34];
    const rot = (v, r) => v.map((_, i) => v[(i + r) % 8]);
    const eqs = [];
    for (let r = 0; r < 8; r++) eqs.push(A.map((x, i) => x === rot(B, r)[i]));
    const any = A.map((_, i) => eqs.some((e) => e[i]));
    const mask = any.reduce((m, b, i) => m | ((b ? 1 : 0) << i), 0);
    const lanes = [];
    for (let i = 0; i < 8; i++) if (mask >> i & 1) lanes.push(i);
    const pack = lanes.concat(new Array(8 - lanes.length).fill(0));
    const packed = pack.map((i) => A[i]);
    const steps = [{ show: 0, cap: "Two blocks of 8 values, one from each list, are loaded into two AVX2 registers with `_mm256_loadu_si256`." }];
    for (let r = 0; r < 8; r++) {
      const hits = A.filter((x, i) => eqs[r][i]);
      steps.push({ show: r + 1, cap: r === 0 ? `\`_mm256_cmpeq_epi32\` compares the lanes pairwise: ${hits.length ? `${andList(hits.map(String))} match` : "no lane matches"}.` : `Rotate b by one lane (\`_mm256_permutevar8x32_epi32\`) and compare again${hits.length ? `: ${andList(hits.map(String))} match` : ": no match"}. The results are combined with OR.` });
    }
    steps.push({ show: 9, mask: true, cap: `After 8 comparisons, every pair of the 64 has been compared. \`_mm256_movemask_ps\` takes the top bit of every lane: the mask **${mask.toString(2).padStart(8, "0")}** (binary, lane 7 first) = ${mask}.` });
    steps.push({ show: 10, mask: true, pack: true, cap: `Entry ${mask} of a table of 256 shuffles lists the matching lanes: ${andList(lanes.map(String))}. One permute packs their values to the front, and one store writes all 8 lanes; the output moves by popcount(${mask}) = **${lanes.length}**.` });
    steps.push({ show: 10, mask: true, pack: true, advance: true, cap: `The blocks end with ${A[7]} and ${B[7]}. ${A[7] === B[7] ? "Both are done, so both lists move 8 values forward." : "The block with the smaller last value is done and moves 8 values forward."} The lanes after the ${lanes.length} results hold garbage, which the next store overwrites.` });
    const ui = frame(fig, { title: "8 values against 8 with AVX2", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const grid = h("div", { class: "ln-grid wb-lanes" });
    ui.stage.appendChild(grid);
    const row = (name, vals, cls, note = "") => h("div", { class: `ln-row ${cls.row || ""}` }, h("span", { class: "ln-name", text: name }),
      ...vals.map((v, i) => h("span", { class: `ln-cell ${cls.cell ? cls.cell(i) : ""}`, text: String(v) })), h("span", { class: "ln-note", text: note }));
    new Player(fig, {
      frames: steps, interval: 1500,
      apply: (f) => {
        grid.textContent = "";
        grid.appendChild(row("lane", [0, 1, 2, 3, 4, 5, 6, 7], { row: "is-head" }));
        grid.appendChild(row("a", A, { row: "is-const", cell: (i) => (f.show >= 9 && any[i] ? "wb-match" : "") }, "8 values of the first list"));
        if (f.show === 0) grid.appendChild(row("b", B, { row: "is-const" }, "8 values of the second list"));
        for (let r = 0; r < Math.min(f.show, 8); r++) {
          grid.appendChild(row(r === 0 ? "b" : `rot ${r}`, rot(B, r), { row: r === f.show - 1 && f.show <= 8 ? "is-hl" : "", cell: (i) => (eqs[r][i] ? "wb-match" : "wb-faint") }, r === 0 ? "compare lane by lane" : ""));
        }
        if (f.mask) grid.appendChild(row("mask", any.map((b) => (b ? 1 : 0)), { row: f.show === 9 ? "is-hl" : "", cell: (i) => (any[i] ? "wb-match" : "") }, `= ${mask}`));
        if (f.pack) {
          grid.appendChild(row("table", pack, { cell: (i) => (i < lanes.length ? "" : "is-dup") }, "lanes to take"));
          grid.appendChild(row("stored", packed, { row: f.advance ? "" : "is-hl", cell: (i) => (i < lanes.length ? "wb-match" : "is-dup") }, `${lanes.length} results`));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------------------- BM25 curve */
  register("bm25-curve", (fig) => {
    let k1 = 1.2;
    let b = 0.75;
    const W = 520;
    const H = 250;
    const M = { l: 44, r: 92, t: 14, b: 34 };
    const fMax = 12;
    const yMax = 4;
    const ui = frame(fig, { title: "The term factor of BM25", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "wb-chart", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const X = (f) => M.l + (f / fMax) * (W - M.l - M.r);
    const Y = (y) => H - M.b - (y / yMax) * (H - M.t - M.b);
    const docs = [[0.5, "short (half)", "c5"], [1, "average", "c2"], [2, "long (double)", "c0"]];
    const tools = toolbar(ui);
    slider(tools, "k₁", { min: 0.2, max: 3, step: 0.1, value: k1, format: (v) => v.toFixed(1) }, (v) => { k1 = v; draw(); });
    slider(tools, "b", { min: 0, max: 1, step: 0.05, value: b, format: (v) => v.toFixed(2) }, (v) => { b = v; draw(); });
    const factor = (f, len) => (f * (k1 + 1)) / (f + k1 * (1 - b + b * len));
    function draw() {
      svg.textContent = "";
      for (let y = 0; y <= yMax; y++) {
        s("line", { x1: M.l, x2: W - M.r, y1: Y(y), y2: Y(y), class: "wb-gridline" }, svg);
        s("text", { x: M.l - 8, y: Y(y), class: "wb-tick", "text-anchor": "end" }, svg).textContent = String(y);
      }
      for (let f = 0; f <= fMax; f += 2) s("text", { x: X(f), y: H - M.b + 16, class: "wb-tick", "text-anchor": "middle" }, svg).textContent = String(f);
      s("text", { x: (M.l + W - M.r) / 2, y: H - 4, class: "wb-axis", "text-anchor": "middle" }, svg).textContent = "f: how many times the word occurs in the document";
      const lim = k1 + 1;
      if (lim <= yMax) {
        s("line", { x1: M.l, x2: W - M.r, y1: Y(lim), y2: Y(lim), class: "wb-limit" }, svg);
        s("text", { x: M.l + 6, y: Y(lim) - 9, class: "wb-tick wb-limit-label" }, svg).textContent = `limit k₁ + 1 = ${lim.toFixed(1)}`;
      }
      // Labels at the right end of the curves, at least 13 px apart.
      const ys = docs.map(([len]) => Y(factor(fMax, len)));
      for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + 13);
      docs.forEach(([len, name, c], k) => {
        let d = "";
        for (let i = 0; i <= 120; i++) {
          const f = (i / 120) * fMax;
          d += `${i ? "L" : "M"}${X(f).toFixed(1)} ${Y(factor(f, len)).toFixed(1)}`;
        }
        s("path", { d, class: `wb-curve ${c}` }, svg);
        for (let f = 1; f <= fMax; f++) s("circle", { cx: X(f), cy: Y(factor(f, len)), r: 2.6, class: `wb-dot ${c}` }, svg);
        s("text", { x: W - M.r + 6, y: ys[k], class: `wb-tick wb-curve-label ${c}` }, svg).textContent = name;
      });
      const avg = (f) => factor(f, 1).toFixed(2);
      ui.setCaption(`For a document of average length: f = 1 gives **${avg(1)}**, f = 2 gives ${avg(2)} and f = 5 gives ${avg(5)}; no f reaches k₁ + 1 = ${(k1 + 1).toFixed(1)}. ${b === 0 ? "With b = 0 the length of the document does not matter." : `A document twice as long gets ${factor(1, 2).toFixed(2)} for f = 1.`} The score of a term is this factor times its idf.`);
    }
    draw();
  });

  /* ----------------------------------------------------------- MaxScore */
  register("maxscore", (fig) => {
    // Three terms, sorted by their largest impact; k = 2. The same algorithm as task 4.
    const TERMS = [
      { name: "ba", post: [[0, 2], [1, 3], [2, 1], [3, 2], [4, 3], [5, 1], [6, 2], [7, 1], [8, 3], [9, 2], [10, 1], [11, 2]] },
      { name: "kuto", post: [[1, 5], [4, 6], [7, 4], [10, 6]] },
      { name: "rimi", post: [[4, 9], [9, 8]] },
    ];
    const K = 2;
    const N = 12;
    const max = TERMS.map((t) => Math.max(...t.post.map((p) => p[1])));
    const bound = [0];
    max.forEach((m, i) => bound.push(bound[i] + m));
    const cur = TERMS.map(() => 0);
    const read = TERMS.map(() => new Set());
    const searched = TERMS.map(() => new Set());
    let heap = [];
    let theta = 0;
    let first = 0;
    const frames = [];
    const snap = (o) => frames.push({ cur: cur.slice(), read: read.map((x) => new Set(x)), searched: searched.map((x) => new Set(x)), heap: heap.slice(), theta, first, ...o });
    snap({ cap: `Query “ba kuto rimi”, top k = ${K}. The terms are sorted by their largest impact: ${andList(TERMS.map((t, i) => `${t.name} ${max[i]}`))}. At first all of them are essential.` });
    const better = (x, y) => x.s > y.s || (x.s === y.s && x.d < y.d);
    for (;;) {
      let d = Infinity;
      for (let i = first; i < TERMS.length; i++) if (cur[i] < TERMS[i].post.length) d = Math.min(d, TERMS[i].post[cur[i]][0]);
      if (d === Infinity) break;
      let score = 0;
      const parts = [];
      for (let i = first; i < TERMS.length; i++) {
        const p = TERMS[i].post[cur[i]];
        if (cur[i] < TERMS[i].post.length && p[0] === d) { score += p[1]; parts.push(`${TERMS[i].name} ${p[1]}`); read[i].add(cur[i]); cur[i]++; }
      }
      let pruned = null;
      for (let i = first - 1; i >= 0; i--) {
        if (score + bound[i + 1] <= theta) { pruned = i; break; }
        while (cur[i] < TERMS[i].post.length && TERMS[i].post[cur[i]][0] < d) cur[i]++;
        if (cur[i] < TERMS[i].post.length && TERMS[i].post[cur[i]][0] === d) { score += TERMS[i].post[cur[i]][1]; parts.push(`${TERMS[i].name} ${TERMS[i].post[cur[i]][1]} (searched)`); searched[i].add(cur[i]); }
      }
      const entered = heap.length < K || score > theta;
      let change = "";
      if (entered) {
        if (heap.length === K) heap.pop();
        heap.push({ d, s: score });
        heap.sort((x, y) => (better(x, y) ? -1 : 1));
        if (heap.length === K) {
          const old = first;
          theta = heap[K - 1].s;
          while (first < TERMS.length && bound[first + 1] <= theta) first++;
          if (first > old) change = ` Now θ = ${theta}, and the largest impacts of ${andList(TERMS.slice(0, first).map((t) => t.name))} add up to only ${bound[first]} ≤ θ: ${first > 1 ? "they are" : "it is"} **non-essential**.`;
          else change = ` θ = ${theta}.`;
        }
      }
      const prunedText = pruned != null ? ` With the non-essential terms it could reach at most ${score} + ${bound[pruned + 1]} = ${score + bound[pruned + 1]} ≤ θ = ${theta}: stop, it cannot get in.` : "";
      snap({ d, cap: `Candidate: document **${d}**, score ${parts.join(" + ")} = ${score}.${prunedText}${entered ? ` It goes into the heap.${change}` : pruned == null ? ` ${score} is not more than θ = ${theta}.` : ""}` });
    }
    const total = TERMS.reduce((a, t) => a + t.post.length, 0);
    const touched = read.reduce((a, x) => a + x.size, 0) + searched.reduce((a, x) => a + x.size, 0);
    snap({ done: true, cap: `The essential lists are used up. The top 2: ${heap.map((x) => `document ${x.d} (${x.s})`).join(" and ")}, the same as scoring everything. MaxScore read ${touched} of the ${total} postings; the end of the list of ba was never read.` });

    const ui = frame(fig, { title: "MaxScore with k = 2", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "wb-ms" });
    ui.stage.appendChild(wrap);
    new Player(fig, {
      frames, interval: 2200,
      apply: (f) => {
        wrap.textContent = "";
        const table = h("table", { class: "wb-mstable" });
        table.appendChild(h("tr", {}, h("th", { text: "term (max)" }), ...Array.from({ length: N }, (_, d) => h("th", { class: f.d === d ? "is-cur" : "", text: String(d) })), h("th", { text: "" })));
        TERMS.forEach((t, i) => {
          const ess = i >= f.first;
          const tr = h("tr", { class: ess ? "" : "is-non" }, h("th", { text: `${t.name} (${max[i]})` }));
          const byDoc = new Map(t.post.map((p, k) => [p[0], k]));
          for (let d = 0; d < N; d++) {
            const k = byDoc.get(d);
            let cls = "";
            if (k == null) cls = "is-none";
            else if (f.read[i].has(k)) cls = "is-read";
            else if (f.searched[i].has(k)) cls = "is-search";
            else if (f.done) cls = "is-skip";
            if (d === f.d) cls += " is-col";
            tr.appendChild(h("td", { class: cls, text: k == null ? "" : String(t.post[k][1]) }));
          }
          tr.appendChild(h("td", { class: "wb-ess", text: ess ? "essential" : "searched only" }));
          table.appendChild(tr);
        });
        const heapBox = h("div", { class: "wb-heap" }, h("b", { text: "heap (best 2)" }),
          ...(f.heap.length ? f.heap.map((x) => h("span", { class: "wb-chip", text: `doc ${x.d}: ${x.s}` })) : [h("span", { class: "wb-empty", text: "empty" })]),
          h("span", { class: "wb-theta", text: `θ = ${f.theta}` }));
        const legend = h("div", { class: "wb-legend" }, h("span", { class: "wb-key is-read", text: "read" }), h("span", { class: "wb-key is-search", text: "found by a search" }), h("span", { class: "wb-key is-skip", text: "never read" }));
        wrap.append(h("div", { class: "wb-scroll" }, table), heapBox, legend);
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------- varint, Stream VByte */
  register("varint", (fig) => {
    const IDS = [3, 130, 134, 600, 17000];
    const GAPS = IDS.map((x, i) => (i ? x - IDS[i - 1] : x));
    const varint = (x) => { const out = []; while (x >= 128) { out.push((x & 127) | 128); x >>>= 7; } out.push(x); return out; };
    const coded = GAPS.map(varint);
    const hex = (b) => b.toString(16).toUpperCase().padStart(2, "0");
    const vFrames = [{ n: 0, gaps: false, cap: `Five document ids of a posting list: ${IDS.join(", ")}. As 32-bit integers they take 20 bytes.` },
      { n: 0, gaps: true, cap: `The list is increasing, so store the first id and then the gaps: ${GAPS.join(", ")}. The gaps are small numbers.` }];
    coded.forEach((bytes, i) => vFrames.push({ n: i + 1, gaps: true, cap: `${GAPS[i]} takes ${bytes.length} byte${bytes.length > 1 ? "s" : ""}: ${bytes.map(hex).join(" ")}. Every byte holds 7 bits of the number, lowest first; its highest bit (orange) is 1 when another byte follows.` }));
    vFrames.push({ n: coded.length, gaps: true, cap: `${coded.flat().length} bytes instead of 20. To decode, read bytes until one has its highest bit 0, then add the gap to the previous id. The branch on that bit depends on the data.` });
    // Stream VByte for the first four gaps
    const four = GAPS.slice(0, 4);
    const lens = four.map((x) => (x < 256 ? 1 : x < 65536 ? 2 : x < 16777216 ? 3 : 4));
    const control = lens.reduce((c, l, i) => c | ((l - 1) << (2 * i)), 0);
    const data = [];
    four.forEach((x, i) => { for (let k = 0; k < lens[i]; k++) data.push((x >>> (8 * k)) & 255); });
    const shuffle = [];
    let at = 0;
    four.forEach((x, i) => { for (let k = 0; k < 4; k++) shuffle.push(k < lens[i] ? at + k : -1); at += lens[i]; });
    const sFrames = [
      { st: 0, cap: `Stream VByte codes four numbers at a time: ${four.join(", ")}. It uses plain bytes (8 bits of data each) and stores the lengths separately.` },
      { st: 1, cap: `The lengths ${lens.join(", ")} (in bytes) go into one control byte, 2 bits per number: **${control.toString(2).padStart(8, "0")}** (number 0 in the lowest bits).` },
      { st: 2, cap: `The data bytes of the four numbers follow each other: ${data.map(hex).join(" ")}, ${data.length} bytes in total, with no continuation bits.` },
      { st: 3, cap: `The control byte selects one of 256 precomputed shuffle masks: for every byte of the four 32-bit lanes, which data byte to take (− means a zero). One \`pshufb\` (\`_mm_shuffle_epi8\`) moves all of them at once, with no branch.` },
      { st: 4, cap: `The four lanes now hold ${four.join(", ")}. A prefix sum inside the register turns the gaps back into the ids ${IDS.slice(0, 4).join(", ")}. We implement this in week 40.` },
    ];
    let tab = "varint";
    const ui = frame(fig, { title: "Gaps and varints", kicker: "Animation", tabs: [["varint", "Varint"], ["svb", "Stream VByte"]], tab, onTab: (k) => { tab = k; player.setFrames(k === "varint" ? vFrames : sFrames); } });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "wb-var" });
    ui.stage.appendChild(wrap);
    const byteBox = (b, cls = "") => h("span", { class: `wb-byte ${cls}` }, ...[7, 6, 5, 4, 3, 2, 1, 0].map((k) => h("i", { class: k === 7 && tab === "varint" ? (b >> 7 & 1 ? "is-more" : "is-last") : "", text: String(b >> k & 1) })), h("small", { text: hex(b) }));
    const player = new Player(fig, {
      frames: vFrames, interval: 1800,
      apply: (f) => {
        wrap.textContent = "";
        if (tab === "varint") {
          wrap.appendChild(cells(IDS, () => "", "ids"));
          if (f.gaps) wrap.appendChild(cells(GAPS, (i) => (i === f.n - 1 ? "is-ptr" : i < f.n ? "is-hit" : ""), "gaps"));
          const row = h("div", { class: "wb-bytes" }, h("span", { class: "wb-rowname", text: "bytes" }));
          coded.slice(0, f.n).forEach((bytes, i) => row.appendChild(h("span", { class: `wb-group${i === f.n - 1 ? " is-cur" : ""}` }, ...bytes.map((x) => byteBox(x)))));
          if (!f.n) row.appendChild(h("span", { class: "wb-empty", text: "(none yet)" }));
          wrap.appendChild(row);
        } else {
          wrap.appendChild(cells(four, () => "", "numbers"));
          if (f.st >= 1) wrap.appendChild(h("div", { class: "wb-bytes" }, h("span", { class: "wb-rowname", text: "control" }), byteBox(control, "is-control"), h("span", { class: "wb-note", text: `lengths ${lens.join(", ")}` })));
          if (f.st >= 2) wrap.appendChild(h("div", { class: "wb-bytes" }, h("span", { class: "wb-rowname", text: "data" }), ...data.map((x) => byteBox(x))));
          if (f.st >= 3) wrap.appendChild(cells(shuffle.map((x) => (x < 0 ? "−" : x)), (i) => (shuffle[i] < 0 ? "is-dim" : "is-probe"), "mask"));
          if (f.st >= 4) wrap.appendChild(cells(four, () => "is-hit", "lanes"));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------------ Roaring containers */
  register("roaring", (fig) => {
    let density = 0.03;
    let run = 1;
    const ui = frame(fig, { title: "Which container is the smallest?", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const wrap = h("div", { class: "wb-roar" });
    ui.stage.appendChild(wrap);
    const svg = s("svg", { viewBox: "0 0 256 256", class: "wb-bits", "aria-hidden": "true" });
    const sizes = h("div", { class: "wb-sizes" });
    wrap.append(h("div", { class: "wb-bitsbox" }, svg, h("div", { class: "wb-note", text: "65,536 values of one chunk; a square is 16 values" })), sizes);
    const tools = toolbar(ui);
    slider(tools, "values", { min: 0, max: 1, step: 0.005, value: Math.sqrt(density), format: (v) => `${(100 * v * v).toFixed(1)} %` }, (v) => { density = v * v; draw(); });
    slider(tools, "run length", { min: 0, max: 3.6, step: 0.05, value: 0, format: (v) => `≈ ${Math.round(10 ** v)}` }, (v) => { run = Math.round(10 ** v); draw(); });
    function values() {
      const rng = mulberry32(21);
      const U = 65536;
      const count = Math.round(density * U);
      const out = [];
      if (run <= 1) {
        let need = count;
        for (let x = 0; x < U && need > 0; x++) if (rng() * (U - x) < need) { out.push(x); need--; }
        return out;
      }
      const runs = Math.max(1, Math.ceil(count / run));
      const gap = (U - count) / runs;
      let p = 0;
      while (out.length < count) {
        const left = count - out.length;
        p = Math.min(p + Math.floor(rng() * (2 * gap + 1)), U - left);
        const len = Math.min(1 + Math.floor(rng() * 2 * run), left);
        for (let i = 0; i < len; i++) out.push(p + i);
        p += len;
      }
      return out;
    }
    function draw() {
      const v = values();
      const card = v.length;
      let runs = 0;
      for (let i = 0; i < card; i++) if (i === 0 || v[i] !== v[i - 1] + 1) runs++;
      const filled = new Array(4096).fill(0);
      for (const x of v) filled[x >> 4]++;
      svg.textContent = "";
      const paths = ["", "", "", ""];
      filled.forEach((c, i) => {
        if (!c) return;
        const level = c >= 16 ? 3 : c >= 8 ? 2 : c >= 3 ? 1 : 0;
        paths[level] += `M${(i % 64) * 4} ${Math.floor(i / 64) * 4}h4v4h-4z`;
      });
      paths.forEach((d, i) => { if (d) s("path", { d, class: `wb-fill l${i}` }, svg); });
      const arrayB = 2 * card;
      const bitmapB = 8192;
      const runB = 4 * runs;
      const best = arrayB <= bitmapB && arrayB <= runB ? "array" : bitmapB <= runB ? "bitmap" : "run";
      const kinds = [["array", arrayB, card > 4096 ? "more than 4096 values: not allowed" : `2 bytes × ${card.toLocaleString("en")} values`], ["bitmap", bitmapB, "1024 words of 64 bits, always"], ["run", runB, `4 bytes × ${runs.toLocaleString("en")} runs`]];
      const top = Math.max(arrayB, bitmapB, runB, 1);
      sizes.textContent = "";
      kinds.forEach(([name, bytes, note]) => sizes.appendChild(h("div", { class: `wb-size${name === best ? " is-best" : ""}` },
        h("div", { class: "wb-size-head" }, h("b", { text: name }), h("span", { text: `${bytes.toLocaleString("en")} bytes` })),
        h("div", { class: "wb-size-bar" }, h("i", { style: `width:${Math.max(0.5, (100 * bytes) / top).toFixed(1)}%` })),
        h("div", { class: "wb-note", text: note }))));
      ui.setCaption(`${card.toLocaleString("en")} values in ${runs.toLocaleString("en")} runs: the **${best}** container is the smallest (${Math.min(arrayB, bitmapB, runB).toLocaleString("en")} bytes). An array wins for few values, a bitmap for many scattered values, and runs when the values come in long runs.`);
    }
    draw();
  });

  /* ================================================= chapter 22: PageRank */

  // The small web of the figures: page 5 (F) is dangling, 6 and 7 (G, H) form a cycle.
  const WEB = {
    names: ["A", "B", "C", "D", "E", "F", "G", "H"],
    pos: [[80, 70], [205, 38], [210, 150], [335, 60], [340, 168], [400, 250], [70, 215], [175, 250]],
    out: [[1, 2], [2, 3], [0], [2, 4], [5, 2], [], [0, 2, 7], [6]],
  };
  const N = WEB.names.length;
  const IN = Array.from({ length: N }, () => []);
  WEB.out.forEach((list, u) => list.forEach((v) => IN[v].push(u)));
  function prStep(x, d) {
    const D = x.reduce((a, v, u) => a + (WEB.out[u].length ? 0 : v), 0);
    const y = new Array(N).fill((1 - d) / N + (d * D) / N);
    WEB.out.forEach((list, u) => list.forEach((v) => { y[v] += (d * x[u]) / list.length; }));
    return y;
  }
  function pagerank(d) {
    let x = new Array(N).fill(1 / N);
    for (let k = 0; k < 500; k++) x = prStep(x, d);
    return x;
  }
  const webScene = (parent, opts = {}) => new Scene(parent, { w: 450, h: 285, r: 19, ...opts });
  function webState(cls = () => "", label = (u) => WEB.names[u], edgeCls = () => "", sub = () => null) {
    return {
      nodes: WEB.names.map((_, u) => ({ id: u, x: WEB.pos[u][0], y: WEB.pos[u][1], label: label(u), cls: cls(u), sub: sub(u) })),
      edges: WEB.out.flatMap((list, u) => list.map((v) => ({ id: `${u}-${v}`, a: u, b: v, dir: true, cls: edgeCls(u, v), bend: WEB.out[v].includes(u) ? 0.14 : 0 }))),
    };
  }
  const pct0 = (x) => `${Math.round(100 * x)}%`;
  function bars(parent, rows) {
    parent.textContent = "";
    for (const r of rows) {
      parent.appendChild(h("div", { class: `wb-barrow${r.cls ? " " + r.cls : ""}` }, h("span", { class: "wb-rowname", text: r.name }),
        h("span", { class: "wb-bar" }, ...(r.fills || []).map((f) => h("i", { class: f.cls, style: `width:${Math.min(100, 100 * f.v).toFixed(1)}%` })),
          r.mark != null ? h("b", { class: "wb-mark", style: `left:${Math.min(100, 100 * r.mark).toFixed(1)}%` }) : null),
        h("span", { class: "wb-barval", text: r.text })));
    }
  }

  /* ------------------------------------------------------- random surfer */
  register("random-surfer", (fig) => {
    const d = 0.85;
    const exact = pagerank(d);
    const scale = 1 / Math.max(...exact) * 0.8;
    let rng = mulberry32(7);
    let at = 0;
    let steps = 0;
    let visits = new Array(N).fill(0);
    let lastEdge = null;
    let jumped = false;
    let timer = 0;
    const ui = frame(fig, { title: "The random surfer", kicker: "Try it", split: true });
    const scene = webScene(ui.stage);
    const barBox = h("div", { class: "wb-bars" });
    ui.side.appendChild(h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "time on each page" }), h("span", { text: "mark: PageRank" })), barBox));
    const tools = toolbar(ui);
    const walkBtn = button(tools, "Walk", () => (timer ? stop() : start()), "is-primary");
    button(tools, "1000 steps", () => { for (let i = 0; i < 1000; i++) move(); draw(); });
    button(tools, "Reset", () => { stop(); rng = mulberry32(7); at = 0; steps = 0; visits = new Array(N).fill(0); lastEdge = null; draw(); });
    function move() {
      const list = WEB.out[at];
      const prev = at;
      if (list.length && rng() < d) { at = list[Math.floor(rng() * list.length)]; jumped = false; lastEdge = `${prev}-${at}`; }
      else { at = Math.floor(rng() * N); jumped = true; lastEdge = null; }
      visits[at]++;
      steps++;
    }
    function start() { if (timer) return; walkBtn.textContent = "Pause"; timer = setInterval(() => { move(); draw(); }, 420); }
    function stop() { clearInterval(timer); timer = 0; walkBtn.textContent = "Walk"; }
    function draw() {
      scene.set(webState((u) => (u === at ? "cur" : ""), (u) => WEB.names[u], (u, v) => (`${u}-${v}` === lastEdge ? "act" : "")));
      bars(barBox, WEB.names.map((name, u) => ({ name, fills: [{ v: steps ? (visits[u] / steps) * scale : 0, cls: "c5" }], mark: exact[u] * scale, text: steps ? pct0(visits[u] / steps) : "–" })));
      let err = 0;
      for (let u = 0; u < N; u++) err += Math.abs(visits[u] / Math.max(1, steps) - exact[u]);
      ui.setCaption(steps === 0 ? `The surfer starts on page A. Press **Walk**: in every step, with probability ${d} the surfer follows a random link, otherwise jumps to a random page. F has no links, so from F the surfer always jumps.`
        : `${steps.toLocaleString("en")} steps; the surfer is on **${WEB.names[at]}**${jumped ? " after a jump" : ""}. The bars show the share of time on each page, and the marks the PageRank. The total difference is ${(100 * err).toFixed(1)} %: it shrinks as the walk goes on.`);
    }
    draw();
  });

  /* ------------------------------------------------------ power iteration */
  register("power-iteration", (fig) => {
    const d = 0.85;
    const frames = [];
    let x = new Array(N).fill(1 / N);
    const exact = pagerank(d);
    const scale = 1 / Math.max(...exact) * 0.8;
    frames.push({ x: x.slice(), k: 0, change: null, cap: "Step 0: every page starts with the same rank, 1/8 = 12.5 %." });
    for (let k = 1; k <= 14; k++) {
      const D = x[5];
      const y = prStep(x, d);
      const change = y.reduce((a, v, i) => a + Math.abs(v - x[i]), 0);
      frames.push({ x: y.slice(), k, change, D, cap: `Step ${k}: every page gives 85 % of its rank along its links, in equal parts, and the dangling page F gives its ${pct0(D)} to all pages. The change is **${change.toFixed(4)}**${k > 1 ? `, ${(change / frames[k - 1].change).toFixed(2)} times the last one` : ""}.` });
      x = y;
    }
    frames.push({ x: x.slice(), k: 15, change: frames[14].change, done: true, cap: `The ranks settle: A and C ${pct0(exact[0])} and ${pct0(exact[2])}, B ${pct0(exact[1])}, the cycle G and H only ${pct0(exact[6])} and ${pct0(exact[7])}. In the long run the change shrinks by the factor d = 0.85 per step.` });
    const ui = frame(fig, { title: "Power iteration", kicker: "Animation", split: true });
    const scene = webScene(ui.stage);
    const barBox = h("div", { class: "wb-bars" });
    ui.side.appendChild(h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "rank" }), h("span", { text: "mark: final value" })), barBox));
    new Player(fig, {
      frames, interval: 1500,
      apply: (f) => {
        scene.set(webState((u) => (u === 5 && f.k > 0 && !f.done ? "c3" : ""), (u) => pct0(f.x[u]), () => (f.k > 0 && !f.done ? "act" : ""), (u) => WEB.names[u]));
        bars(barBox, WEB.names.map((name, u) => ({ name, fills: [{ v: f.x[u] * scale, cls: "c1" }], mark: exact[u] * scale, text: `${(100 * f.x[u]).toFixed(1)} %` })));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------------------- push, pull */
  register("push-pull", (fig) => {
    const T0 = [0, 1, 2, 3];
    const T1 = [4, 5, 6, 7];
    function pushFrames() {
      const fr = [{ round: -1, cap: "Push with two threads: thread 1 (blue) handles pages A–D and thread 2 (orange) pages E–H. Each sends the rank of its page along the page's links." }];
      for (let r = 0; r < 4; r++) {
        const u0 = T0[r];
        const u1 = T1[r];
        const w0 = WEB.out[u0];
        const w1 = WEB.out[u1];
        const both = w0.filter((v) => w1.includes(v));
        fr.push({ round: r, u: [u0, u1], writes: [w0, w1], both,
          cap: both.length ? `Thread 1 pushes ${WEB.names[u0]} and thread 2 pushes ${WEB.names[u1]} at the same time. Both add to page **${andList(both.map((v) => WEB.names[v]))}**: a data race, and one of the additions can be lost.`
            : `Thread 1 pushes ${WEB.names[u0]}${w1.length ? ` and thread 2 pushes ${WEB.names[u1]}` : `; ${WEB.names[u1]} has no links`}. This time they write different pages, but nothing guarantees that.` });
      }
      return fr;
    }
    function pullFrames() {
      const fr = [{ round: -1, cap: "Pull with two threads: each computes the new rank of its own pages, by reading the pages that link to them." }];
      for (let r = 0; r < 4; r++) {
        const u0 = T0[r];
        const u1 = T1[r];
        fr.push({ round: r, u: [u0, u1], reads: [IN[u0], IN[u1]],
          cap: `Thread 1 computes ${WEB.names[u0]} from ${IN[u0].length ? andList(IN[u0].map((v) => WEB.names[v])) : "no pages"}, and thread 2 computes ${WEB.names[u1]} from ${IN[u1].length ? andList(IN[u1].map((v) => WEB.names[v])) : "no pages"}. Reading the same page is fine; every page is written by one thread only: no atomics.` });
      }
      return fr;
    }
    const sets = { push: pushFrames(), pull: pullFrames() };
    let tab = "push";
    const ui = frame(fig, { title: "Push or pull with two threads", kicker: "Animation", tabs: [["push", "Push"], ["pull", "Pull"]], tab, onTab: (k) => { tab = k; player.setFrames(sets[k]); } });
    const scene = webScene(ui.stage);
    const player = new Player(fig, {
      frames: sets[tab], interval: 2300,
      apply: (f) => {
        const color = (u) => (T0.includes(u) ? "c5" : "c0");
        const nodeCls = (u) => {
          if (f.round < 0) return color(u);
          if (f.u.includes(u)) return `${color(u)} ring`;
          if (tab === "push" && f.both.includes(u)) return "bad";
          if (tab === "push" && f.writes.some((w) => w.includes(u))) return "act";
          return "dim";
        };
        const edgeCls = (u, v) => {
          if (f.round < 0) return "";
          if (tab === "push") return f.u.includes(u) ? (f.both.includes(v) ? "bad" : color(u)) : "dim";
          return f.u.includes(v) ? color(v) : "dim";
        };
        scene.set(webState(nodeCls, (u) => WEB.names[u], edgeCls));
        ui.setCaption(f.cap);
      },
    });
  });

  /* --------------------------------------------------------- forward push */
  register("forward-push", (fig) => {
    const d = 0.85;
    const eps = 0.06;
    const seed = 0;
    const p = new Array(N).fill(0);
    const r = new Array(N).fill(0);
    const limit = (u) => eps * Math.max(1, WEB.out[u].length);
    const queue = [seed];
    const inQ = new Array(N).fill(false);
    inQ[seed] = true;
    r[seed] = 1;
    const frames = [{ p: p.slice(), r: r.slice(), u: -1, q: queue.slice(), cap: `Personalized PageRank of page A with forward push, ε = ${eps}. All of the rank starts as the residual of A.` }];
    while (queue.length) {
      const u = queue.shift();
      inQ[u] = false;
      if (r[u] < limit(u)) continue;
      const ru = r[u];
      p[u] += (1 - d) * ru;
      r[u] = 0;
      const targets = WEB.out[u].length ? WEB.out[u] : [seed];
      const share = WEB.out[u].length ? (d * ru) / WEB.out[u].length : d * ru;
      for (const v of targets) {
        r[v] += share;
        if (!inQ[v] && r[v] >= limit(v)) { inQ[v] = true; queue.push(v); }
      }
      frames.push({ p: p.slice(), r: r.slice(), u, to: targets, q: queue.slice(),
        cap: `Push **${WEB.names[u]}**: its residual ${ru.toFixed(3)} → ${((1 - d) * ru).toFixed(3)} (15 %) goes to its estimate, and ${share.toFixed(3)} to ${WEB.out[u].length ? `each of ${andList(targets.map((v) => WEB.names[v]))}` : "A, because F has no links"}. Queue: ${queue.length ? queue.map((v) => WEB.names[v]).join(", ") : "empty"}.` });
    }
    const exact = (() => { // personalized PageRank of A by power iteration
      let x = new Array(N).fill(0);
      x[seed] = 1;
      for (let k = 0; k < 400; k++) {
        const D = x[5];
        const y = new Array(N).fill(0);
        y[seed] = 1 - d + d * D;
        WEB.out.forEach((list, u) => list.forEach((v) => { y[v] += (d * x[u]) / list.length; }));
        x = y;
      }
      return x;
    })();
    const rest = r.reduce((a, v) => a + v, 0);
    frames.push({ p: p.slice(), r: r.slice(), u: -1, q: [], done: true, cap: `Done after ${frames.length - 1} pushes: every residual is below ε times the number of links. The residuals left add up to ${rest.toFixed(3)}, which is the whole error. G and H were never touched: no link leads there from A.` });
    const scale = 1 / Math.max(...exact, 1e-9) * 0.8;
    const ui = frame(fig, { title: "Forward push from page A", kicker: "Animation", split: true });
    const scene = webScene(ui.stage);
    const barBox = h("div", { class: "wb-bars" });
    ui.side.appendChild(h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "estimate + residual" }), h("span", { text: "mark: exact" })), barBox));
    new Player(fig, {
      frames, interval: 1600,
      apply: (f) => {
        scene.set(webState((u) => (u === f.u ? "cur" : f.p[u] > 0 ? "done" : f.r[u] > 0 ? "act" : "dim"), (u) => WEB.names[u], (u) => (u === f.u ? "act" : "")));
        bars(barBox, WEB.names.map((name, u) => ({ name, fills: [{ v: f.p[u] * scale, cls: "c1" }, { v: f.r[u] * scale, cls: "c3" }], mark: exact[u] * scale, text: `${f.p[u].toFixed(2)} + ${f.r[u].toFixed(2)}`, cls: u === f.u ? "is-cur" : "" })));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- the order of the nodes */
  register("spy-reorder", (fig) => {
    // A small generated web graph: sites of 3-40 pages, 80 % of the links inside the site.
    const rng = mulberry32(22);
    const n = 300;
    const site = [];
    for (let v = 0; v < n;) { const size = Math.min(n - v, 3 + Math.floor(37 * rng() ** 2)); site.push([v, v + size]); v += size; }
    const edges = [];
    const targets = [];
    site.forEach(([a, b]) => {
      for (let u = a; u < b; u++) {
        const k = rng() < 0.15 ? 0 : 1 + Math.floor(-Math.log(1 - rng()) * 4);
        for (let i = 0; i < k; i++) {
          let t;
          if (rng() < 0.8 && b - a > 1) { const q = rng(); t = q < 0.25 ? a : q < 0.75 ? Math.max(a, Math.min(b - 1, u + (rng() < 0.5 ? -1 : 1) * (1 + Math.floor(rng() * 4)))) : a + Math.floor(rng() * (b - a)); }
          else if (targets.length && rng() < 0.5) t = targets[Math.floor(rng() * targets.length)];
          else t = Math.floor(rng() * n);
          if (t !== u) { edges.push([u, t]); targets.push(t); }
        }
      }
    });
    const shuffle = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffle[i], shuffle[j]] = [shuffle[j], shuffle[i]]; }
    const E = edges.map(([u, v]) => [shuffle[u], shuffle[v]]);
    const out = Array.from({ length: n }, () => []);
    const inn = Array.from({ length: n }, () => []);
    E.forEach(([u, v]) => { out[u].push(v); inn[v].push(u); });
    const orders = {
      random: Array.from({ length: n }, (_, i) => i),
      bfs: (() => {
        const id = new Array(n).fill(-1);
        let next = 0;
        for (let s0 = 0; s0 < n; s0++) {
          if (id[s0] >= 0) continue;
          id[s0] = next++;
          const q = [s0];
          for (let h0 = 0; h0 < q.length; h0++) for (const w of out[q[h0]].concat(inn[q[h0]])) if (id[w] < 0) { id[w] = next++; q.push(w); }
        }
        return id;
      })(),
      indeg: (() => {
        const ord = Array.from({ length: n }, (_, i) => i).sort((a, b) => inn[b].length - inn[a].length || a - b);
        const id = new Array(n);
        ord.forEach((v, i) => { id[v] = i; });
        return id;
      })(),
    };
    // Misses of the reads x[u] of a pull step in a small LRU cache of 6 lines of 8 values.
    function misses(id) {
      const rows = Array.from({ length: n }, () => []);
      E.forEach(([u, v]) => rows[id[v]].push(id[u]));
      rows.forEach((r) => r.sort((a, b) => a - b));
      const cache = [];
      let m = 0;
      let reads = 0;
      for (const r of rows) {
        for (const u of r) {
          reads++;
          const line = u >> 3;
          const k = cache.indexOf(line);
          if (k >= 0) cache.splice(k, 1);
          else { m++; if (cache.length === 6) cache.shift(); }
          cache.push(line);
        }
      }
      return { m, reads, rows };
    }
    let order = "random";
    const ui = frame(fig, { title: "The links as a matrix", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const svg = s("svg", { viewBox: `0 0 ${n} ${n}`, class: "wb-spy", "aria-hidden": "true" });
    ui.stage.appendChild(h("div", { class: "wb-spybox" }, svg, h("div", { class: "wb-note", text: "row: the page that is computed; column: the page that is read" })));
    const tools = toolbar(ui);
    toggle(tools, "Numbering", [["random", "random"], ["bfs", "breadth-first"], ["indeg", "by in-degree"]], order, (k) => { order = k; draw(); });
    const names = { random: "random numbers", bfs: "a breadth-first search", indeg: "decreasing in-degree" };
    function draw() {
      const { m, reads, rows } = misses(orders[order]);
      svg.textContent = "";
      let dots = "";
      rows.forEach((r, v) => r.forEach((u) => { dots += `M${u} ${v}h2.2v2.2h-2.2z`; }));
      s("rect", { x: 0, y: 0, width: n, height: n, class: "wb-spy-bg" }, svg);
      s("path", { d: dots, class: "wb-spy-dots" }, svg);
      const base = misses(orders.random).m;
      const versus = order === "random" ? "" : base / m < 1.05 ? ", about as many as with random numbers" : `, ${(base / m).toFixed(1)} times fewer than with random numbers`;
      ui.setCaption(`${n} pages and ${E.length} links, numbered by **${names[order]}**. In a pull step, row v reads the columns of its dots. In a cache of 6 lines of 8 values, ${m} of the ${reads} reads miss (${Math.round((100 * m) / reads)} %)${versus}.${order === "bfs" ? " The dots move into a band around the diagonal: a page and the pages that link to it get close numbers, so the reads of nearby rows hit the same cache lines." : order === "indeg" ? " The pages with the most incoming links come first, so the rows at the top are full, but the dots are still scattered over the columns." : " The dots are scattered all over, and most reads miss."}`);
    }
    draw();
  });
})();
