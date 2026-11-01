/* Figures for chapters 23–24: vector search. Distances and their meaning,
   FMA accumulators, the k-d tree, k-means and the inverted file, product
   quantization, fast scan with vpshufb, SimHash (chapter 23); greedy and
   beam search on graphs, the layers of HNSW, the neighbour heuristic,
   recall against speed and prefetching (chapter 24). The small examples run
   the algorithms of the chapters' C++ code on points in the plane.
   Part III pages load this file through the `viz` list in _config.yml. */
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
    const out = h("span", { class: "viz-label vx-val" });
    const input = h("input", { type: "range", class: "viz-range vx-slider", min, max, step, value, "aria-label": label });
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
  const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // Points in [0.04, 0.96]^2 in Gaussian clusters.
  function clustered(rng, n, centers, spread) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const c = centers[i % centers.length];
      pts.push([clamp(c[0] + spread * gauss(rng), 0.04, 0.96), clamp(c[1] + spread * gauss(rng), 0.04, 0.96)]);
    }
    return pts;
  }
  // An SVG drawing area with a coordinate map from the unit square.
  function plane(parent, W, H, pad = 14, cls = "") {
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: `vx-plot ${cls}`, role: "img", "aria-hidden": "true" });
    parent.appendChild(svg);
    const X = (x) => pad + x * (W - 2 * pad);
    const Y = (y) => pad + y * (H - 2 * pad);
    const fromSvg = (p) => [(p.x - pad) / (W - 2 * pad), (p.y - pad) / (H - 2 * pad)];
    return { svg, X, Y, fromSvg, W, H };
  }
  function svgPoint(svg, e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  // Calls onMove(point) while the pointer is pressed (or moved after a tap).
  function dragging(svg, onMove) {
    let down = false;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (e) => { down = true; svg.setPointerCapture(e.pointerId); onMove(svgPoint(svg, e)); });
    svg.addEventListener("pointermove", (e) => { if (down) onMove(svgPoint(svg, e)); });
    const up = () => { down = false; };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  }
  const dot = (g, x, y, r, cls) => s("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r, class: cls }, g);
  const seg = (g, x1, y1, x2, y2, cls) => s("line", { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), class: cls }, g);
  const label = (g, x, y, text, cls = "vx-lbl", anchor = "middle") => {
    const t = s("text", { x: x.toFixed(1), y: y.toFixed(1), class: cls, "text-anchor": anchor }, g);
    t.textContent = text;
    return t;
  };
  // The query: a diamond.
  const diamond = (g, x, y, r = 7, cls = "vx-q") =>
    s("path", { d: `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`, class: cls }, g);
  const panel = (title, note, ...children) => h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: title }), note ? h("span", { text: note }) : null), ...children);
  const cells = (values, cls = () => "", name = null) =>
    h("div", { class: "vx-cells" }, name ? h("span", { class: "vx-rowname", text: name }) : null,
      ...values.map((v, i) => h("span", { class: `vx-cell ${cls(i, v) || ""}`, text: v == null ? "" : String(v) })));
  const fix = (v, d = 1) => Number(v).toFixed(d);

  /* =========================================== chapter 23: exact and IVF */

  /* --------------------------------------------- which points are nearest */
  register("vec-metrics", (fig) => {
    const rng = mulberry32(23);
    const P = [];
    for (let i = 0; i < 34; i++) {
      const a = rng() * 2 * Math.PI;
      const r = 0.18 + 0.78 * Math.sqrt(rng());
      P.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    let q = [0.42, 0.22];
    let metric = "l2";
    const K = 3;
    const ui = frame(fig, { title: "Nearest by which measure?", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 440, H = 300, S = 128, cx = W / 2, cy = H / 2;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-plot", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const X = (x) => cx + x * S, Y = (y) => cy - y * S;
    const tools = toolbar(ui);
    toggle(tools, "Measure", [["l2", "Euclidean"], ["cos", "cosine"], ["ip", "inner product"]], metric, (m) => { metric = m; draw(); });
    tools.appendChild(h("span", { class: "viz-label", text: "Drag to move the query." }));
    dragging(svg, (p) => { q = [clamp((p.x - cx) / S, -1.15, 1.15), clamp((cy - p.y) / S, -1.1, 1.1)]; draw(); });
    const dotp = (a, b) => a[0] * b[0] + a[1] * b[1];
    const len = (a) => Math.hypot(a[0], a[1]);
    const score = (p) => metric === "l2" ? d2(p, q) : metric === "cos" ? 1 - dotp(p, q) / (len(p) * len(q) || 1) : -dotp(p, q);
    function draw() {
      svg.textContent = "";
      seg(svg, X(-1.3), Y(0), X(1.3), Y(0), "vx-axis");
      seg(svg, X(0), Y(-1.15), X(0), Y(1.15), "vx-axis");
      const order = P.map((p, i) => [score(p), i]).sort((a, b) => a[0] - b[0]).slice(0, K).map((x) => x[1]);
      const best = new Set(order);
      const ql = len(q) || 1;
      if (metric !== "l2") {
        const far = 1.35 / ql;
        seg(svg, X(0), Y(0), X(q[0] * far), Y(q[1] * far), "vx-ray");
      }
      if (metric === "ip") {
        // Points beyond this line have a larger inner product than the third best.
        const t = -score(P[order[K - 1]]) / (ql * ql);
        const bx = q[0] * t, by = q[1] * t, nx = -q[1] / ql, ny = q[0] / ql;
        seg(svg, X(bx - 1.6 * nx), Y(by - 1.6 * ny), X(bx + 1.6 * nx), Y(by + 1.6 * ny), "vx-level");
      }
      for (const i of order) {
        const p = P[i];
        if (metric === "l2") seg(svg, X(q[0]), Y(q[1]), X(p[0]), Y(p[1]), "vx-link is-ok");
        else seg(svg, X(0), Y(0), X(p[0]), Y(p[1]), "vx-link is-ok");
      }
      P.forEach((p, i) => dot(svg, X(p[0]), Y(p[1]), best.has(i) ? 5.5 : 4, best.has(i) ? "vx-pt is-near" : "vx-pt"));
      if (metric === "l2") s("circle", { cx: X(q[0]), cy: Y(q[1]), r: Math.sqrt(score(P[order[K - 1]])) * S, class: "vx-ring" }, svg);
      diamond(svg, X(q[0]), Y(q[1]));
      const cap = {
        l2: "**Euclidean distance**: the 3 nearest points (green) are inside the circle around the query. Our tasks use the squared distance: it gives the same order and needs no square root.",
        cos: "**Cosine similarity** looks only at the direction: the 3 best points have directions closest to the query's, whether they are near the origin or far away. For vectors of length 1 it gives the same order as the Euclidean distance.",
        ip: "The **inner product** q · x likes long vectors: the 3 best points are far out in the direction of the query, and every point beyond the dashed line beats every point before it, even a point right next to the query.",
      };
      ui.setCaption(cap[metric]);
    }
    draw();
  });

  /* ---------------------------------------------------- FMA accumulators */
  register("fma-accumulators", (fig) => {
    const OPS = 16;  // 128 values, 8 per FMA
    const LAT = 4;   // cycles until the result of an FMA can be used
    let A = 1;
    const ui = frame(fig, { title: "Hiding the latency of FMA", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, rowH = 22, M = { l: 70, r: 14, t: 18, b: 34 };
    const svg = s("svg", { class: "vx-plot vx-time", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const tools = toolbar(ui);
    toggle(tools, "Accumulators", [[1, "1"], [2, "2"], [4, "4"], [8, "8"]], A, (a) => { A = a; draw(); });
    // One FMA can start per cycle: each needs two loads, and the loads are the limit.
    function schedule() {
      const ready = new Array(A).fill(0);
      const ops = [];
      let slot = 0;
      for (let i = 0; i < OPS; i++) {
        const acc = i % A;
        const start = Math.max(ready[acc], slot);
        ops.push({ i, acc, start });
        ready[acc] = start + LAT;
        slot = start + 1;
      }
      return { ops, end: Math.max(...ready) };
    }
    function draw() {
      const { ops, end } = schedule();
      const H = M.t + A * rowH + M.b;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.textContent = "";
      const maxC = 66;
      const X = (c) => M.l + (c / maxC) * (W - M.l - M.r);
      for (let c = 0; c <= maxC; c += 8) {
        seg(svg, X(c), M.t - 4, X(c), M.t + A * rowH, "vx-grid");
        label(svg, X(c), M.t + A * rowH + 14, String(c), "vx-tick");
      }
      label(svg, (M.l + W - M.r) / 2, H - 4, "cycles", "vx-axis-label");
      for (let a = 0; a < A; a++) label(svg, M.l - 8, M.t + a * rowH + rowH / 2, `sum ${a}`, "vx-tick", "end");
      for (const o of ops) {
        const y = M.t + o.acc * rowH + 3;
        s("rect", { x: X(o.start), y, width: Math.max(2, X(o.start + LAT) - X(o.start) - 1.5), height: rowH - 6, rx: 3, class: `vx-op c${o.acc % 6}` }, svg);
        label(svg, X(o.start + LAT / 2), y + (rowH - 6) / 2, String(o.i + 1), "vx-op-lbl");
      }
      seg(svg, X(end), M.t - 6, X(end), M.t + A * rowH + 2, "vx-end");
      const notes = {
        1: `With **one sum**, every FMA waits ${LAT} cycles for the one before it: 16 FMAs take ${end} cycles, and the FMA units are idle most of the time.`,
        2: `With **two sums**, two chains run side by side: ${end} cycles.`,
        4: `With **four sums**, a new FMA starts in every cycle: ${end} cycles, 4 times faster than one sum. The loads (two per FMA) are now the limit.`,
        8: `**Eight sums** do not help any more: the loads allow about one FMA per cycle, so it stays at ${end} cycles. On our machine, a dot product of 4096 values took 524, 269, 162 and 165 ns with 1, 2, 4 and 8 sums.`,
      };
      ui.setCaption(`${notes[A]} At the end the sums are added together.`);
    }
    draw();
  });

  /* ------------------------------------------------------------ k-d tree */
  register("kdtree", (fig) => {
    const rng = mulberry32(5);
    const N = 44, LEAF = 3;
    const pts = [];
    for (let i = 0; i < N; i++) pts.push([0.05 + 0.9 * rng(), 0.06 + 0.88 * rng()]);
    const order = pts.map((_, i) => i);
    const nodes = [];  // internal nodes in the order of the build
    (function build(lo, hi, depth, box) {
      if (hi - lo <= LEAF) { nodes.push({ leaf: true, lo, hi, box, depth }); return; }
      const axis = depth % 2, mid = lo + ((hi - lo) >> 1);
      const part = order.slice(lo, hi).sort((a, b) => pts[a][axis] - pts[b][axis]);
      for (let i = lo; i < hi; i++) order[i] = part[i - lo];
      const v = pts[order[mid]][axis];
      const node = { lo, hi, mid, axis, v, box, depth };
      nodes.push(node);
      const left = axis === 0 ? [box[0], v, box[2], box[3]] : [box[0], box[1], box[2], v];
      const right = axis === 0 ? [v, box[1], box[2], box[3]] : [box[0], box[1], v, box[3]];
      node.left = nodes.length;
      build(lo, mid, depth + 1, left);
      node.right = nodes.length;
      build(mid + 1, hi, depth + 1, right);
    })(0, N, 0, [0, 1, 0, 1]);
    const q = [0.63, 0.43];
    // The search for the nearest point: first the captions of its steps...
    const steps = [];
    let best = Infinity;
    function offer(i) {
      best = Math.min(best, d2(pts[i], q));
    }
    (function visit(k) {
      const n = nodes[k];
      if (n.leaf) {
        for (let i = n.lo; i < n.hi; i++) offer(order[i]);
        steps.push({ box: n.box, leaf: true, cap: `A leaf: compute the distances of its ${n.hi - n.lo} point${n.hi - n.lo === 1 ? "" : "s"}.` });
        return;
      }
      offer(order[n.mid]);
      const plane = q[n.axis] - n.v;
      const [near, far] = plane < 0 ? [n.left, n.right] : [n.right, n.left];
      steps.push({ box: n.box, line: n, cap: `The query is on the ${n.axis === 0 ? (plane < 0 ? "left" : "right") : (plane < 0 ? "upper" : "lower")} side of this ${n.axis === 0 ? "vertical" : "horizontal"} line: search that side first.` });
      visit(near);
      if (plane * plane <= best) {
        steps.push({ box: nodes[far].box, cap: `The line is only ${fix(Math.abs(plane) * 100, 0)} away and the best distance so far is ${fix(Math.sqrt(best) * 100, 0)}: the other side may have a nearer point, so search it too.` });
        visit(far);
      } else {
        steps.push({ box: nodes[far].box, prune: true, cap: `The line is ${fix(Math.abs(plane) * 100, 0)} away, farther than the best distance ${fix(Math.sqrt(best) * 100, 0)}: nothing on the other side can be nearer. **Skip it.**` });
      }
    })(0);
    // The frames: first the build, then the search.
    const frames = [{ phase: "build", upto: 0, cap: `${N} points. The tree splits them at the median, by x and by y in turn, until at most ${LEAF} are left.` }];
    const internal = nodes.filter((n) => !n.leaf);
    internal.forEach((n, k) => frames.push({ phase: "build", upto: k + 1, cap: k === 0 ? "The first split: the median x. Half of the points are on each side." : `Split ${k + 1}: the median ${n.axis === 0 ? "x" : "y"} of this part (depth ${n.depth}).` }));
    const fullBuild = internal.length;
    let shown = null;
    {
      // ...then the same search again, with the state after each step.
      let b = Infinity, id = -1, c = 0;
      const vis = new Set();
      let pr = [];
      const replay = [];
      (function visit(k) {
        const n = nodes[k];
        if (n.leaf) {
          for (let i = n.lo; i < n.hi; i++) { c++; vis.add(order[i]); const d = d2(pts[order[i]], q); if (d < b) { b = d; id = order[i]; } }
          replay.push({ vis: new Set(vis), b, id, c, pr: pr.slice() });
          return;
        }
        c++; vis.add(order[n.mid]);
        { const d = d2(pts[order[n.mid]], q); if (d < b) { b = d; id = order[n.mid]; } }
        replay.push({ vis: new Set(vis), b, id, c, pr: pr.slice() });
        const plane = q[n.axis] - n.v;
        const [near, far] = plane < 0 ? [n.left, n.right] : [n.right, n.left];
        visit(near);
        if (plane * plane <= b) { replay.push({ vis: new Set(vis), b, id, c, pr: pr.slice() }); visit(far); }
        else { pr = pr.concat([nodes[far].box]); replay.push({ vis: new Set(vis), b, id, c, pr: pr.slice() }); }
      })(0);
      steps.forEach((st, i) => frames.push({ phase: "search", st, ...replay[i] }));
      shown = replay[replay.length - 1];
    }
    frames.push({ phase: "search", st: { cap: "" }, ...shown, done: true });
    const ui = frame(fig, { title: "A k-d tree in two dimensions", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 300, 10);
    new Player(fig, {
      frames, interval: 1200,
      apply: (f) => {
        const g = P.svg;
        g.textContent = "";
        s("rect", { x: P.X(0), y: P.Y(0), width: P.X(1) - P.X(0), height: P.Y(1) - P.Y(0), class: "vx-frame" }, g);
        if (f.phase === "search") {
          for (const b of f.pr) s("rect", { x: P.X(b[0]), y: P.Y(b[2]), width: P.X(b[1]) - P.X(b[0]), height: P.Y(b[3]) - P.Y(b[2]), class: "vx-pruned" }, g);
          if (f.st && f.st.box && !f.done) s("rect", { x: P.X(f.st.box[0]), y: P.Y(f.st.box[2]), width: P.X(f.st.box[1]) - P.X(f.st.box[0]), height: P.Y(f.st.box[3]) - P.Y(f.st.box[2]), class: f.st.prune ? "vx-box is-skip" : "vx-box" }, g);
        }
        const upto = f.phase === "build" ? f.upto : fullBuild;
        internal.slice(0, upto).forEach((n, k) => {
          const b = n.box;
          const cls = f.phase === "build" && k === upto - 1 ? "vx-split is-new" : "vx-split";
          if (n.axis === 0) seg(g, P.X(n.v), P.Y(b[2]), P.X(n.v), P.Y(b[3]), cls);
          else seg(g, P.X(b[0]), P.Y(n.v), P.X(b[1]), P.Y(n.v), cls);
        });
        pts.forEach((p, i) => {
          let cls = "vx-pt";
          if (f.phase === "search") cls = i === f.id ? "vx-pt is-near" : f.vis.has(i) ? "vx-pt is-seen" : "vx-pt is-faint";
          dot(g, P.X(p[0]), P.Y(p[1]), f.phase === "search" && i === f.id ? 5.5 : 4, cls);
        });
        if (f.phase === "search") {
          if (f.id >= 0) s("circle", { cx: P.X(q[0]), cy: P.Y(q[1]), r: Math.sqrt(f.b) * (P.X(1) - P.X(0)), class: "vx-ring" }, g);
          diamond(g, P.X(q[0]), P.Y(q[1]));
        }
        if (f.phase === "build") ui.setCaption(f.cap);
        else if (f.done) ui.setCaption(`Done: the nearest point (green) was found with **${f.c} distances** instead of ${N}. The grey parts were skipped. In 2 dimensions the skipping saves almost everything; in 128 dimensions it saves almost nothing.`);
        else ui.setCaption(`${f.st.cap} (${f.c} distances so far)`);
      },
    });
  });

  /* ----------------------------------------------------------- k-means */
  const KM_CENTERS = [[0.2, 0.25], [0.72, 0.2], [0.5, 0.55], [0.18, 0.78], [0.82, 0.72], [0.45, 0.88]];
  const KM_POINTS = clustered(mulberry32(17), 150, KM_CENTERS, 0.075);
  function lloyd(points, start, rounds) {
    const out = [{ c: start.map((c) => c.slice()), a: null }];
    let c = start.map((x) => x.slice());
    for (let r = 0; r < rounds; r++) {
      const a = points.map((p) => {
        let b = 0;
        for (let j = 1; j < c.length; j++) if (d2(p, c[j]) < d2(p, c[b])) b = j;
        return b;
      });
      out.push({ c: c.map((x) => x.slice()), a, step: "assign" });
      const sum = c.map(() => [0, 0, 0]);
      points.forEach((p, i) => { sum[a[i]][0] += p[0]; sum[a[i]][1] += p[1]; sum[a[i]][2]++; });
      c = c.map((x, j) => (sum[j][2] ? [sum[j][0] / sum[j][2], sum[j][1] / sum[j][2]] : x));
      out.push({ c: c.map((x) => x.slice()), a, step: "move" });
    }
    return out;
  }
  const objective = (points, c) => points.reduce((t, p) => t + Math.min(...c.map((x) => d2(p, x))), 0) / points.length;

  register("kmeans", (fig) => {
    const K = 6;
    const rng = mulberry32(3);
    const start = [];
    const used = new Set();
    while (start.length < K) {
      const i = Math.floor(rng() * KM_POINTS.length);
      if (!used.has(i)) { used.add(i); start.push(KM_POINTS[i].slice()); }
    }
    const states = lloyd(KM_POINTS, start, 6);
    const first = objective(KM_POINTS, states[0].c);
    const frames = states.map((st, i) => ({ ...st, i }));
    const ui = frame(fig, { title: "k-means: assign, then move", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 290, 10);
    new Player(fig, {
      frames, interval: 1300,
      apply: (f) => {
        const g = P.svg;
        g.textContent = "";
        KM_POINTS.forEach((p, i) => dot(g, P.X(p[0]), P.Y(p[1]), 3.6, f.a ? `vx-pt c${f.a[i]}` : "vx-pt"));
        if (f.step === "move") {
          const prev = frames[f.i - 1].c;
          f.c.forEach((c, j) => seg(g, P.X(prev[j][0]), P.Y(prev[j][1]), P.X(c[0]), P.Y(c[1]), "vx-move"));
        }
        f.c.forEach((c, j) => s("path", { d: `M${P.X(c[0]) - 7} ${P.Y(c[1])}h14M${P.X(c[0])} ${P.Y(c[1]) - 7}v14`, class: `vx-centroid c${j}` }, g));
        const obj = objective(KM_POINTS, f.c);
        const round = Math.ceil(f.i / 2);
        if (f.i === 0) ui.setCaption(`${KM_POINTS.length} points and ${K} centroids (+), chosen at random among the points. Two of them may start in the same group.`);
        else if (f.step === "assign") ui.setCaption(`Round ${round}, **assign**: every point takes the color of its nearest centroid.`);
        else ui.setCaption(`Round ${round}, **move**: every centroid moves to the mean of its points. The mean squared distance to the nearest centroid fell from ${fix(first * 1e4, 0)} to **${fix(obj * 1e4, 0)}**${round > 2 ? ": the changes get small, and the centroids settle" : ""}.`);
      },
    });
  });

  /* ------------------------------------------------------ IVF: the probes */
  register("ivf-probe", (fig) => {
    const K = 6, TOPK = 5;
    const rng = mulberry32(3);
    const start = [];
    const used = new Set();
    while (start.length < K) {
      const i = Math.floor(rng() * KM_POINTS.length);
      if (!used.has(i)) { used.add(i); start.push(KM_POINTS[i].slice()); }
    }
    const states = lloyd(KM_POINTS, start, 6);
    const C = states[states.length - 1].c;
    const list = KM_POINTS.map((p) => {
      let b = 0;
      for (let j = 1; j < K; j++) if (d2(p, C[j]) < d2(p, C[b])) b = j;
      return b;
    });
    let q = [0.36, 0.43];
    let nprobe = 1;
    const ui = frame(fig, { title: "Searching the nearest lists", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 290, 10);
    const tools = toolbar(ui);
    slider(tools, "nprobe", { min: 1, max: K, step: 1, value: nprobe, format: (v) => `${v} of ${K}` }, (v) => { nprobe = v; draw(); });
    tools.appendChild(h("span", { class: "viz-label", text: "Drag to move the query." }));
    dragging(P.svg, (p) => { q = P.fromSvg(p).map((v) => clamp(v, 0, 1)); draw(); });
    // A coarse grid colored by the nearest centroid shows the cells.
    const GX = 44, GY = 29;
    function draw() {
      const g = P.svg;
      g.textContent = "";
      const probes = C.map((c, j) => [d2(q, c), j]).sort((a, b) => a[0] - b[0]).slice(0, nprobe).map((x) => x[1]);
      const probed = new Set(probes);
      for (let gx = 0; gx < GX; gx++)
        for (let gy = 0; gy < GY; gy++) {
          const p = [(gx + 0.5) / GX, (gy + 0.5) / GY];
          let b = 0;
          for (let j = 1; j < K; j++) if (d2(p, C[j]) < d2(p, C[b])) b = j;
          s("rect", { x: P.X(gx / GX), y: P.Y(gy / GY), width: P.X(1 / GX) - P.X(0) + 0.4, height: P.Y(1 / GY) - P.Y(0) + 0.4, class: `vx-cellbg c${b}${probed.has(b) ? " is-on" : ""}` }, g);
        }
      const exact = KM_POINTS.map((p, i) => [d2(p, q), i]).sort((a, b) => a[0] - b[0]).slice(0, TOPK).map((x) => x[1]);
      const cand = KM_POINTS.map((p, i) => [d2(p, q), i]).filter(([, i]) => probed.has(list[i])).sort((a, b) => a[0] - b[0]);
      const found = new Set(cand.slice(0, TOPK).map((x) => x[1]));
      const truth = new Set(exact);
      KM_POINTS.forEach((p, i) => {
        let cls = probed.has(list[i]) ? `vx-pt c${list[i]}` : "vx-pt is-faint";
        if (found.has(i)) cls = "vx-pt is-near";
        if (truth.has(i) && !found.has(i)) cls = "vx-pt is-miss";
        dot(g, P.X(p[0]), P.Y(p[1]), truth.has(i) || found.has(i) ? 5 : 3.4, cls);
      });
      C.forEach((c, j) => s("path", { d: `M${P.X(c[0]) - 7} ${P.Y(c[1])}h14M${P.X(c[0])} ${P.Y(c[1]) - 7}v14`, class: `vx-centroid c${j}` }, g));
      diamond(g, P.X(q[0]), P.Y(q[1]));
      const hits = exact.filter((i) => found.has(i)).length;
      ui.setCaption(`The query looks only at the points of the **${nprobe} nearest list${nprobe > 1 ? "s" : ""}**: ${cand.length} of ${KM_POINTS.length} distances (plus ${K} to the centroids). It found **${hits} of the true ${TOPK} nearest** (green)${hits < TOPK ? `; the red ones are in lists it did not search` : ""}. Move the query near a border to see why more lists help.`);
    }
    draw();
  });

  /* ------------------------------------------------ product quantization */
  register("pq-adc", (fig) => {
    // A vector of 8 values in 4 parts of 2; each part has 4 centroids (codes 0-3).
    const BOOK = [
      [[2, 8], [7, 3], [9, 9], [3, 2]],
      [[1, 1], [6, 7], [2, 9], [8, 2]],
      [[5, 5], [9, 1], [1, 6], [8, 8]],
      [[3, 7], [7, 7], [2, 2], [8, 3]],
    ];
    const x = [7, 4, 2, 8, 9, 2, 3, 6];
    const q = [3, 3, 5, 6, 8, 8, 4, 2];
    const code = BOOK.map((b, j) => {
      const part = [x[2 * j], x[2 * j + 1]];
      let best = 0;
      b.forEach((c, k) => { if (d2(part, c) < d2(part, b[best])) best = k; });
      return best;
    });
    const table = BOOK.map((b, j) => b.map((c) => d2([q[2 * j], q[2 * j + 1]], c)));
    const approx = table.reduce((t, row, j) => t + row[code[j]], 0);
    const exact = x.reduce((t, v, i) => t + (v - q[i]) ** 2, 0);
    const recon = code.flatMap((c, j) => BOOK[j][c]);
    const frames = [{ upto: -1, cap: "A vector of 8 numbers. Product quantization cuts it into **4 parts of 2 numbers**. Each part has its own small codebook of 4 centroids (in practice 256), found by k-means on the parts of many vectors." }];
    for (let j = 0; j < 4; j++) frames.push({ upto: j, cap: `Part ${j + 1}, (${x[2 * j]}, ${x[2 * j + 1]}): its nearest centroid in codebook ${j + 1} is number **${code[j]}**, (${BOOK[j][code[j]].join(", ")}). Only that number is stored.` });
    frames.push({ upto: 4, codeOnly: true, cap: `The vector is stored as its code **${code.join(" ")}**: 4 numbers of 2 bits instead of 8 numbers of 32 bits. It now stands for (${recon.join(", ")}), close to the original.` });
    frames.push({ upto: 4, table: true, cap: "A query comes. For each part of the query and each centroid of that part, compute the distance once: a table of 4 × 4 numbers. It does not depend on the vectors in the database." });
    frames.push({ upto: 4, table: true, sum: true, cap: `The approximate distance to the vector is the sum of one entry per part, chosen by the code: **${table.map((r, j) => r[code[j]]).join(" + ")} = ${approx}**. The exact distance is ${exact}. No vector is read, and the table stays in the L1 cache: four lookups and three additions per vector.` });
    const ui = frame(fig, { title: "Product quantization and distance tables", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "vx-pq" });
    ui.stage.appendChild(box);
    new Player(fig, {
      frames, interval: 2200,
      apply: (f) => {
        box.textContent = "";
        box.appendChild(cells(x, (i) => (Math.floor(i / 2) === f.upto ? "is-cur" : Math.floor(i / 2) < f.upto ? "is-done" : "") + (i % 2 === 1 && i < 7 ? " vx-gap" : ""), "vector"));
        const books = h("div", { class: "vx-books" });
        BOOK.forEach((b, j) => {
          const W = 112, H = 112, pad = 10;
          const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-book", role: "img", "aria-hidden": "true" });
          const Xs = (v) => pad + (v / 10) * (W - 2 * pad), Ys = (v) => H - pad - (v / 10) * (H - 2 * pad);
          s("rect", { x: pad, y: pad, width: W - 2 * pad, height: H - 2 * pad, class: "vx-frame" }, svg);
          const part = [x[2 * j], x[2 * j + 1]];
          const qp = [q[2 * j], q[2 * j + 1]];
          b.forEach((c, k) => {
            const chosen = j <= f.upto && k === code[j];
            if (f.table) seg(svg, Xs(qp[0]), Ys(qp[1]), Xs(c[0]), Ys(c[1]), f.sum && chosen ? "vx-link is-ok" : "vx-link is-faint");
            s("circle", { cx: Xs(c[0]), cy: Ys(c[1]), r: chosen ? 6.5 : 5, class: chosen ? "vx-cent is-on" : "vx-cent" }, svg);
            label(svg, Xs(c[0]), Ys(c[1]) + 0.5, String(k), "vx-cent-lbl");
          });
          if (j <= f.upto && !f.codeOnly && !f.table) dot(svg, Xs(part[0]), Ys(part[1]), 4, "vx-pt is-cur");
          if (f.table) diamond(svg, Xs(qp[0]), Ys(qp[1]), 6);
          books.appendChild(h("div", { class: "vx-bookbox" }, svg, h("span", { class: "vx-booklbl", text: `part ${j + 1}` })));
        });
        box.appendChild(books);
        if (f.upto >= 0) box.appendChild(cells(code.map((c, j) => (j <= f.upto ? c : "")), (j) => (j <= f.upto ? "is-hit" : "is-empty"), "code"));
        if (f.table) {
          const t = h("div", { class: "vx-table" });
          table.forEach((row, j) => t.appendChild(cells(row, (k) => (f.sum && k === code[j] ? "is-hit" : ""), `part ${j + 1}`)));
          box.appendChild(panel("distance table of the query", "centroid 0 1 2 3", t));
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------------------ fast scan */
  register("fast-scan", (fig) => {
    // 4 parts with 16 centroids each (4-bit codes), 32 vectors in a block.
    const rng = mulberry32(11);
    const M = 4;
    const LUT = Array.from({ length: M }, () => Array.from({ length: 16 }, () => Math.floor(rng() * 25)));
    const CODES = Array.from({ length: 32 }, () => Array.from({ length: M }, () => Math.floor(rng() * 16)));
    const frames = [{ j: -1, cap: "A block of **32 vectors** with 4-bit codes: 16 centroids per part. The 16 entries of the table of a part are rounded to bytes, so one table fills 16 bytes: half a 256-bit register." }];
    const sums = new Array(32).fill(0);
    for (let j = 0; j < M; j++) {
      frames.push({ j, step: "codes", sums: sums.slice(), cap: `Part ${j + 1}: one 16-byte load brings the codes of all 32 vectors (two 4-bit codes per byte). The low 4 bits go to the low half of the register (vectors 1–16), the high 4 bits to the high half (vectors 17–32).` });
      for (let v = 0; v < 32; v++) sums[v] += LUT[j][CODES[v][j]];
      frames.push({ j, step: "shuffle", sums: sums.slice(), cap: `**vpshufb**: every byte of the code register picks the table entry with its number, in both halves at once: 32 lookups in one instruction. Then the bytes are added to 16-bit sums.` });
    }
    frames.push({ j: M, sums: sums.slice(), cap: `After ${M} parts the 32 sums are ready: about two instructions per part for 32 vectors. A scalar loop does 32 separate lookups per part. On our machine: **1.4 ns per vector** instead of 13.8 (the 4-bit codes of 200,000 vectors with 32 parts).` });
    const ui = frame(fig, { title: "Fast scan: 32 lookups in one instruction", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "vx-fs" });
    ui.stage.appendChild(box);
    const hex = (v) => v.toString(16).toUpperCase();
    new Player(fig, {
      frames, interval: 2000,
      apply: (f) => {
        box.textContent = "";
        const j = Math.min(f.j, M - 1);
        if (f.j >= 0 && f.j < M) {
          const lut = LUT[j];
          box.appendChild(panel(`table of part ${j + 1}`, "16 bytes, in both halves", cells(lut, (c) => (f.step === "shuffle" ? "is-hl" : ""), "entry"), cells([...Array(16).keys()].map(hex), () => "vx-idx", "code")));
          const lo = CODES.slice(0, 16).map((c) => hex(c[j])), hi = CODES.slice(16).map((c) => hex(c[j]));
          box.appendChild(panel("codes", "one register: two halves", cells(lo, () => "is-cur", "1–16"), cells(hi, () => "is-cur", "17–32")));
          if (f.step === "shuffle") {
            box.appendChild(panel("looked up", "vpshufb", cells(CODES.slice(0, 16).map((c) => lut[c[j]]), () => "is-hit", "1–16"), cells(CODES.slice(16).map((c) => lut[c[j]]), () => "is-hit", "17–32")));
          }
        }
        if (f.sums) box.appendChild(panel("sums (16 bits)", f.j >= M ? "done" : `after part ${f.step === "shuffle" ? j + 1 : j}`, cells(f.sums.slice(0, 16), () => (f.j >= M ? "is-done" : ""), "1–16"), cells(f.sums.slice(16), () => (f.j >= M ? "is-done" : ""), "17–32")));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------------------- SimHash */
  register("simhash", (fig) => {
    let planes = 16;
    let seed = 1;
    let a = [0.8, 0.35], b = [0.45, 0.75];
    let normals = [];
    const ui = frame(fig, { title: "SimHash: the angle from bits", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 440, H = 300, S = 120, cx = W / 2, cy = H / 2 + 10;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-plot", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const bitsBox = h("div", { class: "vx-bits" });
    ui.stage.appendChild(bitsBox);
    const tools = toolbar(ui);
    slider(tools, "Planes", { min: 4, max: 64, step: 4, value: planes, format: (v) => String(v) }, (v) => { planes = v; make(); draw(); });
    button(tools, "New planes", () => { seed++; make(); draw(); });
    tools.appendChild(h("span", { class: "viz-label", text: "Drag the arrow tips." }));
    function make() {
      const rng = mulberry32(seed * 97);
      normals = Array.from({ length: planes }, () => { const t = rng() * Math.PI; return [Math.cos(t + Math.PI / 2), Math.sin(t + Math.PI / 2)]; });
    }
    let grab = null;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (e) => {
      const p = svgPoint(svg, e);
      const v = [(p.x - cx) / S, (cy - p.y) / S];
      grab = d2(v, a) < d2(v, b) ? "a" : "b";
      svg.setPointerCapture(e.pointerId);
      move(v);
    });
    svg.addEventListener("pointermove", (e) => { if (grab) { const p = svgPoint(svg, e); move([(p.x - cx) / S, (cy - p.y) / S]); } });
    svg.addEventListener("pointerup", () => { grab = null; });
    svg.addEventListener("pointercancel", () => { grab = null; });
    function move(v) {
      const L = Math.hypot(v[0], v[1]) || 1;
      const u = [v[0] / L * Math.min(1.05, Math.max(0.35, L)), v[1] / L * Math.min(1.05, Math.max(0.35, L))];
      if (grab === "a") a = u; else b = u;
      draw();
    }
    const bit = (n, v) => (n[0] * v[0] + n[1] * v[1] >= 0 ? 1 : 0);
    function draw() {
      svg.textContent = "";
      const ba = normals.map((n) => bit(n, a)), bb = normals.map((n) => bit(n, b));
      normals.forEach((n, k) => {
        const dx = -n[1], dy = n[0];
        seg(svg, cx - dx * 1.25 * S, cy + dy * 1.25 * S, cx + dx * 1.25 * S, cy - dy * 1.25 * S, ba[k] !== bb[k] ? "vx-plane is-diff" : "vx-plane");
      });
      const arrow = (v, cls, name) => {
        seg(svg, cx, cy, cx + v[0] * S, cy - v[1] * S, `vx-arrow ${cls}`);
        dot(svg, cx + v[0] * S, cy - v[1] * S, 7, `vx-tip ${cls}`);
        label(svg, cx + v[0] * S * 1.13, cy - v[1] * S * 1.13 + 4, name, `vx-name ${cls}`);
      };
      arrow(a, "c5", "a");
      arrow(b, "c0", "b");
      const ham = ba.filter((x, k) => x !== bb[k]).length;
      const angle = Math.acos(clamp((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)), -1, 1)) * 180 / Math.PI;
      const est = ham / planes * 180;
      bitsBox.textContent = "";
      bitsBox.append(cells(ba, (k) => (ba[k] !== bb[k] ? "is-bad" : ""), "a"), cells(bb, (k) => (ba[k] !== bb[k] ? "is-bad" : ""), "b"));
      ui.setCaption(`Each line through the origin gives one bit: on which side of it a vector is. **${ham} of ${planes}** bits differ (red lines): a line separates a and b with probability angle/180°, so the estimate is ${ham}/${planes} × 180° = **${fix(est, 0)}°**; the true angle is ${fix(angle, 0)}°. With 64 or 128 bits, XOR and popcount compare two hashes in a few instructions.`);
    }
    make();
    draw();
  });

  /* ============================================ chapter 24: graph indexes */

  // A navigable small world graph (Malkov et al. 2014): points inserted in a
  // random order, each linked in both directions to its m nearest among the
  // earlier ones. Links are never removed, so the early points keep the long
  // links they got while the graph was still sparse.
  function nswGraph(points, m, seed) {
    const n = points.length;
    const order = points.map((_, i) => i);
    const rng = mulberry32(seed);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const adj = points.map(() => []);
    const inserted = [];
    for (const u of order) {
      const near = inserted.map((v) => [d2(points[u], points[v]), v]).sort((a, b) => a[0] - b[0]).slice(0, m).map((x) => x[1]);
      for (const v of near) {
        adj[u].push(v);
        adj[v].push(u);
      }
      inserted.push(u);
    }
    return { adj, entry: order[0] };
  }
  // Each point linked to its k nearest (and back): only short links.
  function knnGraph(points, k) {
    const adj = points.map(() => new Set());
    points.forEach((p, u) => {
      points.map((q, v) => [d2(p, q), v]).filter(([, v]) => v !== u).sort((a, b) => a[0] - b[0]).slice(0, k).forEach(([, v]) => { adj[u].add(v); adj[v].add(u); });
    });
    return { adj: adj.map((x) => [...x]), entry: 0 };
  }
  function drawGraph(g, P, points, adj, edgeCls = () => "vx-edge") {
    const done = new Set();
    adj.forEach((list, u) => list.forEach((v) => {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      if (done.has(key)) return;
      done.add(key);
      seg(g, P.X(points[u][0]), P.Y(points[u][1]), P.X(points[v][0]), P.Y(points[v][1]), edgeCls(u, v));
    }));
  }
  const GRAPH_POINTS = clustered(mulberry32(41), 64, [[0.15, 0.2], [0.55, 0.15], [0.85, 0.35], [0.3, 0.6], [0.7, 0.75], [0.12, 0.85]], 0.08);

  /* ------------------------------------------------------- greedy search */
  register("greedy-graph", (fig) => {
    const pts = GRAPH_POINTS;
    const graphs = { knn: knnGraph(pts, 3), nsw: nswGraph(pts, 3, 9) };
    let kind = "knn";
    let q = [0.84, 0.82];
    const ui = frame(fig, { title: "Greedy search on a graph", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 300, 12);
    const tools = toolbar(ui);
    toggle(tools, "Graph", [["knn", "3 nearest"], ["nsw", "small world"]], kind, (k) => { kind = k; player.setFrames(walk()); });
    tools.appendChild(h("span", { class: "viz-label", text: "Drag to move the query." }));
    function walk() {
      const { adj } = graphs[kind];
      const start = 0;  // the same start in both graphs: a point in the lower left
      const nearest = pts.map((p, i) => [d2(p, q), i]).sort((a, b) => a[0] - b[0])[0][1];
      const frames = [];
      let cur = start, path = [start], computed = 1;
      frames.push({ cur, path: path.slice(), look: [], computed, cap: `Start at a fixed point. Its distance to the query is computed.` });
      for (;;) {
        const look = adj[cur];
        computed += look.length;
        let best = cur;
        for (const v of look) if (d2(pts[v], q) < d2(pts[best], q)) best = v;
        frames.push({ cur, path: path.slice(), look, computed, cap: `Look at the ${look.length} neighbours of the current point: compute their distances to the query.` });
        if (best === cur) {
          const ok = cur === nearest;
          frames.push({ cur, path: path.slice(), look: [], computed, done: true, nearest, cap: ok
            ? `No neighbour is nearer: stop. This **is** the nearest point, found after ${path.length - 1} steps and ${computed} distances.`
            : `No neighbour is nearer: stop. But the nearest point (ring) is elsewhere: greedy search got **stuck in a local minimum**, after ${computed} distances.` });
          break;
        }
        cur = best;
        path.push(cur);
        frames.push({ cur, path: path.slice(), look: [], computed, cap: `Move to the neighbour nearest to the query.` });
      }
      return frames;
    }
    const player = new Player(fig, {
      frames: walk(), interval: 900,
      apply: (f) => {
        const g = P.svg;
        g.textContent = "";
        const { adj } = graphs[kind];
        drawGraph(g, P, pts, adj);
        for (let i = 1; i < f.path.length; i++) seg(g, P.X(pts[f.path[i - 1]][0]), P.Y(pts[f.path[i - 1]][1]), P.X(pts[f.path[i]][0]), P.Y(pts[f.path[i]][1]), "vx-path");
        const looked = new Set(f.look);
        for (const v of f.look) seg(g, P.X(pts[f.cur][0]), P.Y(pts[f.cur][1]), P.X(pts[v][0]), P.Y(pts[v][1]), "vx-edge is-act");
        pts.forEach((p, i) => dot(g, P.X(p[0]), P.Y(p[1]), i === f.cur ? 6 : 4, i === f.cur ? "vx-pt is-cur" : looked.has(i) ? "vx-pt is-seen" : f.path.includes(i) ? "vx-pt is-path" : "vx-pt"));
        if (f.done) s("circle", { cx: P.X(pts[f.nearest][0]), cy: P.Y(pts[f.nearest][1]), r: 9, class: f.nearest === f.cur ? "vx-mark is-ok" : "vx-mark is-bad" }, g);
        diamond(g, P.X(q[0]), P.Y(q[1]));
        ui.setCaption(f.cap);
      },
    });
    dragging(P.svg, (p) => { q = P.fromSvg(p).map((v) => clamp(v, 0, 1)); player.setFrames(walk()); });
  });

  /* ---------------------------------------------------------- beam search */
  // search_layer of task 2: candidates (best first) and results (the ef best).
  function beamFrames(pts, adj, entry, q, ef) {
    const dist = (i) => d2(pts[i], q);
    const better = (a, b) => (a.d !== b.d ? a.d < b.d : a.id < b.id);
    const seen = new Set([entry]);
    let cand = [{ id: entry, d: dist(entry) }];
    let res = [{ id: entry, d: dist(entry) }];
    const frames = [];
    const snap = (o) => frames.push({ seen: new Set(seen), cand: cand.slice().sort((a, b) => (better(a, b) ? -1 : 1)), res: res.slice().sort((a, b) => (better(a, b) ? -1 : 1)), ...o });
    snap({ cap: `Start from the entry point: it is the first candidate and the first result. ef = ${ef}: keep the ${ef} best results.` });
    for (;;) {
      cand.sort((a, b) => (better(a, b) ? -1 : 1));
      const c = cand[0];
      const worst = res.reduce((w, r) => (better(w, r) ? r : w), res[0]);
      if (res.length >= ef && better(worst, c)) {
        snap({ cur: c.id, stop: true, cap: `The best candidate is worse than the worst of the ${ef} results: nothing better can come from it. **Stop.** ${seen.size} distances were computed.` });
        break;
      }
      cand.shift();
      const added = [], rejected = [];
      for (const e of adj[c.id]) {
        if (seen.has(e)) continue;
        seen.add(e);
        const n = { id: e, d: dist(e) };
        const w = res.reduce((x, r) => (better(x, r) ? r : x), res[0]);
        if (res.length < ef || better(n, w)) {
          cand.push(n);
          res.push(n);
          if (res.length > ef) res = res.filter((r) => r !== res.reduce((x, y) => (better(x, y) ? y : x), res[0]));
          added.push(e);
        } else rejected.push(e);
      }
      snap({ cur: c.id, added, rejected, cap: `Expand the best candidate: ${added.length + rejected.length ? `${added.length} new neighbour${added.length === 1 ? "" : "s"} entered the results${rejected.length ? `, ${rejected.length} ${rejected.length === 1 ? "was" : "were"} too far` : ""}` : "all its neighbours were seen before"}.` });
      if (!cand.length) { snap({ stop: true, cap: `No candidates are left. **Stop.** ${seen.size} distances were computed.` }); break; }
    }
    return frames;
  }

  register("beam-search", (fig) => {
    const pts = GRAPH_POINTS;
    const { adj } = nswGraph(pts, 3, 9);
    let ef = 3;
    let q = [0.84, 0.82];
    const ui = frame(fig, { title: "Beam search with ef", kicker: "Try it", split: true });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 300, 12);
    const lists = h("div", { class: "vx-lists" });
    ui.side.appendChild(lists);
    const tools = toolbar(ui);
    const make = () => beamFrames(pts, adj, 0, q, ef);
    slider(tools, "ef", { min: 1, max: 8, step: 1, value: ef, format: (v) => String(v) }, (v) => { ef = v; player.setFrames(make()); });
    tools.appendChild(h("span", { class: "viz-label", text: "Drag to move the query." }));
    const truth = () => new Set(pts.map((p, i) => [d2(p, q), i]).sort((a, b) => a[0] - b[0]).slice(0, ef).map((x) => x[1]));
    const chips = (items, cls) => h("div", { class: "vx-chips" }, ...items.map((it) => h("span", { class: `vx-chip ${cls(it)}` }, h("b", { text: String(it.id) }), h("span", { text: fix(Math.sqrt(it.d) * 100, 0) }))));
    const player = new Player(fig, {
      frames: make(), interval: 1100,
      apply: (f) => {
        const g = P.svg;
        g.textContent = "";
        drawGraph(g, P, pts, adj, (u, v) => (f.cur != null && (u === f.cur || v === f.cur) && !f.stop ? "vx-edge is-act" : "vx-edge"));
        const inRes = new Set(f.res.map((r) => r.id)), inCand = new Set(f.cand.map((c) => c.id));
        const real = f.stop ? truth() : null;
        pts.forEach((p, i) => {
          let cls = "vx-pt";
          if (f.seen.has(i)) cls = "vx-pt is-seen";
          if (inCand.has(i)) cls = "vx-pt is-cand";
          if (inRes.has(i)) cls = f.stop ? (real.has(i) ? "vx-pt is-near" : "vx-pt is-res") : "vx-pt is-res";
          if (i === f.cur && !f.stop) cls = "vx-pt is-cur";
          dot(g, P.X(p[0]), P.Y(p[1]), inRes.has(i) || i === f.cur ? 5.5 : 4, cls);
          if (inRes.has(i)) label(g, P.X(p[0]) + 8, P.Y(p[1]) - 6, String(i), "vx-idlbl", "start");
        });
        if (f.stop) for (const i of real) if (!inRes.has(i)) s("circle", { cx: P.X(pts[i][0]), cy: P.Y(pts[i][1]), r: 8, class: "vx-mark is-bad" }, g);
        diamond(g, P.X(q[0]), P.Y(q[1]));
        lists.textContent = "";
        lists.append(panel(`results (at most ${ef})`, "id, distance", chips(f.res, () => "is-res")), panel("candidates", "best first", f.cand.length ? chips(f.cand, (c) => (c.id === f.cur ? "is-cur" : "")) : h("span", { class: "vx-empty", text: "empty" })));
        let cap = f.cap;
        if (f.stop) {
          const hits = [...real].filter((i) => inRes.has(i)).length;
          cap += ` The results are **${hits} of the true ${ef} nearest**${hits < ef ? " (the red rings were missed)" : ""}.`;
        }
        ui.setCaption(cap);
      },
    });
    dragging(P.svg, (p) => { q = P.fromSvg(p).map((v) => clamp(v, 0, 1)); player.setFrames(make()); });
  });

  /* --------------------------------------------------------- HNSW layers */
  register("hnsw-layers", (fig) => {
    const pts = clustered(mulberry32(77), 72, [[0.2, 0.25], [0.6, 0.2], [0.85, 0.6], [0.35, 0.7], [0.65, 0.85]], 0.09);
    const n = pts.length;
    const rng = mulberry32(5);
    const level = pts.map(() => Math.min(2, Math.floor(-Math.log(1 - rng()) / Math.log(4))));
    if (!level.includes(2)) level[0] = 2;
    const layers = [0, 1, 2].map((l) => {
      const nodes = pts.map((_, i) => i).filter((i) => level[i] >= l);
      const sub = nodes.map((i) => pts[i]);
      const { adj } = nswGraph(sub, l === 0 ? 3 : 2, 13 + l);
      return { nodes, adj: adj.map((list) => list.map((k) => nodes[k])), index: new Map(nodes.map((i, k) => [i, k])) };
    });
    const entry = layers[2].nodes[0];
    const q = [0.24, 0.8];
    const dist = (i) => d2(pts[i], q);
    // Greedy on layers 2 and 1, then a beam search with ef = 4 on layer 0.
    const frames = [];
    let cur = entry, computed = 1;
    const path = [[], [], []];
    for (let l = 2; l >= 1; l--) {
      path[l].push(cur);
      frames.push({ l, cur, path: path.map((p) => p.slice()), computed, cap: l === 2 ? `Start at the entry point on the top layer (${layers[2].nodes.length} points). Its links are long.` : `Go down to layer ${l} (${layers[l].nodes.length} points) at the same point.` });
      for (;;) {
        const list = layers[l].adj[layers[l].index.get(cur)];
        computed += list.length;
        let best = cur;
        for (const v of list) if (dist(v) < dist(best)) best = v;
        if (best === cur) break;
        cur = best;
        path[l].push(cur);
        frames.push({ l, cur, path: path.map((p) => p.slice()), computed, cap: `Layer ${l}: greedy steps (ef = 1) toward the query. ${computed} distances so far.` });
      }
    }
    const nearest = pts.map((p, i) => [dist(i), i]).sort((a, b) => a[0] - b[0]).slice(0, 4).map((x) => x[1]);
    const beam = beamFrames(pts, layers[0].nodes.map((i) => layers[0].adj[layers[0].index.get(i)]), cur, q, 4);
    const last = beam[beam.length - 1];
    path[0].push(cur);
    frames.push({ l: 0, cur, path: path.map((p) => p.slice()), computed, cap: `Go down to layer 0, where all ${n} points are. The search starts close to the query already.` });
    frames.push({ l: 0, cur, path: path.map((p) => p.slice()), computed: computed + last.seen.size - 1, res: last.res.map((r) => r.id), seen: last.seen, done: true,
      cap: `On layer 0, a beam search with ef = 4 finds the 4 nearest: ${last.res.map((r) => r.id).filter((i) => nearest.includes(i)).length} of the true 4, with **${computed + last.seen.size - 1} distances** for ${n} points.` });
    const ui = frame(fig, { title: "Down the layers of HNSW", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 660, H = 250, Wp = 200;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-plot vx-layers", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    new Player(fig, {
      frames, interval: 1300,
      apply: (f) => {
        svg.textContent = "";
        [2, 1, 0].forEach((l, k) => {
          const ox = 10 + k * (Wp + 25), oy = 30, size = Wp;
          const X = (x) => ox + 8 + x * (size - 16), Y = (y) => oy + 8 + y * (size - 16);
          s("rect", { x: ox, y: oy, width: size, height: size, rx: 8, class: f.l === l ? "vx-layer is-on" : "vx-layer" }, svg);
          label(svg, ox + size / 2, 16, `layer ${l}: ${layers[l].nodes.length} points`, f.l === l ? "vx-axis-label is-on" : "vx-axis-label");
          const L = layers[l];
          L.adj.forEach((list, kk) => list.forEach((v) => { const u = L.nodes[kk]; if (u < v) seg(svg, X(pts[u][0]), Y(pts[u][1]), X(pts[v][0]), Y(pts[v][1]), "vx-edge"); }));
          const pth = f.path[l];
          for (let i = 1; i < pth.length; i++) seg(svg, X(pts[pth[i - 1]][0]), Y(pts[pth[i - 1]][1]), X(pts[pth[i]][0]), Y(pts[pth[i]][1]), "vx-path");
          pts.forEach((p, i) => {
            if (level[i] < l) return;
            let cls = "vx-pt";
            if (l === 0 && f.done && f.seen.has(i)) cls = "vx-pt is-seen";
            if (l === 0 && f.done && f.res.includes(i)) cls = "vx-pt is-near";
            if (pth.includes(i)) cls = "vx-pt is-path";
            if (i === f.cur && f.l === l && !f.done) cls = "vx-pt is-cur";
            dot(svg, X(p[0]), Y(p[1]), l === 0 ? 2.8 : 4, cls);
          });
          diamond(svg, X(q[0]), Y(q[1]), 5);
          if (k < 2) s("path", { d: `M${ox + size + 5} ${oy + size / 2}l12 0m-5 -5l5 5l-5 5`, class: "vx-down" }, svg);
        });
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------ the neighbour heuristic */
  register("select-heuristic", (fig) => {
    const base = [0.5, 0.52];
    const C = [[0.68, 0.5], [0.74, 0.44], [0.78, 0.57], [0.83, 0.49], [0.36, 0.32], [0.3, 0.27], [0.44, 0.78], [0.39, 0.84], [0.88, 0.62], [0.2, 0.6]];
    const order = C.map((p, i) => [d2(p, base), i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    let M = 3, mode = "heuristic";
    const ui = frame(fig, { title: "Choosing the neighbours of a new point", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const P = plane(ui.stage, 440, 300, 12);
    const tools = toolbar(ui);
    toggle(tools, "Rule", [["simple", "the m nearest"], ["heuristic", "the heuristic"]], mode, (m) => { mode = m; player.setFrames(make()); });
    slider(tools, "m", { min: 2, max: 5, step: 1, value: M, format: (v) => String(v) }, (v) => { M = v; player.setFrames(make()); });
    function make() {
      const frames = [{ kept: [], cap: `A new point (diamond) and ${C.length} candidates found by the search, numbered by their distance to it. Choose at most m = ${M} of them as neighbours.` }];
      const kept = [];
      for (const e of order) {
        if (kept.length >= M) break;
        if (mode === "simple") {
          kept.push(e);
          frames.push({ kept: kept.slice(), e, ok: true, cap: `Candidate ${order.indexOf(e) + 1}: take it, it is among the ${M} nearest.` });
          continue;
        }
        const blocker = kept.find((r) => d2(C[e], C[r]) < d2(C[e], base));
        if (blocker == null) {
          kept.push(e);
          frames.push({ kept: kept.slice(), e, ok: true, cap: `Candidate ${order.indexOf(e) + 1}: it is nearer to the new point than to every neighbour kept so far. **Keep it.**` });
        } else {
          frames.push({ kept: kept.slice(), e, ok: false, blocker, cap: `Candidate ${order.indexOf(e) + 1}: it is nearer to kept neighbour ${order.indexOf(blocker) + 1} than to the new point. A search can reach it through that neighbour: **skip it.**` });
        }
      }
      frames.push({ kept: kept.slice(), done: true, cap: mode === "simple"
        ? `The ${M} nearest are all on one side: a search that arrives here cannot easily go to the other groups.`
        : `The kept neighbours point in different directions, so a search can leave this point toward every group. On our data, HNSW with the simple rule reached recall 0.86 at most; with the heuristic, 1.000.` });
      return frames;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1300,
      apply: (f) => {
        const g = P.svg;
        g.textContent = "";
        for (const r of f.kept) seg(g, P.X(base[0]), P.Y(base[1]), P.X(C[r][0]), P.Y(C[r][1]), "vx-link is-ok");
        if (f.e != null && !f.done) {
          seg(g, P.X(base[0]), P.Y(base[1]), P.X(C[f.e][0]), P.Y(C[f.e][1]), f.ok ? "vx-link is-ok" : "vx-link is-faint");
          if (f.blocker != null) seg(g, P.X(C[f.e][0]), P.Y(C[f.e][1]), P.X(C[f.blocker][0]), P.Y(C[f.blocker][1]), "vx-link is-bad");
        }
        order.forEach((i, rank) => {
          const p = C[i];
          const cls = f.kept.includes(i) ? "vx-pt is-near" : i === f.e ? (f.ok ? "vx-pt is-near" : "vx-pt is-miss") : "vx-pt";
          dot(g, P.X(p[0]), P.Y(p[1]), 7, cls);
          label(g, P.X(p[0]), P.Y(p[1]) + 0.5, String(rank + 1), "vx-ptlbl");
        });
        diamond(g, P.X(base[0]), P.Y(base[1]), 8);
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------------- recall and speed */
  register("recall-qps", (fig) => {
    // Measured on 100,000 SIFT-like vectors with 1000 queries, one thread (microseconds per query).
    const SERIES = [
      { name: "HNSW, ef_construction 200", cls: "c5", knob: "ef", pts: [[10, 0.896, 7.5], [16, 0.954, 10.2], [24, 0.979, 14.4], [32, 0.990, 21.2], [48, 0.996, 26.7], [64, 0.999, 33.0], [100, 0.999, 49.1], [160, 1.0, 72.9], [320, 1.0, 122.7]] },
      { name: "HNSW, ef_construction 100", cls: "c1", knob: "ef", pts: [[10, 0.857, 8], [20, 0.933, 12], [40, 0.967, 21], [80, 0.977, 39], [160, 0.978, 71], [320, 0.978, 145]] },
      { name: "IVF, 316 lists", cls: "c0", knob: "nprobe", pts: [[1, 0.650, 20], [2, 0.854, 31], [4, 0.963, 44], [8, 0.995, 87], [16, 0.999, 129], [32, 1.0, 233]] },
      { name: "brute force, bytes", cls: "c2", knob: "", pts: [[0, 1.0, 937]] },
    ];
    let need = 0.95;
    const ui = frame(fig, { title: "Recall against speed", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 300, M = { l: 62, r: 16, t: 14, b: 40 };
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-plot vx-chart", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const legend = h("div", { class: "vx-legend" }, ...SERIES.map((sr) => h("span", { class: `vx-key ${sr.cls}`, text: sr.name })));
    ui.stage.appendChild(legend);
    const tools = toolbar(ui);
    slider(tools, "Recall needed", { min: 0.8, max: 0.995, step: 0.005, value: need, format: (v) => v.toFixed(3) }, (v) => { need = v; draw(); });
    const X = (r) => M.l + ((r - 0.6) / 0.4) * (W - M.l - M.r);
    const lq = (us) => Math.log10(1e6 / us);  // queries per second, log scale
    const Y = (us) => H - M.b - ((lq(us) - 2.5) / (5.5 - 2.5)) * (H - M.t - M.b);
    function draw() {
      svg.textContent = "";
      for (const qps of [1e3, 1e4, 1e5]) {
        const us = 1e6 / qps;
        seg(svg, M.l, Y(us), W - M.r, Y(us), "vx-grid");
        label(svg, M.l - 8, Y(us), qps >= 1e5 ? "100,000" : qps >= 1e4 ? "10,000" : "1000", "vx-tick", "end");
      }
      for (let r = 0.6; r <= 1.0001; r += 0.1) {
        seg(svg, X(r), M.t, X(r), H - M.b, "vx-grid");
        label(svg, X(r), H - M.b + 14, r.toFixed(1), "vx-tick");
      }
      label(svg, (M.l + W - M.r) / 2, H - 6, "recall@10", "vx-axis-label");
      const yl = label(svg, 14, (M.t + H - M.b) / 2, "queries per second", "vx-axis-label");
      yl.setAttribute("transform", `rotate(-90 14 ${(M.t + H - M.b) / 2})`);
      seg(svg, X(need), M.t, X(need), H - M.b, "vx-need");
      const picks = [];
      for (const sr of SERIES) {
        if (sr.pts.length > 1) s("path", { d: sr.pts.map((p, i) => `${i ? "L" : "M"}${X(p[1]).toFixed(1)} ${Y(p[2]).toFixed(1)}`).join(""), class: `vx-curve ${sr.cls}` }, svg);
        const ok = sr.pts.filter((p) => p[1] >= need).sort((a, b) => a[2] - b[2])[0];
        sr.pts.forEach((p) => {
          const c = dot(svg, X(p[1]), Y(p[2]), p === ok ? 6 : 3.5, `vx-cdot ${sr.cls}${p === ok ? " is-pick" : ""}`);
          s("title", {}, c).textContent = `${sr.name}${sr.knob ? `, ${sr.knob} ${p[0]}` : ""}: recall ${p[1]}, ${p[2]} µs per query`;
        });
        if (ok) picks.push(`${sr.name.split(",")[0]}${sr.name.includes("100") ? " (efc 100)" : ""}: **${ok[2]} µs**${sr.knob ? ` (${sr.knob} ${ok[0]})` : ""}`);
        else picks.push(`${sr.name.split(",")[0]} (efc 100): never reaches it`);
      }
      ui.setCaption(`For recall@10 of at least ${need.toFixed(3)}, the fastest setting of each method: ${picks.join("; ")}. Up and to the right is better. The graph built with ef_construction 100 stops near 0.978: searching harder cannot fix a poor graph.`);
    }
    draw();
  });

  /* ---------------------------------------------------------- prefetching */
  register("prefetch-timeline", (fig) => {
    const N = 6, WORK = 9;
    let lat = 40;
    const ui = frame(fig, { title: "Waiting for memory, with and without prefetching", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 560, H = 196, M = { l: 150, r: 12, t: 12 };
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "vx-plot vx-time", role: "img", "aria-hidden": "true" });
    ui.stage.appendChild(svg);
    const tools = toolbar(ui);
    slider(tools, "Memory latency", { min: 10, max: 120, step: 5, value: lat, format: (v) => `${v} cycles` }, (v) => { lat = v; draw(); });
    function draw() {
      svg.textContent = "";
      // Without: each neighbour's vector is loaded when its distance is computed.
      const plain = [];
      let t = 0;
      for (let i = 0; i < N; i++) { plain.push({ wait: [t, t + lat], work: [t + lat, t + lat + WORK] }); t += lat + WORK; }
      // With: all loads are started first, one per cycle, then the distances follow.
      const pre = [];
      let free = 0;
      for (let i = 0; i < N; i++) { const ready = i + lat; const st = Math.max(ready, free); pre.push({ wait: [i, ready], work: [st, st + WORK] }); free = st + WORK; }
      const total = Math.max(t, free);
      const X = (c) => M.l + (c / total) * (W - M.l - M.r);
      const rows = [["without prefetching", plain, t], ["with prefetching", pre, free]];
      rows.forEach(([name, ops, end], r) => {
        const y0 = M.t + r * 90;
        label(svg, M.l - 10, y0 + 32, name, "vx-tick is-big", "end");
        ops.forEach((o, i) => {
          const y = y0 + 4 + i * 10;
          s("rect", { x: X(o.wait[0]), y, width: Math.max(1, X(o.wait[1]) - X(o.wait[0])), height: 8, rx: 2, class: "vx-wait" }, svg);
          s("rect", { x: X(o.work[0]), y, width: Math.max(1, X(o.work[1]) - X(o.work[0])), height: 8, rx: 2, class: `vx-op c${i % 6}` }, svg);
        });
        seg(svg, X(end), y0, X(end), y0 + 64, "vx-end");
        const right = X(end) + 90 > W;
        label(svg, right ? X(end) - 5 : X(end) + 5, y0 + 74, `${end} cycles`, "vx-tick is-big", right ? "end" : "start");
      });
      ui.setCaption(`Six neighbours: grey is waiting for a vector to come from memory, colour is computing its distance (${WORK} cycles). Without prefetching the waits come one after another: **${t} cycles**. With _mm_prefetch for all six first, the waits overlap: **${free} cycles**, ${(t / free).toFixed(1)} times faster. The longer the latency, the larger the gain. On our machine, prefetching made the whole HNSW search 1.3–1.7 times faster.`);
    }
    draw();
  });
})();
