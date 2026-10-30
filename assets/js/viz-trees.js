/* Tree figures: chapter 7 (trees, recursion, n queens), chapter 12 (binary
   search trees), AVL trees and heaps. Binary trees are laid out by in-order
   index, so a rotation only moves nodes up and down — the in-order sequence
   (the order of the keys) never changes. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, OutputPanel, VarsPanel, frame, h, s } = V;
  const list = (xs) => xs.join(", ").replace(/, ([^,]*)$/, " ja $1");

  /* =============================================== Chapter 7: a tree */
  const PUU = {
    pos: { 1: [210, 40], 4: [95, 135], 5: [210, 135], 2: [325, 135], 3: [40, 232], 7: [150, 232], 6: [325, 232] },
    children: { 1: ["4", "5", "2"], 4: ["3", "7"], 5: [], 2: ["6"], 3: [], 7: [], 6: [] },
  };
  const parentOf = {};
  for (const [p, cs] of Object.entries(PUU.children)) for (const c of cs) parentOf[c] = p;
  const depthOf = (v) => (parentOf[v] ? depthOf(parentOf[v]) + 1 : 0);
  const subtree = (v) => [v].concat(...PUU.children[v].map(subtree));

  function treeState(o = {}) {
    const nodes = Object.entries(PUU.pos).map(([id, [x, y]]) => ({
      id, x, y, label: id, cls: (o.cls && o.cls[id]) || "", sub: o.sub && o.sub[id], subPos: o.subPos || "below",
      click: !!o.click, badge: o.badge && o.badge[id], badgeCls: o.badgeCls && o.badgeCls[id],
    }));
    const edges = [];
    for (const [p, cs] of Object.entries(PUU.children)) for (const c of cs) edges.push({ id: `${p}-${c}`, a: p, b: c, cls: (o.ecls && o.ecls[`${p}-${c}`]) || "" });
    return { nodes, edges, marks: o.marks || [] };
  }

  register("tree", (fig) => {
    const views = [
      ["root", "Juuri"], ["children", "Lapset"], ["leaves", "Lehdet"], ["subtree", "Alipuu"], ["depth", "Syvyys"], ["height", "Korkeus"],
    ];
    let view = "root";
    const ui = frame(fig, { title: "Puun käsitteet", kicker: "Kokeile", tabs: views, tab: view, onTab: (t) => { view = t; show(); } });
    const sc = new Scene(ui.stage, { w: 420, h: 272 });
    function show(clicked) {
      if (clicked) {
        const v = clicked;
        const cs = PUU.children[v];
        const cls = { [v]: "cur" };
        cs.forEach((c) => { cls[c] = "act"; });
        if (parentOf[v]) cls[parentOf[v]] = "done";
        sc.set(treeState({ cls, click: true, ecls: Object.fromEntries(cs.map((c) => [`${v}-${c}`, "act"]).concat(parentOf[v] ? [[`${parentOf[v]}-${v}`, "done"]] : [])) }));
        ui.setCaption(`Solmu ${v}: syvyys ${depthOf(v)}, ${parentOf[v] ? `vanhempi ${parentOf[v]}` : "ei vanhempaa (juuri)"}, ${cs.length ? `lapset ${list(cs)}` : "ei lapsia (lehti)"} ja alipuussa ${subtree(v).length} ${subtree(v).length === 1 ? "solmu" : "solmua"}.`);
        return;
      }
      if (view === "root") {
        sc.set(treeState({ cls: { 1: "cur" }, click: true }));
        ui.setCaption("Puun ylin solmu on **juuri**. Tässä puussa juuri on solmu 1. Klikkaa mitä tahansa solmua nähdäksesi sen tiedot.");
      } else if (view === "children") {
        sc.set(treeState({ cls: { 1: "cur", 4: "act", 5: "act", 2: "act" }, ecls: { "1-4": "act", "1-5": "act", "1-2": "act" }, click: true }));
        ui.setCaption("Solmun 1 **lapset** ovat solmut 4, 5 ja 2. Vastaavasti solmun 4 **vanhempi** on solmu 1.");
      } else if (view === "leaves") {
        sc.set(treeState({ cls: { 3: "okf", 7: "okf", 5: "okf", 6: "okf" }, click: true }));
        ui.setCaption("Solmut, joilla ei ole lapsia, ovat **lehtiä**: 3, 7, 5 ja 6.");
      } else if (view === "subtree") {
        sc.set(treeState({ cls: { 4: "cur", 3: "act", 7: "act" }, ecls: { "4-3": "act", "4-7": "act" }, click: true, marks: [{ id: "h", type: "hull", nodes: ["4", "3", "7"], cls: "c0", pad: 10 }] }));
        ui.setCaption("Solmun 4 **alipuu** sisältää solmut 4, 3 ja 7. Solmun 1 alipuu sisältää koko puun.");
      } else if (view === "depth") {
        const sub = {};
        for (const v of Object.keys(PUU.pos)) sub[v] = `syvyys ${depthOf(v)}`;
        const marks = [0, 1, 2].map((d) => ({ id: `d${d}`, type: "text", x: 412, y: [40, 135, 232][d], text: `${d}`, cls: "faint mono", anchor: "end" }));
        sc.set(treeState({ sub, marks, click: true }));
        ui.setCaption("Juuren **syvyys** on 0 ja jokaisen muun solmun syvyys on yhtä suurempi kuin sen vanhemman syvyys.");
      } else {
        sc.set(treeState({ cls: { 3: "cur", 7: "cur", 6: "cur" }, ecls: { "1-4": "act", "4-3": "act", "4-7": "act", "1-2": "act", "2-6": "act" }, click: true }));
        ui.setCaption("Puun **korkeus** on suurin solmun syvyys. Tässä korkeus on 2, koska solmujen 3, 7 ja 6 syvyys on 2.");
      }
    }
    sc.onNodeClick = (id) => show(id);
    show();
  });

  // Recursive functions on the tree: traverse (enter/leave), count_nodes, count_height.
  const REC_CODE = {
    traverse: `def traverse(node):
    print("enter", node.value)
    for child in node.children:
        traverse(child)
    print("leave", node.value)`,
    count: `def count_nodes(node):
    result = 1
    for child in node.children:
        result += count_nodes(child)
    print("subtree of node", node, "has", result, "nodes")
    return result`,
    height: `def count_height(node):
    result = 0
    for child in node.children:
        result = max(result, count_height(child) + 1)
    return result`,
  };
  function recursionFrames(kind) {
    const frames = [];
    const out = [];
    const stack = [];
    const result = {};
    const done = {};
    const fname = kind === "traverse" ? "traverse" : kind === "count" ? "count_nodes" : "count_height";
    const snap = (cap, line, edge) => {
      const cls = {};
      const sub = {};
      for (const [v, r] of Object.entries(done)) { cls[v] = "done"; if (kind !== "traverse") sub[v] = `= ${r}`; }
      stack.forEach((v) => { cls[v] = "act"; if (kind !== "traverse") sub[v] = `result ${result[v]}`; });
      if (stack.length) cls[stack[stack.length - 1]] = "cur";
      const ecls = {};
      for (let i = 1; i < stack.length; i++) ecls[`${stack[i - 1]}-${stack[i]}`] = "act";
      if (edge) ecls[edge] = "act";
      frames.push({ st: treeState({ cls, sub, ecls }), cap, line, out: out.slice(),
        vars: [{ k: "kutsupino", v: stack.length ? stack.map((v) => `${fname}(${v})`).join(" → ") : "tyhjä" }] });
    };
    function rec(v) {
      stack.push(v);
      if (kind === "traverse") { out.push(`enter ${v}`); snap(`\`traverse(${v})\` alkaa ja tulostaa \`enter ${v}\`.`, 2); }
      else { result[v] = kind === "count" ? 1 : 0; snap(`\`${fname}(${v})\` alkaa: \`result = ${result[v]}\`.`, 2); }
      for (const c of PUU.children[v]) {
        snap(`Solmun ${v} lapsi ${c}: kutsutaan rekursiivisesti \`${fname}(${c})\`.`, [3, 4], `${v}-${c}`);
        const r = rec(c);
        if (kind === "count") { result[v] += r; snap(`Kutsu palautti ${r}, joten solmun ${v} \`result\` kasvaa arvoon ${result[v]}.`, 4); }
        else if (kind === "height") { const nv = Math.max(result[v], r + 1); snap(`Kutsu palautti ${r}: \`result = max(${result[v]}, ${r} + 1) = ${nv}\`.`, 4); result[v] = nv; }
      }
      if (kind === "traverse") { out.push(`leave ${v}`); snap(`Solmun ${v} lapset on käsitelty: tulostetaan \`leave ${v}\`.`, 5); }
      else if (kind === "count") { out.push(`subtree of node ${v} has ${result[v]} nodes`); snap(`Solmun ${v} alipuussa on ${result[v]} ${result[v] === 1 ? "solmu" : "solmua"}: tulostus ja paluu.`, [5, 6]); }
      else snap(`\`count_height(${v})\` palauttaa ${result[v]}.`, 5);
      done[v] = result[v];
      stack.pop();
      return result[v];
    }
    snap(kind === "traverse" ? "Kutsutaan `traverse(tree)`, missä `tree` on juurisolmu 1." : `Kutsutaan \`${fname}(tree)\`, missä \`tree\` on juurisolmu 1.`, 1);
    rec("1");
    snap(kind === "traverse" ? "Kaikki solmut on käyty läpi." : kind === "count" ? "Puussa on 7 solmua." : "Puun korkeus on 2.", []);
    return frames;
  }
  register("tree-recursion", (fig, { mode }) => {
    let kind = mode || "count";
    const ui = frame(fig, { title: "Rekursio puussa", split: true, kicker: "Animaatio",
      tabs: [["traverse", "traverse"], ["count", "count_nodes"], ["height", "count_height"]], tab: kind, onTab: (t) => { kind = t; build(); } });
    const sc = new Scene(ui.stage, { w: 420, h: 272 });
    let code = null;
    let out = null;
    let vars = null;
    let player = null;
    function build() {
      ui.side.textContent = "";
      code = new CodePanel(ui.side, REC_CODE[kind]);
      out = kind === "height" ? null : new OutputPanel(ui.side);
      vars = new VarsPanel(ui.side, "Kutsupino");
      const frames = recursionFrames(kind);
      const apply = (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); if (out) out.set(f.out); vars.set(f.vars); };
      if (player) player.destroy();
      player = new Player(fig, { frames, interval: 1100, apply });
    }
    build();
  });

  /* ======================================================== n queens */
  function attack(a, b) {
    return a[0] === b[0] || a[1] === b[1] || Math.abs(a[0] - b[0]) === Math.abs(a[1] - b[1]);
  }

  // Draws an n×n board into an <svg>; returns update(queens, opts).
  function board(parent, n, size, x0 = 0, y0 = 0, onClick = null) {
    const g = s("g", { transform: `translate(${x0} ${y0})` }, parent);
    const c = size / n;
    const cells = [];
    for (let r = 0; r < n; r++) {
      cells.push([]);
      for (let q = 0; q < n; q++) {
        const rect = s("rect", { x: q * c, y: r * c, width: c, height: c, class: (r + q) % 2 ? "vz-cell-dark" : "vz-cell-light" }, g);
        cells[r].push(rect);
        if (onClick) {
          const hit = s("rect", { x: q * c, y: r * c, width: c, height: c, class: "vz-board-hit" }, g);
          hit.addEventListener("click", () => onClick(r, q));
        }
      }
    }
    s("rect", { x: 0, y: 0, width: size, height: size, class: "vz-board-frame", rx: 4 }, g);
    const qg = s("g", {}, g);
    return function update(queens, o = {}) {
      for (let r = 0; r < n; r++) {
        for (let q = 0; q < n; q++) {
          let cls = (r + q) % 2 ? "vz-cell-dark" : "vz-cell-light";
          if (o.shade && queens.some((p) => attack(p, [r, q]))) cls = "vz-cell-attack";
          if (o.hit && o.hit.some(([a, b]) => a === r && b === q)) cls = "vz-cell-hit";
          cells[r][q].setAttribute("class", cls);
        }
      }
      qg.textContent = "";
      for (const [r, q] of queens) {
        const bad = o.badQueens && o.badQueens.some(([a, b]) => a === r && b === q);
        const t = s("text", { x: q * c + c / 2, y: r * c + c / 2 + 1, class: `vz-queen${bad ? " bad" : ""}` }, qg);
        t.textContent = "♛";
        t.style.fontSize = `${c * 0.62}px`;
      }
    };
  }

  register("queens", (fig, { mode }) => {
    if (mode === "search") return queensSearch(fig);
    let tab = "solutions";
    let n = 4;
    let queens = [];
    const ui = frame(fig, { title: "Kuningattaret", kicker: "Kokeile", tabs: [["solutions", "Ratkaisut"], ["try", "Kokeile itse"]], tab, onTab: (t) => { tab = t; show(); } });
    const svg = s("svg", { class: "vz-svg", viewBox: "0 0 440 210" }, ui.stage);
    const tools = h("div", { class: "viz-tools" });
    function show() {
      svg.textContent = "";
      tools.remove();
      if (tab === "solutions") {
        svg.setAttribute("viewBox", "0 0 440 210");
        board(svg, 4, 180, 25, 15)([[0, 1], [1, 3], [2, 0], [3, 2]]);
        board(svg, 4, 180, 235, 15)([[0, 2], [1, 0], [2, 3], [3, 1]]);
        ui.setCaption("Kun n = 4, ratkaisuja on 2. Kummassakin ratkaisussa jokaisella rivillä, sarakkeella ja vinorivillä on enintään yksi kuningatar.");
      } else {
        tools.textContent = "";
        tools.append(h("span", { class: "viz-label", text: "Laudan koko" }));
        for (const k of [4, 5, 6, 8]) {
          const b = h("button", { type: "button", class: `viz-btn is-text${k === n ? " is-primary" : ""}`, text: `${k} × ${k}` });
          b.addEventListener("click", () => { n = k; queens = []; show(); });
          tools.append(b);
        }
        const clear = h("button", { type: "button", class: "viz-btn is-text", text: "Tyhjennä" });
        clear.addEventListener("click", () => { queens = []; draw(); });
        tools.append(h("span", { class: "viz-sep" }), clear);
        ui.main.after(tools);
        svg.setAttribute("viewBox", "0 0 440 300");
        const update = board(svg, n, 280, 80, 10, (r, q) => {
          const i = queens.findIndex(([a, b]) => a === r && b === q);
          if (i >= 0) queens.splice(i, 1);
          else if (queens.length === n) { ui.setCaption(`Laudalla on jo ${n} kuningatarta. Poista ensin jokin kuningatar klikkaamalla sitä.`); return; }
          else queens.push([r, q]);
          draw();
        });
        function draw() {
          const bad = queens.filter((p) => queens.some((o) => o !== p && attack(o, p)));
          update(queens, { shade: true, badQueens: bad });
          if (bad.length) ui.setCaption(`Punaiset kuningattaret uhkaavat toisiaan. Kuningattaria ${queens.length}/${n}.`);
          else if (queens.length === n) ui.setCaption(`**Ratkaisu löytyi!** ${n} kuningatarta, joista mitkään kaksi eivät uhkaa toisiaan.`);
          else ui.setCaption(`Sijoita ${n} kuningatarta klikkaamalla ruutuja. Varjostetut ruudut ovat uhattuina. Kuningattaria ${queens.length}/${n}.`);
        }
        draw();
      }
    }
    show();
  });

  function queensSearch(fig) {
    const n = 4;
    const ui = frame(fig, { title: "Peruuttava haku, n = 4", split: true, kicker: "Animaatio" });
    const W = 440;
    const sc = new Scene(ui.stage, { w: W, h: 250, r: 11 });
    const boardSvg = s("svg", { class: "vz-svg", viewBox: "0 0 200 200" }, h("div"));
    const bp = h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "Ruudukko" }), h("span", { class: "qs-count" })));
    bp.appendChild(boardSvg);
    boardSvg.style.maxWidth = "220px";
    boardSvg.style.margin = ".5rem auto";
    ui.side.appendChild(bp);
    const update = board(boardSvg, n, 184, 8, 8);

    // Build the search tree (valid placements are explored, attacked ones pruned).
    const tree = [];
    function rec(row, queens, parent, depth) {
      const id = tree.length;
      tree.push({ id, parent, depth, queens: queens.slice(), kids: [], valid: true, solution: row === n });
      if (parent != null) tree[parent].kids.push(id);
      if (row === n) return;
      for (let col = 0; col < n; col++) {
        const hits = queens.filter((q) => attack(q, [row, col]));
        if (hits.length) {
          const pid = tree.length;
          tree.push({ id: pid, parent: id, depth: depth + 1, queens: queens.concat([[row, col]]), kids: [], valid: false, hits });
          tree[id].kids.push(pid);
        } else rec(row + 1, queens.concat([[row, col]]), id, depth + 1);
      }
    }
    rec(0, [], null, 0);
    // Layout over explored nodes only; pruned attempts are small dots fanned
    // out just below their parent, so they take no horizontal space.
    let leaf = 0;
    const X = {};
    (function place(id) {
      const vk = tree[id].kids.filter((k) => tree[k].valid);
      if (!vk.length) X[id] = leaf++;
      else { vk.forEach(place); X[id] = (X[vk[0]] + X[vk[vk.length - 1]]) / 2; }
    })(0);
    const step = Math.min(58, (W - 40) / Math.max(1, leaf - 1));
    const x0 = (W - step * (leaf - 1)) / 2;
    const pos = (id) => {
      const t = tree[id];
      if (t.valid) return [x0 + X[id] * step, 22 + t.depth * 52];
      const [px, py] = pos(t.parent);
      const col = t.queens[t.queens.length - 1][1];
      return [px + (col - (n - 1) / 2) * 11, py + 24];
    };

    const frames = [];
    const shown = new Set();
    let solutions = 0;
    const snap = (cur, cap, extra = {}) => {
      const nodes = [];
      const edges = [];
      for (const id of shown) {
        const t = tree[id];
        const [x, y] = pos(id);
        let cls = t.valid ? (t.solution ? "okf" : "done") : "prune";
        if (id === cur) cls = t.valid ? (t.solution ? "okf" : "cur") : "prune is-cur";
        // Pruned attempts are small unlabeled dots; the board panel shows which square was tried.
        nodes.push({ id: `t${id}`, x, y, r: t.valid ? 10 : 3.6, label: t.depth && t.valid ? String(t.queens[t.queens.length - 1][1]) : "", cls: `${cls} is-small is-mono` });
        if (t.parent != null) edges.push({ id: `e${id}`, a: `t${t.parent}`, b: `t${id}`, cls: t.valid ? (id === cur ? "act" : "") : "bad" });
      }
      frames.push({ st: { nodes, edges }, cap, queens: tree[cur].queens, hits: extra.hits || [], bad: extra.bad || [], solutions });
    };
    (function walk(id) {
      const t = tree[id];
      shown.add(id);
      if (!t.valid) {
        const last = t.queens[t.queens.length - 1];
        snap(id, `Rivin ${last[0]} sarake ${last[1]}: kuningatar olisi uhattuna, joten tätä vaihtoehtoa ei tutkita.`, { hits: [last], bad: t.hits });
        return;
      }
      if (t.solution) { solutions++; snap(id, `Kaikki ${n} kuningatarta on sijoitettu: löytyi ratkaisu numero ${solutions}!`); return; }
      snap(id, id === 0 ? "Haku alkaa tyhjästä ruudukosta. Puun solmun luku kertoo sarakkeen, johon kuningatar lisättiin." : `Kuningatar rivillä ${t.queens.length - 1} sarakkeessa ${t.queens[t.queens.length - 1][1]} ei uhkaa muita: jatketaan seuraavalle riville.`);
      t.kids.forEach(walk);
    })(0);
    const lastSolution = tree.filter((x) => x.solution).pop();
    frames.push({ ...frames[frames.length - 1], cap: `Haku on käynyt läpi kaikki vaihtoehdot ja löytänyt ${solutions} ratkaisua (vihreät solmut). Ruudukossa on viimeksi löydetty ratkaisu.`, queens: lastSolution.queens, hits: [], bad: [] });
    const cnt = bp.querySelector(".qs-count");
    new Player(fig, { frames, interval: 900, apply: (f, i, instant) => {
      sc.set(f.st, instant);
      ui.setCaption(f.cap);
      update(f.queens, { hit: f.hits, badQueens: f.hits.length ? [...f.bad, ...f.hits] : [] });
      cnt.textContent = `ratkaisuja ${f.solutions}`;
    } });
  }

  /* ================================================ Binary search trees */
  let uid = 0;
  const node = (key) => ({ id: `n${++uid}`, key, left: null, right: null });
  function build(keys) {
    let root = null;
    for (const k of keys) root = bstInsert(root, k);
    return root;
  }
  function bstInsert(root, k) {
    if (!root) return node(k);
    let cur = root;
    for (;;) {
      if (cur.key === k) return root;
      if (k < cur.key) { if (!cur.left) { cur.left = node(k); return root; } cur = cur.left; }
      else { if (!cur.right) { cur.right = node(k); return root; } cur = cur.right; }
    }
  }
  function inorder(t, out = []) { if (t) { inorder(t.left, out); out.push(t); inorder(t.right, out); } return out; }
  const heightOf = (t) => (t ? 1 + Math.max(heightOf(t.left), heightOf(t.right)) : -1);

  // in-order layout: x by in-order index, y by depth
  function treeLayout(root, { w, x0 = 0, top = 34, gap = 62, step = 52 }) {
    const nodes = inorder(root);
    const st = Math.min(step, nodes.length > 1 ? (w - 40) / (nodes.length - 1) : step);
    const span = (nodes.length - 1) * st;
    const pos = {};
    nodes.forEach((n, i) => { pos[n.id] = [x0 + (w - span) / 2 + i * st, 0]; });
    (function depth(t, d) { if (!t) return; pos[t.id][1] = top + d * gap; depth(t.left, d + 1); depth(t.right, d + 1); })(root, 0);
    return pos;
  }

  function bstState(root, o = {}) {
    const pos = treeLayout(root, { w: o.w || 420, x0: o.x0 || 0, top: o.top, gap: o.gap, step: o.step });
    const nodes = [];
    const edges = [];
    (function walk(t) {
      if (!t) return;
      nodes.push({ id: t.id, x: pos[t.id][0], y: pos[t.id][1], label: t.label != null ? t.label : t.key, cls: `${(o.cls && o.cls[t.id]) || ""}${t.tri ? " tri is-italic" : ""}${t.italic ? " is-italic" : ""}`,
        shape: t.tri ? "tri" : "circle", sub: o.sub && o.sub[t.id], subPos: (o.subPos && o.subPos[t.id]) || "below", subCls: o.subCls && o.subCls[t.id], pop: o.pop === t.id });
      for (const c of [t.left, t.right]) if (c) edges.push({ id: `${t.id}-${c.id}`, a: t.id, b: c.id, cls: (o.ecls && o.ecls[`${t.id}-${c.id}`]) || "" });
      walk(t.left);
      walk(t.right);
    })(root);
    return { nodes: nodes.concat(o.extraNodes || []), edges: edges.concat(o.extraEdges || []), marks: o.marks || [] };
  }
  const byKey = (root, k) => inorder(root).find((n) => n.key === k);

  // Operation frames for search / insert / delete on a plain BST.
  function searchFrames(root, k, out, o = {}) {
    let cur = root;
    const path = [];
    while (cur) {
      path.push(cur);
      const cls = {};
      const ecls = {};
      path.forEach((p, i) => { cls[p.id] = "act"; if (i) ecls[`${path[i - 1].id}-${p.id}`] = "act"; });
      cls[cur.id] = "cur";
      if (cur.key === k) {
        cls[cur.id] = "okf";
        out.push({ st: bstState(root, { ...o, cls, ecls }), cap: `${k} = ${cur.key}: alkio ${k} löytyi.` });
        return { found: cur, path };
      }
      const dir = k < cur.key ? "left" : "right";
      out.push({ st: bstState(root, { ...o, cls, ecls }), cap: `${k} ${k < cur.key ? "<" : ">"} ${cur.key}, joten haku jatkuu ${dir === "left" ? "vasempaan" : "oikeaan"} lapseen${cur[dir] ? "" : ", mutta lasta ei ole"}.` });
      cur = cur[dir];
    }
    return { found: null, path };
  }
  function insertFrames(root, k, out, o = {}) {
    if (!root) { const n = node(k); out.push({ st: bstState(n, { ...o, cls: { [n.id]: "okf" }, pop: n.id }), cap: `Puu oli tyhjä, joten ${k} tulee puun juureksi.` }); return n; }
    const { found, path } = searchFrames(root, k, out, o);
    if (found) { out[out.length - 1].cap = `Alkio ${k} on jo puussa, joten sitä ei lisätä uudestaan.`; return root; }
    const parent = path[path.length - 1];
    const n = node(k);
    if (k < parent.key) parent.left = n; else parent.right = n;
    const cls = {};
    path.forEach((p) => { cls[p.id] = "act"; });
    cls[n.id] = "okf";
    out.push({ st: bstState(root, { ...o, cls, pop: n.id }), cap: `Lisätään ${k} solmun ${parent.key} ${k < parent.key ? "vasemmaksi" : "oikeaksi"} lapseksi.` });
    return root;
  }
  function deleteFrames(root, k, out, o = {}) {
    const { found, path } = searchFrames(root, k, out, o);
    if (!found) { out[out.length - 1].cap = `Alkiota ${k} ei ole puussa.`; return root; }
    let target = found;
    if (found.left && found.right) {
      let succ = found.right;
      const sp = [succ];
      while (succ.left) { succ = succ.left; sp.push(succ); }
      const cls = { [found.id]: "cur" };
      sp.forEach((p) => { cls[p.id] = "act"; });
      cls[succ.id] = "done";
      out.push({ st: bstState(root, { ...o, cls }), cap: `Solmulla ${k} on kaksi lasta. Pienin alkiota ${k} suurempi alkio on ${succ.key} (oikealle ja sitten niin paljon vasemmalle kuin mahdollista).` });
      [found.key, succ.key] = [succ.key, found.key];
      out.push({ st: bstState(root, { ...o, cls: { [found.id]: "done", [succ.id]: "cur" }, pop: found.id }), cap: `Vaihdetaan alkiot ${succ.key} ja ${found.key} keskenään. Nyt poistettavalla solmulla on enintään yksi lapsi.` });
      target = succ;
    }
    // remove target (≤ 1 child)
    const child = target.left || target.right;
    let parent = null;
    (function find(t) { if (!t) return; if (t.left === target || t.right === target) parent = t; find(t.left); find(t.right); })(root);
    const cap = child ? `Poistetaan solmu ${k} ja nostetaan sen tilalle sen ainoa lapsi ${child.key}.` : `Solmulla ${k} ei ole lapsia, joten sen voi poistaa suoraan.`;
    if (!parent) root = child;
    else if (parent.left === target) parent.left = child;
    else parent.right = child;
    out.push({ st: bstState(root, o), cap });
    return root;
  }

  register("bst", (fig, { mode }) => {
    const m = mode || "set";
    if (m === "playground") return bstPlayground(fig);
    const ui = frame(fig, { title: "Binäärihakupuu", kicker: m === "set" || m === "shapes" ? "Kuva" : "Animaatio" });
    if (m === "shapes") {
      const sc = new Scene(ui.stage, { w: 470, h: 290, r: 18 });
      const a = build([4, 2, 5, 1, 3]);
      const b = build([1, 2, 3, 4, 5]);
      const sa = bstState(a, { w: 200, x0: 10, step: 44, gap: 60 });
      const sb = bstState(b, { w: 230, x0: 235, step: 40, gap: 54 });
      sc.set({ nodes: sa.nodes.concat(sb.nodes), edges: sa.edges.concat(sb.edges) }, true);
      ui.setCaption("Molemmat puut esittävät joukkoa {1, 2, 3, 4, 5}. Vasemman puun korkeus on 2, oikean 4: sama joukko voidaan esittää monella tavalla.");
      return;
    }
    const sc = new Scene(ui.stage, { w: 420, h: 220 });
    const root = build([5, 3, 8, 2, 7, 9]);
    if (m === "set") {
      sc.set(bstState(root, {}), true);
      ui.setCaption("Binäärihakupuu joukolle {2, 3, 5, 7, 8, 9}. Juuren vasemmassa alipuussa on pienemmät ja oikeassa suuremmat alkiot.");
      return;
    }
    const frames = [{ st: bstState(root, {}), cap: m === "search" ? "Etsitään alkiota 7 juuresta alkaen." : m === "insert" ? "Lisätään joukkoon alkio 4." : "Poistetaan joukosta alkio 5." }];
    if (m === "search") searchFrames(root, 7, frames);
    else if (m === "insert") insertFrames(root, 4, frames);
    else deleteFrames(root, 5, frames);
    const player = new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible(600, 0.55);
  });

  function bstPlayground(fig) {
    const ui = frame(fig, { title: "Kokeile binäärihakupuuta", kicker: "Kokeile" });
    const sc = new Scene(ui.stage, { w: 460, h: 300, r: 17 });
    let root = build([50, 30, 70, 20, 40, 60, 80]);
    const tools = h("div", { class: "viz-tools" });
    const input = h("input", { class: "viz-input", type: "number", value: "45", min: "0", max: "999", "aria-label": "Alkio" });
    const mk = (text, fn, cls = "") => { const b = h("button", { type: "button", class: `viz-btn is-text ${cls}`, text }); b.addEventListener("click", fn); return b; };
    let player = null;
    const run = (frames) => {
      if (!player) player = new Player(fig, { frames, interval: 1100, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(`${f.cap} Puun korkeus on ${heightOf(f.root)}.`); } });
      else player.setFrames(frames);
      player.play();
    };
    const op = (kind) => {
      const k = parseInt(input.value, 10);
      if (Number.isNaN(k)) return;
      const frames = [];
      if (kind === "insert") root = insertFrames(root, k, frames, { w: 460 });
      else if (kind === "search") searchFrames(root, k, frames, { w: 460 });
      else root = deleteFrames(root, k, frames, { w: 460 });
      if (!frames.length) frames.push({ st: bstState(root, { w: 460 }), cap: "Puu on tyhjä." });
      frames.forEach((f) => { f.root = root; });
      run(frames);
    };
    tools.append(h("span", { class: "viz-label", text: "Alkio" }), input,
      mk("Lisää", () => op("insert"), "is-primary"), mk("Etsi", () => op("search")), mk("Poista", () => op("delete")), h("span", { class: "viz-sep" }),
      mk("Lisää 1…7 järjestyksessä", () => {
        root = null;
        const frames = [];
        for (let k = 1; k <= 7; k++) root = insertFrames(root, k, frames, { w: 460, gap: 40 });
        frames.forEach((f) => { f.root = root; });
        frames.push({ st: bstState(root, { w: 460, gap: 40 }), cap: "Kun alkiot lisätään järjestyksessä, kaikki menevät samaan ketjuun.", root });
        run(frames);
      }),
      mk("Tasapainoinen puu", () => { root = build([50, 30, 70, 20, 40, 60, 80]); run([{ st: bstState(root, { w: 460 }), cap: "Tasapainoinen puu.", root }]); }));
    ui.main.after(tools);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") op("insert"); });
    run([{ st: bstState(root, { w: 460 }), cap: "Kirjoita luku ja valitse toiminto.", root }]);
    player.pause();
  }

  /* ========================================================= AVL trees */
  const T = (label, left = null, right = null, extra = {}) => ({ id: extra.id || `v${label}`, key: label, label, left, right, ...extra });
  const avlHeights = (t, out = {}) => { if (t) { avlHeights(t.left, out); avlHeights(t.right, out); out[t.id] = 1 + Math.max(t.left ? out[t.left.id] : -1, t.right ? out[t.right.id] : -1); } return out; };

  function heightSubs(root) {
    const hs = avlHeights(root);
    return Object.fromEntries(Object.entries(hs).map(([id, v]) => [id, `h=${v}`]));
  }
  function unbalanced(root) {
    const hs = avlHeights(root);
    const bad = [];
    (function walk(t) {
      if (!t) return;
      const l = t.left ? hs[t.left.id] : -1;
      const r = t.right ? hs[t.right.id] : -1;
      if (Math.abs(l - r) > 1) bad.push(t.id);
      walk(t.left);
      walk(t.right);
    })(root);
    return bad;
  }

  // the example trees of the AVL page, keys as ids so animations connect them
  const AVL = {
    e1: () => T(3, T(2), T(7, T(5), T(8))),
    e2: () => T(3, T(2), T(7, T(5), T(8, null, T(9)))),
    e3: () => T(7, T(3, T(2), T(5)), T(8, null, T(9))),
    e4: () => T(3, T(2), T(7, T(5, null, T(6)), T(8))),
    e5: () => T(3, T(2), T(5, null, T(7, T(6), T(8)))),
    e6: () => T(5, T(3, T(2)), T(7, T(6), T(8))),
  };
  const avlOpts = (root, extra = {}) => {
    const bad = unbalanced(root);
    const cls = {};
    for (const id of bad) cls[id] = "bad";
    return { w: 420, step: 50, gap: 58, ...extra, sub: heightSubs(root), subPos: Object.fromEntries(Object.keys(heightSubs(root)).map((k) => [k, "right"])), cls: { ...cls, ...(extra.cls || {}) }, marks: extra.marks || [] };
  };
  // x/y/z labels: a right child gets its label at the upper right so that it does not sit on the edge from its parent.
  const isRightChild = (root, id) => { let r = false; (function walk(t) { if (!t) return; if (t.right && t.right.id === id) r = true; walk(t.left); walk(t.right); })(root); return r; };
  const xyz = (ids, root) => Object.entries(ids).map(([name, id]) => {
    const right = isRightChild(root, id);
    return { id: `lbl-${name}`, type: "text", at: id, dx: right ? 25 : -27, dy: right ? -21 : -18, text: name, cls: "label-x" };
  });

  register("avl", (fig, { mode }) => {
    const m = mode || "balance";
    if (m === "playground") return avlPlayground(fig);
    if (m === "balance") {
      const ui = frame(fig, { title: "AVL-puun tasapainoehto", kicker: "Kuva" });
      const sc = new Scene(ui.stage, { w: 500, h: 250, r: 17 });
      const a = T(3, T(2, null, null, { id: "a2" }), T(7, T(5, null, null, { id: "a5" }), T(8, null, null, { id: "a8" }), { id: "a7" }), { id: "a3" });
      const b = T(3, T(2), T(7, T(5), T(8, null, T(9))));
      const sa = bstState(a, avlOpts(a, { w: 220, x0: 0, step: 46 }));
      const sb = bstState(b, avlOpts(b, { w: 230, x0: 230, step: 44, gap: 52 }));
      const marks = [
        { id: "ta", type: "text", x: 110, y: 238, text: "(a) tasapainoinen", cls: "ok" },
        { id: "tb", type: "text", x: 355, y: 238, text: "(b) solmu 3: 0 vs. 2", cls: "bad" },
      ];
      sc.set({ nodes: sa.nodes.concat(sb.nodes), edges: sa.edges.concat(sb.edges), marks }, true);
      ui.setCaption("Solmujen viereen on merkitty niiden alipuiden korkeudet. Oikeassa puussa solmun 3 vasemman alipuun korkeus on 0 ja oikean 2, joten tasapainoehto ei ole voimassa.");
      return;
    }
    if (m === "rotation" || m === "case1" || m === "case2") {
      const ui = frame(fig, { title: m === "rotation" ? "Kierrot" : m === "case1" ? "Tapaus 1: yksi kierto" : "Tapaus 2: kaksi kiertoa", kicker: "Animaatio" });
      const sc = new Scene(ui.stage, { w: 420, h: 250, r: 18 });
      const tri = (l) => T(l, null, null, { tri: true, id: `t${l}` });
      const v = (l, a, b) => T(l, a, b, { italic: true, id: `v${l}` });
      let trees;
      let caps;
      if (m === "rotation") {
        trees = [v("x", tri("A"), v("y", tri("B"), tri("C"))), v("y", v("x", tri("A"), tri("B")), tri("C"))];
        caps = ["Vasemmanpuoleinen tilanne: x on ylempänä. Kierto vasemmalta oikealle nostaa y:n x:n yli.", "Oikeanpuoleinen tilanne: y on ylempänä. Kierto oikealta vasemmalle nostaa x:n takaisin y:n yli. Alipuiden A, B ja C järjestys säilyy."];
      } else if (m === "case1") {
        trees = [v("x", tri("A"), v("y", tri("B"), v("z", tri("C"), tri("D")))), v("y", v("x", tri("A"), tri("B")), v("z", tri("C"), tri("D")))];
        caps = ["Solmut y ja z ovat samanpuoleisia (oikeanpuoleisia) lapsia.", "Kierto nostaa y:n ylimmäksi: sen vasemmaksi lapseksi tulee x ja oikeaksi lapseksi z."];
      } else {
        trees = [v("x", tri("A"), v("y", v("z", tri("B"), tri("C")), tri("D"))), v("x", tri("A"), v("z", tri("B"), v("y", tri("C"), tri("D")))), v("z", v("x", tri("A"), tri("B")), v("y", tri("C"), tri("D")))];
        caps = ["Solmu y on oikeanpuoleinen ja z vasemmanpuoleinen lapsi.", "Ensimmäinen kierto nostaa z:n y:n yli.", "Toinen kierto nostaa z:n x:n yli: z:n vasemmaksi lapseksi tulee x ja oikeaksi y."];
      }
      const frames = trees.map((t, i) => ({ st: bstState(t, { w: 420, step: m === "case1" || m === "case2" ? 52 : 70, gap: 58 }), cap: caps[i] }));
      const player = new Player(fig, { frames, interval: 1900, loop: m === "rotation", apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
      player.playWhenVisible(600, 0.55);
      return;
    }
    // Example steps e1…e6
    const ui = frame(fig, { title: m === "e1" ? "Esimerkkipuu" : "Lisääminen AVL-puuhun", kicker: ["e3", "e5", "e6"].includes(m) ? "Animaatio" : "Kuva" });
    const sc = new Scene(ui.stage, { w: 420, h: 250, r: 18 });
    const caps = {
      e1: "Lähtötilanne. Solmujen viereen on merkitty niiden alipuiden korkeudet.",
      e2: "Alkio 9 lisätään solmun 8 oikeaksi lapseksi. Juuressa vasemman alipuun korkeus on 0 ja oikean 2: x = 3, y = 7 ja z = 8.",
      e3: "Kierto nostaa solmun 7 solmun 3 yli. Puu on taas tasapainoinen.",
      e4: "Alkio 6 lisätään solmun 5 oikeaksi lapseksi. Juuressa tasapainoehto rikkoutuu: x = 3, y = 7 ja z = 5.",
      e5: "Ensimmäinen kierto nostaa solmun 5 solmun 7 yli.",
      e6: "Toinen kierto nostaa solmun 5 solmun 3 yli. Puu on taas tasapainoinen.",
    };
    const marksFor = { e2: { x: "v3", y: "v7", z: "v8" }, e4: { x: "v3", y: "v7", z: "v5" } };
    const stateOf = (k) => { const t = AVL[k](); return bstState(t, avlOpts(t, { marks: marksFor[k] ? xyz(marksFor[k], t) : [], cls: k === "e2" ? { v9: "okf" } : k === "e4" ? { v6: "okf" } : {} })); };
    if (["e1", "e2", "e4"].includes(m)) {
      sc.set(stateOf(m), true);
      ui.setCaption(caps[m]);
      return;
    }
    const prev = { e3: "e2", e5: "e4", e6: "e5" }[m];
    const frames = [{ st: stateOf(prev), cap: prev === "e5" ? caps.e5 : caps[prev] }, { st: stateOf(m), cap: caps[m] }];
    const player = new Player(fig, { frames, interval: 1600, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible(600, 0.55);
  });

  // AVL insertion with automatic rebalancing.
  function avlPlayground(fig) {
    const ui = frame(fig, { title: "Kokeile AVL-puuta", kicker: "Kokeile" });
    const sc = new Scene(ui.stage, { w: 460, h: 290, r: 17 });
    let root = null;
    const tools = h("div", { class: "viz-tools" });
    const input = h("input", { class: "viz-input", type: "number", value: "1", "aria-label": "Alkio" });
    let player = null;
    const opts = (r, extra = {}) => avlOpts(r, { w: 460, step: 40, gap: 54, ...extra });
    const emptyTree = { nodes: [], edges: [], marks: [{ id: "empty", type: "text", x: 230, y: 140, text: "Puu on tyhjä", cls: "faint" }] };
    const rotate = (r, x, dir) => {
      // rotate subtree x: dir "left" lifts x.right, "right" lifts x.left; returns new root of whole tree
      const y = dir === "left" ? x.right : x.left;
      if (dir === "left") { x.right = y.left; y.left = x; } else { x.left = y.right; y.right = x; }
      if (r === x) return y;
      (function fix(t) { if (!t) return; if (t.left === x) t.left = y; else if (t.right === x) t.right = y; else { fix(t.left); fix(t.right); } })(r);
      return r;
    };
    function insert(k) {
      const frames = [];
      root = insertFrames(root, k, frames, opts(root));
      frames.forEach((f, i) => { if (i === frames.length - 1) f.st = bstState(root, opts(root, { cls: { [byKey(root, k).id]: "okf" } })); });
      // walk up from the new node and fix the lowest unbalanced node
      for (;;) {
        const bad = unbalanced(root);
        if (!bad.length) break;
        const hs = avlHeights(root);
        // lowest unbalanced node on the path to k
        const path = [];
        let c = root;
        while (c) { path.push(c); if (k === c.key) break; c = k < c.key ? c.left : c.right; }
        const x = path.slice().reverse().find((t) => bad.includes(t.id));
        const hh = (t) => (t ? hs[t.id] : -1);
        const y = hh(x.left) > hh(x.right) ? x.left : x.right;
        const z = hh(y.left) > hh(y.right) ? y.left : (hh(y.right) > hh(y.left) ? y.right : (y === x.left ? y.left : y.right));
        const marks = xyz({ x: x.id, y: y.id, z: z.id }, root);
        frames.push({ st: bstState(root, opts(root, { marks })), cap: `Solmussa ${x.key} tasapainoehto ei ole voimassa. Tässä x = ${x.key}, y = ${y.key} ja z = ${z.key}.` });
        const same = (y === x.right) === (z === y.right);
        if (same) {
          root = rotate(root, x, y === x.right ? "left" : "right");
          frames.push({ st: bstState(root, opts(root)), cap: `Tapaus 1: kierto nostaa solmun ${y.key} solmun ${x.key} yli.` });
        } else {
          root = rotate(root, y, z === y.left ? "right" : "left");
          frames.push({ st: bstState(root, opts(root)), cap: `Tapaus 2: ensin solmu ${z.key} nousee solmun ${y.key} yli…` });
          root = rotate(root, x, y === x.right ? "left" : "right");
          frames.push({ st: bstState(root, opts(root)), cap: `…ja sitten solmun ${x.key} yli.` });
        }
      }
      frames.push({ st: bstState(root, opts(root)), cap: `Puu on tasapainoinen. Korkeus on ${heightOf(root)}, kun solmuja on ${inorder(root).length}.` });
      if (!player) player = new Player(fig, { frames, interval: 1300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
      else player.setFrames(frames);
      player.play();
    }
    const mk = (text, fn, cls = "") => { const b = h("button", { type: "button", class: `viz-btn is-text ${cls}`, text }); b.addEventListener("click", fn); return b; };
    tools.append(h("span", { class: "viz-label", text: "Alkio" }), input, mk("Lisää", () => {
      const k = parseInt(input.value, 10);
      if (Number.isNaN(k)) return;
      insert(k);
      input.value = String(k + 1);
    }, "is-primary"), mk("Tyhjennä", () => { root = null; if (player) player.pause(); sc.set(emptyTree); ui.setCaption("Puu on tyhjä. Lisää alkioita esimerkiksi järjestyksessä 1, 2, 3, …"); input.value = "1"; }));
    ui.main.after(tools);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); tools.querySelector(".is-primary").click(); } });
    ui.setCaption("Lisää alkioita esimerkiksi järjestyksessä 1, 2, 3, … ja seuraa, miten kierrot pitävät puun tasapainoisena.");
    player = new Player(fig, { frames: [{ st: emptyTree, cap: "Lisää alkioita esimerkiksi järjestyksessä 1, 2, 3, … ja seuraa, miten kierrot pitävät puun tasapainoisena." }], apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
  }

  /* ============================================================== Heaps */
  const HEAP0 = [1, 3, 5, 4, 5, 8, 9, 7, 8, 5];
  function heapScene(ui, n) {
    const W = 470;
    const sc = new Scene(ui.stage, { w: W, h: 345, r: 17 });
    const slot = (i) => {
      const lvl = Math.floor(Math.log2(i + 1));
      const first = 2 ** lvl - 1;
      return [W * ((i - first) + 0.5) / 2 ** lvl, 32 + lvl * 64];
    };
    const cell = (i, n2) => { const cw = 38; const x0 = (W - n2 * cw) / 2 + cw / 2; return [x0 + i * cw, 300]; };
    return { sc, slot, cell, W, n };
  }
  // elements: [{id, v}] in array order
  function heapState(H, els, o = {}) {
    const nodes = [];
    const marks = [];
    const n = els.length;
    for (let i = 1; i < n; i++) {
      const [x1, y1] = H.slot(Math.floor((i - 1) / 2));
      const [x2, y2] = H.slot(i);
      marks.push({ id: `l${i}`, type: "line", x1, y1, x2, y2, cls: (o.lineCls && o.lineCls[i]) || "", under: true });
    }
    const slotsN = Math.max(n, o.cells || n);
    for (let i = 0; i < slotsN; i++) {
      const [cx] = H.cell(i, slotsN);
      marks.push({ id: `ix${i}`, type: "text", x: cx, y: 327, text: String(i), cls: "faint mono" });
      marks.push({ id: `bx${i}`, type: "rect", x: cx - 17, y: 283, w: 34, h: 34, rx: 7, cls: "soft" });
    }
    els.forEach((e, i) => {
      const [x, y] = H.slot(i);
      const cls = (o.cls && o.cls[i]) || "";
      nodes.push({ id: e.id, x, y, label: e.v, cls, pop: o.pop === i ? e.id : undefined });
      const [cx, cy] = H.cell(i, slotsN);
      nodes.push({ id: `c${e.id}`, x: cx, y: cy, label: e.v, shape: "rect", w: 34, h: 34, rx: 7, cls: `${cls} is-mono` });
    });
    marks.push({ id: "arr", type: "text", x: 12, y: 270, text: "lista", cls: "faint", anchor: "start" });
    return { nodes, edges: [], marks: marks.concat(o.marks || []) };
  }
  register("heap", (fig, { mode }) => {
    const m = mode || "structure";
    const ui = frame(fig, { title: m === "structure" ? "Minimikeko puuna ja listana" : m === "push" ? "Alkion lisääminen kekoon" : "Pienimmän alkion poistaminen", kicker: m === "structure" ? "Kokeile" : "Animaatio" });
    const H = heapScene(ui, HEAP0.length);
    let els = HEAP0.map((v, i) => ({ id: `e${i}`, v }));
    if (m === "structure") {
      const show = (k) => {
        const cls = {};
        const lineCls = {};
        if (k != null) {
          cls[k] = "cur";
          const l = 2 * k + 1;
          const r = 2 * k + 2;
          const p = Math.floor((k - 1) / 2);
          if (l < els.length) { cls[l] = "act"; lineCls[l] = "cur"; }
          if (r < els.length) { cls[r] = "act"; lineCls[r] = "cur"; }
          if (k > 0) { cls[p] = "done"; lineCls[k] = "done"; }
          const parts = [];
          parts.push(`Alkio ${els[k].v} on kohdassa ${k}.`);
          if (l < els.length) parts.push(`Sen vasen lapsi on kohdassa 2·${k}+1 = ${l}${r < els.length ? ` ja oikea lapsi kohdassa 2·${k}+2 = ${r}` : ""}.`);
          else parts.push("Sillä ei ole lapsia.");
          if (k > 0) parts.push(`Vanhempi on kohdassa ⌊(${k}−1)/2⌋ = ${p}.`);
          ui.setCaption(parts.join(" ") + " Klikkaa muita solmuja tai listan kohtia.");
        } else ui.setCaption("Keko listana [1, 3, 5, 4, 5, 8, 9, 7, 8, 5]: taso kerrallaan ylhäältä alas. Klikkaa solmua tai listan kohtaa.");
        const st = heapState(H, els, { cls, lineCls });
        st.nodes.forEach((nd) => { nd.click = true; });
        H.sc.set(st);
      };
      H.sc.onNodeClick = (id) => { const i = els.findIndex((e) => e.id === id || `c${e.id}` === id); show(i); };
      show(1);
      return;
    }
    const frames = [];
    const snap = (cap, o = {}) => frames.push({ st: heapState(H, els.slice(), o), cap });
    if (m === "push") {
      snap("Lisätään kekoon alkio 2.", { cells: 11 });
      els.push({ id: "new", v: 2 });
      let i = els.length - 1;
      snap("Uusi alkio lisätään keon pohjalle eli listan loppuun kohtaan 10.", { cls: { [i]: "cur" }, pop: i });
      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (els[p].v <= els[i].v) { snap(`Vanhempi ${els[p].v} ≤ ${els[i].v}, joten alkio on oikealla paikalla.`, { cls: { [i]: "okf", [p]: "done" }, lineCls: { [i]: "done" } }); break; }
        snap(`Vanhempi ${els[p].v} (kohta ${p}) on suurempi kuin ${els[i].v}, joten alkiot vaihdetaan.`, { cls: { [i]: "cur", [p]: "act" }, lineCls: { [i]: "cur" } });
        [els[p], els[i]] = [els[i], els[p]];
        snap(`Alkio ${els[p].v} nousi kohtaan ${p}.`, { cls: { [p]: "cur" } });
        i = p;
      }
      snap(`Valmis: keko listana on [${els.map((e) => e.v).join(", ")}].`);
    } else {
      snap("Poistetaan keon pienin alkio, joka on juuressa.", { cls: { 0: "cur" } });
      const last = els.pop();
      const removed = els[0];
      els[0] = last;
      snap(`Pienin alkio ${removed.v} poistetaan ja sen tilalle siirretään keon viimeinen alkio ${last.v}.`, { cls: { 0: "cur" }, cells: 10 });
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let c = l;
        if (l >= els.length) break;
        if (r < els.length && els[r].v < els[l].v) c = r;
        if (els[c].v >= els[i].v) { snap(`Lapset ${l < els.length ? els[l].v : ""}${r < els.length ? ` ja ${els[r].v}` : ""} eivät ole pienempiä kuin ${els[i].v}, joten alkio on oikealla paikalla.`, { cls: { [i]: "okf" } }); i = -1; break; }
        snap(`Pienempi lapsi ${els[c].v} (kohta ${c}) on pienempi kuin ${els[i].v}, joten alkiot vaihdetaan.`, { cls: { [i]: "cur", [c]: "act" }, lineCls: { [c]: "cur" } });
        [els[i], els[c]] = [els[c], els[i]];
        snap(`Alkio ${els[c].v} laskeutui kohtaan ${c}.`, { cls: { [c]: "cur" } });
        i = c;
      }
      if (i >= 0) snap(`Alkiolla ${els[i].v} ei ole lapsia, joten se on oikealla paikalla.`, { cls: { [i]: "okf" } });
      snap(`Valmis: keko listana on [${els.map((e) => e.v).join(", ")}].`);
    }
    new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { H.sc.set(f.st, instant); ui.setCaption(f.cap); } });
  });

})();
