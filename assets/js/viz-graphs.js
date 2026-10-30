/* Graph figures: chapters 8 and 13–16. Every animation replays the course's
   Python code step by step, using the same edge insertion order (and thus the
   same adjacency lists), so the visiting orders and printed output match the
   material exactly. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, OutputPanel, VarsPanel, frame, fmt, h } = V;

  /* ------------------------------------------------------------ helpers */
  const eid = (a, b, dir) => (dir ? `${a}>${b}` : (String(a) < String(b) ? `${a}-${b}` : `${b}-${a}`));
  const list = (xs) => xs.join(", ").replace(/, ([^,]*)$/, " ja $1");
  const toNodes = (xs) => (xs.length === 1 ? `solmuun ${xs[0]}` : `solmuihin ${list(xs)}`);

  // Where a node's sub label goes when the figure does not say: below the node,
  // unless a straight edge leaves downwards (then above, or right if both).
  function autoSubPos(G, id) {
    const [x, y] = G.pos[id];
    let down = false;
    let up = false;
    for (const [a, b, , bend] of G.edges) {
      if (bend) continue;
      const other = String(a) === id ? String(b) : String(b) === id ? String(a) : null;
      if (other == null) continue;
      const [ox, oy] = G.pos[other];
      if (Math.abs(ox - x) < Math.abs(oy - y) * 1.2) { if (oy > y) down = true; else up = true; }
    }
    return !down ? "below" : !up ? "above" : "right";
  }

  // Graph definition: { w, h, dir, pos: {id: [x, y]}, edges: [[a, b, w?, bend?]] }
  function makeState(G, o = {}) {
    const nodes = Object.entries(G.pos).map(([id, [x, y]]) => ({
      id, x, y,
      label: (o.label && o.label[id] != null) ? o.label[id] : (G.labels && G.labels[id] != null ? G.labels[id] : id),
      cls: (o.cls && o.cls[id]) || o.defaultCls || "",
      sub: o.sub && o.sub[id],
      subPos: (o.subPos && o.subPos[id]) || G.subPos || (o.sub && o.sub[id] != null ? autoSubPos(G, id) : "below"),
      badge: o.badge && o.badge[id],
      badgeCls: o.badgeCls && o.badgeCls[id],
      click: !!o.click,
      r: G.r,
    }));
    const edges = G.edges.map(([a, b, w, bend]) => {
      const id = eid(a, b, G.dir);
      return {
        id, a: String(a), b: String(b), dir: !!G.dir,
        bend: (o.bend && o.bend[id] != null) ? o.bend[id] : (bend || 0),
        label: (o.elabel && o.elabel[id] != null) ? o.elabel[id] : (w != null && !o.noWeights ? w : null),
        cls: (o.ecls && o.ecls[id]) || o.defaultEcls || "",
        loff: (G.loff && G.loff[id]) || 0,
      };
    });
    return { nodes: nodes.concat(o.extraNodes || []), edges: edges.concat(o.extraEdges || []), marks: o.marks || [] };
  }

  // Adjacency lists in insertion order, exactly like the course's add_edge.
  function adjacency(G) {
    const adj = {};
    for (const id of Object.keys(G.pos)) adj[id] = [];
    for (const [a, b, w] of G.edges) {
      adj[a].push(G.weighted ? [String(b), w] : String(b));
      if (!G.dir) adj[b].push(G.weighted ? [String(a), w] : String(a));
    }
    return adj;
  }

  function sceneFor(ui, G) {
    const sc = new Scene(ui.stage, { w: G.w, h: G.h, r: G.r || 19 });
    return sc;
  }

  /* --------------------------------------------------------- graph data */
  const VERKKO1 = { w: 420, h: 240, pos: { 1: [70, 55], 2: [250, 55], 3: [70, 185], 4: [250, 185], 5: [362, 120] },
    edges: [[1, 2], [1, 3], [1, 4], [2, 4], [2, 5], [3, 4], [4, 5]] };
  const VERKKO2 = { w: 540, h: 200, pos: { 1: [60, 50], 2: [185, 50], 3: [60, 152], 4: [275, 50], 5: [400, 50], 6: [275, 152], 7: [400, 152], 8: [488, 101] },
    edges: [[1, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7]] };
  const SUUVER = { w: 420, h: 235, dir: true, pos: { 1: [70, 55], 2: [245, 55], 5: [362, 122], 3: [70, 185], 4: [245, 185] },
    edges: [[1, 2], [2, 4], [2, 5], [3, 1], [4, 1], [4, 5]] };
  const TOPO = { w: 420, h: 225, dir: true, pos: { 1: [70, 55], 2: [210, 55], 3: [350, 55], 4: [70, 172], 5: [210, 172], 6: [350, 172] },
    edges: [[1, 2], [2, 3], [3, 6], [4, 1], [4, 5], [5, 2], [5, 3]] };
  const LYHPOL = { w: 430, h: 245, dir: true, weighted: true, pos: { 1: [60, 55], 2: [240, 55], 3: [60, 192], 4: [240, 192], 5: [372, 124] },
    edges: [[1, 2, 8], [1, 3, 1], [2, 5, 5], [3, 2, 4], [3, 4, 2], [4, 2, 1], [4, 5, 3]] };
  const SCC = { w: 480, h: 225, dir: true, pos: { 1: [58, 52], 2: [190, 52], 3: [322, 52], 7: [430, 113], 4: [58, 178], 5: [190, 178], 6: [322, 178] },
    edges: [[1, 2, null, -0.22], [1, 4], [2, 1, null, -0.22], [2, 5], [3, 2], [3, 7], [5, 4], [6, 3], [6, 5], [7, 6]] };

  /* ================================================== Chapter 8: graphs */

  // Neighbours, degrees and the four example paths (verkko1).
  register("graph", (fig, { mode }) => {
    const G = VERKKO1;
    const adj = adjacency(G);
    if (mode === "connected" || mode === "plain") {
      const ui = frame(fig, { title: mode === "connected" ? "Yhtenäinen verkko" : "Suuntaamaton verkko", kicker: "Kuva" });
      const sc = sceneFor(ui, G);
      sc.set(makeState(G, { defaultCls: mode === "connected" ? "c1" : "", defaultEcls: mode === "connected" ? "c1" : "" }), true);
      ui.setCaption(mode === "connected"
        ? "Minkä tahansa kahden solmun välillä on polku, joten verkossa on yksi komponentti {1, 2, 3, 4, 5}."
        : "Suuntaamattoman verkon kaaria voi kulkea molempiin suuntiin.");
      return;
    }
    const paths = [[1, 2, 5], [1, 4, 5], [1, 3, 4, 5], [1, 3, 4, 2, 5]];
    let tab = "neighbors";
    let player = null;
    const ui = frame(fig, {
      title: "Verkko, naapurit ja polut", tabs: [["neighbors", "Naapurit"], ["paths", "Polut 1 → 5"]], tab,
      onTab: (t) => { tab = t; show(); },
    });
    const sc = sceneFor(ui, G);
    function neighbors(id) {
      const cls = { [id]: "cur" };
      const ecls = {};
      for (const v of adj[id]) { cls[v] = "act"; ecls[eid(id, v)] = "act"; }
      sc.set(makeState(G, { cls, ecls, click: true }));
      const nb = adj[id].map(Number).sort((a, b) => a - b);
      ui.setCaption(`Solmun ${id} naapurit ovat ${nb.length > 1 ? "solmut" : "solmu"} ${list(nb)}, joten sen **aste** on ${nb.length}. Valitse toinen solmu klikkaamalla.`);
    }
    function show() {
      if (player) { player.destroy(); player = null; }
      if (tab === "neighbors") {
        sc.onNodeClick = (id) => neighbors(id);
        neighbors("1");
      } else {
        sc.onNodeClick = null;
        const frames = paths.map((p) => {
          const cls = {};
          const ecls = {};
          p.forEach((v, i) => { cls[v] = i === 0 || i === p.length - 1 ? "cur" : "act"; if (i) ecls[eid(p[i - 1], v)] = "path"; });
          return { st: makeState(G, { cls, ecls }), cap: `Polku ${p.join(" → ")} kulkee ${p.length - 1} kaarta pitkin.` };
        });
        player = new Player(fig, { frames, interval: 1700, loop: true, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
        player.play();
      }
    }
    show();
  });

  // DFS and BFS step by step (DFS and BFS classes of chapter 8).
  const DFS_CODE = `def visit(self, node):
    if node in self.visited:
        return
    self.visited.add(node)

    for next_node in self.graph[node]:
        self.visit(next_node)`;
  const BFS_CODE = `def search(self, start_node):
    visited = set()

    queue = [start_node]
    visited.add(start_node)

    for node in queue:
        for next_node in self.graph[node]:
            if next_node not in visited:
                queue.append(next_node)
                visited.add(next_node)

    return visited`;

  function dfsFrames(G, start) {
    const adj = adjacency(G);
    const visited = new Set();
    const stack = [];
    const order = {};
    const frames = [];
    const done = new Set();
    let edge = null;
    const snap = (cap, line, extra = {}) => {
      const cls = {};
      for (const v of visited) cls[v] = done.has(v) ? "done" : "act";
      if (stack.length) cls[stack[stack.length - 1]] = "cur";
      if (extra.peek && !cls[extra.peek]) cls[extra.peek] = "";
      const ecls = {};
      for (const [k, v] of Object.entries(treeEdges)) ecls[k] = v;
      if (edge) ecls[edge] = "act";
      frames.push({ st: makeState(G, { cls, ecls, badge: { ...order }, badgeCls: {} }), cap, line,
        vars: [{ k: "visited", v: new Set([...visited].map(Number)) }, { k: "kutsupino", v: `[${stack.map((x) => `visit(${x})`).join(", ")}]` }] });
    };
    const treeEdges = {};
    let count = 0;
    function visit(node, from) {
      edge = from != null ? eid(from, node, G.dir) : null;
      if (visited.has(node)) {
        snap(`Kutsu \`visit(${node})\`: solmussa ${node} on jo käyty, joten palataan heti takaisin.`, [2, 3]);
        edge = null;
        return;
      }
      stack.push(node);
      visited.add(node);
      order[node] = ++count;
      if (from != null) treeEdges[eid(from, node, G.dir)] = "tree";
      snap(`Haku saapuu solmuun ${node} ja lisää sen joukkoon \`visited\`.`, 4);
      edge = null;
      for (const next of adj[node]) {
        edge = eid(node, next, G.dir);
        snap(`Solmun ${node} vieruslistalla on solmu ${next}: kutsutaan \`visit(${next})\`.`, [6, 7]);
        visit(next, node);
      }
      done.add(node);
      snap(`Solmun ${node} vieruslista on käyty läpi, joten metodin \`visit(${node})\` suoritus päättyy.`, 6);
      stack.pop();
    }
    visit(String(start), null);
    snap(`Haku on valmis. Solmusta ${start} pääsee solmuihin ${list([...visited].map(Number).sort((a, b) => a - b))}. Numerot kertovat järjestyksen, jossa haku saapui solmuihin.`, []);
    return frames;
  }

  function bfsFrames(G, start) {
    const adj = adjacency(G);
    const visited = new Set([String(start)]);
    const queue = [String(start)];
    const frames = [];
    const order = { [start]: 1 };
    const tree = {};
    const snap = (cap, line, cur, edge) => {
      const cls = {};
      queue.forEach((v, i) => { cls[v] = i < qi ? "done" : "act"; });
      if (cur) cls[cur] = "cur";
      const ecls = { ...tree };
      if (edge) ecls[edge] = "act";
      frames.push({ st: makeState(G, { cls, ecls, badge: { ...order } }), cap, line,
        vars: [{ k: "queue", v: `[${queue.join(", ")}]` }, { k: "käsittelyssä", v: cur ? `queue[${qi - 1}] = ${cur}` : "–" }, { k: "visited", v: new Set([...visited].map(Number)) }] });
    };
    let qi = 0;
    snap(`Jonoon laitetaan alkusolmu ${start}, joka merkitään vierailluksi.`, [4, 5]);
    while (qi < queue.length) {
      const node = queue[qi++];
      snap(`Otetaan jonosta käsittelyyn solmu ${node}.`, 7, node);
      for (const next of adj[node]) {
        const e = eid(node, next, G.dir);
        if (!visited.has(next)) {
          queue.push(next);
          visited.add(next);
          order[next] = queue.length;
          tree[e] = "tree";
          snap(`Solmua ${next} ei ole vielä lisätty, joten se lisätään jonon loppuun.`, [10, 11], node, e);
        } else {
          snap(`Solmu ${next} on jo lisätty jonoon aiemmin, joten sitä ei lisätä uudestaan.`, 9, node, e);
        }
      }
    }
    qi = queue.length;
    snap(`Jono on käyty loppuun. Leveyshaku löysi solmut järjestyksessä ${queue.join(", ")}.`, 13);
    return frames;
  }

  function searchViz(fig, kind, G, start, title) {
    const ui = frame(fig, { title, split: true, kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const code = new CodePanel(ui.side, kind === "dfs" ? DFS_CODE : BFS_CODE);
    const vars = new VarsPanel(ui.side, "Tila");
    const frames = kind === "dfs" ? dfsFrames(G, start) : bfsFrames(G, start);
    new Player(fig, { frames, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  }
  register("graph-dfs", (fig) => searchViz(fig, "dfs", VERKKO1, 1, "Syvyyshaku solmusta 1"));
  register("graph-bfs", (fig) => searchViz(fig, "bfs", VERKKO1, 1, "Leveyshaku solmusta 1"));

  // Components (verkko2), Components.find_components.
  register("components", (fig) => {
    const G = VERKKO2;
    const adj = adjacency(G);
    const ui = frame(fig, { title: "Komponenttien etsiminen syvyyshaulla", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const vars = new VarsPanel(ui.side, "Tila");
    const comp = {};
    let counter = 0;
    const frames = [];
    // Component labels go above the upper nodes and below the lower ones, away from the edges.
    const subPos = Object.fromEntries(Object.entries(G.pos).map(([v, [, y]]) => [v, y < G.h / 2 - 10 ? "above" : "below"]));
    const snap = (cap, cur, edge) => {
      const cls = {};
      const ecls = {};
      for (const [v, c] of Object.entries(comp)) cls[v] = `c${(c - 1) % 6}`;
      if (cur) cls[cur] = "cur";
      for (const [a, b] of G.edges) if (comp[a] && comp[a] === comp[b]) ecls[eid(a, b)] = `c${(comp[a] - 1) % 6}`;
      if (edge) ecls[edge] = "act";
      const marks = [];
      for (let c = 1; c <= counter; c++) {
        const members = Object.keys(comp).filter((v) => comp[v] === c);
        marks.push({ id: `h${c}`, type: "hull", nodes: members, cls: `c${(c - 1) % 6} soft`, pad: 9 });
      }
      frames.push({ st: makeState(G, { cls, ecls, marks, sub: Object.fromEntries(Object.entries(comp).map(([v, c]) => [v, `k${c}`])), subPos }), cap,
        vars: [{ k: "counter", v: String(counter) }, { k: "components", v: `{${Object.keys(comp).sort((a, b) => a - b).map((v) => `${v}: ${comp[v]}`).join(", ")}}` }] });
    };
    snap("Aluksi yksikään solmu ei kuulu mihinkään komponenttiin.");
    function visit(node, from) {
      if (comp[node]) return;
      comp[node] = counter;
      snap(`Syvyyshaku merkitsee solmun ${node} komponenttiin ${counter}.`, node, from ? eid(from, node) : null);
      for (const next of adj[node]) visit(next, node);
    }
    for (const node of Object.keys(G.pos)) {
      if (!comp[node]) {
        counter += 1;
        snap(`Solmu ${node} ei ole vielä missään komponentissa, joten \`counter\` kasvaa arvoon ${counter} ja solmusta ${node} aloitetaan uusi haku.`, node);
        visit(node, null);
      }
    }
    const groups = [];
    for (let c = 1; c <= counter; c++) groups.push(`{${Object.keys(comp).filter((v) => comp[v] === c).join(", ")}}`);
    snap(`Valmis: verkossa on ${counter} komponenttia: ${list(groups)}.`);
    new Player(fig, { frames, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  // BFS distances and a shortest path (Distances / ShortestPaths).
  register("bfs-distances", (fig) => {
    const G = VERKKO1;
    const adj = adjacency(G);
    const ui = frame(fig, { title: "Etäisyydet leveyshaulla", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const vars = new VarsPanel(ui.side, "distances");
    const dist = { 1: 0 };
    const prev = { 1: null };
    const queue = ["1"];
    const frames = [];
    const tree = {};
    const snap = (cap, cur, edge, extra = {}) => {
      const cls = {};
      for (const v of Object.keys(dist)) cls[v] = "done";
      if (cur) cls[cur] = "cur";
      Object.assign(cls, extra.cls || {});
      const ecls = { ...tree, ...(extra.ecls || {}) };
      if (edge) ecls[edge] = "act";
      frames.push({ st: makeState(G, { cls, ecls, sub: Object.fromEntries(Object.entries(dist).map(([v, d]) => [v, `d=${d}`])), subPos: { 1: "above", 2: "above", 3: "below", 4: "below", 5: "right" } }), cap,
        vars: Object.keys(dist).map((v) => ({ k: v, v: String(dist[v]), cls: v === cur ? "hl" : "" })) });
    };
    snap("Alkusolmun 1 etäisyys on 0.", "1");
    for (let qi = 0; qi < queue.length; qi++) {
      const node = queue[qi];
      for (const next of adj[node]) {
        if (!(next in dist)) {
          dist[next] = dist[node] + 1;
          prev[next] = node;
          queue.push(next);
          tree[eid(node, next)] = "tree";
          snap(`Solmuun ${next} päästään solmusta ${node}, joten sen etäisyys on ${dist[node]} + 1 = ${dist[next]}.`, node, eid(node, next));
        }
      }
    }
    const pathA = { cls: { 1: "cur", 4: "act", 5: "cur" }, ecls: { "1-4": "path", "4-5": "path", "1-2": "", "2-5": "" } };
    snap("Etäisyys solmuun 5 on 2. Eräs lyhin polku on 1 → 4 → 5, jolla on 2 kaarta.", null, null, pathA);
    const pathB = { cls: { 1: "cur", 2: "act", 5: "cur" }, ecls: { "1-2": "path", "2-5": "path" } };
    snap("Myös polku 1 → 2 → 5 on lyhin polku. Metodi `find_path(1, 5)` palauttaa tämän polun, koska leveyshaku löytää solmun 5 ensin solmun 2 kautta.", null, null, pathB);
    new Player(fig, { frames, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  // Maze exploration with the recursive explore function.
  register("maze", (fig) => {
    const ORIGINAL = [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 1, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1],
    ];
    const CODE = `def explore(grid, y, x):
    if grid[y][x] != 0:
        return

    print("visit", y, x)
    grid[y][x] = 2

    explore(grid, y - 1, x)
    explore(grid, y + 1, x)
    explore(grid, y, x - 1)
    explore(grid, y, x + 1)`;
    let grid = ORIGINAL.map((r) => r.slice());
    let editing = false;
    const ui = frame(fig, { title: "Labyrintin läpikäynti syvyyshaulla", split: true, kicker: "Animaatio" });
    const C = 44;
    const sc = new Scene(ui.stage, { w: 8 * C + 16, h: 6 * C + 16 });
    const code = new CodePanel(ui.side, CODE);
    const out = new OutputPanel(ui.side);
    const tools = h("div", { class: "viz-tools" });
    const btnEdit = h("button", { type: "button", class: "viz-btn is-text", text: "Muokkaa seiniä" });
    const btnReset = h("button", { type: "button", class: "viz-btn is-text", text: "Palauta alkuperäinen" });
    tools.append(btnEdit, btnReset);
    ui.main.after(tools);

    function cellState(g, extra = {}) {
      const nodes = [];
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 8; x++) {
          const id = `${y},${x}`;
          let cls = g[y][x] === 1 ? "wall" : "floor";
          if (extra.cls && extra.cls[id]) cls = extra.cls[id];
          nodes.push({ id, x: 8 + C / 2 + x * C, y: 8 + C / 2 + y * C, shape: "rect", w: C - 4, h: C - 4, rx: 7,
            label: extra.label && extra.label[id] != null ? extra.label[id] : "", cls: `${cls} is-mono is-small`, click: editing });
        }
      }
      return { nodes, edges: [] };
    }
    function simulate() {
      const g = grid.map((r) => r.slice());
      const frames = [];
      const lines = [];
      const order = {};
      const stack = [];
      const finished = new Set();
      let n = 0;
      const snap = (cap, line) => {
        const cls = {};
        for (const id of Object.keys(order)) cls[id] = finished.has(id) ? "done" : "act";
        if (stack.length) cls[stack[stack.length - 1]] = "cur";
        frames.push({ st: cellState(g, { cls, label: { ...order } }), cap, line, out: lines.slice() });
      };
      snap("Kutsutaan `explore(grid, 1, 1)`. Lattiaruudut ovat valkoisia ja seinät tummia.", []);
      const depthLimit = 200;
      (function explore(y, x, depth) {
        if (depth > depthLimit || g[y][x] !== 0) return;
        lines.push(`visit ${y} ${x}`);
        g[y][x] = 2;
        const id = `${y},${x}`;
        order[id] = ++n;
        stack.push(id);
        snap(`Ruutu (${y}, ${x}) on lattiaa, jossa ei ole käyty: tulostetaan \`visit ${y} ${x}\` ja merkitään ruutuun 2. Haku jatkuu ylös, alas, vasemmalle ja oikealle.`, [5, 6]);
        explore(y - 1, x, depth + 1);
        explore(y + 1, x, depth + 1);
        explore(y, x - 1, depth + 1);
        explore(y, x + 1, depth + 1);
        finished.add(id);
        stack.pop();
      })(1, 1, 0);
      if (!n) snap("Aloitusruutu (1, 1) on seinää, joten funktio palaa heti.", [2, 3]);
      else snap(`Valmis: haku kävi ${n} ruudussa. Numerot kertovat järjestyksen, jossa ruudut löydettiin.`, []);
      return frames;
    }
    let player = null;
    function rebuild() {
      const frames = simulate();
      if (!player) {
        player = new Player(fig, { frames, interval: 900, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); out.set(f.out); } });
      } else player.setFrames(frames);
    }
    sc.onNodeClick = (id) => {
      if (!editing) return;
      const [y, x] = id.split(",").map(Number);
      if (y === 0 || x === 0 || y === 5 || x === 7) return;
      grid[y][x] = grid[y][x] === 1 ? 0 : 1;
      sc.set(cellState(grid), true);
    };
    btnEdit.addEventListener("click", () => {
      editing = !editing;
      btnEdit.textContent = editing ? "Valmis – aja haku" : "Muokkaa seiniä";
      btnEdit.classList.toggle("is-primary", editing);
      if (editing) {
        player.pause();
        sc.set(cellState(grid), true);
        ui.setCaption("Klikkaa ruutuja vaihtaaksesi seinän ja lattian välillä. Reunat ovat aina seinää. Paina lopuksi **Valmis – aja haku**.");
      } else rebuild();
    });
    btnReset.addEventListener("click", () => {
      grid = ORIGINAL.map((r) => r.slice());
      editing = false;
      btnEdit.textContent = "Muokkaa seiniä";
      btnEdit.classList.remove("is-primary");
      rebuild();
    });
    rebuild();
  });

  /* ========================================= Chapter 13: directed graphs */

  function reachable(adj, start) {
    const seen = new Set([start]);
    const q = [start];
    for (let i = 0; i < q.length; i++) for (const w of adj[q[i]]) if (!seen.has(w)) { seen.add(w); q.push(w); }
    return seen;
  }

  register("digraph", (fig, { mode }) => {
    const G = SUUVER;
    const adj = adjacency(G);
    if (mode === "scc") {
      const ui = frame(fig, { title: "Vahvasti yhtenäiset komponentit", kicker: "Kuva" });
      const sc = sceneFor(ui, G);
      const cls = { 1: "c1", 2: "c1", 4: "c1", 3: "c0", 5: "c2" };
      sc.set(makeState(G, { cls, ecls: { "1>2": "c1", "2>4": "c1", "4>1": "c1" },
        marks: [{ id: "a", type: "hull", nodes: ["1", "2", "4"], cls: "c1", pad: 10 }, { id: "b", type: "hull", nodes: ["3"], cls: "c0", pad: 8 }, { id: "c", type: "hull", nodes: ["5"], cls: "c2", pad: 8 }] }), true);
      ui.setCaption("Komponentit ovat {1, 2, 4}, {3} ja {5}: solmut 1, 2 ja 4 ovat syklillä 1 → 2 → 4 → 1, mutta solmusta 5 ei pääse minnekään ja solmuun 3 ei pääse mistään.");
      return;
    }
    const ui = frame(fig, { title: "Suunnattu verkko", kicker: "Kokeile" });
    const sc = sceneFor(ui, G);
    function select(id) {
      const r = reachable(adj, id);
      const cls = {};
      const ecls = {};
      for (const v of r) cls[v] = "done";
      cls[id] = "cur";
      for (const [a, b] of G.edges) if (r.has(String(a))) ecls[eid(a, b, true)] = "done";
      sc.set(makeState(G, { cls, ecls, click: true }));
      const others = [...r].filter((v) => v !== id).map(Number).sort((a, b) => a - b);
      ui.setCaption(others.length
        ? `Kaaria niiden suuntaan kulkemalla solmusta ${id} pääsee ${toNodes(others)}. Klikkaa toista solmua.`
        : `Solmusta ${id} ei lähde yhtään kaarta, joten siitä ei pääse mihinkään muuhun solmuun. Klikkaa toista solmua.`);
    }
    sc.onNodeClick = select;
    select("1");
  });

  // Topological order: the DAG itself, and the same DAG laid out in a line.
  const TOPO_ORDER = ["4", "1", "5", "2", "3", "6"];
  const TOPO_LINE_BEND = { "4>5": -0.42, "1>2": 0.42, "5>3": -0.42 };
  register("topo", (fig, { mode }) => {
    const G = TOPO;
    if (mode !== "line") {
      const ui = frame(fig, { title: "Suunnattu syklitön verkko", kicker: "Kuva" });
      const sc = sceneFor(ui, G);
      sc.set(makeState(G, {}), true);
      ui.setCaption("Verkossa ei ole sykliä, joten sille on olemassa topologinen järjestys.");
      return;
    }
    const ui = frame(fig, { title: "Topologinen järjestys", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const linePos = {};
    TOPO_ORDER.forEach((v, i) => { linePos[v] = [45 + i * 66, 112]; });
    const graphState = makeState(G, {});
    const lineG = { ...G, pos: linePos };
    const lineState = makeState(lineG, { bend: TOPO_LINE_BEND, badge: Object.fromEntries(TOPO_ORDER.map((v, i) => [v, i + 1])) });
    const frames = [
      { st: graphState, cap: "Asetellaan verkon solmut uudestaan topologisen järjestyksen [4, 1, 5, 2, 3, 6] mukaisesti…" },
      { st: lineState, cap: "Topologisessa järjestyksessä [4, 1, 5, 2, 3, 6] kaikki kaaret kulkevat vasemmalta oikealle." },
    ];
    const player = new Player(fig, { frames, interval: 1400, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible(500, 0.6);
  });

  // TopologicalSort.create with node states 0/1/2 (and a variant with a cycle).
  register("toposort", (fig) => {
    const CODE = `def visit(self, node):
    if self.state[node] == 1:
        self.cycle = True
        return
    if self.state[node] == 2:
        return

    self.state[node] = 1
    for next_node in self.graph[node]:
        self.visit(next_node)

    self.state[node] = 2
    self.order.append(node)`;
    let tab = "dag";
    const ui = frame(fig, { title: "Topologisen järjestyksen muodostaminen", split: true, kicker: "Animaatio",
      tabs: [["dag", "Syklitön verkko"], ["cycle", "Verkossa sykli"]], tab, onTab: (t) => { tab = t; build(); } });
    // Extra room at the top for the arc 3 → 1 of the cyclic variant, which passes above the labels.
    const BASE = { ...TOPO, h: TOPO.h + 26, pos: Object.fromEntries(Object.entries(TOPO.pos).map(([v, [x, y]]) => [v, [x, y + 26]])) };
    const sc = sceneFor(ui, BASE);
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Tila");
    let player = null;
    function build() {
      const G = tab === "dag" ? BASE : { ...BASE, edges: TOPO.edges.concat([[3, 1, null, 0.42]]) };
      const adj = adjacency(G);
      const state = {};
      Object.keys(G.pos).forEach((v) => { state[v] = 0; });
      const order = [];
      let cycle = false;
      const frames = [];
      let edge = null;
      const snap = (cap, line, cur) => {
        const cls = {};
        for (const [v, s] of Object.entries(state)) cls[v] = s === 1 ? "act" : s === 2 ? "done" : "";
        if (cur) cls[cur] = s1(cur);
        const ecls = {};
        if (edge) ecls[edge] = cycle && edge === "3>1" ? "bad" : "act";
        frames.push({ st: makeState(G, { cls, ecls, sub: Object.fromEntries(Object.entries(state).map(([v, s]) => [v, `tila ${s}`])) }), cap, line,
          vars: [{ k: "order", v: `[${order.join(", ")}]` }, { k: "cycle", v: cycle ? "True" : "False", cls: cycle ? "hl" : "" }] });
      };
      const s1 = (v) => (state[v] === 1 ? "cur" : state[v] === 2 ? "done" : "cur");
      function visit(node) {
        if (state[node] === 1) { cycle = true; snap(`Solmun ${node} tila on 1 eli sen käsittely on kesken: verkossa on sykli!`, [2, 3], node); return; }
        if (state[node] === 2) { snap(`Solmun ${node} käsittely on jo valmis (tila 2), joten palataan.`, [5, 6], node); return; }
        state[node] = 1;
        snap(`Haku saapuu solmuun ${node}: tila 1.`, 8, node);
        for (const next of adj[node]) {
          edge = eid(node, next, true);
          snap(`Kuljetaan kaari ${node} → ${next}.`, [9, 10], node);
          visit(next);
          edge = null;
        }
        state[node] = 2;
        order.push(node);
        snap(`Kaikki solmusta ${node} lähtevät kaaret on käsitelty: tila 2 ja solmu ${node} lisätään listan loppuun.`, [12, 13], node);
      }
      snap("Aluksi jokaisen solmun tila on 0.", []);
      for (const node of Object.keys(G.pos)) {
        if (state[node] === 0) {
          snap(`Metodi \`create\` aloittaa syvyyshaun solmusta ${node}, jonka tila on 0.`, [], node);
          visit(node);
        }
      }
      if (cycle) snap("Koska `cycle` on `True`, topologista järjestystä ei ole olemassa ja metodi palauttaa `None`. Sykli on 1 → 2 → 3 → 1.", []);
      else snap(`Lopuksi lista käännetään: topologinen järjestys on [${order.slice().reverse().join(", ")}].`, []);
      if (!player) player = new Player(fig, { frames, interval: 1100, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
      else player.setFrames(frames);
    }
    build();
  });

  // CountPaths: number of paths from 4 to 3 with memoization.
  register("dag-paths", (fig) => {
    const G = TOPO;
    const adj = adjacency(G);
    const ui = frame(fig, { title: "Polkujen määrä dynaamisella ohjelmoinnilla", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const vars = new VarsPanel(ui.side, "result");
    const result = { 3: 1 };
    const frames = [];
    const stack = [];
    const snap = (cap, edge, extra = {}) => {
      const cls = {};
      for (const v of Object.keys(result)) cls[v] = "done";
      stack.forEach((v) => { cls[v] = "act"; });
      if (stack.length) cls[stack[stack.length - 1]] = "cur";
      cls[3] = cls[3] === "cur" ? "cur" : "okf";
      Object.assign(cls, extra.cls || {});
      const ecls = { ...(extra.ecls || {}) };
      if (edge) ecls[edge] = "act";
      frames.push({ st: makeState(G, { cls, ecls, sub: Object.fromEntries(Object.entries(result).map(([v, c]) => [v, `${c} ${c === 1 ? "polku" : "polkua"}`])) }), cap,
        vars: Object.keys(result).map((v) => ({ k: `result[${v}]`, v: String(result[v]) })) });
    };
    snap("Kohdesolmuna on 3: sanakirjaan `result` merkitään valmiiksi, että solmusta 3 on 1 polku itseensä.");
    function countFrom(node, from) {
      if (node in result) { snap(`Polkujen määrä solmusta ${node} on jo laskettu: ${result[node]}.`, from ? eid(from, node, true) : null); return result[node]; }
      stack.push(node);
      snap(`Lasketaan polkujen määrä solmusta ${node} käymällä läpi solmusta lähtevät kaaret.`, from ? eid(from, node, true) : null);
      let total = 0;
      for (const next of adj[node]) total += countFrom(next, node);
      result[node] = total;
      snap(`Solmusta ${node} on ${total} ${total === 1 ? "polku" : "polkua"} solmuun 3.`);
      stack.pop();
      return total;
    }
    countFrom("4", null);
    const paths = [["4", "1", "2", "3"], ["4", "5", "2", "3"], ["4", "5", "3"]];
    paths.forEach((p, i) => {
      const ecls = {};
      const cls = {};
      p.forEach((v, j) => { cls[v] = j === 0 || j === p.length - 1 ? "cur" : "act"; if (j) ecls[eid(p[j - 1], v, true)] = "path"; });
      snap(`Polku ${i + 1}/3: ${p.join(" → ")}.`, null, { cls, ecls });
    });
    new Player(fig, { frames, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  // Coin problem as a DAG (coins 1, 3 and 4; sum 6).
  register("coin-dag", (fig) => {
    const coins = [1, 3, 4];
    const X = 6;
    const pos = {};
    for (let i = 0; i <= X; i++) pos[i] = [70 + i * 72, 100];
    const edges = [];
    for (let a = 0; a <= X; a++) {
      for (const c of coins) {
        const b = a + c;
        if (b <= X) edges.push([a, b, null, c === 1 ? 0 : c === 3 ? -0.36 : 0.3]);
      }
    }
    const G = { w: 530, h: 215, dir: true, pos, edges, r: 18 };
    const ui = frame(fig, { title: "Rahamäärät verkkona", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const count = { 0: 1 };
    const frames = [];
    const snap = (cap, cur, ecls = {}, cls = {}) => {
      const c2 = { ...cls };
      for (const v of Object.keys(count)) if (!c2[v]) c2[v] = "done";
      if (cur != null) c2[cur] = "cur";
      // The path counts go in their own row below the arcs.
      const marks = [{ id: "cnt-h", type: "text", x: 8, y: 196, text: "polkuja", cls: "faint", anchor: "start" }];
      for (const [v, c] of Object.entries(count)) marks.push({ id: `cnt${v}`, type: "text", x: pos[v][0], y: 196, text: String(c), cls: String(v) === String(cur) ? "cur mono big" : "mono big" });
      frames.push({ st: makeState(G, { cls: c2, ecls, marks }), cap });
    };
    snap("Solmu x tarkoittaa rahamäärää x ja kaari kolikkoa 1, 3 tai 4. Rahamäärään 0 on yksi tapa (tyhjä polku).", 0);
    for (let b = 1; b <= X; b++) {
      const ins = coins.filter((c) => b - c >= 0);
      const ecls = {};
      ins.forEach((c) => { ecls[eid(b - c, b, true)] = "act"; });
      count[b] = ins.reduce((t, c) => t + count[b - c], 0);
      snap(`Rahamäärään ${b} tullaan solmuista ${list(ins.map((c) => b - c))}, joten polkuja on ${ins.map((c) => count[b - c]).join(" + ")} = ${count[b]}.`, b, ecls);
    }
    const all = [];
    (function rec(a, p) { if (a === X) { all.push(p.slice()); return; } for (const c of coins) if (a + c <= X) { p.push(c); rec(a + c, p); p.pop(); } })(0, []);
    all.forEach((p, i) => {
      const ecls = {};
      const cls = {};
      let a = 0;
      cls[0] = "cur";
      for (const c of p) { ecls[eid(a, a + c, true)] = "path"; a += c; cls[a] = "act"; }
      cls[X] = "cur";
      snap(`Polku ${i + 1}/${all.length} vastaa tapaa [${p.join(", ")}].`, null, ecls, cls);
    });
    new Player(fig, { frames, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
  });

  // Strong connectivity: two small graphs, click to see what is reachable.
  register("strong", (fig) => {
    const L = [[1, 2], [2, 4], [4, 3], [3, 1]];
    const R = [[1, 2], [1, 3], [2, 4], [4, 3]];
    const base = { 1: [60, 48], 2: [190, 48], 3: [60, 170], 4: [190, 170] };
    const pos = {};
    const labels = {};
    for (const [v, [x, y]] of Object.entries(base)) { pos[`L${v}`] = [x, y]; pos[`R${v}`] = [x + 290, y]; labels[`L${v}`] = v; labels[`R${v}`] = v; }
    const edges = L.map(([a, b]) => [`L${a}`, `L${b}`]).concat(R.map(([a, b]) => [`R${a}`, `R${b}`]));
    const G = { w: 545, h: 218, dir: true, pos, labels, edges };
    const adj = adjacency(G);
    const ui = frame(fig, { title: "Vahva yhtenäisyys", kicker: "Kokeile" });
    const sc = sceneFor(ui, G);
    function select(id) {
      const r = reachable(adj, id);
      const cls = {};
      const ecls = {};
      for (const v of r) cls[v] = "done";
      cls[id] = "cur";
      for (const [a, b] of G.edges) if (r.has(a)) ecls[eid(a, b, true)] = "done";
      const side = id[0] === "L" ? "Vasemmassa" : "Oikeassa";
      const missing = Object.keys(pos).filter((v) => v[0] === id[0] && !r.has(v)).map((v) => v.slice(1));
      const marks = [{ id: "tl", type: "text", x: 125, y: 206, text: "vahvasti yhtenäinen", cls: "ok" }, { id: "tr", type: "text", x: 415, y: 206, text: "ei vahvasti yhtenäinen", cls: "bad" }];
      sc.set(makeState(G, { cls, ecls, click: true, marks }));
      ui.setCaption(missing.length
        ? `${side} verkossa solmusta ${id.slice(1)} ei pääse ${toNodes(missing)}. Klikkaa muita solmuja.`
        : `${side} verkossa solmusta ${id.slice(1)} pääsee kaikkiin solmuihin. Klikkaa muita solmuja.`);
    }
    sc.onNodeClick = select;
    select("R2");
  });

  // Strongly connected components of the example graph.
  const SCC_COMP = { 1: 0, 2: 0, 3: 1, 6: 1, 7: 1, 4: 2, 5: 3 };
  const SCC_NAMES = ["A", "B", "C", "D"];
  register("scc", (fig, { mode }) => {
    const G = SCC;
    if (mode === "graph") {
      const ui = frame(fig, { title: "Suunnattu verkko", kicker: "Kuva" });
      const sc = sceneFor(ui, G);
      sc.set(makeState(G, {}), true);
      ui.setCaption("Esimerkkiverkossa on 7 solmua ja 10 kaarta.");
      return;
    }
    const compCls = (c) => `c${c}`;
    const cls = {};
    const ecls = {};
    for (const [v, c] of Object.entries(SCC_COMP)) cls[v] = compCls(c);
    for (const [a, b] of G.edges) if (SCC_COMP[a] === SCC_COMP[b]) ecls[eid(a, b, true)] = compCls(SCC_COMP[a]);
    const hulls = [0, 1, 2, 3].map((c) => ({ id: `h${c}`, type: "hull", nodes: Object.keys(SCC_COMP).filter((v) => SCC_COMP[v] === c), cls: compCls(c), pad: 11 }));
    const labels = [{ id: "lA", type: "text", x: 124, y: 13, text: "A", cls: "big" }, { id: "lB", type: "text", x: 376, y: 13, text: "B", cls: "big" }, { id: "lC", type: "text", x: 20, y: 178, text: "C", cls: "big" }, { id: "lD", type: "text", x: 236, y: 205, text: "D", cls: "big" }];
    const compState = makeState(G, { cls, ecls, marks: hulls.concat(labels) });
    if (mode === "components") {
      const ui = frame(fig, { title: "Vahvasti yhtenäiset komponentit", kicker: "Kuva" });
      const sc = sceneFor(ui, G);
      sc.set(compState, true);
      ui.setCaption("Komponentit ovat A = {1, 2}, B = {3, 6, 7}, C = {4} ja D = {5}. Komponentin sisällä mistä tahansa solmusta pääsee mihin tahansa solmuun.");
      return;
    }
    // mode "condense": collapse each component into one node
    const ui = frame(fig, { title: "Komponenttiverkko", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const centre = { 0: [124, 52], 1: [370, 115], 2: [58, 178], 3: [190, 178] };
    const cNodes = [0, 1, 2, 3].map((c) => ({ id: SCC_NAMES[c], x: centre[c][0], y: centre[c][1], label: SCC_NAMES[c], cls: `solid ${compCls(c)}`, r: 22 }));
    const cEdges = [["A", "C"], ["A", "D"], ["B", "A"], ["B", "D"], ["D", "C"]].map(([a, b]) => ({ id: `${a}>${b}`, a, b, dir: true }));
    const merged = { nodes: Object.keys(SCC_COMP).map((v) => ({ id: v, x: centre[SCC_COMP[v]][0], y: centre[SCC_COMP[v]][1], label: "", cls: `plain`, r: 4 })).concat(cNodes), edges: cEdges, marks: [] };
    const frames = [
      { st: compState, cap: "Yhdistetään jokaisen komponentin solmut yhdeksi solmuksi…" },
      { st: merged, cap: "Komponenttiverkossa A = {1, 2}, B = {3, 6, 7}, C = {4} ja D = {5}. Verkko on syklitön ja näyttää, miten komponenteista pääsee toisiin." },
    ];
    const player = new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible(600, 0.6);
  });

  // Kosaraju's algorithm (both phases), as in the Kosaraju class.
  register("kosaraju", (fig) => {
    const G = SCC;
    const adj = adjacency(G);
    const radj = {};
    for (const v of Object.keys(G.pos)) radj[v] = [];
    for (const [a, b] of G.edges) radj[b].push(String(a));
    const RG = { ...G, edges: G.edges.map(([a, b, w, bend]) => [b, a, w, bend]) };
    const ui = frame(fig, { title: "Kosarajun algoritmi", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const vars = new VarsPanel(ui.side, "Tila");
    const visited = new Set();
    const order = [];
    const frames = [];
    const comp = {};
    let count = 0;
    let phase = 1;
    let stack = [];
    const snap = (cap, edge) => {
      const graph = phase === 1 ? G : RG;
      const cls = {};
      for (const v of visited) cls[v] = phase === 1 ? "done" : "";
      for (const [v, c] of Object.entries(comp)) cls[v] = `c${(c - 1) % 6}`;
      stack.forEach((v) => { if (!comp[v]) cls[v] = "act"; });
      if (stack.length) cls[stack[stack.length - 1]] = "cur";
      const ecls = {};
      if (phase === 2) for (const [a, b] of graph.edges) if (comp[a] && comp[a] === comp[b]) ecls[eid(a, b, true)] = `c${(comp[a] - 1) % 6}`;
      if (edge) ecls[edge] = "act";
      frames.push({ st: makeState(graph, { cls, ecls, badge: phase === 1 ? Object.fromEntries(order.map((v, i) => [v, i + 1])) : {} }), cap,
        vars: [{ k: "vaihe", v: String(phase) }, { k: "order", v: `[${order.join(", ")}]` }].concat(phase === 2 ? [{ k: "count", v: String(count) }] : []) });
    };
    snap("Ensimmäinen vaihe: syvyyshaut alkuperäisessä verkossa. Solmu lisätään listaan `order`, kun sen käsittely päättyy.");
    function visit1(node, from) {
      if (visited.has(node)) return;
      visited.add(node);
      stack.push(node);
      snap(`Haku saapuu solmuun ${node}.`, from ? eid(from, node, true) : null);
      for (const next of adj[node]) visit1(next, node);
      order.push(node);
      snap(`Solmun ${node} käsittely päättyy: lisätään ${node} listaan.`);
      stack.pop();
    }
    for (const node of Object.keys(G.pos)) visit1(node, null);
    order.reverse();
    phase = 2;
    visited.clear();
    snap(`Lista käännetään: [${order.join(", ")}]. Toinen vaihe tehdään käänteisessä verkossa, jossa jokaisen kaaren suunta on käännetty.`);
    function visit2(node, from) {
      if (visited.has(node)) return;
      visited.add(node);
      comp[node] = count;
      stack.push(node);
      snap(`Solmu ${node} kuuluu komponenttiin ${count}.`, from ? eid(from, node, true) : null);
      for (const next of radj[node]) visit2(next, node);
      stack.pop();
    }
    for (const node of order) {
      if (!visited.has(node)) {
        count += 1;
        snap(`Solmua ${node} ei ole käsitelty: aloitetaan siitä uusi haku, joka muodostaa komponentin ${count}.`);
        visit2(node, null);
      }
    }
    stack = [];
    snap(`Valmis: verkossa on ${count} vahvasti yhtenäistä komponenttia.`);
    new Player(fig, { frames, interval: 1000, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  /* ========================================= Chapter 14: shortest paths */

  register("weighted", (fig, { mode }) => {
    const G = LYHPOL;
    const ui = frame(fig, { title: "Painotettu verkko", kicker: "Kuva" });
    const sc = sceneFor(ui, G);
    if (mode === "example") {
      sc.set(makeState(G, { cls: { 1: "cur", 3: "act", 2: "cur" }, ecls: { "1>3": "path", "3>2": "path" } }), true);
      ui.setCaption("Polun 1 → 3 → 2 pituus on 1 + 4 = 5.");
    } else {
      sc.set(makeState(G, {}), true);
      ui.setCaption("Kaarten yhteydessä on niiden painot.");
    }
  });

  const BF_CODE = `for _ in range(num_rounds):
    for edge in self.edges:
        node_a, node_b, weight = edge
        new_distance = distances[node_a] + weight
        if new_distance < distances[node_b]:
            print("update", node_a, node_b, new_distance)
            distances[node_b] = new_distance`;
  register("bellman-ford", (fig) => {
    const G = LYHPOL;
    const ui = frame(fig, { title: "Bellman-Ford-algoritmi", split: true, kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const code = new CodePanel(ui.side, BF_CODE);
    const out = new OutputPanel(ui.side);
    const dist = {};
    Object.keys(G.pos).forEach((v) => { dist[v] = Infinity; });
    dist[1] = 0;
    const frames = [];
    const lines = [];
    const sub = () => Object.fromEntries(Object.entries(dist).map(([v, d]) => [v, d === Infinity ? "∞" : d]));
    const snap = (cap, line, edge, eclsCls = "act", changed = null) => {
      const cls = {};
      for (const [v, d] of Object.entries(dist)) if (d !== Infinity) cls[v] = "done";
      if (changed) cls[changed] = "cur";
      frames.push({ st: makeState(G, { cls, ecls: edge ? { [edge]: eclsCls } : {}, sub: sub(), subPos: { 1: "above", 2: "above", 3: "below", 4: "below", 5: "right" } }), cap, line, out: lines.slice() });
    };
    snap("Alussa etäisyys alkusolmuun 1 on 0 ja kaikkiin muihin solmuihin ∞.", []);
    const rounds = Object.keys(G.pos).length - 1;
    for (let r = 1; r <= rounds; r++) {
      for (const [a, b, w] of G.edges) {
        const e = eid(a, b, true);
        const nd = dist[a] + w;
        if (nd < dist[b]) {
          lines.push(`update ${a} ${b} ${nd}`);
          const old = dist[b];
          dist[b] = nd;
          snap(`Kierros ${r}: kaari ${a} → ${b} (paino ${w}) antaa uuden etäisyyden ${dist[a]} + ${w} = ${nd}, joka on pienempi kuin ${old === Infinity ? "∞" : old}.`, [5, 6, 7], e, "act", String(b));
        } else {
          snap(`Kierros ${r}: kaari ${a} → ${b} antaisi etäisyyden ${dist[a] === Infinity ? "∞" : `${dist[a]} + ${w} = ${nd}`}, mikä ei ole pienempi kuin ${dist[b] === Infinity ? "∞" : dist[b]}.`, [4, 5], e, "ghost");
        }
      }
    }
    snap("Neljän kierroksen jälkeen etäisyydet ovat lopulliset: {1: 0, 2: 4, 3: 1, 4: 3, 5: 6}.", []);
    new Player(fig, { frames, interval: 950, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); out.set(f.out); } });
  });

  const DIJ_CODE = `while queue:
    node_a = heapq.heappop(queue)[1]
    if node_a in visited:
        continue
    visited.add(node_a)

    for node_b, weight in self.graph[node_a]:
        new_distance = distances[node_a] + weight
        if new_distance < distances[node_b]:
            distances[node_b] = new_distance
            new_pair = (new_distance, node_b)
            heapq.heappush(queue, new_pair)`;
  register("dijkstra", (fig) => {
    const G = LYHPOL;
    const adj = adjacency(G);
    const ui = frame(fig, { title: "Dijkstran algoritmi", split: true, kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const code = new CodePanel(ui.side, DIJ_CODE);
    const vars = new VarsPanel(ui.side, "Tila");
    const dist = {};
    Object.keys(G.pos).forEach((v) => { dist[v] = Infinity; });
    dist[1] = 0;
    const visited = new Set();
    const heap = [[0, "1"]];
    const frames = [];
    const heapStr = () => `[${heap.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(([d, v]) => `(${d}, ${v})`).join(", ")}]`;
    const snap = (cap, line, cur, edge, ecls = "act") => {
      const cls = {};
      for (const [d, v] of heap) if (!visited.has(v)) cls[v] = "act";
      for (const v of visited) cls[v] = "done";
      if (cur) cls[cur] = "cur";
      frames.push({ st: makeState(G, { cls, ecls: edge ? { [edge]: ecls } : {}, sub: Object.fromEntries(Object.entries(dist).map(([v, d]) => [v, d === Infinity ? "∞" : d])), subPos: { 1: "above", 2: "above", 3: "below", 4: "below", 5: "right" } }), cap, line,
        vars: [{ k: "queue", v: heapStr() }, { k: "visited", v: new Set([...visited].map(Number)) }] });
    };
    snap("Kekoon laitetaan pari (0, 1): alkusolmun etäisyys on 0.", []);
    while (heap.length) {
      heap.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const [d, a] = heap.shift();
      if (visited.has(a)) { snap(`Keosta otetaan pari (${d}, ${a}), mutta solmussa ${a} on jo käyty, joten se ohitetaan.`, [2, 3, 4], a); continue; }
      visited.add(a);
      snap(`Keosta otetaan pari (${d}, ${a}): solmun ${a} pienin etäisyys ${d} on nyt varma.`, [2, 5], a);
      for (const [b, w] of adj[a]) {
        const nd = dist[a] + w;
        const e = eid(a, b, true);
        if (nd < dist[b]) {
          dist[b] = nd;
          heap.push([nd, b]);
          snap(`Kaari ${a} → ${b}: ${dist[a]} + ${w} = ${nd} on pienempi kuin aiempi etäisyys, joten pari (${nd}, ${b}) lisätään kekoon.`, [9, 10, 11, 12], a, e);
        } else snap(`Kaari ${a} → ${b}: ${dist[a]} + ${w} = ${nd} ei paranna etäisyyttä ${dist[b]}.`, [8, 9], a, e, "ghost");
      }
    }
    snap("Keko on tyhjä. Etäisyydet ovat {1: 0, 2: 4, 3: 1, 4: 3, 5: 6} kuten Bellman-Ford-algoritmissa.", []);
    new Player(fig, { frames, interval: 1050, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  });

  // Floyd–Warshall: the distance matrix is updated through each middle node k.
  register("floyd-warshall", (fig) => {
    const G = LYHPOL;
    const ids = Object.keys(G.pos).sort((a, b) => a - b);
    const ui = frame(fig, { title: "Floyd-Warshall-algoritmi", split: true, kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const matrixPanel = h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "distances" }), h("span", { class: "fw-k" })));
    const table = h("table", { class: "vz-matrix" });
    matrixPanel.appendChild(table);
    ui.side.appendChild(matrixPanel);
    const d = {};
    for (const a of ids) for (const b of ids) d[`${a},${b}`] = a === b ? 0 : Infinity;
    for (const [a, b, w] of G.edges) d[`${a},${b}`] = Math.min(d[`${a},${b}`], w);
    const frames = [];
    const snap = (cap, k, hi = null, via = null) => {
      const cls = {};
      const ecls = {};
      if (k) cls[k] = "cur";
      if (hi) { const [a, b] = hi.split(","); cls[a] = cls[a] || "act"; cls[b] = cls[b] || "act"; }
      frames.push({ st: makeState(G, { cls, ecls }), cap, k, hi, m: { ...d }, via });
    };
    snap("Etäisyysmatriisin pohjana on vierusmatriisi: suorat kaaret, 0 lävistäjällä ja muuten ∞.", null);
    for (const k of ids) {
      snap(`Välisolmuna on nyt ${k}: kokeillaan, lyheneekö jokin polku kulkemalla solmun ${k} kautta.`, k);
      for (const a of ids) {
        for (const b of ids) {
          const nd = d[`${a},${k}`] + d[`${k},${b}`];
          if (nd < d[`${a},${b}`]) {
            const old = d[`${a},${b}`];
            d[`${a},${b}`] = nd;
            snap(`Polku ${a} → ${b} lyhenee kulkemalla solmun ${k} kautta: ${d[`${a},${k}`]} + ${d[`${k},${b}`]} = ${nd} < ${old === Infinity ? "∞" : old}.`, k, `${a},${b}`, k);
          }
        }
      }
    }
    snap("Valmis: matriisi sisältää kaikkien solmuparien väliset etäisyydet. Esimerkiksi etäisyys solmusta 3 solmuun 5 on 5.", null);
    function draw(f) {
      table.textContent = "";
      const head = h("tr", {}, h("th", { text: "" }), ...ids.map((b) => h("th", { text: b })));
      table.appendChild(head);
      for (const a of ids) {
        const tr = h("tr", {}, h("th", { text: a }));
        for (const b of ids) {
          const v = f.m[`${a},${b}`];
          const td = h("td", { text: v === Infinity ? "∞" : String(v) });
          if (f.hi === `${a},${b}`) td.className = "is-hl";
          else if (f.k && (a === f.k || b === f.k)) td.className = "is-k";
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      matrixPanel.querySelector(".fw-k").textContent = f.k ? `k = ${f.k}` : "";
    }
    new Player(fig, { frames, interval: 1300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); draw(f); } });
  });

  /* ======================= Chapter 15: union-find and spanning trees */

  // Forest layout for union-find: every set is drawn as a tree below its root.
  function forestLayout(nodes, link, w, top = 42, gap = 82) {
    const children = {};
    for (const v of nodes) children[v] = [];
    for (const v of nodes) if (link[v] != null) children[link[v]].push(v);
    const roots = nodes.filter((v) => link[v] == null);
    const pos = {};
    let leaf = 0;
    const leafX = {};
    function place(v, depth) {
      if (!children[v].length) { leafX[v] = leaf++; }
      else { for (const c of children[v]) place(c, depth + 1); leafX[v] = (leafX[children[v][0]] + leafX[children[v][children[v].length - 1]]) / 2; }
      pos[v] = [leafX[v], top + depth * gap];
    }
    for (const r of roots) { place(r, 0); leaf += 0.3; }
    const total = Math.max(1, leaf - 0.3);
    const step = Math.min(70, (w - 60) / Math.max(1, total - 1 || 1));
    const span = (total - 1) * step;
    const x0 = (w - span) / 2;
    for (const v of nodes) pos[v] = [x0 + pos[v][0] * step, pos[v][1]];
    return pos;
  }

  register("union-find", (fig, { mode }) => {
    if (mode === "code") return unionFindCode(fig);
    const pos = { 1: [52, 48], 4: [52, 150], 5: [196, 48], 2: [146, 150], 6: [246, 150], 3: [372, 48], 7: [372, 145], 8: [372, 240] };
    const link = { 4: 1, 2: 5, 6: 5, 7: 3, 8: 7 };
    const G = (lk) => ({ w: 430, h: 275, dir: true, pos, edges: Object.entries(lk).map(([a, b]) => [a, b]) });
    const ui = frame(fig, { title: mode === "union" ? "Joukkojen yhdistäminen" : "Union-find-rakenne", kicker: "Animaatio" });
    const sc = new Scene(ui.stage, { w: 430, h: 275 });
    const reps = (lk) => Object.keys(pos).filter((v) => lk[v] == null);
    const st = (lk, cls = {}, ecls = {}) => makeState(G(lk), { cls: { ...Object.fromEntries(reps(lk).map((v) => [v, "ring"])), ...cls }, ecls });
    const link2 = { ...link, 1: 5 };
    const frames = [
      { st: st(link), cap: "Joukot ovat {1, 4}, {2, 5, 6} ja {3, 7, 8}. Joukkojen edustajat 1, 5 ja 3 on korostettu." },
      { st: st(link, { 2: "cur", 5: "cur" }, { "2>5": "path" }), cap: "Alkiosta 2 päästään edustajaan polkua 2 → 5." },
      { st: st(link, { 8: "cur", 7: "act", 3: "cur" }, { "8>7": "path", "7>3": "path" }), cap: "Alkiosta 8 päästään edustajaan polkua 8 → 7 → 3." },
      { st: st(link, { 2: "act", 6: "act", 5: "cur" }, { "2>5": "path", "6>5": "path" }), cap: "Alkioilla 2 ja 6 on yhteinen edustaja 5, joten ne kuuluvat samaan joukkoon." },
      { st: st(link2, { 1: "act" }, { "1>5": "act" }), cap: "Yhdistetään joukot {1, 4} ja {2, 5, 6}: edustaja 1 asetetaan viittaamaan edustajaan 5." },
      { st: st(link2, { 4: "cur", 1: "act", 5: "cur" }, { "4>1": "path", "1>5": "path" }), cap: "Uuden joukon {1, 2, 4, 5, 6} edustaja on 5. Alkiosta 4 päästään edustajaan polkua 4 → 1 → 5." },
    ];
    // The first figure explains find (frames 0-3), the second one the union (frames 0, 4, 5).
    const shown = mode === "union" ? [frames[0], frames[4], frames[5]] : frames.slice(0, 4);
    new Player(fig, { frames: shown, interval: 1700, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
  });

  function unionFindCode(fig) {
    const CODE = `def find(self, x):
    while self.link[x] is not None:
        x = self.link[x]
    return x

def union(self, a, b):
    a = self.find(a)
    b = self.find(b)
    if a == b: return

    if self.size[a] > self.size[b]:
        a, b = b, a
    self.link[a] = b
    self.size[b] += self.size[a]`;
    const nodes = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const ui = frame(fig, { title: "Yhdistämiset koodiesimerkissä", split: true, kicker: "Animaatio" });
    const sc = new Scene(ui.stage, { w: 420, h: 180, r: 17 });
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Tila");
    const link = {};
    const size = {};
    nodes.forEach((v) => { link[v] = null; size[v] = 1; });
    const frames = [];
    const snap = (cap, line, cls = {}, ecls = {}) => {
      const pos = forestLayout(nodes, link, 420);
      const G = { w: 420, h: 180, dir: true, pos, edges: nodes.filter((v) => link[v] != null).map((v) => [v, link[v]]) };
      const c = { ...cls };
      nodes.forEach((v) => { if (link[v] == null && !c[v]) c[v] = "ring"; });
      frames.push({ st: makeState(G, { cls: c, ecls, sub: Object.fromEntries(nodes.filter((v) => link[v] == null).map((v) => [v, `size ${size[v]}`])) }), cap, line,
        vars: [{ k: "link", v: `{${nodes.map((v) => `${v}: ${link[v] == null ? "None" : link[v]}`).join(", ")}}` }] });
    };
    const find = (x) => { while (link[x] != null) x = link[x]; return x; };
    snap("Aluksi jokainen alkio on omassa joukossaan ja on itse joukkonsa edustaja.", []);
    for (const [a0, b0] of [["1", "4"], ["2", "5"], ["5", "6"], ["3", "7"], ["7", "8"]]) {
      let a = find(a0);
      let b = find(b0);
      snap(`\`union(${a0}, ${b0})\`: edustajat ovat ${a} ja ${b}.`, [7, 8], { [a]: "cur", [b]: "cur" });
      const swap = size[a] > size[b];
      if (swap) [a, b] = [b, a];
      link[a] = b;
      size[b] += size[a];
      snap(swap
        ? `Joukko, jonka edustaja on ${a}, on pienempi, joten ${a} asetetaan viittaamaan solmuun ${b}. Uuden joukon koko on ${size[b]}.`
        : `Joukot ovat yhtä suuria (tai ensimmäinen on pienempi), joten ${a} asetetaan viittaamaan solmuun ${b}. Uuden joukon koko on ${size[b]}.`, swap ? [11, 12, 13, 14] : [13, 14], { [a]: "act", [b]: "cur" }, { [`${a}>${b}`]: "act" });
    }
    snap("Lopuksi `find` antaa joukon {1, 4} edustajaksi 4, joukon {2, 5, 6} edustajaksi 5 ja joukon {3, 7, 8} edustajaksi 7, kuten koodin tulostus näyttää.", [1, 2, 3, 4]);
    new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  }

  const SPAN = { w: 340, h: 200, pos: { 1: [40, 100], 2: [150, 42], 4: [285, 42], 3: [150, 158], 5: [285, 158] },
    edges: [[1, 2, 2], [1, 3, 4], [2, 3, 1], [2, 4, 2], [3, 5, 7], [4, 5, 5]] };

  register("tree-graph", (fig) => {
    const G = { w: 360, h: 195, pos: { 1: [50, 45], 3: [50, 152], 4: [200, 152], 2: [200, 45], 5: [312, 98] }, edges: [[1, 3], [3, 4], [2, 4], [4, 5]] };
    const ui = frame(fig, { title: "Puu verkkona", kicker: "Kuva" });
    const sc = sceneFor(ui, G);
    sc.set(makeState(G, { cls: { 1: "ok", 2: "ok", 5: "ok" }, sub: { 1: "lehti", 2: "lehti", 5: "lehti" }, subPos: { 1: "above", 2: "above", 5: "above" } }), true);
    ui.setCaption("Verkko on yhtenäinen ja syklitön. Lehtiä ovat solmut 1, 2 ja 5, joiden aste on 1. Viidellä solmulla on 5 − 1 = 4 kaarta.");
  });

  register("spanning", (fig, { mode }) => {
    const G = SPAN;
    const ui = frame(fig, { title: mode === "weighted" ? "Virittävien puiden painot" : "Virittävä puu", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const T1 = ["1-3", "2-3", "2-4", "4-5"];
    const T2 = ["1-2", "2-3", "2-4", "4-5"];
    const tree = (ids, cls) => { const e = {}; for (const [a, b] of G.edges) e[eid(a, b)] = ids.includes(eid(a, b)) ? cls : "ghost"; return e; };
    let frames;
    if (mode === "weighted") {
      frames = [
        { st: makeState(G, {}), cap: "Painotettu verkko." },
        { st: makeState(G, { ecls: tree(T1, "c1") }), cap: "Ensimmäisen virittävän puun paino on 4 + 1 + 2 + 5 = 12." },
        { st: makeState(G, { ecls: tree(T2, "ok") }), cap: "Toisen virittävän puun paino on 2 + 1 + 2 + 5 = 10. Tämä on verkon pienin virittävä puu." },
      ];
    } else {
      const T = ["1-3", "2-3", "2-4", "3-5"];
      frames = [
        { st: makeState(G, { noWeights: true }), cap: "Verkossa on 5 solmua ja 6 kaarta." },
        { st: makeState(G, { noWeights: true, ecls: tree(T, "done") }), cap: "Virittävä puu sisältää kaikki solmut ja 4 kaarta niin, että tuloksena on puu." },
      ];
    }
    const player = new Player(fig, { frames, interval: 2000, loop: true, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible(500, 0.6);
  });

  register("kruskal", (fig) => {
    const G = SPAN;
    const ui = frame(fig, { title: "Kruskalin algoritmi", split: true, kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const panel = h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: "Kaaret painojärjestyksessä" })));
    const tbl = h("table", { class: "vz-matrix vz-edgelist" });
    panel.appendChild(tbl);
    ui.side.appendChild(panel);
    const edges = G.edges.map(([a, b, w]) => ({ a: String(a), b: String(b), w })).sort((x, y) => x.w - y.w);
    const link = {};
    Object.keys(G.pos).forEach((v) => { link[v] = null; });
    const find = (x) => { while (link[x] != null) x = link[x]; return x; };
    const status = edges.map(() => "");
    const frames = [];
    let total = 0;
    const comps = () => {
      const roots = {};
      let c = 0;
      const cls = {};
      for (const v of Object.keys(G.pos)) { const r = find(v); if (!(r in roots)) roots[r] = c++; cls[v] = `c${roots[r] % 6}`; }
      return cls;
    };
    const snap = (cap, cur = -1) => {
      const ecls = {};
      edges.forEach((e, i) => { ecls[eid(e.a, e.b)] = status[i] === "ok" ? "ok" : status[i] === "no" ? "ghost" : ""; });
      if (cur >= 0) ecls[eid(edges[cur].a, edges[cur].b)] = status[cur] === "no" ? "bad" : "act";
      frames.push({ st: makeState(G, { cls: comps(), ecls }), cap, cur, status: status.slice(), total });
    };
    snap("Kaaret käydään läpi painojärjestyksessä. Värit näyttävät union-find-rakenteen joukot eli komponentit.");
    edges.forEach((e, i) => {
      if (find(e.a) !== find(e.b)) {
        link[find(e.a)] = find(e.b);
        status[i] = "ok";
        total += e.w;
        snap(`Kaari ${e.a}–${e.b} (paino ${e.w}) yhdistää kaksi eri komponenttia, joten se tulee mukaan puuhun.`, i);
      } else {
        status[i] = "no";
        snap(`Solmut ${e.a} ja ${e.b} ovat jo samassa komponentissa, joten kaari ${e.a}–${e.b} aiheuttaisi syklin eikä tule mukaan.`, i);
      }
    });
    snap(`Pienin virittävä puu on valmis: sen paino on ${total}.`);
    function draw(f) {
      tbl.textContent = "";
      tbl.appendChild(h("tr", {}, h("th", { text: "Kaari" }), h("th", { text: "Paino" }), h("th", { text: "Puuhun?" })));
      edges.forEach((e, i) => {
        const tr = h("tr", { class: i === f.cur ? "is-hl" : "" }, h("td", { text: `${e.a}–${e.b}` }), h("td", { text: String(e.w) }),
          h("td", { text: f.status[i] === "ok" ? "Kyllä" : f.status[i] === "no" ? "Ei" : "", class: f.status[i] === "ok" ? "is-ok" : f.status[i] === "no" ? "is-no" : "" }));
        tbl.appendChild(tr);
      });
      tbl.appendChild(h("tr", { class: "is-total" }, h("td", { text: "Paino" }), h("td", { text: String(f.total) }), h("td", { text: "" })));
    }
    new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); draw(f); } });
  });

  /* ================================================ Chapter 16: flows */

  const FLOWG = { w: 430, h: 240, dir: true, pos: { 1: [45, 120], 2: [175, 45], 3: [175, 195], 4: [325, 45], 5: [325, 195] },
    edges: [[1, 2, 4], [1, 3, 6], [2, 3, 8], [2, 4, 3], [3, 5, 4], [4, 5, 5]] };
  const FLOW_FINAL = { "1>2": 4, "1>3": 3, "2>3": 1, "2>4": 3, "3>5": 4, "4>5": 3 };

  // Flow particles moving along edges in proportion to the flow.
  function particles(sc, flows) {
    if (V.reduced.matches) return () => {};
    const g = sc.gOver;
    const dots = [];
    for (const [id, f] of Object.entries(flows)) {
      const eo = sc.edges.get(id);
      if (!eo || !f) continue;
      for (let i = 0; i < f; i++) {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("r", "3.2");
        c.setAttribute("class", "vz-dot");
        g.appendChild(c);
        dots.push({ c, eo, off: i / f });
      }
    }
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const tick = (now) => {
      const t = (now - t0) / 2600;
      for (const d of dots) {
        const len = d.eo.line.getTotalLength();
        const p = d.eo.line.getPointAtLength(((t + d.off) % 1) * len);
        d.c.setAttribute("cx", p.x);
        d.c.setAttribute("cy", p.y);
      }
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(tick); });
    io.observe(sc.svg);
    return () => { io.disconnect(); cancelAnimationFrame(raf); dots.forEach((d) => d.c.remove()); };
  }

  register("flow", (fig) => {
    const G = FLOWG;
    const ui = frame(fig, { title: "Maksimivirtaus", kicker: "Animaatio" });
    const sc = sceneFor(ui, G);
    const elabel = {};
    const ecls = {};
    for (const [a, b, c] of G.edges) { const id = eid(a, b, true); elabel[id] = `${FLOW_FINAL[id]}/${c}`; if (FLOW_FINAL[id] === c) ecls[id] = "done"; }
    sc.set(makeState(G, { elabel, ecls, cls: { 1: "cur", 5: "cur" } }), true);
    particles(sc, FLOW_FINAL);
    ui.setCaption("Merkintä x/c: kaaren kapasiteetti on c ja siitä on käytetty x. Solmusta 1 lähtee ja solmuun 5 saapuu virtaus 7; muissa solmuissa tuleva ja lähtevä virtaus on yhtä suuri. Täyteen käytetyt kaaret on korostettu.");
  });

  // Residual network: forward capacity and the reverse edge.
  function residualState(cap, o = {}) {
    const pos = FLOWG.pos;
    const edges = [];
    const labels = {};
    for (const [a, b] of FLOWG.edges) {
      edges.push([a, b, null, -0.2]);
      edges.push([b, a, null, -0.2]);
      labels[eid(a, b, true)] = cap[`${a}>${b}`];
      labels[eid(b, a, true)] = cap[`${b}>${a}`];
    }
    return makeState({ ...FLOWG, pos, edges }, { elabel: labels, ...o });
  }
  const capInit = () => {
    const c = {};
    for (const [a, b, w] of FLOWG.edges) { c[`${a}>${b}`] = w; c[`${b}>${a}`] = 0; }
    return c;
  };
  register("residual", (fig) => {
    const ui = frame(fig, { title: "Verkko Ford-Fulkerson-algoritmille", kicker: "Kuva" });
    const sc = new Scene(ui.stage, { w: FLOWG.w, h: FLOWG.h });
    const cap = capInit();
    const ecls = {};
    for (const [a, b] of FLOWG.edges) ecls[eid(b, a, true)] = "ghost";
    sc.set(residualState(cap, { ecls }), true);
    ui.setCaption("Jokaista kaarta kohden on vastakkaiseen suuntaan kulkeva kaari, jonka kapasiteetti on aluksi 0.");
  });

  register("ford-fulkerson", (fig) => {
    const ui = frame(fig, { title: "Ford-Fulkerson-algoritmi", kicker: "Animaatio" });
    const sc = new Scene(ui.stage, { w: FLOWG.w, h: FLOWG.h });
    const vars = new VarsPanel(ui.side, "Tila");
    const cap = capInit();
    const nodes = ["1", "2", "3", "4", "5"];
    let total = 0;
    const frames = [];
    const snap = (cap2, cap, ecls = {}, cls = {}) => {
      const e2 = { ...ecls };
      for (const k of Object.keys(cap)) if (cap[k] === 0 && !e2[k]) e2[k] = "ghost";
      frames.push({ st: residualState(cap, { ecls: e2, cls }), cap: cap2, vars: [{ k: "virtaus", v: String(total) }] });
    };
    snap("Alussa virtaus on 0. Etsitään täydennyspolkuja, joissa jokaisen kaaren kapasiteetti on positiivinen.", { ...cap });
    // Depth-first search over nodes 1..n like MaximumFlow.add_flow.
    for (;;) {
      const seen = new Set();
      const path = [];
      const dfs = (node, flow) => {
        if (seen.has(node)) return 0;
        seen.add(node);
        if (node === "5") return flow;
        for (const next of nodes) {
          const c = cap[`${node}>${next}`] || 0;
          if (c > 0) {
            const inc = dfs(next, Math.min(flow, c));
            if (inc > 0) { path.unshift([node, next]); return inc; }
          }
        }
        return 0;
      };
      const add = dfs("1", Infinity);
      if (!add) break;
      const ecls = {};
      const cls = { 1: "cur", 5: "cur" };
      for (const [a, b] of path) { ecls[`${a}>${b}`] = "path"; cls[b] = cls[b] || "act"; }
      const verts = ["1"].concat(path.map(([, b]) => b));
      snap(`Täydennyspolku ${verts.join(" → ")}: pienin kapasiteetti polulla on ${add}.`, { ...cap }, ecls, cls);
      for (const [a, b] of path) { cap[`${a}>${b}`] -= add; cap[`${b}>${a}`] += add; }
      total += add;
      const e2 = {};
      for (const [a, b] of path) { e2[`${a}>${b}`] = "done"; e2[`${b}>${a}`] = "done"; }
      snap(`Polun kaarten kapasiteetit pienenevät ${add}:llä ja vastakkaisten kaarten kasvavat ${add}:llä. Virtaus on nyt ${total}.`, { ...cap }, e2, cls);
    }
    const reach = new Set(["1"]);
    const q = ["1"];
    for (let i = 0; i < q.length; i++) for (const v of nodes) if ((cap[`${q[i]}>${v}`] || 0) > 0 && !reach.has(v)) { reach.add(v); q.push(v); }
    const cls = {};
    for (const v of reach) cls[v] = "done";
    frames.push({ st: residualState(cap, { cls, ecls: Object.fromEntries(Object.entries(cap).filter(([, c]) => c === 0).map(([k]) => [k, "ghost"])), marks: [{ id: "reach", type: "hull", nodes: [...reach], cls: "cut", pad: 8 }] }),
      cap: `Täydennyspolkua ei enää löydy, joten maksimivirtaus on ${total}. Alkusolmusta pääsee enää solmuihin ${list([...reach].sort())}.`, vars: [{ k: "virtaus", v: String(total), cls: "ok" }] });
    new Player(fig, { frames, interval: 1800, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  register("min-cut", (fig, { mode }) => {
    const ui = frame(fig, { title: mode === "reach" ? "Maksimivirtaus ja minimileikkaus" : "Minimileikkaus", kicker: "Kuva" });
    if (mode === "reach") {
      const sc = new Scene(ui.stage, { w: FLOWG.w, h: FLOWG.h });
      const cap = { "1>2": 0, "2>1": 4, "1>3": 3, "3>1": 3, "2>3": 7, "3>2": 1, "2>4": 0, "4>2": 3, "3>5": 0, "5>3": 4, "4>5": 2, "5>4": 3 };
      const ecls = {};
      for (const [k, c] of Object.entries(cap)) if (c === 0) ecls[k] = "ghost";
      sc.set(residualState(cap, { cls: { 1: "solid", 2: "done", 3: "done" }, ecls, marks: [{ id: "r", type: "hull", nodes: ["1", "2", "3"], cls: "cut", pad: 8 }] }), true);
      ui.setCaption("Maksimivirtauksen jälkeen alkusolmusta pääsee positiivisia kaaria pitkin solmuihin 1, 2 ja 3. Näistä lähtevät alkuperäiset kaaret 2 → 4 ja 3 → 5 on käytetty kokonaan.");
      return;
    }
    const sc = new Scene(ui.stage, { w: FLOWG.w, h: FLOWG.h });
    sc.set(makeState(FLOWG, { ecls: { "2>4": "bad", "3>5": "bad" }, marks: [{ id: "x1", type: "cross", edge: "2>4", size: 7 }, { id: "x2", type: "cross", edge: "3>5", size: 7 }] }), true);
    ui.setCaption("Kun kaaret 2 → 4 ja 3 → 5 poistetaan, solmusta 1 ei pääse solmuun 5. Leikkauksen paino on 3 + 4 = 7, mikä on yhtä suuri kuin maksimivirtaus.");
  });

  // A network where depth-first augmenting paths are slow (Z = 40 for the demo).
  register("flow-slow", (fig) => {
    const Z = 40;
    const G = { w: 400, h: 205, dir: true, pos: { 1: [45, 102], 2: [200, 38], 3: [200, 167], 4: [355, 102] },
      edges: [[1, 2, "Z"], [1, 3, "Z"], [2, 3, 1], [2, 4, "Z"], [3, 4, "Z"]] };
    let tab = "bad";
    const ui = frame(fig, { title: "Täydennyspolkujen valinta", kicker: "Animaatio",
      tabs: [["bad", "Huono valinta"], ["bfs", "Edmonds-Karp"]], tab, onTab: (t) => { tab = t; build(); } });
    const sc = sceneFor(ui, G);
    const vars = new VarsPanel(ui.side, `Tila (Z = ${Z})`);
    let player = null;
    function build() {
      const flow = { "1>2": 0, "1>3": 0, "2>3": 0, "2>4": 0, "3>4": 0 };
      const frames = [];
      let paths = 0;
      const lbl = () => ({ "1>2": `${flow["1>2"]}/Z`, "1>3": `${flow["1>3"]}/Z`, "2>3": `${flow["2>3"]}/1`, "2>4": `${flow["2>4"]}/Z`, "3>4": `${flow["3>4"]}/Z` });
      const snap = (cap, ecls = {}) => frames.push({ st: makeState(G, { elabel: lbl(), ecls, cls: { 1: "cur", 4: "cur" } }), cap, vars: [{ k: "polkuja", v: String(paths) }, { k: "virtaus", v: String(flow["2>4"] + flow["3>4"]) }] });
      snap(tab === "bad"
        ? "Jos polut valitaan huonosti, jokainen polku kulkee keskimmäisen kaaren kautta ja lisää virtausta vain 1:llä."
        : "Edmonds-Karp-algoritmi valitsee aina polun, jossa on mahdollisimman vähän kaaria (leveyshaku).");
      if (tab === "bad") {
        for (let i = 0; i < 2 * Z; i++) {
          paths++;
          if (i % 2 === 0) {
            flow["1>2"]++; flow["2>3"]++; flow["3>4"]++;
            snap(`Polku ${paths}: 1 → 2 → 3 → 4 lisää virtausta 1:llä.`, { "1>2": "path", "2>3": "path", "3>4": "path" });
          } else {
            flow["1>3"]++; flow["2>3"]--; flow["2>4"]++;
            snap(`Polku ${paths}: 1 → 3 → 2 → 4 kulkee vastakkaista kaarta 3 → 2, joka peruu keskimmäisen kaaren virtauksen, ja lisää virtausta 1:llä.`, { "1>3": "path", "2>3": "act", "2>4": "path" });
          }
        }
        frames[frames.length - 1].cap = `Maksimivirtaus 2Z = ${2 * Z} vaati ${paths} täydennyspolkua!`;
      } else {
        paths = 1; flow["1>2"] = Z; flow["2>4"] = Z;
        snap(`Polku 1 → 2 → 4 lisää virtausta Z = ${Z}:llä.`, { "1>2": "path", "2>4": "path" });
        paths = 2; flow["1>3"] = Z; flow["3>4"] = Z;
        snap(`Polku 1 → 3 → 4 lisää virtausta Z:llä. Maksimivirtaus 2Z = ${2 * Z} saatiin vain kahdella polulla.`, { "1>3": "path", "3>4": "path" });
      }
      if (!player) player = new Player(fig, { frames, interval: 900, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
      else player.setFrames(frames);
    }
    build();
  });

  // Bipartite matching and the corresponding flow network.
  register("matching", (fig, { mode }) => {
    const L = { 1: 40, 2: 105, 3: 170, 4: 235 };
    const R = { 5: 72, 6: 137, 7: 202 };
    const E = [[1, 6], [2, 6], [3, 5], [3, 7], [4, 6], [4, 7]];
    const M = ["1-6", "3-5", "4-7"];
    const bip = { w: 440, h: 275, pos: {}, edges: E };
    for (const [v, y] of Object.entries(L)) bip.pos[v] = [125, y];
    for (const [v, y] of Object.entries(R)) bip.pos[v] = [310, y];
    if (mode !== "flow") {
      const ui = frame(fig, { title: "Kaksijakoisen verkon maksimiparitus", kicker: "Kuva" });
      const sc = sceneFor(ui, bip);
      const ecls = {};
      for (const [a, b] of E) ecls[eid(a, b)] = M.includes(eid(a, b)) ? "path" : "";
      sc.set(makeState(bip, { ecls, cls: { 1: "act", 3: "act", 4: "act", 5: "act", 6: "act", 7: "act" } }), true);
      ui.setCaption("Maksimiparitus sisältää 3 kaarta: 1–6, 3–5 ja 4–7. Jokainen solmu kuuluu enintään yhteen kaareen.");
      return;
    }
    const ui = frame(fig, { title: "Paritus maksimivirtauksena", kicker: "Animaatio" });
    const flowPos = { s: [30, 137] , t: [410, 137] };
    for (const [v, y] of Object.entries(L)) flowPos[v] = [140, y];
    for (const [v, y] of Object.entries(R)) flowPos[v] = [290, y];
    const sc = new Scene(ui.stage, { w: 440, h: 275 });
    const s1 = makeState(bip, {});
    const flowG = { w: 440, h: 275, dir: true, pos: flowPos, labels: { s: "", t: "" },
      edges: Object.keys(L).map((v) => ["s", v]).concat(E).concat(Object.keys(R).map((v) => [v, "t"])) };
    const s2 = makeState(flowG, { cls: { s: "solid", t: "solid" }, sub: { s: "alku", t: "loppu" } });
    const used = { "s>1": 1, "s>3": 1, "s>4": 1, "1>6": 1, "3>5": 1, "4>7": 1, "6>t": 1, "5>t": 1, "7>t": 1 };
    const ecls3 = {};
    for (const k of Object.keys(used)) ecls3[k] = "path";
    const s3 = makeState(flowG, { cls: { s: "solid", t: "solid" }, ecls: ecls3, sub: { s: "alku", t: "loppu" } });
    const frames = [
      { st: s1, cap: "Kaksijakoinen verkko: vasemman ja oikean ryhmän välillä on kaaria." },
      { st: s2, cap: "Lisätään alkusolmu ja loppusolmu ja suunnataan kaaret vasemmalta oikealle. Jokaisen kaaren kapasiteetti on 1." },
      { st: s3, cap: "Maksimivirtaus on 3, ja virtauksen käyttämät keskimmäiset kaaret 1–6, 3–5 ja 4–7 muodostavat maksimiparituksen." },
    ];
    new Player(fig, { frames, interval: 1900, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
  });
})();
