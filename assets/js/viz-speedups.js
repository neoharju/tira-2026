/* Figures for chapters 19–20: goal-directed search (A*, ALT, bidirectional
   search) and contraction hierarchies. The small examples replay the C++ code
   of the chapters on the same graphs, with the same tie-breaking (keys
   compare the distance first and the node second), so the numbers in the
   captions match the text. The road map figures run the same algorithms on a
   generated map. Part III pages load this file through the `viz` list in
   _config.yml. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, VarsPanel, frame, h, s, reduced } = V;

  /* -------------------------------------------------------------- helpers */
  const cppPanel = (parent, code) => new CodePanel(parent, code, "c++");

  // Binary min-heap of [key, node]. Ties go to the smaller node, exactly like
  // the 64-bit keys (key << 32) | node of the C++ code.
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    static less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
    push(key, node) {
      const a = this.a;
      a.push([key, node]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!Heap.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    top() { return this.a[0]; }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && Heap.less(a[l], a[m])) m = l;
          if (r < a.length && Heap.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    }
    sorted() { return this.a.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]); }
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

  const inf = (d) => (d === Infinity ? "∞" : String(d));
  const pairs = (xs) => `[${xs.map(([k, v]) => `(${k}, ${v})`).join(", ")}]`;
  const andList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

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
    tools.appendChild(h("span", { class: "viz-label", text: label }));
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

  /* ============================================== small example graphs */
  // Graph of the A* example (chapter 19). Map units: every road is at least
  // twice as long as the straight line, so h(v) = floor(2 * geo(v, t)).
  const TOWN = {
    pos: [[0, 1], [0, 5], [2, 3], [3, 5.6], [3.5, 0.5], [5, 2.5], [6.5, 5.2], [8, 1], [8, 3.5], [10.5, 5.5], [11, 2.5]],
    edges: [[0, 2, 6], [0, 4, 8], [1, 2, 6], [1, 3, 7], [2, 3, 8], [2, 4, 6], [2, 5, 8], [3, 6, 8], [4, 5, 6], [4, 7, 13],
      [5, 6, 7], [5, 8, 7], [6, 8, 5], [6, 9, 9], [7, 8, 5], [7, 10, 7], [8, 10, 9], [9, 10, 7]],
    s: 2, t: 10,
  };
  const townXY = (i) => [36 + TOWN.pos[i][0] * 46, 30 + TOWN.pos[i][1] * 41];
  const geoUnits = (a, b) => Math.hypot(TOWN.pos[a][0] - TOWN.pos[b][0], TOWN.pos[a][1] - TOWN.pos[b][1]);

  function undirectedAdj(n, edges) {
    const adj = Array.from({ length: n }, () => []);
    for (const [a, b, w] of edges) {
      adj[a].push([b, w]);
      adj[b].push([a, w]);
    }
    return adj;
  }
  const eKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  function townState(o = {}) {
    const n = TOWN.pos.length;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = townXY(i);
      nodes.push({
        id: String(i), x, y, label: String(i), r: 17,
        cls: (o.cls && o.cls[i]) || "", sub: o.sub && o.sub[i], subPos: (o.subPos && o.subPos[i]) || "below",
        badge: o.badge && o.badge[i], badgeCls: o.badgeCls && o.badgeCls[i],
      });
    }
    const edges = TOWN.edges.map(([a, b, w]) => {
      const id = eKey(a, b);
      const e = { id, a: String(a), b: String(b), label: o.elabel && o.elabel[id] != null ? o.elabel[id] : w, cls: (o.ecls && o.ecls[id]) || "" };
      if (o.dir && o.dir[id]) { e.dir = true; [e.a, e.b] = o.dir[id]; }
      return e;
    });
    const [sx, sy] = townXY(TOWN.s);
    const [tx, ty] = townXY(TOWN.t);
    const marks = [
      { id: "s", type: "text", x: sx - 26, y: sy - 18, text: "s", cls: "big cur" },
      { id: "t", type: "text", x: tx + 4, y: ty - 30, text: "t", cls: "big cur" },
    ].concat(o.marks || []);
    return { nodes, edges, marks };
  }
  const TOWN_SUBPOS = { 0: "below", 1: "above", 2: "below", 3: "below", 4: "right", 5: "above", 6: "below", 7: "above", 8: "below", 9: "below", 10: "below" };

  /* ------------------------------------------------------- A* step by step */
  const ASTAR_CODE = `while (!heap.empty()) {
    Node u = key_node(heap.pop());
    if (done[u]) continue;
    done[u] = 1;
    ++result.settled;
    if (u == target) break;
    for (std::uint32_t e = g.offset[u]; e < g.offset[u + 1]; ++e) {
        Node v = g.target[e];
        Dist d = dist[u] + g.weight[e];
        if (d < dist[v]) {
            dist[v] = d;
            heap.push(make_key(d + h(v), v));
        }
    }
}`;

  function townH(useH) {
    return Array.from({ length: TOWN.pos.length }, (_, v) => (useH ? Math.floor(2 * geoUnits(v, TOWN.t)) : 0));
  }

  function astarFrames(useH) {
    const n = TOWN.pos.length;
    const adj = undirectedAdj(n, TOWN.edges);
    const hv = townH(useH);
    const dist = new Array(n).fill(Infinity);
    const done = new Array(n).fill(false);
    const parent = new Array(n).fill(-1);
    const heap = new Heap();
    const frames = [];
    let settled = 0;
    const snap = (cap, line, cur = -1, edge = null, ecl = "act") => {
      const cls = {};
      const sub = {};
      const ecls = {};
      for (let v = 0; v < n; v++) {
        if (dist[v] !== Infinity) { cls[v] = done[v] ? "done" : "act"; sub[v] = useH ? `${dist[v]}+${hv[v]}` : String(dist[v]); }
        if (parent[v] >= 0) ecls[eKey(parent[v], v)] = "tree";
      }
      if (cur >= 0) cls[cur] = "cur";
      if (edge) ecls[edge] = ecl;
      const badge = useH ? Object.fromEntries(hv.map((x, v) => [v, x])) : null;
      frames.push({
        st: townState({ cls, sub, subPos: TOWN_SUBPOS, ecls, badge, badgeCls: {} }), cap, line,
        vars: [
          { k: "heap", v: pairs(heap.sorted().map(([k, v]) => [k, v])) },
          { k: "settled", v: String(settled) },
        ],
      });
    };
    dist[TOWN.s] = 0;
    heap.push(hv[TOWN.s], TOWN.s);
    snap(useH
      ? `Each node has a badge with **h(v)**, a lower bound for the distance to t = 10. The heap starts with the key ${hv[TOWN.s]} = 0 + h(2) for s = 2. Below a reached node: **g + h**.`
      : "Here **h(v) = 0** for every node, so the key is just the distance from s: this is Dijkstra's algorithm. The heap starts with the key 0 for s = 2.", []);
    while (heap.size) {
      const [key, u] = heap.pop();
      if (done[u]) {
        snap(`The key (${key}, ${u}) is old: node ${u} is already settled, so it is skipped.`, [2, 3], u);
        continue;
      }
      done[u] = true;
      settled++;
      if (u === TOWN.t) {
        snap(`Node ${u} is the target. It is settled with distance ${dist[u]}, so the search stops. It settled **${settled} nodes**.`, [4, 5, 6], u);
        break;
      }
      snap(useH
        ? `The smallest key is ${key} = g + h = ${dist[u]} + ${hv[u]}: node ${u} is settled. Its distance from s is ${dist[u]}.`
        : `The smallest key is ${key}: node ${u} is settled with distance ${dist[u]}.`, [2, 4, 5], u);
      for (const [v, w] of adj[u]) {
        const d = dist[u] + w;
        const e = eKey(u, v);
        if (d < dist[v]) {
          const old = dist[v];
          dist[v] = d;
          parent[v] = u;
          heap.push(d + hv[v], v);
          snap(useH
            ? `Edge ${u}–${v}: g = ${dist[u]} + ${w} = ${d}${old === Infinity ? "" : ` (was ${old})`}. The key is g + h = ${d} + ${hv[v]} = ${d + hv[v]}.`
            : `Edge ${u}–${v}: ${dist[u]} + ${w} = ${d} is ${old === Infinity ? "the first distance" : `smaller than ${old}`}, so (${d}, ${v}) goes to the heap.`, [8, 9, 10, 11, 12], u, e);
        } else if (!done[v]) {
          snap(`Edge ${u}–${v}: ${dist[u]} + ${w} = ${d} is not smaller than ${dist[v]}.`, [8, 9, 10], u, e, "ghost");
        }
      }
    }
    return frames;
  }

  register("astar-steps", (fig) => {
    let mode = "astar";
    const ui = frame(fig, {
      title: "Dijkstra and A* from s = 2 to t = 10", split: true, kicker: "Animation",
      tabs: [["dijkstra", "Dijkstra"], ["astar", "A*"]], tab: mode, onTab: (t) => { mode = t; player.setFrames(astarFrames(mode === "astar")); },
    });
    const sc = new Scene(ui.stage, { w: 580, h: 296, r: 17 });
    const code = cppPanel(ui.side, ASTAR_CODE);
    const vars = new VarsPanel(ui.side, "State");
    const player = new Player(fig, {
      frames: astarFrames(true), interval: 1150,
      apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); },
    });
  });

  /* ------------------------------------------------------- reduced costs */
  // A* exactly as in the C++ code (no re-opening of settled nodes).
  function townAstar(hv) {
    const n = TOWN.pos.length;
    const adj = undirectedAdj(n, TOWN.edges);
    const dist = new Array(n).fill(Infinity);
    const par = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    const heap = new Heap();
    dist[TOWN.s] = 0;
    heap.push(hv[TOWN.s], TOWN.s);
    while (heap.size) {
      const u = heap.pop()[1];
      if (done[u]) continue;
      done[u] = true;
      if (u === TOWN.t) break;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; par[v] = u; heap.push(dist[v] + hv[v], v); }
    }
    const path = [];
    for (let v = TOWN.t; v >= 0; v = par[v]) path.unshift(v);
    return { dist: dist[TOWN.t], path };
  }

  register("reduced-costs", (fig) => {
    let view = "reduced";
    const ui = frame(fig, {
      title: "Reduced costs w(u, v) − h(u) + h(v)", kicker: "Figure",
      tabs: [["weights", "Weights"], ["reduced", "Reduced costs"], ["bad", "Inconsistent h"]], tab: view,
      onTab: (t) => { view = t; show(); },
    });
    const sc = new Scene(ui.stage, { w: 580, h: 296, r: 17 });
    function show() {
      // "bad": h(5) = 16 = d(5, t) and 0 elsewhere: admissible, not consistent
      const hv = view === "bad" ? TOWN.pos.map((_, v) => (v === 5 ? 16 : 0)) : townH(true);
      const elabel = {};
      const ecls = {};
      const dir = {};
      let negative = 0;
      for (const [a, b, w] of TOWN.edges) {
        const id = eKey(a, b);
        if (view === "weights" || hv[a] === hv[b]) continue;
        // the direction towards t: from the larger h to the smaller h
        const [u, v] = hv[a] > hv[b] ? [a, b] : [b, a];
        const r = w - hv[u] + hv[v];
        elabel[id] = r;
        dir[id] = [String(u), String(v)];
        if (r < 0) { ecls[id] = "bad"; negative++; } else if (r === 0) ecls[id] = "ok";
      }
      const res = townAstar(hv);
      const pathCls = view === "bad" ? "c3" : "path";
      for (let i = 1; i < res.path.length; i++) {
        const id = eKey(res.path[i - 1], res.path[i]);
        if (!ecls[id]) ecls[id] = pathCls;
      }
      const badge = Object.fromEntries(hv.map((x, v) => [v, x]));
      sc.set(townState({ elabel, ecls, dir, badge, badgeCls: {} }));
      if (view === "weights") ui.setCaption("The road lengths w. The badges show h(v) = ⌊2 · geo(v, t)⌋. The shortest path 2 → 5 → 8 → 10 has length 8 + 7 + 9 = 24.");
      else if (view === "reduced") ui.setCaption("Each arrow points to the end with the smaller h, and its label is the reduced cost in that direction (the other direction costs more). All are ≥ 0, so h is **consistent**. On the path 2 → 5 → 8 → 10 they sum to 2 + 1 + 3 = 6 = 24 − h(2).");
      else ui.setCaption(`Now h(5) = 16 and h(v) = 0 elsewhere. This h never overestimates (d(5, t) = 16), but it is **not consistent**: ${negative} roads at node 5 get a negative reduced cost (red). A* settles nodes 7 and 8 before node 5 and returns ${res.path.join(" → ")} of length **${res.dist}** (yellow). The correct answer is 24.`);
    }
    show();
  });

  /* --------------------------------------------- bidirectional search */
  // s = 0, a = 1, b = 2, x = 3, t = 4, plus side streets 5 (near s) and 6 (near t).
  const BI = {
    pos: { 0: [70, 140], 1: [200, 52], 2: [380, 52], 3: [290, 168], 4: [510, 140], 5: [80, 250], 6: [500, 250] },
    labels: { 0: "s", 1: "a", 2: "b", 3: "x", 4: "t", 5: "c", 6: "d" },
    edges: [[0, 1, 6], [1, 2, 4], [2, 4, 6], [0, 3, 9], [3, 4, 9], [0, 5, 7], [4, 6, 7], [5, 3, 8], [6, 3, 8]],
  };
  const BI_CODE = `for (int dir = 0; !heap[0].empty() && !heap[1].empty(); dir ^= 1) {
    std::uint64_t top_f = key_dist(heap[0].top());
    std::uint64_t top_b = key_dist(heap[1].top());
    if (top_f + top_b >= mu) break;
    std::uint64_t key = heap[dir].pop();
    Node u = key_node(key);
    if (key_dist(key) != dist[dir][u]) continue;
    const Graph& h = *graph[dir];
    for (std::uint32_t e = h.offset[u]; e < h.offset[u + 1]; ++e) {
        Node v = h.target[e];
        Dist d = dist[dir][u] + h.weight[e];
        if (d < dist[dir][v]) {
            dist[dir][v] = d;
            heap[dir].push(make_key(d, v));
        }
        if (dist[1 - dir][v] != INF)
            mu = std::min(mu, d + dist[1 - dir][v]);
    }
}`;

  function bidirFrames(naive) {
    const n = 7;
    const adj = undirectedAdj(n, BI.edges);
    const L = (v) => BI.labels[v];
    const dist = [new Array(n).fill(Infinity), new Array(n).fill(Infinity)];
    const done = [new Array(n).fill(false), new Array(n).fill(false)];
    const par = [new Array(n).fill(-1), new Array(n).fill(-1)];
    const heap = [new Heap(), new Heap()];
    const frames = [];
    let mu = Infinity;
    let meet = null;
    const names = ["forward", "backward"];
    const snap = (cap, line, cur = -1, edge = null, extra = {}) => {
      const cls = {};
      const sub = {};
      const ecls = {};
      for (let v = 0; v < n; v++) {
        const f = done[0][v];
        const b = done[1][v];
        if (f && b) cls[v] = "c1";
        else if (f) cls[v] = "c5";
        else if (b) cls[v] = "c0";
        const parts = [];
        if (dist[0][v] !== Infinity) parts.push(`f ${dist[0][v]}`);
        if (dist[1][v] !== Infinity) parts.push(`b ${dist[1][v]}`);
        if (parts.length) sub[v] = parts.join(" · ");
        for (let d = 0; d < 2; d++) if (par[d][v] >= 0 && done[d][v]) ecls[eKey(par[d][v], v)] = d ? "c0" : "c5";
      }
      if (cur >= 0) cls[cur] = "cur";
      if (meet && !extra.final) ecls[eKey(meet[0], meet[1])] = "path";
      if (extra.path) for (const [a, b] of extra.path) ecls[eKey(a, b)] = extra.wrong ? "bad" : "path";
      if (edge) ecls[edge] = "act";
      const nodes = Object.entries(BI.pos).map(([id, [x, y]]) => ({ id, x, y, label: L(id), cls: cls[id] || "", sub: sub[id], subPos: Number(id) === 5 || Number(id) === 6 || Number(id) === 3 ? "below" : "above", r: 18 }));
      const edges = BI.edges.map(([a, b, w]) => ({ id: eKey(a, b), a: String(a), b: String(b), label: w, cls: ecls[eKey(a, b)] || "" }));
      const tf = heap[0].size ? heap[0].top()[0] : Infinity;
      const tb = heap[1].size ? heap[1].top()[0] : Infinity;
      frames.push({
        st: { nodes, edges, marks: [] }, cap, line,
        vars: [
          { k: "top_f", v: inf(tf) }, { k: "top_b", v: inf(tb) },
          { k: "top_f + top_b", v: inf(tf + tb), cls: !naive && tf + tb >= mu ? "hl" : "" },
          { k: "mu", v: inf(mu), cls: mu !== Infinity ? "ok" : "" },
        ],
      });
    };
    dist[0][0] = 0;
    heap[0].push(0, 0);
    dist[1][4] = 0;
    heap[1].push(0, 4);
    snap("The forward search starts from s (blue) and the backward search from t (orange). They take turns. **mu** is the length of the best s–t path seen so far.", []);
    for (let dir = 0; heap[0].size && heap[1].size; dir ^= 1) {
      const tf = heap[0].top()[0];
      const tb = heap[1].top()[0];
      if (!naive && tf + tb >= mu) {
        snap(`top_f + top_b = ${tf} + ${tb} = ${tf + tb} ≥ mu = ${mu}. No path can be shorter than ${mu}, so the search **stops**. The answer is ${mu}.`, [2, 3, 4]);
        break;
      }
      const [k, u] = heap[dir].pop();
      if (k > dist[dir][u]) continue;
      done[dir][u] = true;
      if (naive && done[1 - dir][u]) {
        const d = dist[0][u] + dist[1][u];
        const p = [];
        for (let d0 = 0; d0 < 2; d0++) for (let v = u; par[d0][v] >= 0; v = par[d0][v]) p.push([v, par[d0][v]]);
        snap(`Node ${L(u)} is now settled from both sides. The naive rule stops and answers d(s, ${L(u)}) + d(${L(u)}, t) = ${dist[0][u]} + ${dist[1][u]} = **${d}**. Wrong! The path s → a → b → t has length 16.`, [], u, null, { path: p, wrong: true, final: true });
        return frames;
      }
      snap(`The ${names[dir]} search settles ${L(u)} with distance ${dist[dir][u]}.`, [5, 6, 7], u);
      for (const [v, w] of adj[u]) {
        const d = dist[dir][u] + w;
        if (d < dist[dir][v]) {
          dist[dir][v] = d;
          par[dir][v] = u;
          heap[dir].push(d, v);
        }
        if (!naive && dist[1 - dir][v] !== Infinity && d + dist[1 - dir][v] < mu) {
          mu = d + dist[1 - dir][v];
          meet = [u, v];
          snap(`Edge ${L(u)}–${L(v)}: ${L(v)} was already reached by the other search. This gives an s–t path of length ${d} + ${dist[1 - dir][v]} = ${mu}, so mu = ${mu}.`, [11, 16, 17], u, eKey(u, v));
        }
      }
      if (!naive) snap(`Check: top_f + top_b = ${inf(heap[0].size ? heap[0].top()[0] : Infinity)} + ${inf(heap[1].size ? heap[1].top()[0] : Infinity)} ${(heap[0].size ? heap[0].top()[0] : Infinity) + (heap[1].size ? heap[1].top()[0] : Infinity) >= mu ? "≥" : "<"} mu = ${inf(mu)}.`, [2, 3, 4], u);
    }
    if (!naive) {
      const p = [[0, 1], [1, 2], [2, 4]];
      snap("The shortest path s → a → b → t (16) does not go through x, the first node that both searches would reach.", [], -1, null, { path: p, final: true });
    }
    return frames;
  }

  register("bidir-steps", (fig) => {
    let mode = "rule";
    const ui = frame(fig, {
      title: "Bidirectional Dijkstra from s to t", split: true, kicker: "Animation",
      tabs: [["rule", "Stopping rule"], ["naive", "Naive rule"]], tab: mode,
      onTab: (t) => { mode = t; player.setFrames(bidirFrames(mode === "naive")); },
    });
    const sc = new Scene(ui.stage, { w: 580, h: 300, r: 18 });
    const code = cppPanel(ui.side, BI_CODE);
    const vars = new VarsPanel(ui.side, "State");
    const player = new Player(fig, {
      frames: bidirFrames(false), interval: 1300,
      apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); },
    });
  });

  /* ================================================ contraction (toy) */
  const CHG = {
    pos: [[0, 0.8], [0, 4.4], [1.6, 2.6], [3.2, 2.0], [5, 1.2], [6.8, 1.0], [8.6, 1.2], [10.4, 2.0], [5.2, 4.0], [8.4, 4.0], [12, 0.8], [12, 4.4]],
    edges: [[0, 2, 3], [1, 2, 4], [0, 1, 6], [2, 3, 3], [3, 4, 4], [4, 5, 4], [5, 6, 4], [6, 7, 4], [3, 8, 6], [8, 9, 6], [9, 7, 6], [7, 10, 3], [7, 11, 4], [10, 11, 5], [5, 8, 7]],
    order: [0, 10, 4, 6, 8, 9, 1, 11, 2, 3, 7, 5],
    highway: new Set(["3-4", "4-5", "5-6", "6-7"]),
  };
  const chMapXY = (i) => [34 + CHG.pos[i][0] * 42, 34 + CHG.pos[i][1] * 44];
  const CH_RANK = (() => { const r = []; CHG.order.forEach((v, i) => { r[v] = i; }); return r; })();
  const chHierXY = (i) => [34 + CHG.pos[i][0] * 42, 262 - CH_RANK[i] * 20];

  // Undirected contraction with exact witness searches (the toy is symmetric).
  function contractToy() {
    const n = CHG.pos.length;
    const adj = Array.from({ length: n }, () => new Map());
    for (const [a, b, w] of CHG.edges) { adj[a].set(b, { w, mid: -1 }); adj[b].set(a, { w, mid: -1 }); }
    const alive = new Array(n).fill(true);
    const upEdges = [];
    function witness(u, target, skip, limit) {
      const dist = new Map([[u, 0]]);
      const par = new Map();
      const heap = new Heap();
      heap.push(0, u);
      while (heap.size) {
        const [d, x] = heap.pop();
        if (d > dist.get(x) || d > limit) continue;
        if (x === target) {
          const path = [x];
          for (let y = x; par.has(y); y = par.get(y)) path.push(par.get(y));
          return { d, path: path.reverse() };
        }
        for (const [y, { w }] of adj[x]) {
          if (!alive[y] || skip(y)) continue;
          if (d + w < (dist.has(y) ? dist.get(y) : Infinity)) { dist.set(y, d + w); par.set(y, x); heap.push(d + w, y); }
        }
      }
      return { d: Infinity, path: [] };
    }
    function shortcutsFor(v, skip) {
      const nb = [...adj[v].keys()].filter((x) => alive[x]).sort((a, b) => a - b);
      const checks = [];
      for (let i = 0; i < nb.length; i++) {
        for (let j = i + 1; j < nb.length; j++) {
          const u = nb[i];
          const w = nb[j];
          const len = adj[v].get(u).w + adj[v].get(w).w;
          const wit = witness(u, w, skip, len);
          checks.push({ u, w, len, wit, need: wit.d > len });
        }
      }
      return { nb, checks };
    }
    return { n, adj, alive, upEdges, contract(v, skip) {
      const res = shortcutsFor(v, skip || ((x) => x === v));
      for (const x of res.nb) upEdges.push([v, x, adj[v].get(x).w, adj[v].get(x).mid]);
      return res;
    }, apply(v, res) {
      alive[v] = false;
      for (const c of res.checks) {
        if (!c.need) continue;
        const old = adj[c.u].get(c.w);
        if (old && old.w <= c.len) continue;
        adj[c.u].set(c.w, { w: c.len, mid: v });
        adj[c.w].set(c.u, { w: c.len, mid: v });
      }
    } };
  }

  function chToyState(layout, o = {}) {
    const n = CHG.pos.length;
    const xy = layout === "hier" ? chHierXY : chMapXY;
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = xy(i);
      nodes.push({ id: String(i), x, y, label: String(i), r: 15, cls: (o.cls && o.cls[i]) || "", sub: o.sub && o.sub[i], subPos: (o.subPos && o.subPos[i]) || (layout === "hier" ? "right" : "below"), badge: o.badge && o.badge[i], badgeCls: o.badgeCls && o.badgeCls[i] });
    }
    const edges = [];
    for (const [a, b, w, mid] of o.edges || []) {
      const id = eKey(a, b);
      const isShortcut = mid >= 0;
      const cls = o.ecls && o.ecls[id];
      // the hierarchy view labels only the edges that matter in the current step
      const label = o.noLabels || (layout === "hier" && !isShortcut && (!cls || cls === "up")) ? null : w;
      edges.push({ id, a: String(a), b: String(b), label, cls: cls || (isShortcut ? "c1 sc" : layout === "map" && CHG.highway.has(id) ? "hw" : ""), bend: isShortcut && layout === "map" ? 0.18 : 0 });
    }
    const marks = (o.marks || []).slice();
    if (layout === "hier") marks.push({ id: "lbl", type: "text", x: 8, y: 14, text: "rank ↑", cls: "faint", anchor: "start" });
    return { nodes, edges, marks };
  }

  function currentEdges(C) {
    const out = [];
    for (let a = 0; a < C.n; a++) {
      if (!C.alive[a]) continue;
      for (const [b, { w, mid }] of C.adj[a]) if (a < b && C.alive[b]) out.push([a, b, w, mid]);
    }
    return out;
  }

  function contractionFrames(layoutOf) {
    const C = contractToy();
    const frames = [];
    let total = 0;
    let witnesses = 0;
    const removed = [];
    const snap = (cap, o = {}) => {
      const cls = Object.assign({}, o.cls || {});
      for (const v of removed) if (cls[v] == null) cls[v] = "ghost";
      const edges = currentEdges(C).concat(o.extraEdges || []).concat(layoutOf === "hier" ? C.upEdges.map(([a, b, w, mid]) => [a, b, w, mid]) : []);
      const ecls = Object.assign({}, o.ecls || {});
      if (layoutOf === "hier") for (const [a, b] of C.upEdges) if (ecls[eKey(a, b)] == null) ecls[eKey(a, b)] = "up";
      frames.push({ st: chToyState(layoutOf, { cls, edges, ecls, badge: Object.fromEntries(removed.map((v) => [v, CH_RANK[v]])), badgeCls: {} }), cap,
        vars: [{ k: "contracted", v: String(removed.length) }, { k: "shortcuts", v: String(total) }, { k: "witnesses found", v: String(witnesses) }] });
    };
    snap("The highway (thick) runs from 3 to 7. Small streets connect the villages, and a slow country road goes through 8 and 9. We contract the nodes in the order 0, 10, 4, 6, 8, 9, 1, 11, 2, 3, 7, 5.");
    for (const v of CHG.order) {
      const res = C.contract(v);
      const nbCls = Object.fromEntries(res.nb.map((x) => [x, "act"]));
      const nbText = !res.nb.length ? "It has no remaining neighbours." : res.nb.length === 1 ? `Its only remaining neighbour is ${res.nb[0]}, so no pair needs a shortcut.` : `Its remaining neighbours are ${andList(res.nb)}, so we check ${res.checks.length} pair${res.checks.length > 1 ? "s" : ""}.`;
      snap(`Contract node ${v}. ${nbText}`, { cls: { ...nbCls, [v]: "cur" } });
      for (const c of res.checks) {
        const via = `${c.u} → ${v} → ${c.w}`;
        if (!c.need) {
          witnesses++;
          const ecls = {};
          for (let i = 1; i < c.wit.path.length; i++) ecls[eKey(c.wit.path[i - 1], c.wit.path[i])] = "ok";
          snap(`Pair ${c.u}, ${c.w}: the path ${via} has length ${c.len}. A witness search finds ${c.wit.path.join(" → ")} of length ${c.wit.d} ≤ ${c.len} without ${v}. **No shortcut.**`, { cls: { ...nbCls, [v]: "cur", [c.u]: "ok", [c.w]: "ok" }, ecls });
        } else {
          snap(`Pair ${c.u}, ${c.w}: the path ${via} has length ${c.len}, and no other path is as short. **Add the shortcut ${c.u}–${c.w} with weight ${c.len}.**`, { cls: { ...nbCls, [v]: "cur", [c.u]: "cur", [c.w]: "cur" }, extraEdges: [[c.u, c.w, c.len, v]], ecls: { [eKey(c.u, c.w)]: "c1 sc is-new", [eKey(c.u, v)]: "act", [eKey(v, c.w)]: "act" } });
        }
      }
      C.apply(v, res);
      total += res.checks.filter((c) => c.need).length;
      removed.push(v);
    }
    snap(`Done: ${total} shortcuts. Each node has its rank in the badge. In the hierarchy view, every edge goes from a lower node to a higher node.`);
    return frames;
  }

  register("ch-contract", (fig) => {
    let layout = "map";
    const ui = frame(fig, {
      title: "Contracting the nodes one by one", kicker: "Animation",
      tabs: [["map", "Map"], ["hier", "Hierarchy"]], tab: layout,
      onTab: (t) => { layout = t; player.setFrames(contractionFrames(layout), true); },
    });
    const sc = new Scene(ui.stage, { w: 580, h: layout === "map" ? 270 : 290, r: 15 });
    sc.resize(580, 290);
    const vars = new VarsPanel(ui.main, "Counts");
    const player = new Player(fig, {
      frames: contractionFrames(layout), interval: 1500,
      apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); },
    });
  });

  /* ------------------------------------------------------ CH query (toy) */
  function toyHierarchy() {
    const C = contractToy();
    for (const v of CHG.order) C.apply(v, C.contract(v));
    // up[u]: edges to higher nodes (the toy is symmetric, so down = up)
    const up = Array.from({ length: C.n }, () => []);
    const mid = new Map();
    for (const [a, b, w, m] of C.upEdges) {
      up[a].push([b, w]);
      mid.set(eKey(a, b), m);
    }
    return { up, mid, edges: C.upEdges };
  }

  function chQueryFrames(s, t) {
    const H = toyHierarchy();
    const n = CHG.pos.length;
    const dist = [new Array(n).fill(Infinity), new Array(n).fill(Infinity)];
    const done = [new Array(n).fill(false), new Array(n).fill(false)];
    const par = [new Array(n).fill(-1), new Array(n).fill(-1)];
    const heap = [new Heap(), new Heap()];
    const frames = [];
    let mu = Infinity;
    let top = -1;
    const allEdges = H.edges.map(([a, b, w, m]) => [a, b, w, m]);
    const snap = (cap, layout, o = {}) => {
      const cls = {};
      const sub = {};
      const ecls = {};
      for (let v = 0; v < n; v++) {
        if (done[0][v] && done[1][v]) cls[v] = "c1";
        else if (done[0][v]) cls[v] = "c5";
        else if (done[1][v]) cls[v] = "c0";
        const parts = [];
        if (dist[0][v] !== Infinity) parts.push(`f ${dist[0][v]}`);
        if (dist[1][v] !== Infinity) parts.push(`b ${dist[1][v]}`);
        if (parts.length && !o.noSub) sub[v] = parts.join(" · ");
        for (let d = 0; d < 2; d++) if (par[d][v] >= 0 && done[d][v]) ecls[eKey(par[d][v], v)] = d ? "c0" : "c5";
      }
      if (o.cur != null) cls[o.cur] = "cur";
      Object.assign(ecls, o.ecls || {});
      Object.assign(cls, o.cls || {});
      frames.push({ st: chToyState(layout, { cls, sub, edges: o.edges || allEdges, ecls, noLabels: o.noLabels }), cap,
        vars: [{ k: "forward heap", v: pairs(heap[0].sorted()) }, { k: "backward heap", v: pairs(heap[1].sorted()) }, { k: "mu", v: inf(mu), cls: mu !== Infinity ? "ok" : "" }] });
    };
    dist[0][s] = 0;
    heap[0].push(0, s);
    dist[1][t] = 0;
    heap[1].push(0, t);
    snap(`Query from ${s} to ${t}. Both searches only go **up** in the hierarchy: the forward search (blue) from ${s} and the backward search (orange) from ${t}.`, "hier");
    for (let dir = 0; heap[0].size || heap[1].size; dir ^= 1) {
      const q = heap[dir];
      if (!q.size) continue;
      if (q.top()[0] >= mu) {
        snap(`The ${dir ? "backward" : "forward"} search stops: its smallest key ${q.top()[0]} is not smaller than mu = ${mu}.`, "hier");
        q.a.length = 0;
        continue;
      }
      const [k, u] = q.pop();
      if (k > dist[dir][u]) continue;
      done[dir][u] = true;
      let meetText = "";
      if (dist[1 - dir][u] !== Infinity && dist[dir][u] + dist[1 - dir][u] < mu) {
        mu = dist[dir][u] + dist[1 - dir][u];
        top = u;
        meetText = ` The searches meet here: mu = ${dist[0][u]} + ${dist[1][u]} = ${mu}.`;
      }
      for (const [v, w] of H.up[u]) {
        const d = dist[dir][u] + w;
        if (d < dist[dir][v]) { dist[dir][v] = d; par[dir][v] = u; heap[dir].push(d, v); }
      }
      snap(`The ${dir ? "backward" : "forward"} search settles ${u} (distance ${dist[dir][u]}) and relaxes its upward edges.${meetText}`, "hier", { cur: u });
    }
    // the up-down path
    const upPart = [];
    for (let v = top; v >= 0; v = par[0][v]) upPart.unshift(v);
    const downPart = [];
    for (let v = par[1][top]; v >= 0; v = par[1][v]) downPart.push(v);
    let path = upPart.concat(downPart);
    const pathEdges = (p) => Object.fromEntries(p.slice(1).map((v, i) => [eKey(p[i], v), "path"]));
    snap(`The shortest distance is mu = ${mu}. The path in the hierarchy is ${path.join(" → ")}: up to the top node ${top}, then down. It has ${path.length - 1} edges.`, "hier", { ecls: pathEdges(path), noSub: true });
    // unpack shortcuts one at a time
    for (;;) {
      let idx = -1;
      for (let i = 0; i + 1 < path.length; i++) if (H.mid.get(eKey(path[i], path[i + 1])) >= 0) { idx = i; break; }
      if (idx < 0) break;
      const a = path[idx];
      const b = path[idx + 1];
      const m = H.mid.get(eKey(a, b));
      path = path.slice(0, idx + 1).concat([m], path.slice(idx + 1));
      snap(`Unpack the shortcut ${a}–${b}: it was added when node ${m} was contracted, so it stands for ${a} → ${m} → ${b}.`, "hier", { ecls: pathEdges(path), noSub: true, cls: { [m]: "cur" } });
    }
    const roadEdges = CHG.edges.map(([a, b, w]) => [a, b, w, -1]);
    snap(`The path on the map: ${path.join(" → ")}, length ${mu}. It uses the highway from 3 to 7.`, "map", { edges: roadEdges, ecls: pathEdges(path), noSub: true });
    return frames;
  }

  register("ch-query", (fig) => {
    const ui = frame(fig, { title: "A CH query from 0 to 11", kicker: "Animation" });
    const sc = new Scene(ui.stage, { w: 580, h: 290, r: 15 });
    const vars = new VarsPanel(ui.main, "State");
    new Player(fig, {
      frames: chQueryFrames(0, 11), interval: 1500,
      apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); },
    });
  });

  /* ------------------------------------------- parallel rounds (toy) */
  function roundsFrames() {
    const C = contractToy();
    const pos = [];
    CHG.order.forEach((v, i) => { pos[v] = i; });
    const frames = [];
    const roundOf = {};
    let total = 0;
    let r = 0;
    const roads = CHG.edges.map(([a, b, w]) => [a, b, w, -1]);
    const snap = (cap, cur = [], final = false) => {
      const cls = {};
      const badge = {};
      for (const [v, k] of Object.entries(roundOf)) { cls[v] = final ? "" : "ghost"; badge[v] = k; }
      for (const v of cur) cls[v] = r % 2 ? "c2" : "c3";
      frames.push({ st: chToyState("map", { cls, edges: final ? roads : currentEdges(C), noLabels: final, badge, badgeCls: {} }), cap });
    };
    snap("Parallel contraction works in rounds. A node joins the round if it comes before all its remaining neighbours in the order. Then no two nodes of a round are neighbours.");
    while (C.alive.some((x) => x)) {
      r++;
      const round = [];
      for (let v = 0; v < C.n; v++) {
        if (!C.alive[v]) continue;
        let first = true;
        for (const [x] of C.adj[v]) if (C.alive[x] && pos[x] < pos[v]) first = false;
        if (first) round.push(v);
      }
      const inRound = new Set(round);
      const results = round.map((v) => [v, C.contract(v, (x) => inRound.has(x))]);
      // phase 2 keeps the smallest weight for each pair
      const best = new Map();
      const twice = [];
      for (const [v, res] of results) {
        for (const c of res.checks) {
          if (!c.need) continue;
          const key = eKey(c.u, c.w);
          if (best.has(key)) twice.push([key, best.get(key), { ...c, v }]);
          if (!best.has(key) || c.len < best.get(key).len) best.set(key, { ...c, v });
        }
      }
      const added = best.size;
      let note = "";
      for (const [key, x, y] of twice) {
        const [a, b] = x.len <= y.len ? [x, y] : [y, x];
        note += ` Nodes ${a.v} and ${b.v} both want a shortcut ${key.replace("-", "–")}, because their witness searches may not use each other. Phase 2 keeps the shorter one: ${a.len} through node ${a.v}.`;
      }
      const addText = added ? `${added} shortcut${added === 1 ? "" : "s"}` : "no shortcuts";
      snap(round.length === 1
        ? `Round ${r}: only node ${round[0]} can be contracted now. It adds ${addText}.`
        : `Round ${r}: nodes ${andList(round)} are contracted at the same time, one per thread. Their witness searches skip all nodes of the round. They add ${addText}.${note}`, round);
      for (const [v, res] of results) C.apply(v, res);
      total += added;
      for (const v of round) roundOf[v] = r;
    }
    snap(`Done in ${r} rounds with ${total} shortcuts, as many as the sequential contraction. The badge of a node is its round.`, [], true);
    return frames;
  }

  register("ch-rounds", (fig) => {
    const ui = frame(fig, { title: "Contraction in parallel rounds", kicker: "Animation" });
    const sc = new Scene(ui.stage, { w: 580, h: 270, r: 15 });
    new Player(fig, {
      frames: roundsFrames(), interval: 2200,
      apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); },
    });
  });

  /* ------------------------------------------ many-to-many min-plus (toy) */
  register("ch-table", (fig) => {
    const H = toyHierarchy();
    const n = CHG.pos.length;
    const BIG = Infinity;
    const space = (s) => {
      const dist = new Array(n).fill(Infinity);
      const heap = new Heap();
      const out = [];
      dist[s] = 0;
      heap.push(0, s);
      while (heap.size) {
        const [d, u] = heap.pop();
        if (d > dist[u]) continue;
        out.push([u, d]);
        for (const [v, w] of H.up[u]) if (d + w < dist[v]) { dist[v] = d + w; heap.push(d + w, v); }
      }
      return out;
    };
    const sources = [0, 1, 2];
    const targets = [4, 5, 6, 7, 8, 9, 10, 11];
    const rowOf = new Map();
    const rows = [];
    targets.forEach((t, j) => {
      for (const [k, d] of space(t)) {
        if (!rowOf.has(k)) { rowOf.set(k, rows.length); rows.push({ k, b: new Array(8).fill(BIG) }); }
        rows[rowOf.get(k)].b[j] = d;
      }
    });
    rows.sort((x, y) => x.k - y.k);
    rowOf.clear();
    rows.forEach((r, i) => rowOf.set(r.k, i));
    const D = sources.map(() => new Array(8).fill(BIG));
    const frames = [];
    const snapT = (cap, si, k = null, dk = null, changed = []) => frames.push({ D: D.map((r) => r.slice()), si, k, dk, changed, cap });
    snapT(`Targets ${andList(targets)} are the 8 lanes. Each row of B is a node k with d(k, t) for every target (∞ if k is not in the backward search space of t).`, -1);
    sources.forEach((s, si) => {
      const fs = space(s);
      snapT(`Source ${s}: its upward search space is ${fs.map(([k, d]) => `${k} (${d})`).join(", ")}.`, si);
      for (const [k, dk] of fs) {
        if (!rowOf.has(k)) {
          snapT(`Node ${k} (distance ${dk}) has no row in B: no backward search reached it. Skip.`, si, k, dk);
          continue;
        }
        const b = rows[rowOf.get(k)].b;
        const changed = [];
        for (let j = 0; j < 8; j++) if (dk + b[j] < D[si][j]) { D[si][j] = dk + b[j]; changed.push(j); }
        snapT(`Node ${k}: add ${dk} to all 8 lanes of row ${k} and take the minimum with row ${s} of the table. ${changed.length ? `${changed.length} lane${changed.length > 1 ? "s" : ""} got smaller.` : "Nothing changes."}`, si, k, dk, changed);
      }
    });
    snapT("Done. Every entry is the shortest distance; for example d(0, 11) = 26 as in the query above.", -1);

    const ui = frame(fig, { title: "A distance table as a min-plus product", kicker: "Animation" });
    const wrap = h("div", { class: "mp-wrap" });
    ui.stage.appendChild(wrap);
    ui.stage.classList.add("is-plain");
    const fmtv = (v) => (v === Infinity ? "∞" : String(v));
    function table(title, rowLabels, data, opts = {}) {
      const t = h("table", { class: "mp-table" });
      t.appendChild(h("caption", { text: title }));
      t.appendChild(h("tr", {}, h("th", { text: opts.corner || "" }), ...targets.map((x) => h("th", { text: `t=${x}` }))));
      data.forEach((row, i) => {
        const tr = h("tr", { class: opts.hlRow === i ? "is-hl" : "" }, h("th", { text: rowLabels[i] }));
        row.forEach((v, j) => tr.appendChild(h("td", { class: `${v === Infinity ? "is-inf" : ""}${opts.changed && opts.hlRow === i && opts.changed.includes(j) ? " is-new" : ""}`, text: fmtv(v) })));
        t.appendChild(tr);
      });
      return t;
    }
    new Player(fig, {
      frames, interval: 1600,
      apply: (f) => {
        wrap.textContent = "";
        const ri = f.k != null && rowOf.has(f.k) ? rowOf.get(f.k) : -1;
        wrap.appendChild(table("B: backward distances d(k, t)", rows.map((r) => `k=${r.k}`), rows.map((r) => r.b), { hlRow: ri, corner: "" }));
        if (ri >= 0) {
          const sum = rows[ri].b.map((v) => v + f.dk);
          wrap.appendChild(table(`d(s, ${f.k}) + B[${f.k}]`, [`+${f.dk}`], [sum], { hlRow: 0, changed: f.changed }));
        }
        wrap.appendChild(table("D: the distance table", sources.map((x) => `s=${x}`), f.D, { hlRow: f.si, changed: f.changed }));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ==================================================== the road map */
  // A generated city: a jittered grid with lakes, a few one-way streets and two
  // fast highways. Weights are travel times. The largest strongly connected
  // component is kept.
  function makeMap(seed = 20260) {
    const rnd = mulberry32(seed);
    const GW = 32;
    const GH = 20;
    const SP = 20;
    const lakes = [[9.5, 6.5, 3.3], [21.5, 13, 2.8], [17, 2.5, 1.7], [4, 15, 1.6]];
    const hwRow = 16;
    const hwCol = 26;
    const id = new Map();
    const xs = [];
    const ys = [];
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const onHw = gy === hwRow || gx === hwCol;
        if (!onHw && lakes.some(([lx, ly, r]) => Math.hypot(gx - lx, gy - ly) < r)) continue;
        id.set(gy * GW + gx, xs.length);
        xs.push(14 + gx * SP + (onHw ? 0 : (rnd() - 0.5) * 9));
        ys.push(14 + gy * SP + (onHw ? 0 : (rnd() - 0.5) * 9));
      }
    }
    const arcs = [];
    const draw = [];
    const add = (a, b, hw) => {
      const len = Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
      const w = Math.max(1, Math.round(len * (hw ? 0.45 : 1 + rnd() * 0.6)));
      const r = rnd();
      if (!hw && r < 0.05) arcs.push([a, b, w]);
      else if (!hw && r < 0.1) arcs.push([b, a, w]);
      else { arcs.push([a, b, w]); arcs.push([b, a, w]); }
      draw.push([a, b, hw]);
    };
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const a = id.get(gy * GW + gx);
        if (a == null) continue;
        const right = gx + 1 < GW ? id.get(gy * GW + gx + 1) : undefined;
        const down = gy + 1 < GH ? id.get((gy + 1) * GW + gx) : undefined;
        if (right != null && (gy === hwRow || rnd() < 0.9)) add(a, right, gy === hwRow);
        if (down != null && (gx === hwCol || rnd() < 0.9)) add(a, down, gx === hwCol);
        const diag = gx + 1 < GW && gy + 1 < GH ? id.get((gy + 1) * GW + gx + 1) : undefined;
        if (diag != null && rnd() < 0.1) add(a, diag, false);
      }
    }
    // keep the strongly connected component of a central node
    const n0 = xs.length;
    const out0 = Array.from({ length: n0 }, () => []);
    const in0 = Array.from({ length: n0 }, () => []);
    for (const [a, b] of arcs) { out0[a].push(b); in0[b].push(a); }
    const reach = (adj, s) => { const seen = new Uint8Array(n0); const st = [s]; seen[s] = 1; while (st.length) { const u = st.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } } return seen; };
    let center = 0;
    let best = Infinity;
    for (let i = 0; i < n0; i++) { const d = Math.hypot(xs[i] - 330, ys[i] - 200); if (d < best) { best = d; center = i; } }
    const f = reach(out0, center);
    const b = reach(in0, center);
    const map = [];
    const M = { x: [], y: [], w: 14 * 2 + (GW - 1) * SP, h: 14 * 2 + (GH - 1) * SP };
    for (let i = 0; i < n0; i++) if (f[i] && b[i]) { map[i] = M.x.length; M.x.push(xs[i]); M.y.push(ys[i]); }
    M.n = M.x.length;
    M.out = Array.from({ length: M.n }, () => []);
    M.in = Array.from({ length: M.n }, () => []);
    for (const [a, c, w] of arcs) if (map[a] != null && map[c] != null) { M.out[map[a]].push([map[c], w]); M.in[map[c]].push([map[a], w]); }
    M.draw = draw.filter(([a, c]) => map[a] != null && map[c] != null).map(([a, c, hw]) => [map[a], map[c], hw]);
    M.nearest = (x, y) => { let bi = 0; let bd = Infinity; for (let i = 0; i < M.n; i++) { const d = (M.x[i] - x) ** 2 + (M.y[i] - y) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
    return M;
  }

  let MAP = null;
  const theMap = () => (MAP || (MAP = makeMap()));

  function walk(par, v) {
    const p = [];
    for (; v >= 0; v = par[v]) p.push(v);
    return p.reverse();
  }

  // A* (Dijkstra when pot is null). Returns the settled nodes in order.
  function mapSearch(M, s, t, pot) {
    const dist = new Float64Array(M.n).fill(Infinity);
    const par = new Int32Array(M.n).fill(-1);
    const done = new Uint8Array(M.n);
    const heap = new Heap();
    const events = [];
    dist[s] = 0;
    heap.push(pot ? pot(s) : 0, s);
    while (heap.size) {
      const u = heap.pop()[1];
      if (done[u]) continue;
      done[u] = 1;
      events.push([u, 0]);
      if (u === t) break;
      for (const [v, w] of M.out[u]) {
        const d = dist[u] + w;
        if (d < dist[v]) { dist[v] = d; par[v] = u; heap.push(d + (pot ? pot(v) : 0), v); }
      }
    }
    return { events, dist: dist[t], path: walk(par, t) };
  }

  function mapAll(M, s, backward = false) {
    const dist = new Float64Array(M.n).fill(Infinity);
    const heap = new Heap();
    dist[s] = 0;
    heap.push(0, s);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (const [v, w] of backward ? M.in[u] : M.out[u]) if (d + w < dist[v]) { dist[v] = d + w; heap.push(d + w, v); }
    }
    return dist;
  }

  function mapBidir(M, s, t) {
    const dist = [new Float64Array(M.n).fill(Infinity), new Float64Array(M.n).fill(Infinity)];
    const par = [new Int32Array(M.n).fill(-1), new Int32Array(M.n).fill(-1)];
    const heap = [new Heap(), new Heap()];
    const events = [];
    dist[0][s] = 0;
    heap[0].push(0, s);
    dist[1][t] = 0;
    heap[1].push(0, t);
    let mu = s === t ? 0 : Infinity;
    let meet = s === t ? [s, s] : null;
    for (let dir = 0; heap[0].size && heap[1].size; dir ^= 1) {
      if (heap[0].top()[0] + heap[1].top()[0] >= mu) break;
      const [k, u] = heap[dir].pop();
      if (k > dist[dir][u]) continue;
      events.push([u, dir]);
      for (const [v, w] of dir ? M.in[u] : M.out[u]) {
        const d = dist[dir][u] + w;
        if (d < dist[dir][v]) { dist[dir][v] = d; par[dir][v] = u; heap[dir].push(d, v); }
        if (dist[1 - dir][v] !== Infinity && d + dist[1 - dir][v] < mu) { mu = d + dist[1 - dir][v]; meet = dir ? [v, u] : [u, v]; }
      }
    }
    let path = [];
    if (meet) {
      path = walk(par[0], meet[0]);
      if (meet[1] !== meet[0]) for (let v = meet[1]; v >= 0; v = par[1][v]) path.push(v);
    }
    return { events, dist: mu, path };
  }

  function geoPotential(M, t) {
    if (!M.geoC) {
      let c = Infinity;
      for (let u = 0; u < M.n; u++) for (const [v, w] of M.out[u]) { const len = Math.hypot(M.x[u] - M.x[v], M.y[u] - M.y[v]); if (len > 0) c = Math.min(c, w / len); }
      M.geoC = c * (1 - 1e-9);
    }
    const c = M.geoC;
    return (v) => Math.floor(c * Math.hypot(M.x[v] - M.x[t], M.y[v] - M.y[t]));
  }

  // Farthest-point landmarks with distance tables in both directions.
  function addLandmark(M, L) {
    let far;
    if (!L.list.length) far = mapAll(M, M.nearest(M.w / 2, M.h / 2));
    else far = L.closest;
    let next = 0;
    for (let v = 1; v < M.n; v++) if (far[v] > far[next]) next = v;
    const from = mapAll(M, next);
    const to = mapAll(M, next, true);
    L.list.push(next);
    L.from.push(from);
    L.to.push(to);
    L.closest = L.closest ? L.closest.map((d, v) => Math.min(d, from[v])) : Float64Array.from(from);
    return next;
  }
  const newLandmarks = () => ({ list: [], from: [], to: [], closest: null });
  function altPotential(L, t) {
    return (v) => {
      let best = 0;
      for (let i = 0; i < L.list.length; i++) {
        best = Math.max(best, L.from[i][t] - L.from[i][v], L.to[i][v] - L.to[i][t]);
      }
      return best;
    };
  }
  let LM8 = null;
  const landmarks8 = (M) => {
    if (!LM8) { LM8 = newLandmarks(); for (let i = 0; i < 8; i++) addLandmark(M, LM8); }
    return LM8;
  };

  /* ---------------------------------------------- contraction hierarchy */
  function buildCH(M) {
    if (M.ch) return M.ch;
    const n = M.n;
    const out = Array.from({ length: n }, () => new Map());
    const inn = Array.from({ length: n }, () => new Map());
    for (let u = 0; u < n; u++) for (const [v, w] of M.out[u]) {
      const old = out[u].get(v);
      if (!old || w < old.w) { out[u].set(v, { w, mid: -1 }); inn[v].set(u, { w, mid: -1 }); }
    }
    const contracted = new Uint8Array(n);
    const dist = new Float64Array(n).fill(Infinity);
    const touched = [];
    // witness search with a limit on settled nodes: a missed witness only adds
    // an unnecessary shortcut, which is still correct
    function witness(u, skip, limit) {
      for (const x of touched) dist[x] = Infinity;
      touched.length = 0;
      const heap = new Heap();
      dist[u] = 0;
      touched.push(u);
      heap.push(0, u);
      let settledCount = 0;
      while (heap.size && settledCount < 60) {
        const [d, x] = heap.pop();
        if (d > dist[x]) continue;
        if (d > limit) break;
        settledCount++;
        for (const [y, { w }] of out[x]) {
          if (y === skip || contracted[y]) continue;
          if (d + w < dist[y]) { if (dist[y] === Infinity) touched.push(y); dist[y] = d + w; heap.push(d + w, y); }
        }
      }
    }
    function shortcuts(v) {
      const res = [];
      let maxOut = 0;
      for (const [w, a] of out[v]) if (!contracted[w]) maxOut = Math.max(maxOut, a.w);
      for (const [u, a] of inn[v]) {
        if (contracted[u]) continue;
        witness(u, v, a.w + maxOut);
        for (const [w, b] of out[v]) {
          if (contracted[w] || w === u) continue;
          if (dist[w] > a.w + b.w) res.push([u, w, a.w + b.w, v]);
        }
      }
      return res;
    }
    const cn = new Int32Array(n);
    const degree = (v) => { let d = 0; for (const x of out[v].keys()) if (!contracted[x]) d++; for (const x of inn[v].keys()) if (!contracted[x]) d++; return d; };
    const prio = (v) => shortcuts(v).length - degree(v) + cn[v];
    const pq = new Heap();
    for (let v = 0; v < n; v++) pq.push(prio(v), v);
    const rank = new Int32Array(n);
    const up = Array.from({ length: n }, () => []);
    const down = Array.from({ length: n }, () => []);
    const mid = new Map();
    let next = 0;
    let added = 0;
    while (pq.size) {
      const [p, v] = pq.pop();
      if (contracted[v]) continue;
      const now = prio(v);
      if (now > p) { pq.push(now, v); continue; }
      rank[v] = next++;
      for (const [w, a] of out[v]) if (!contracted[w]) { up[v].push([w, a.w]); mid.set(v * n + w, a.mid); }
      for (const [u, a] of inn[v]) if (!contracted[u]) { down[v].push([u, a.w]); mid.set(u * n + v, a.mid); }
      const sc = shortcuts(v);
      contracted[v] = 1;
      for (const [a, b, w, m] of sc) {
        const old = out[a].get(b);
        if (old && old.w <= w) continue;
        out[a].set(b, { w, mid: m });
        inn[b].set(a, { w, mid: m });
        added++;
      }
      const nb = new Set();
      for (const x of out[v].keys()) if (!contracted[x]) nb.add(x);
      for (const x of inn[v].keys()) if (!contracted[x]) nb.add(x);
      for (const x of nb) { cn[x]++; pq.push(prio(x), x); }
    }
    M.ch = { rank, up, down, mid, added };
    return M.ch;
  }

  function mapCH(M, s, t) {
    const C = buildCH(M);
    const n = M.n;
    const g = [C.up, C.down];
    const dist = [new Float64Array(n).fill(Infinity), new Float64Array(n).fill(Infinity)];
    const par = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
    const heap = [new Heap(), new Heap()];
    const events = [];
    dist[0][s] = 0;
    heap[0].push(0, s);
    dist[1][t] = 0;
    heap[1].push(0, t);
    let mu = Infinity;
    let top = -1;
    for (let dir = 0; heap[0].size || heap[1].size; dir ^= 1) {
      const q = heap[dir];
      if (!q.size) continue;
      if (q.top()[0] >= mu) { q.a.length = 0; continue; }
      const [k, u] = q.pop();
      if (k > dist[dir][u]) continue;
      events.push([u, dir]);
      if (dist[1 - dir][u] !== Infinity && dist[0][u] + dist[1][u] < mu) { mu = dist[0][u] + dist[1][u]; top = u; }
      for (const [v, w] of g[dir][u]) {
        const d = dist[dir][u] + w;
        if (d < dist[dir][v]) { dist[dir][v] = d; par[dir][v] = u; q.push(d, v); }
      }
    }
    if (top < 0) return { events, dist: Infinity, path: [] };
    const hops = walk(par[0], top);
    for (let v = par[1][top]; v >= 0; v = par[1][v]) hops.push(v);
    const path = [hops[0]];
    const unpack = (a, b) => {
      const m = C.mid.get(a * n + b);
      if (m == null || m < 0) { path.push(b); return; }
      unpack(a, m);
      unpack(m, b);
    };
    for (let i = 0; i + 1 < hops.length; i++) unpack(hops[i], hops[i + 1]);
    return { events, dist: mu, path };
  }

  /* -------------------------------------------------------- map drawing */
  function mapSvg(parent, M) {
    const svg = s("svg", { viewBox: `0 0 ${M.w} ${M.h}`, class: "rr-svg", role: "presentation", focusable: "false" });
    let road = "";
    let hwy = "";
    for (const [a, b, hw] of M.draw) {
      const seg = `M${M.x[a].toFixed(1)} ${M.y[a].toFixed(1)}L${M.x[b].toFixed(1)} ${M.y[b].toFixed(1)}`;
      if (hw) hwy += seg; else road += seg;
    }
    s("path", { d: road, class: "rr-road" }, svg);
    s("path", { d: hwy, class: "rr-hwy" }, svg);
    const g = s("g", {}, svg);
    const dots = M.x.map((x, i) => s("circle", { cx: x.toFixed(1), cy: M.y[i].toFixed(1), r: 2.4, class: "rr-n" }, g));
    const path = s("path", { class: "rr-path" }, svg);
    const marks = s("g", { class: "rr-marks" }, svg);
    parent.appendChild(svg);
    return { svg, dots, path, marks };
  }

  function drawPath(view, M, p) {
    view.path.setAttribute("d", p.length ? p.map((v, i) => `${i ? "L" : "M"}${M.x[v].toFixed(1)} ${M.y[v].toFixed(1)}`).join("") : "");
  }

  function drawMarks(view, M, list) {
    view.marks.textContent = "";
    for (const m of list) {
      const x = M.x[m.node];
      const y = M.y[m.node];
      if (m.kind === "lm") {
        s("path", { d: `M${x} ${y - 7}L${x + 7} ${y}L${x} ${y + 7}L${x - 7} ${y}Z`, class: `rr-lm${m.cls ? " " + m.cls : ""}` }, view.marks);
        const t = s("text", { x, y: y - 10, class: "rr-lm-label" }, view.marks);
        t.textContent = m.text;
      } else {
        s("circle", { cx: x, cy: y, r: 7.5, class: `rr-st ${m.kind}` }, view.marks);
        const t = s("text", { x, y: y + 0.5, class: "rr-st-label" }, view.marks);
        t.textContent = m.text;
      }
    }
  }

  function svgPoint(svg, ev) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
  }

  /* -------------------------------------------------------- the race */
  const RACERS = {
    dijkstra: { name: "Dijkstra", run: (M, s, t) => mapSearch(M, s, t, null) },
    astar: { name: "A* (straight line)", run: (M, s, t) => mapSearch(M, s, t, geoPotential(M, t)) },
    alt: { name: "ALT (8 landmarks)", run: (M, s, t) => mapSearch(M, s, t, altPotential(landmarks8(M), t)) },
    bidir: { name: "Bidirectional", run: (M, s, t) => mapBidir(M, s, t) },
    ch: { name: "Contraction hierarchy", run: (M, s, t) => mapCH(M, s, t) },
  };
  const RACE_MODES = {
    intro: ["dijkstra", "astar"],
    all: ["dijkstra", "astar", "alt", "bidir"],
    ch: ["dijkstra", "ch"],
  };

  register("route-race", (fig, { mode }) => {
    const M = theMap();
    const keys = RACE_MODES[mode] || RACE_MODES.all;
    let s = mode === "intro" ? M.nearest(200, 380) : M.nearest(60, 330);
    let t = mode === "intro" ? M.nearest(500, 40) : M.nearest(600, 60);
    let clickSets = "t";
    const ui = frame(fig, { title: keys.length === 2 ? `${RACERS[keys[0]].name} vs ${RACERS[keys[1]].name}` : "Four searches, one route", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const grid = h("div", { class: `rr-grid is-${keys.length}` });
    ui.stage.appendChild(grid);
    const panels = keys.map((k) => {
      const box = h("div", { class: "rr-panel" });
      const head = h("div", { class: "rr-head" }, h("span", { class: "rr-name", text: RACERS[k].name }), h("span", { class: "rr-count" }));
      box.appendChild(head);
      grid.appendChild(box);
      const view = mapSvg(box, M);
      view.svg.addEventListener("click", (ev) => {
        const p = svgPoint(view.svg, ev);
        if (!p) return;
        const v = M.nearest(p.x, p.y);
        if (clickSets === "t") { if (v !== s) t = v; } else if (v !== t) s = v;
        run();
      });
      return { key: k, view, count: head.lastChild, box };
    });
    const tools = toolbar(ui);
    button(tools, "Race again", () => run(), "is-primary");
    button(tools, "Random route", () => {
      const rnd = Math.random;
      do { s = Math.floor(rnd() * M.n); t = Math.floor(rnd() * M.n); } while (Math.hypot(M.x[s] - M.x[t], M.y[s] - M.y[t]) < 200);
      run();
    });
    tools.appendChild(h("span", { class: "viz-sep" }));
    toggle(tools, "Click sets", [["s", "source s"], ["t", "target t"]], clickSets, (k) => { clickSets = k; });
    let raf = 0;
    function run() {
      cancelAnimationFrame(raf);
      const results = panels.map((p) => RACERS[p.key].run(M, s, t));
      for (const [i, p] of panels.entries()) {
        for (const d of p.view.dots) d.setAttribute("class", "rr-n");
        drawPath(p.view, M, []);
        drawMarks(p.view, M, [{ node: s, kind: "src", text: "s" }, { node: t, kind: "dst", text: "t" }]);
        p.count.textContent = "0 nodes";
        p.box.classList.remove("is-done");
        p.res = results[i];
        p.i = 0;
      }
      const longest = Math.max(...results.map((r) => r.events.length));
      const perFrame = Math.max(1, Math.ceil(longest / 120));
      const finish = (p) => {
        drawPath(p.view, M, p.res.path);
        p.box.classList.add("is-done");
      };
      const caption = () => {
        const parts = panels.map((p) => `${RACERS[p.key].name} ${p.res.events.length}`);
        const base = panels[0].res.events.length;
        const best = panels[panels.length - 1];
        const ratio = base / Math.max(1, best.res.events.length);
        ui.setCaption(`Settled nodes: ${parts.join(" · ")}. All find the same travel time ${panels[0].res.dist}. ${keys.length === 2 ? `${RACERS[best.key].name} settles ${ratio.toFixed(1)} times fewer nodes.` : ""} Click a map to move ${clickSets === "t" ? "the target" : "the source"}.`);
      };
      if (reduced.matches) {
        for (const p of panels) {
          for (const [v, dir] of p.res.events) p.view.dots[v].setAttribute("class", `rr-n ${dir ? "is-b" : "is-f"}`);
          p.count.textContent = `${p.res.events.length} nodes`;
          finish(p);
        }
        caption();
        return;
      }
      ui.setCaption("Each search settles the same number of nodes per frame, so the one with less work finishes first.");
      const step = () => {
        let busy = false;
        for (const p of panels) {
          if (p.i >= p.res.events.length) continue;
          const end = Math.min(p.res.events.length, p.i + perFrame);
          for (; p.i < end; p.i++) {
            const [v, dir] = p.res.events[p.i];
            p.view.dots[v].setAttribute("class", `rr-n ${dir ? "is-b" : "is-f"}`);
          }
          p.count.textContent = `${p.i} nodes`;
          if (p.i >= p.res.events.length) finish(p); else busy = true;
        }
        if (busy) raf = requestAnimationFrame(step); else caption();
      };
      raf = requestAnimationFrame(step);
    }
    // Start when the figure scrolls into view.
    let started = false;
    const start = () => { if (!started) { started = true; run(); } };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); setTimeout(start, 300); } }, { threshold: 0.4 });
      io.observe(fig);
    } else start();
    const results0 = panels.map((p) => RACERS[p.key].run(M, s, t));
    drawStatic(results0);
    function drawStatic(results) {
      panels.forEach((p, i) => { p.res = results[i]; drawMarks(p.view, M, [{ node: s, kind: "src", text: "s" }, { node: t, kind: "dst", text: "t" }]); p.count.textContent = ""; });
      ui.setCaption("Each search settles the same number of nodes per frame, so the one with less work finishes first.");
    }
  });

  /* -------------------------------------------------- ALT bound quality */
  register("alt-bound", (fig) => {
    const M = theMap();
    const L = newLandmarks();
    let kind = "alt";
    let s = M.nearest(60, 330);
    let t = M.nearest(600, 60);
    let clickSets = "t";
    const ui = frame(fig, { title: "How good is the lower bound?", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "rr-panel is-single" });
    ui.stage.appendChild(box);
    const view = mapSvg(box, M);
    const legend = h("div", { class: "rr-legend" }, h("span", { text: "bound / true distance:" }),
      ...["0–20%", "20–40%", "40–60%", "60–80%", "80–95%", "95–100%"].map((txt, i) => h("span", { class: "rr-key" }, h("i", { class: `q${i}` }), txt)));
    box.appendChild(legend);
    const tools = toolbar(ui);
    const btnAdd = button(tools, "Add a landmark", () => { if (L.list.length < 8) { addLandmark(M, L); kind = "alt"; syncKind(); show(true); } }, "is-primary");
    button(tools, "Remove landmarks", () => { Object.assign(L, newLandmarks()); show(); });
    tools.appendChild(h("span", { class: "viz-sep" }));
    const kindButtons = toggle(tools, "Bound", [["alt", "landmarks"], ["geo", "straight line"]], kind, (k) => { kind = k; show(); });
    const syncKind = () => kindButtons.forEach((b, i) => b.setAttribute("aria-pressed", String((i === 0) === (kind === "alt"))));
    tools.appendChild(h("span", { class: "viz-sep" }));
    toggle(tools, "Click sets", [["s", "source s"], ["t", "target t"]], clickSets, (k) => { clickSets = k; });
    view.svg.addEventListener("click", (ev) => {
      const p = svgPoint(view.svg, ev);
      if (!p) return;
      const v = M.nearest(p.x, p.y);
      if (clickSets === "t") { if (v !== s) t = v; } else if (v !== t) s = v;
      show();
    });
    function show(added = false) {
      const truth = mapAll(M, t, true);   // d(v, t) for every v
      const pot = kind === "geo" ? geoPotential(M, t) : altPotential(L, t);
      let sum = 0;
      let cnt = 0;
      for (let v = 0; v < M.n; v++) {
        if (v === t) { view.dots[v].setAttribute("class", "rr-n"); continue; }
        const q = truth[v] > 0 ? pot(v) / truth[v] : 1;
        sum += q;
        cnt++;
        const k = q >= 0.95 ? 5 : q >= 0.8 ? 4 : Math.min(3, Math.floor(q * 5));
        view.dots[v].setAttribute("class", `rr-n q${k}`);
      }
      const marks = [{ node: s, kind: "src", text: "s" }, { node: t, kind: "dst", text: "t" }];
      L.list.forEach((v, i) => marks.unshift({ node: v, kind: "lm", text: `L${i + 1}`, cls: added && i === L.list.length - 1 ? "is-new" : "" }));
      drawMarks(view, M, marks);
      const res = mapSearch(M, s, t, kind === "alt" && !L.list.length ? null : pot);
      drawPath(view, M, res.path);
      const dij = mapSearch(M, s, t, null).events.length;
      btnAdd.disabled = L.list.length >= 8;
      const what = kind === "geo" ? "The straight-line bound" : L.list.length ? `With ${L.list.length} landmark${L.list.length > 1 ? "s" : ""}, the bound` : "Without landmarks the bound is 0, and it";
      ui.setCaption(`${what} is on average **${Math.round((100 * sum) / cnt)}%** of the true distance to t. A* with it settles **${res.events.length}** nodes from s to t (Dijkstra: ${dij}).${kind === "alt" && L.list.length < 8 ? " Press **Add a landmark**: the next one is the node farthest from the landmarks so far." : ""}`);
    }
    show();
  });

  /* ------------------------------------------------- SIMD lanes (ALT) */
  const SIMD_CODE = `auto from = _mm256_load_si256((const __m256i*)rows[v].from);
auto to = _mm256_load_si256((const __m256i*)rows[v].to);
__m256i a = _mm256_sub_epi32(t_from, from);   // d(L,t) - d(L,v)
__m256i b = _mm256_sub_epi32(to, t_to);       // d(v,L) - d(t,L)
__m256i m = _mm256_max_epi32(a, b);           // 8 candidates
__m128i x = _mm_max_epi32(_mm256_castsi256_si128(m),
                          _mm256_extracti128_si256(m, 1));  // 4
x = _mm_max_epi32(x, _mm_shuffle_epi32(x, _MM_SHUFFLE(1, 0, 3, 2)));  // 2
x = _mm_max_epi32(x, _mm_shuffle_epi32(x, _MM_SHUFFLE(2, 3, 0, 1)));  // 1
return static_cast<Dist>(std::max(_mm_cvtsi128_si32(x), 0));`;

  register("alt-simd", (fig) => {
    const M = theMap();
    const L = landmarks8(M);
    const v = M.nearest(200, 230);
    const t = M.nearest(520, 110);
    const tFrom = L.from.map((d) => d[t]);
    const tTo = L.to.map((d) => d[t]);
    const from = L.from.map((d) => d[v]);
    const to = L.to.map((d) => d[v]);
    const a = tFrom.map((x, i) => x - from[i]);
    const b = to.map((x, i) => x - tTo[i]);
    const m = a.map((x, i) => Math.max(x, b[i]));
    const x4 = [0, 1, 2, 3].map((i) => Math.max(m[i], m[i + 4]));
    const x2 = [Math.max(x4[0], x4[2]), Math.max(x4[1], x4[3]), Math.max(x4[2], x4[0]), Math.max(x4[3], x4[1])];
    const x1 = [Math.max(x2[0], x2[1]), Math.max(x2[1], x2[0]), Math.max(x2[2], x2[3]), Math.max(x2[3], x2[2])];
    const result = Math.max(x1[0], 0);
    const truth = mapAll(M, t, true)[v];
    const R = (name, vals, note) => ({ name, vals, note });
    const rows = [
      R("t_from", tFrom, "d(Lᵢ, t), loaded once per query"),
      R("from", from, "d(Lᵢ, v)"),
      R("a", a, "t_from − from"),
      R("to", to, "d(v, Lᵢ)"),
      R("t_to", tTo, "d(t, Lᵢ), loaded once per query"),
      R("b", b, "to − t_to"),
      R("m", m, "max(a, b) in every lane"),
      R("x (4 lanes)", x4, "max of the low and the high half"),
      R("x (2 lanes)", x2, "swap the 64-bit halves, max"),
      R("x (1 lane)", x1, "swap neighbours, max"),
    ];
    const steps = [
      { show: 0, hl: [], line: [], cap: `Before the query starts, the 8 distances between the landmarks and the target t are loaded into **t_from** and **t_to**. Now we compute h(v) for one node v.` },
      { show: 2, hl: [1], line: [1], cap: "One 256-bit load brings d(Lᵢ, v) for all 8 landmarks. They are the first half of the node's 64-byte row." },
      { show: 3, hl: [2], line: [3], cap: "One subtraction gives the first bound d(Lᵢ, t) − d(Lᵢ, v) for all 8 landmarks at once." },
      { show: 5, hl: [3], line: [2], cap: "The second load brings d(v, Lᵢ), the second half of the same cache line." },
      { show: 6, hl: [5], line: [4], cap: "The second subtraction gives d(v, Lᵢ) − d(t, Lᵢ) for all 8 landmarks." },
      { show: 7, hl: [6], line: [5], cap: "max(a, b) keeps the better bound of each landmark. Now we need the largest of the 8 lanes: a **horizontal** maximum." },
      { show: 8, hl: [7], line: [6, 7], cap: "Take the high 128 bits and the low 128 bits and compute their maximum: 4 lanes are left." },
      { show: 9, hl: [8], line: [8], cap: "Swap the two 64-bit halves with a shuffle and take the maximum again: 2 different lanes are left." },
      { show: 10, hl: [9], line: [9, 10], cap: `Swap neighbouring lanes and take the maximum: every lane now holds the answer. Lane 0 is read out, and a negative value would become 0: **h(v) = ${result}**. The true distance is d(v, t) = ${truth}.` },
    ];
    const ui = frame(fig, { title: "The ALT bound with AVX2", split: true, kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const grid = h("div", { class: "ln-grid" });
    ui.stage.appendChild(grid);
    const code = cppPanel(ui.side, SIMD_CODE);
    function draw(st) {
      grid.textContent = "";
      grid.appendChild(h("div", { class: "ln-row is-head" }, h("span", { class: "ln-name", text: "lane" }), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => h("span", { class: "ln-cell", text: String(i) })), h("span", { class: "ln-note" })));
      rows.forEach((r, i) => {
        const visible = i < st.show || (i <= 1 && st.show === 0 && i === 0) || i === 4 && st.show >= 0;
        if (!visible && !(i === 0 || i === 4)) return;
        const width = i >= 7 ? [4, 2, 1][i - 7] : 8;
        const cells = r.vals.map((val, j) => h("span", { class: `ln-cell${j >= width ? " is-dup" : ""}${val < 0 ? " is-neg" : ""}`, text: String(val) }));
        grid.appendChild(h("div", { class: `ln-row${st.hl.includes(i) ? " is-hl" : ""}${i === 0 || i === 4 ? " is-const" : ""}` }, h("span", { class: "ln-name", text: r.name }), ...cells, h("span", { class: "ln-note", text: r.note })));
      });
    }
    new Player(fig, {
      frames: steps, interval: 2100,
      apply: (f) => { draw(f); code.set(f.line); ui.setCaption(f.cap); },
    });
  });
})();
