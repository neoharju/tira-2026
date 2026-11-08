/* Figures for Part IV, chapters 29 and 30: tries and radix trees, and spatial
   indexes. Chapter 29: an ART that grows key by key (with a plain trie and
   lazy expansion to compare), the four kinds of nodes, the SIMD search in a
   Node16, longest-prefix match with a two-level table, and the parallel build.
   The small examples run the algorithms of the chapters' C++ code; the
   charts show the measurements quoted in the text.
   Part IV pages load this file after viz-storage.js (the `viz` list in _config.yml). */
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
  function toggle(tools, label, options, value, onChange) {
    const group = h("span", { class: "ix-ctl is-wrap" });  // the name stays with its first button
    tools.appendChild(group);
    if (label) group.appendChild(h("span", { class: "viz-label", text: label }));
    const buttons = options.map(([key, text]) => {
      const b = h("button", { type: "button", class: "viz-btn is-text", text, "aria-pressed": String(key === value) });
      b.addEventListener("click", () => {
        buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        onChange(key);
      });
      group.appendChild(b);
      return b;
    });
    return buttons;
  }
  function slider(tools, label, { min, max, step, value, format }, onInput) {
    const out = h("span", { class: "viz-label st-val" });
    const input = h("input", { type: "range", class: "viz-range st-slider", min, max, step, value, "aria-label": label });
    const show = () => {  // the range can change (sfc-ranges), so read it from the input
      const lo = +input.min, hi = +input.max;
      input.style.setProperty("--p", `${hi > lo ? ((input.value - lo) / (hi - lo)) * 100 : 0}%`);
      out.textContent = format(+input.value);
    };
    input.addEventListener("input", () => { show(); onInput(+input.value); });
    // The arrow keys move this slider; without this, the player of the figure
    // would take them and step the animation instead.
    input.addEventListener("keydown", (e) => e.stopPropagation());
    // one group, so that a narrow toolbar never puts the name and the slider on different lines
    tools.append(h("span", { class: "ix-ctl" }, h("span", { class: "viz-label", text: label }), input, out));
    show();
    // Sets the slider from the figure (after a drag), without calling onInput.
    input.setValue = (v) => { input.value = v; show(); };
    return input;
  }
  // The point of a pointer event in the coordinates of the SVG's viewBox.
  function svgPoint(svg, e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  // Calls onDown(point) when the pointer is pressed on the SVG and onMove(point)
  // while it stays pressed, also outside the SVG.
  function dragging(svg, onDown, onMove) {
    let down = false;
    svg.style.touchAction = "none";
    svg.classList.add("ix-drag");
    svg.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      down = true;
      svg.setPointerCapture(e.pointerId);
      onDown(svgPoint(svg, e));
    });
    svg.addEventListener("pointermove", (e) => { if (down) onMove(svgPoint(svg, e)); });
    const up = () => { down = false; };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
  const hex2 = (b) => (b & 255).toString(16).toUpperCase().padStart(2, "0");
  const fmtBytes = (b) => (b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);

  /* ===================================== chapter 29: tries and radix trees */

  /* ---------------------------------------------- an ART grows key by key */
  // Keys of 4 hex digits; a level reads one digit, so a node has up to 16
  // children. The ART view has the two kinds that fit 16 children: Node4 and
  // Node16. Each tree is the canonical tree of its key set: the same tree
  // that the inserts of the chapter make.
  const ART_KEYS = ["3A7F", "3A72", "3A90", "C105", "3A75", "3A7B", "3A70", "C1A0", "3AE4", "7000", "3A7D", "C1A9"];
  const ART_CAPS = [
    "An empty tree. Each key has 4 hex digits, and each level reads one digit, so a node can have 16 children (a real ART reads a byte: 256).",
    "Insert **3A7F**. The tree is empty, so the key is the root: one leaf. Lazy expansion: no node reads its digits yet.",
    "Insert **3A72**. The leaf 3A7F gets a second key, so lazy expansion ends here. A **Node4** takes its place at digit 3, the first digit where the keys differ (F and 2). Its prefix is 3A7.",
    "Insert **3A90**. The key leaves the compressed path 3A7 at digit 2 (9, not 7). The **path splits**: a new Node4 at digit 2 with the prefix 3A goes above the old node, which does not change.",
    "Insert **C105**. The key leaves the path already at digit 0. A new Node4 becomes the root. Its child 3 skips digit 1 (A): path compression.",
    "Insert **3A75**. The key has the prefix 3A7 of the node at digit 3, and the node has no child 5: the leaf goes into the node, between 2 and F.",
    "Insert **3A7B**. The node gets its fourth child: it is full now.",
    "Insert **3A70**. The full Node4 **grows** into a Node16: its 4 children are copied, the old node is freed, and the pointer in its parent changes. Then 0 goes in, first.",
    "Insert **C1A0**. The root's child C is the leaf C105: a new Node4 at digit 2 (0 and A), with the prefix C1.",
    "Insert **3AE4**. A new leaf in the node 3A·, which now has the children 7, 9 and E.",
    "Insert **7000**. A new leaf in the root, between 3 and C.",
    "Insert **3A7D**. A sixth child for the Node16.",
    "Insert **C1A9**. The leaf C1A0 gets a neighbour: a Node4 at digit 3, with the prefix C1A. All 12 keys are in the tree.",
  ];
  // The trees of a sorted key set: {leaf} or {depth, prefix, kids: [[digit, tree]]}.
  function groupAt(keys, d) {
    const out = [];
    for (const k of keys) {
      if (!out.length || out[out.length - 1][0] !== k[d]) out.push([k[d], []]);
      out[out.length - 1][1].push(k);
    }
    return out;
  }
  function radixTree(keys, from = 0) {
    if (keys.length === 1) return { leaf: keys[0] };
    let d = from;
    while (keys.every((k) => k[d] === keys[0][d])) d++;
    return { depth: d, prefix: keys[0].slice(0, d), kids: groupAt(keys, d).map(([c, g]) => [c, radixTree(g, d + 1)]) };
  }
  function lazyTrie(keys, d = 0) {
    if (keys.length === 1) return { leaf: keys[0] };
    return { depth: d, prefix: keys[0].slice(0, d), kids: groupAt(keys, d).map(([c, g]) => [c, lazyTrie(g, d + 1)]) };
  }
  function plainTrie(keys, d = 0) {
    if (d === 4) return { leaf: keys[0] };
    return { depth: d, prefix: keys[0].slice(0, d), kids: groupAt(keys, d).map(([c, g]) => [c, plainTrie(g, d + 1)]) };
  }
  // Sizes as in the chapter, for 16 children: a Node4 has 4 key digits and 4
  // pointers, a Node16 16 and 16; a trie node is 16 pointers; a leaf 24 bytes.
  function measure(t, view) {
    const r = { inner: 0, slots: 0, used: 0, leaves: 0, bytes: 0, n4: 0, n16: 0 };
    (function walk(n) {
      if (n.leaf) { r.leaves++; r.bytes += 24; return; }
      r.inner++;
      r.used += n.kids.length;
      if (view === "art") {
        const small = n.kids.length <= 4;
        r.slots += small ? 4 : 16;
        r.bytes += small ? 56 : 160;
        if (small) r.n4++; else r.n16++;
      } else {
        r.slots += 16;
        r.bytes += 144;
      }
      n.kids.forEach(([, c]) => walk(c));
    })(t);
    return r;
  }
  register("art-insert", (fig) => {
    let view = "art";
    const ui = frame(fig, { title: "Inserting keys into a radix tree", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const W = 600, H = 300;
    const svg = svgBox(ui.stage, W, H, "ix-tree");
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    toggle(tools, "View", [["plain", "plain trie"], ["lazy", "lazy expansion"], ["art", "path compression, Node4/16"]], view, (v) => { view = v; player.go(player.i, true); });
    const frames = ART_KEYS.map((_, i) => i + 1);
    frames.unshift(0);
    const sortedOf = (n) => ART_KEYS.slice(0, n).slice().sort();
    const treeOf = (keys, v) => (!keys.length ? null : v === "art" ? radixTree(keys) : v === "lazy" ? lazyTrie(keys) : plainTrie(keys));
    const ids = (t) => {  // the inner nodes of a tree as "depth:prefix:kind"
      const out = new Set();
      (function walk(n) {
        if (!n || n.leaf) return;
        out.add(`${n.depth}:${n.prefix}:${n.kids.length <= 4 ? 4 : 16}`);
        n.kids.forEach(([, c]) => walk(c));
      })(t);
      return out;
    };
    function draw(count) {
      svg.textContent = "";
      const keys = sortedOf(count);
      const cur = count ? ART_KEYS[count - 1] : null;
      const t = treeOf(keys, view);
      const before = view === "art" ? ids(treeOf(sortedOf(count - 1), "art")) : ids(treeOf(sortedOf(count - 1), view));
      const rowY = (r) => 26 + r * 58;
      for (let r = 0; r < 4; r++) label(svg, 8, rowY(r), `digit ${r}`, "st-tick", "start");
      if (!t) {
        label(svg, W / 2, H / 2, "empty", "st-tick");
      } else {
        // leaves in key order, spread over the width; a node above the mean of its children
        const leaves = [];
        (function collect(n) { if (n.leaf) leaves.push(n); else n.kids.forEach(([, c]) => collect(c)); })(t);
        const left = 70, right = W - 24;
        const step = leaves.length > 1 ? (right - left) / (leaves.length - 1) : 0;
        leaves.forEach((l, i) => { l.x = leaves.length > 1 ? left + i * step : (left + right) / 2; });
        (function place(n, parentRow) {
          if (n.leaf) {
            n.row = view === "plain" ? 4 : parentRow + 1;
            return;
          }
          n.row = n.depth;
          n.kids.forEach(([, c]) => place(c, n.row));
          n.x = n.kids.reduce((a, [, c]) => a + c.x, 0) / n.kids.length;
        })(t, -1);
        const NW = Math.max(38, Math.min(52, step - 3)), NH = 30, LW = 40, LH = 20;
        (function edges(n) {
          if (n.leaf) return;
          for (const [c, k] of n.kids) {
            const y1 = rowY(n.row) + NH / 2, y2 = rowY(k.row) - (k.leaf ? LH / 2 : NH / 2);
            seg(svg, n.x, y1, k.x, y2, `st-edge${k.leaf && k.leaf === cur ? " is-on" : ""}`);
            label(svg, n.x + (k.x - n.x) * 0.32 + (k.x >= n.x ? 5 : -5), y1 + (y2 - y1) * 0.32, c, "ix-digit");
            edges(k);
          }
        })(t);
        (function nodes(n) {
          if (n.leaf) {
            const y = rowY(n.row);
            rect(svg, n.x - LW / 2, y - LH / 2, LW, LH, `ix-leaf${n.leaf === cur ? " is-cur" : ""}`, 6);
            label(svg, n.x, y, n.leaf, "ix-leaf-lbl");
            return;
          }
          const y = rowY(n.row);
          const kind = n.kids.length <= 4 ? 4 : 16;
          const fresh = !before.has(`${n.depth}:${n.prefix}:${kind}`);
          rect(svg, n.x - NW / 2, y - NH / 2, NW, NH, `st-page${fresh && count ? " is-split" : ""}`, 6);
          label(svg, n.x, y - 6, `${n.prefix || "∅"}·`, "ix-node-lbl");
          label(svg, n.x, y + 7, view === "art" ? `N${kind} ${n.kids.length}/${kind}` : `${n.kids.length}/16`, "ix-node-sub");
          n.kids.forEach(([, c]) => nodes(c));
        })(t);
      }
      // the three ways to store the same keys
      side.textContent = "";
      const rows = [["plain", "plain trie"], ["lazy", "lazy expansion"], ["art", "path compression, Node4/16"]].map(([v, name]) => {
        const m = keys.length ? measure(treeOf(keys, v), v) : { inner: 0, slots: 0, used: 0, leaves: 0, bytes: 0 };
        return [name, m, v === view];
      });
      side.append(panel("the same keys", `${keys.length} key${keys.length === 1 ? "" : "s"}`,
        h("div", { class: "ix-compare" },
          h("span", { class: "ix-h", text: "" }), h("span", { class: "ix-h", text: "nodes" }), h("span", { class: "ix-h", text: "slots used" }), h("span", { class: "ix-h", text: "bytes" }),
          ...rows.flatMap(([name, m, on]) => [
            h("span", { class: `ix-name${on ? " is-on" : ""}`, text: name }),
            h("b", { text: String(m.inner) }),
            h("b", { text: `${m.used}/${m.slots}` }),
            h("b", { text: String(m.bytes) }),
          ]))));
      side.append(h("p", { class: "ix-note", text: "Bytes: a node of 16 pointers is 144, a Node4 56, a Node16 160 and a leaf 24 (header and pointers as in the C++ code)." }));
    }
    // The inner nodes of a tree, parents first, and the node that holds a leaf.
    const nodesOf = (t) => {
      const out = [];
      (function walk(n) { if (!n || n.leaf) return; out.push(n); n.kids.forEach(([, c]) => walk(c)); })(t);
      return out;
    };
    const parentOf = (t, key) => {
      let out = null;
      (function walk(n) {
        if (out || !n || n.leaf) return;
        for (const [d, c] of n.kids) {
          if (c.leaf === key) { out = { node: n, digit: d }; return; }
          walk(c);
        }
      })(t);
      return out;
    };
    // The captions of ART_CAPS tell what the radix tree does. The plain trie and
    // lazy expansion get captions made from their own trees: the new nodes and
    // the place of the leaf.
    function describe(count) {
      const key = ART_KEYS[count - 1];
      if (view === "lazy" && count === 1) return ART_CAPS[1];
      const after = treeOf(sortedOf(count), view);
      const old = new Set(nodesOf(treeOf(sortedOf(count - 1), view)).map((n) => `${n.depth}:${n.prefix}`));
      const fresh = nodesOf(after).filter((n) => !old.has(`${n.depth}:${n.prefix}`));
      const name = (n) => `${n.prefix || "∅"}·`;
      const list = `${plural(fresh.length, "new node")} of 16 slots (${fresh.map(name).join(", ")})`;
      if (count === 1) return `Insert **${key}**. A plain trie has a node for every digit of every key: ${list}, for one key.`;
      const p = parentOf(after, key);
      const at = `node ${name(p.node)} at digit ${p.node.depth}, as child ${p.digit}`;
      if (!fresh.length) return `Insert **${key}**. The nodes on the path of the key are there already: the leaf goes into ${at}.`;
      if (view === "plain") return `Insert **${key}**. The path of the key needs ${list}. The leaf goes into ${at}.`;
      const last = fresh[fresh.length - 1], d0 = fresh[0].depth;
      const other = last.kids.map(([, c]) => c.leaf).find((l) => l && l !== key);
      return `Insert **${key}**. The leaf ${other} was alone where the new key goes, so both keys move down: ${list}, ${d0 === last.depth ? `for digit ${d0}` : `for the digits ${d0} to ${last.depth}`}. Digit ${last.depth} is the first digit where the two keys differ.`;
    }
    const player = new Player(fig, {
      frames, interval: 2600,
      apply: (count) => {
        draw(count);
        ui.setCaption(view === "art" || count === 0 ? ART_CAPS[count] : describe(count));
      },
    });
  });

  /* ---------------------------------------------- the four kinds of nodes */
  const ART_KINDS = [
    { name: "Node4", max: 4, bytes: 56, parts: [["header", 16], ["keys", 4], ["", 4], ["4 pointers", 32]] },
    { name: "Node16", max: 16, bytes: 160, parts: [["header", 16], ["16 keys", 16], ["16 pointers", 128]] },
    { name: "Node48", max: 48, bytes: 656, parts: [["header", 16], ["index of 256", 256], ["48 pointers", 384]] },
    { name: "Node256", max: 256, bytes: 2064, parts: [["header", 16], ["256 pointers", 2048]] },
  ];
  const kindFor = (c) => ART_KINDS.find((k) => c <= k.max);
  register("art-nodes", (fig) => {
    let c = 20;
    const ui = frame(fig, { title: "Four kinds of nodes", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const cards = h("div", { class: "ix-kinds" });
    ui.stage.appendChild(cards);
    const W = 600, H = 230, M = { l: 58, r: 16, t: 14, b: 40 };
    const svg = svgBox(ui.stage, W, H, "st-chart");
    const tools = toolbar(ui);
    slider(tools, "Children", { min: 2, max: 256, step: 1, value: c, format: (v) => String(v) }, (v) => { c = v; draw(); });
    const X = (n) => M.l + (Math.log2(n) - 1) / 7 * (W - M.l - M.r);
    const Y = (b) => H - M.b - (Math.log2(b) - 3) / (Math.log2(1100) - 3) * (H - M.t - M.b);
    function draw() {
      const k = kindFor(c);
      cards.textContent = "";
      for (const kind of ART_KINDS) {
        const fits = c <= kind.max;
        const parts = kind.parts.filter(([name]) => name);
        cards.append(h("div", { class: `ix-kind${kind === k ? " is-on" : fits ? "" : " is-small"}` },
          h("b", { text: kind.name }),
          h("span", { text: `${kind.bytes} bytes${fits ? `, ${(kind.bytes / c).toFixed(1)} per child` : ", too small"}` }),
          h("i", {}, ...parts.map(([name, bytes]) => h("u", { class: `ix-part${name.includes("pointer") ? " is-ptr" : name === "header" ? " is-head" : ""}`, style: `flex-grow:${Math.max(bytes, 12)}`, title: `${name}: ${bytes} bytes`, text: name })))));
      }
      svg.textContent = "";
      for (const b of [8, 16, 32, 64, 128, 256, 512, 1024]) {
        s("line", { x1: M.l, x2: W - M.r, y1: Y(b), y2: Y(b), class: "st-grid" }, svg);
        label(svg, M.l - 8, Y(b), String(b), "st-tick", "end");
      }
      for (const n of [2, 4, 16, 48, 256]) label(svg, X(n), H - M.b + 16, String(n), "st-tick");
      label(svg, (M.l + W - M.r) / 2, H - 6, "children of the node (log scale)", "st-axis");
      const yl = label(svg, 14, (M.t + H - M.b) / 2, "bytes per child", "st-axis");
      yl.setAttribute("transform", `rotate(-90 14 ${(M.t + H - M.b) / 2})`);
      const path = (f) => Array.from({ length: 255 }, (_, i) => i + 2).map((n, i) => `${i ? "L" : "M"}${X(n).toFixed(1)} ${Y(f(n)).toFixed(1)}`).join("");
      s("path", { d: path((n) => 2064 / n), class: "st-curve c0" }, svg);
      s("path", { d: path((n) => kindFor(n).bytes / n), class: "st-curve c5" }, svg);
      label(svg, X(6), Y(2064 / 6) - 10, "always a Node256", "st-tick st-curve-lbl c0", "start");
      label(svg, X(90), Y(56) - 14, "the smallest kind (ART)", "st-tick st-curve-lbl c5");
      s("circle", { cx: X(c), cy: Y(k.bytes / c), r: 6, class: "st-dot c5 is-on" }, svg);
      s("circle", { cx: X(c), cy: Y(2064 / c), r: 4, class: "st-dot c0" }, svg);
      ui.setCaption(`A node with **${c}** children is a **${k.name}**: ${k.bytes} bytes, ${(k.bytes / c).toFixed(1)} bytes per child. A Node256 for the same children would need 2064 bytes, ${(2064 / c).toFixed(1)} per child. With the smallest kind, a node never costs more than 42.1 bytes per child: the worst case is a Node256 with 49 children (2064 / 49).${k.name === "Node48" ? " A Node48 finds a child with two loads: index[b], then the pointer." : k.name === "Node16" ? " A Node16 finds a byte with one SIMD compare." : ""}`);
    }
    draw();
  });

  /* ---------------------------------------------- SIMD search in a Node16 */
  const N16_KEYS = [0x05, 0x13, 0x2A, 0x40, 0x5C, 0x7F, 0x80, 0x9B, 0xC4, 0xE0, 0xFD];
  const N16_GARBAGE = [0x9B, 0x37, 0x00, 0xFF, 0x5C];  // places 11-15 hold old bytes
  const N16_FIND = `int find16_sse(const Node16& n, std::uint8_t b) {
    const __m128i keys = _mm_loadu_si128(n.keys);  // all 16 bytes
    const __m128i x = _mm_set1_epi8(b);            // b in 16 lanes
    const __m128i eq = _mm_cmpeq_epi8(keys, x);    // 0xFF where equal
    unsigned m = _mm_movemask_epi8(eq);            // the top bits
    m &= (1u << n.count) - 1;                      // only the keys
    return m != 0 ? std::countr_zero(m) : -1;
}`;
  const N16_LOWER = `int lower16_sse(const Node16& n, std::uint8_t b) {
    const __m128i flip = _mm_set1_epi8(0x80);
    const __m128i keys = _mm_xor_si128(_mm_loadu_si128(n.keys), flip);
    const __m128i x = _mm_set1_epi8(b ^ 0x80);     // b in 16 lanes
    const __m128i lt = _mm_cmplt_epi8(keys, x);    // signed: key < b
    unsigned m = _mm_movemask_epi8(lt);            // the top bits
    m &= (1u << n.count) - 1;                      // only the keys
    return std::popcount(m);                       // the keys < b
}`;
  const N16_NOFLIP = `int lower16_wrong(const Node16& n, std::uint8_t b) {
    // no flip: the bytes stay as they are
    const __m128i keys = _mm_loadu_si128(n.keys);
    const __m128i x = _mm_set1_epi8(b);            // b in 16 lanes
    const __m128i lt = _mm_cmplt_epi8(keys, x);    // signed: key < b
    unsigned m = _mm_movemask_epi8(lt);            // the top bits
    m &= (1u << n.count) - 1;                      // only the keys
    return std::popcount(m);                       // wrong for 0x80+
}`;
  register("node16-simd", (fig) => {
    let mode = "find", flip = true, b = 0x37;
    const bytes = N16_KEYS.concat(N16_GARBAGE);
    const count = N16_KEYS.length;
    const signed = (v) => (v >= 128 ? v - 256 : v);
    function make() {
      const fr = [];
      const less = (key) => (mode === "find" ? key === b : flip ? key < b : signed(key) < signed(b));
      const hits = bytes.map(less);
      const raw = hits.reduce((a, x, j) => a | ((x ? 1 : 0) << j), 0);
      const masked = raw & ((1 << count) - 1);
      const answer = mode === "find" ? (masked ? 31 - Math.clz32(masked & -masked) : -1) : masked.toString(2).split("").filter((x) => x === "1").length;
      const scalar = mode === "find" ? N16_KEYS.indexOf(b) : N16_KEYS.filter((k) => k < b).length;
      const unmasked = mode === "find" ? (raw ? 31 - Math.clz32(raw & -raw) : -1) : raw.toString(2).split("").filter((x) => x === "1").length;
      const L = mode === "find" ? { load: 2, set: 3, cmp: 4, mm: 5, and: 6, res: 7 } : flip ? { load: [2, 3], set: 4, cmp: 5, mm: 6, and: 7, res: 8 } : { load: 3, set: 4, cmp: 5, mm: 6, and: 7, res: 8 };
      fr.push({ show: 1, line: L.load, cap: `A Node16 with ${count} children: its key bytes are sorted, and places ${count}–15 hold old bytes that mean nothing. One unaligned load puts all 16 bytes in a register.${mode === "find" ? "" : flip ? " Then XOR with 0x80 flips the top bit of every byte." : " (No flip: the bytes stay as they are.)"}` });
      fr.push({ show: 2, line: L.set, cap: `_mm_set1_epi8 puts b = 0x${hex2(b)} in all 16 lanes${mode === "place" && flip ? `, flipped too: 0x${hex2(b ^ 0x80)}` : ""}.` });
      fr.push({ show: 3, line: L.cmp, cap: mode === "find" ? "_mm_cmpeq_epi8 compares the 16 pairs at once: 0xFF where the bytes are equal." : flip ? "_mm_cmplt_epi8 compares signed bytes. After the flip, the signed order of the bytes is their unsigned order: 0xFF where the key is less than b." : `_mm_cmplt_epi8 compares **signed** bytes: a byte of 0x80 or more is negative, so it counts as less than 0x${hex2(b)}${b < 128 ? "" : " only if it is smaller as a signed number"}.` });
      fr.push({ show: 4, line: L.mm, cap: `_mm_movemask_epi8 collects the top bit of each byte: the 16-bit mask 0b${raw.toString(2).padStart(16, "0")} (lane 0 on the right).` });
      fr.push({ show: 5, line: L.and, cap: `The AND with (1 << ${count}) − 1 keeps the bits of the ${count} keys. Without it, the old bytes in places ${count}–15 could match: the answer would be ${unmasked}${unmasked === answer ? ", which happens to be right here" : ", which is wrong"}.` });
      const ok = answer === scalar;
      fr.push({ show: 6, line: L.res, cap: mode === "find"
        ? (answer >= 0 ? `countr_zero gives place **${answer}**: the child of byte 0x${hex2(b)}. No branch depended on the keys.` : `The mask is 0: byte 0x${hex2(b)} is **not in the node**.`)
        : `popcount counts the ones: **${answer}** key${answer === 1 ? " is" : "s are"} less than 0x${hex2(b)}, so b belongs at place ${answer}. ${ok ? "That is right." : `**Wrong:** the right place is ${scalar}. Without the flip, the keys 0x80 and up count as negative.`}`, ok });
      return fr.map((f) => ({ ...f, hits, raw, masked, answer, ok: f.ok }));
    }
    const ui = frame(fig, { title: "A byte among 16 in one compare", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-swiss ix-n16" });
    ui.stage.appendChild(box);
    let code = new V.CodePanel(ui.side, N16_FIND, "c++");
    const codeText = () => (mode === "find" ? N16_FIND : flip ? N16_LOWER : N16_NOFLIP);
    const newCode = () => {
      code.el.remove();
      code = new V.CodePanel(ui.side, codeText(), "c++");
    };
    const tools = toolbar(ui);
    const flipButtons = [];
    toggle(tools, "Search", [["find", "find b"], ["place", "the place of b"]], mode, (v) => {
      mode = v;
      newCode();
      flipButtons.forEach((x) => { x.disabled = mode === "find"; });
      player.setFrames(make());
    });
    flipButtons.push(...toggle(tools, "Top bit", [[true, "flip"], [false, "do not flip"]], flip, (v) => { flip = v; newCode(); player.setFrames(make()); }));
    flipButtons.forEach((x) => { x.disabled = true; });
    slider(tools, "b", { min: 0, max: 255, step: 1, value: b, format: (v) => `0x${hex2(v)}` }, (v) => { b = v; player.setFrames(make(), true); });
    const player = new Player(fig, {
      frames: make(), interval: 1900,
      apply: (f) => {
        box.textContent = "";
        const flipped = mode === "place" && flip;
        const shown = bytes.map((x) => (flipped ? x ^ 0x80 : x));
        const old = (j) => (j >= count ? " is-dim" : "");
        box.append(cells(bytes.map((_, j) => j), () => "is-index", "place"));
        box.append(cells(shown.map(hex2), (j) => `${old(j)}${f.show >= 6 && mode === "find" && j === f.answer ? " is-hit" : ""}`, flipped ? "keys ^ 0x80" : "keys"));
        if (f.show >= 2) box.append(cells(shown.map(() => hex2(flipped ? b ^ 0x80 : b)), () => "is-dim", flipped ? "b ^ 0x80" : "b"));
        if (f.show >= 3) box.append(cells(f.hits.map((x) => (x ? "FF" : "00")), (j) => (f.hits[j] ? (j >= count ? "is-bad" : "is-on") : "is-dim"), mode === "find" ? "cmpeq" : "cmplt"));
        if (f.show >= 4) box.append(cells(f.hits.map((x) => (x ? "1" : "0")), (j) => (f.hits[j] ? (j >= count ? "is-bad" : "is-on") : "is-dim"), "movemask"));
        if (f.show >= 5) box.append(cells(f.hits.map((x, j) => (x && j < count ? "1" : "0")), (j) => (f.hits[j] && j < count ? "is-on" : "is-dim"), "& count"));
        if (f.show >= 6) box.append(h("div", { class: "st-lanesbox" }, h("span", { class: `st-count${f.ok === false ? " is-bad" : ""}` }, mode === "place" ? "popcount" : f.answer >= 0 ? "countr_zero" : "m == 0, return", h("b", { text: String(f.answer) }))));
        code.set(f.line);
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- longest-prefix match */
  // Addresses of 8 bits; the first table has 32 entries for the first 5 bits,
  // and a group has 8 entries for the last 3 bits (DIR-5-3, a toy DIR-24-8).
  const LPM_ROUTES = [
    { p: 0b00000000, len: 0, hop: "A" }, { p: 0b01000000, len: 2, hop: "B" }, { p: 0b01100000, len: 3, hop: "C" },
    { p: 0b10100000, len: 4, hop: "G" }, { p: 0b01101000, len: 5, hop: "D" }, { p: 0b01101100, len: 6, hop: "E" },
    { p: 0b11111110, len: 7, hop: "H" }, { p: 0b01101111, len: 8, hop: "F" },
  ];
  const HOP_CLASS = { A: "c5", B: "c2", C: "c1", D: "c3", E: "c0", F: "c4", G: "c2", H: "c0" };
  const bits8 = (v, n = 8) => v.toString(2).padStart(8, "0").slice(0, n);
  register("lpm-dir", (fig) => {
    let address = 0b01101110;
    function build(upto) {
      const tbl = new Array(32).fill(null);
      const groups = [];  // {entry, cells}
      const hist = [];
      for (let i = 0; i < upto; i++) {
        const r = LPM_ROUTES[i];
        if (r.len <= 5) {
          const first = r.p >> 3, n = 1 << (5 - r.len);
          for (let e = first; e < first + n; e++) tbl[e] = r.hop;
          hist.push(`${bits8(r.p, r.len) || "∅"}/${r.len} fills ${n} entr${n === 1 ? "y" : "ies"} of the table (${first}${n > 1 ? `–${first + n - 1}` : ""})`);
        } else {
          const e = r.p >> 3;
          let g = typeof tbl[e] === "object" && tbl[e] !== null ? tbl[e].g : -1;
          let made = false;
          if (g < 0) {
            g = groups.length;
            groups.push({ entry: e, cells: new Array(8).fill(tbl[e]) });
            tbl[e] = { g };
            made = true;
          }
          const first = r.p & 7, n = 1 << (8 - r.len);
          for (let j = first; j < first + n; j++) groups[g].cells[j] = r.hop;
          hist.push(`${bits8(r.p, r.len)}/${r.len} is longer than 5 bits: ${made ? `entry ${e} gets group ${g}, filled with copies of the entry, and` : `in group ${g} of entry ${e},`} it fills ${n} entr${n === 1 ? "y" : "ies"}`);
        }
      }
      return { tbl, groups, last: hist[hist.length - 1] };
    }
    const frames = Array.from({ length: LPM_ROUTES.length + 2 }, (_, i) => i);
    const ui = frame(fig, { title: "Longest-prefix match with two tables", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "ix-lpm" });
    ui.stage.appendChild(box);
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    slider(tools, "Address", { min: 0, max: 255, step: 1, value: address, format: (v) => bits8(v) }, (v) => { address = v; player.go(frames.length - 1); });
    function render(i) {
      const routes = Math.min(i, LPM_ROUTES.length);
      const st = build(routes);
      const lookup = i === frames.length - 1;
      box.textContent = "";
      const entry = address >> 3;
      const tcell = (e) => (st.tbl[e] == null ? "–" : typeof st.tbl[e] === "object" ? `g${st.tbl[e].g}` : st.tbl[e]);
      const tcls = (e) => `${st.tbl[e] == null ? "is-empty" : typeof st.tbl[e] === "object" ? "is-dim" : HOP_CLASS[st.tbl[e]]}${lookup && e === entry ? " is-cur" : ""}`;
      box.append(h("div", { class: "ix-tblhead", text: "first table: 32 entries, one for each value of the first 5 bits" }));
      box.append(cells(Array.from({ length: 16 }, (_, e) => tcell(e)), (e) => tcls(e), "0–15"));
      box.append(cells(Array.from({ length: 16 }, (_, e) => tcell(e + 16)), (e) => tcls(e + 16), "16–31"));
      st.groups.forEach((g, gi) => {
        box.append(cells(g.cells.map((x) => x || "–"), (j) => `${g.cells[j] ? HOP_CLASS[g.cells[j]] : "is-empty"}${lookup && entry === g.entry && j === (address & 7) ? " is-cur" : ""}`, `group ${gi} (entry ${g.entry})`));
      });
      // the walk of the binary trie: the routes that end on the path of the address
      let best = null;
      const marks = LPM_ROUTES.slice(0, routes).filter((r) => r.len === 0 || bits8(r.p, r.len) === bits8(address, r.len));
      for (const r of marks) if (!best || r.len > best.len) best = r;
      side.textContent = "";
      side.append(panel("routes", `${routes} of ${LPM_ROUTES.length}`, h("div", { class: "ix-routes" },
        ...LPM_ROUTES.map((r, k) => h("span", { class: `ix-route ${HOP_CLASS[r.hop]}${k >= routes ? " is-todo" : ""}${lookup && best === r ? " is-best" : ""}` },
          h("code", { text: `${bits8(r.p, r.len).padEnd(8, "·")}/${r.len}` }), h("b", { text: r.hop }))))));
      if (lookup) {
        const e = st.tbl[entry];
        const viaGroup = e && typeof e === "object";
        const hop = viaGroup ? st.groups[e.g].cells[address & 7] : e;
        side.append(panel("binary trie: the walk", "", h("div", { class: "ix-walk" },
          ...bits8(address).split("").map((bit, j) => h("span", { class: marks.some((r) => r.len === j + 1) ? "is-route" : "", text: bit })))));
        ui.setCaption(`Look up **${bits8(address)}**. The binary trie walks 8 bits and passes the routes of length ${marks.map((r) => r.len).join(", ")}: the longest, /${best.len}, gives **${best.hop}**. The table reads entry ${entry} (the first 5 bits, ${bits8(address, 5)})${viaGroup ? `, which points to group ${e.g}, and then entry ${address & 7} of the group (the last 3 bits): two reads` : ": one read"}, and gives **${hop}**${hop === best.hop ? "" : " (different!)"}.`);
      } else if (i === 0) {
        ui.setCaption("Eight routes, sorted by the length of their prefix. A route covers every address whose first bits are its prefix; the letters are the next hops. The table is built from the shortest route to the longest.");
      } else {
        ui.setCaption(`Route ${bits8(LPM_ROUTES[i - 1].p, LPM_ROUTES[i - 1].len) || "∅"}/${LPM_ROUTES[i - 1].len} → ${LPM_ROUTES[i - 1].hop}: ${st.last}. A longer prefix comes later, so it overwrites the entries of the shorter prefixes that contain it.`);
      }
    }
    const player = new Player(fig, { frames, interval: 2300, apply: (i) => render(i) });
  });

  /* ---------------------------------------------- the parallel build */
  // 16 groups of keys (the first hex digit), 4 threads that take the next
  // group when they are free. Grouping costs 10 units of work in parallel; a
  // group of s keys costs s units; splitting a large group again costs a tenth
  // of its keys, in parallel, and gives 16 groups of the same total size.
  register("art-build", (fig) => {
    const T = 4;
    let keys = "skewed", split = false;
    const SIZES = {
      random: [6, 7, 5, 6, 8, 6, 5, 7, 6, 6, 7, 5, 6, 7, 6, 7],
      skewed: [2, 2, 2, 70, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    };
    function schedule() {
      const sizes = SIZES[keys];
      const total = sizes.reduce((a, b) => a + b, 0);
      const jobs = [];  // {group, size, part}
      let t0 = 10 / T;  // the parallel grouping
      const phases = [{ from: 0, to: t0, what: "group the keys" }];
      sizes.forEach((sz, g) => {
        if (split && sz > total / (2 * T)) {
          const t1 = t0 + (sz / 10) / T;
          phases.push({ from: t0, to: t1, what: `split group ${g.toString(16).toUpperCase()} again` });
          t0 = t1;
          for (let k = 0; k < 16; k++) jobs.push({ group: g, size: sz / 16, part: k });
        } else jobs.push({ group: g, size: sz, part: -1 });
      });
      jobs.sort((a, b) => a.group - b.group || a.part - b.part);
      const free = new Array(T).fill(t0);
      const blocks = [];
      for (const j of jobs) {
        let th = 0;
        for (let x = 1; x < T; x++) if (free[x] < free[th] - 1e-9) th = x;
        blocks.push({ ...j, thread: th, from: free[th], to: free[th] + j.size });
        free[th] += j.size;
      }
      const end = Math.max(...free);
      const one = 10 + total + (split ? sizes.filter((sz) => sz > total / (2 * T)).reduce((a, sz) => a + sz / 10, 0) : 0);
      return { sizes, blocks, phases, end, one, busy: blocks.reduce((a, b) => a + b.size, 0) };
    }
    const ui = frame(fig, { title: "Building the groups in parallel", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 600, H = 250;
    const svg = svgBox(ui.stage, W, H, "ix-gantt");
    const tools = toolbar(ui);
    toggle(tools, "Keys", [["random", "random"], ["skewed", "skewed"]], keys, (v) => { keys = v; player.setFrames(make()); });
    toggle(tools, "Large groups", [[false, "one thread each"], [true, "split again"]], split, (v) => { split = v; player.setFrames(make()); });
    function make() {
      const sc = schedule();
      const n = 12;
      return Array.from({ length: n + 1 }, (_, i) => ({ sc, t: (sc.end * i) / n }));
    }
    const player = new Player(fig, {
      frames: make(), interval: 700,
      apply: ({ sc, t }) => {
        svg.textContent = "";
        const max = Math.max(...sc.sizes);
        const bw = (W - 80) / 16;
        label(svg, 8, 14, "keys in each group", "st-tick", "start");
        sc.sizes.forEach((sz, g) => {
          const hh = (sz / max) * 70;
          rect(svg, 70 + g * bw + 2, 92 - hh, bw - 4, hh, `st-bar c${g % 6}`, 2);
          label(svg, 70 + g * bw + bw / 2, 102, g.toString(16).toUpperCase(), "st-tick");
        });
        const X = (x) => 70 + (x / Math.max(sc.end, 1)) * (W - 90);
        for (let th = 0; th < T; th++) {
          const y = 128 + th * 26;
          label(svg, 62, y + 10, `thread ${th}`, "st-tick", "end");
          rect(svg, 70, y, W - 90, 20, "ix-idle", 3);
          for (const p of sc.phases) if (p.from < t) rect(svg, X(p.from), y, X(Math.min(p.to, t)) - X(p.from), 20, "ix-phase", 0);
          for (const b of sc.blocks) {
            if (b.thread !== th || b.from >= t) continue;
            rect(svg, X(b.from) + 0.5, y + 1, Math.max(0, X(Math.min(b.to, t)) - X(b.from) - 1), 18, `st-bar c${b.group % 6}`, 2);
            if (b.to - b.from > sc.end * 0.05 && b.to <= t) label(svg, (X(b.from) + X(b.to)) / 2, y + 10, b.group.toString(16).toUpperCase(), "ix-gantt-lbl");
          }
        }
        seg(svg, X(t), 120, X(t), 128 + T * 26, "ix-now");
        const done = t >= sc.end - 1e-9;
        const speedup = sc.one / sc.end;
        ui.setCaption(done
          ? `All groups are built after **${sc.end.toFixed(1)}** time units; one thread needs ${sc.one.toFixed(0)}. Speedup **${speedup.toFixed(2)}** on ${T} threads.${keys === "skewed" && !split ? " One thread builds group 3, which has 70 % of the keys, while the other three wait: Amdahl's law." : keys === "skewed" ? " Group 3 was split again into 16 groups, and all threads share them." : " Random keys fill the groups evenly, so the threads finish at about the same time."}`
          : t === 0 ? `${keys === "random" ? "Random keys: the 16 groups have about the same size." : "Skewed keys: group 3 has 70 % of the keys."} First, all threads group the keys (grey). Then each free thread takes the next group.`
            : (() => { const busy = sc.blocks.filter((b) => b.from <= t && b.to > t).length; return `Time ${t.toFixed(1)}: ${busy} of ${T} threads ${busy === 1 ? "is" : "are"} building a group.`; })());
      },
    });
  });

  /* ========================================== chapter 30: spatial indexes */

  // The key of cell (x, y) of an n x n grid on a curve.
  function zKey(x, y) {
    let k = 0;
    for (let i = 0; i < 16; i++) k |= (((x >> i) & 1) << (2 * i)) | (((y >> i) & 1) << (2 * i + 1));
    return k >>> 0;
  }
  function hKey(n, x, y) {  // the loop of the chapter (Wikipedia's xy2d)
    let d = 0;
    for (let s = n >> 1; s > 0; s >>= 1) {
      const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
        const t = x; x = y; y = t;
      }
    }
    return d;
  }
  function rng32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------- curves and key ranges */
  register("sfc-ranges", (fig) => {
    const N = 16;
    let curve = "z", box = { x: 5, y: 3, w: 6, h: 5 };
    const ui = frame(fig, { title: "A box on a space-filling curve", kicker: "Try it", split: true });
    ui.stage.classList.add("is-plain");
    const C = 21, M = 8, W = N * C + 2 * M;
    const svg = svgBox(ui.stage, W, W, "ix-grid");
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    toggle(tools, "Curve", [["z", "Z-order"], ["h", "Hilbert"]], curve, (v) => { curve = v; draw(); });
    // The box always stays on the grid: the x slider goes up to N - width, and a
    // width that does not fit at x moves the box to the left.
    const num = (v) => String(v);
    const sl = {
      x: slider(tools, "x", { min: 0, max: N - box.w, step: 1, value: box.x, format: num }, (v) => { box.x = v; update(); }),
      y: slider(tools, "y", { min: 0, max: N - box.h, step: 1, value: box.y, format: num }, (v) => { box.y = v; update(); }),
      w: slider(tools, "width", { min: 1, max: N, step: 1, value: box.w, format: num }, (v) => { box.w = v; box.x = Math.min(box.x, N - v); update(); }),
      h: slider(tools, "height", { min: 1, max: N, step: 1, value: box.h, format: num }, (v) => { box.h = v; box.y = Math.min(box.y, N - v); update(); }),
    };
    tools.appendChild(h("span", { class: "viz-label", text: "Or drag on the grid to draw the box." }));
    function update() {
      sl.x.max = N - box.w;
      sl.y.max = N - box.h;
      for (const k of ["x", "y", "w", "h"]) sl[k].setValue(box[k]);
      draw();
    }
    // A drag on the grid draws a new box, from the cell where it starts to the
    // cell under the pointer.
    const cellAt = (p) => ({ x: clamp(Math.floor((p.x - M) / C), 0, N - 1), y: clamp(N - 1 - Math.floor((p.y - M) / C), 0, N - 1) });
    let from = null;
    const stretch = (p) => {
      const c = cellAt(p);
      box = { x: Math.min(from.x, c.x), y: Math.min(from.y, c.y), w: Math.abs(c.x - from.x) + 1, h: Math.abs(c.y - from.y) + 1 };
      update();
    };
    dragging(svg, (p) => { from = cellAt(p); stretch(p); }, stretch);
    const key = (x, y) => (curve === "z" ? zKey(x, y) : hKey(N, x, y));
    const sx = (x) => M + x * C + C / 2, sy = (y) => M + (N - 1 - y) * C + C / 2;  // y grows upward, as on a map
    function draw() {
      svg.textContent = "";
      const x1 = box.x + box.w - 1, y1 = box.y + box.h - 1;
      const inside = [];
      for (let x = box.x; x <= x1; x++) for (let y = box.y; y <= y1; y++) inside.push(key(x, y));
      inside.sort((a, b) => a - b);
      const rangeOf = new Map();
      let ranges = 0;
      inside.forEach((k, i) => { if (i === 0 || k !== inside[i - 1] + 1) ranges++; rangeOf.set(k, ranges - 1); });
      const lo = inside[0], hi = inside[inside.length - 1];
      for (let x = 0; x < N; x++)
        for (let y = 0; y < N; y++) {
          const k = key(x, y);
          const r = rangeOf.get(k);
          const cls = r != null ? `ix-cell c${r % 6}` : k >= lo && k <= hi ? "ix-cell is-extra" : "ix-cell";
          rect(svg, M + x * C + 1, M + (N - 1 - y) * C + 1, C - 2, C - 2, cls, 3);
        }
      // the curve through the cells, in the order of the keys
      const order = [];
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) order.push([key(x, y), x, y]);
      order.sort((a, b) => a[0] - b[0]);
      s("path", { d: order.map(([, x, y], i) => `${i ? "L" : "M"}${sx(x)} ${sy(y)}`).join(""), class: "ix-curve" }, svg);
      rect(svg, M + box.x * C, M + (N - 1 - y1) * C, (x1 - box.x + 1) * C, (y1 - box.y + 1) * C, "ix-qbox", 2);
      const extra = order.filter(([k]) => k >= lo && k <= hi).length;
      side.textContent = "";
      side.append(panel("the box", curve === "z" ? "Z-order" : "Hilbert", h("div", { class: "st-kv" },
        h("span", { text: "cells in the box" }), h("b", { text: String(inside.length) }),
        h("span", { text: "key ranges for exactly these cells" }), h("b", { text: String(ranges) }),
        h("span", { text: "cells in one range, smallest to largest key" }), h("b", { text: String(extra) }))));
      const n = inside.length;
      ui.setCaption(`The box covers **${plural(n, "cell")}**. On the ${curve === "z" ? "Z-order" : "Hilbert"} curve, ${n === 1 ? "its key is" : "their keys form"} **${plural(ranges, "run")}** of consecutive keys (one color per run): ${plural(ranges, "range scan")} in a B+ tree. ${ranges === 1 ? "That one range reads exactly the cells of the box." : `A single range from key ${lo} to key ${hi} would read ${plural(extra, "cell")}, ${extra - n} of them outside the box (dashed).`}`);
    }
    draw();
  });

  /* ---------------------------------------------- Morton keys with pdep */
  register("morton-bits", (fig) => {
    let x = 5, y = 3;
    const ui = frame(fig, { title: "A Morton key with pdep", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "st-swiss ix-bits" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    slider(tools, "x", { min: 0, max: 255, step: 1, value: x, format: (v) => String(v) }, (v) => { x = v; draw(); });
    slider(tools, "y", { min: 0, max: 255, step: 1, value: y, format: (v) => String(v) }, (v) => { y = v; draw(); });
    const bit = (v, i) => (v >> i) & 1;
    function draw() {
      box.textContent = "";
      const places = Array.from({ length: 16 }, (_, j) => 15 - j);  // bit 15 on the left
      const key = zKey(x, y);
      box.append(cells(places, () => "is-index", "bit"));
      box.append(cells(places.map((p) => (p < 8 ? bit(x, p) : "")), (j) => (places[j] < 8 ? "c5" : "is-empty"), "x"));
      box.append(cells(places.map((p) => (p % 2 === 0 ? "1" : "0")), (j) => (places[j] % 2 === 0 ? "is-on" : "is-dim"), "mask 0x5555"));
      box.append(cells(places.map((p) => (p % 2 === 0 ? bit(x, p / 2) : "0")), (j) => (places[j] % 2 === 0 ? "c5" : "is-dim"), "pdep(x)"));
      box.append(cells(places.map((p) => (p < 8 ? bit(y, p) : "")), (j) => (places[j] < 8 ? "c0" : "is-empty"), "y"));
      box.append(cells(places.map((p) => (p % 2 === 1 ? bit(y, (p - 1) / 2) : "0")), (j) => (places[j] % 2 === 1 ? "c0" : "is-dim"), "pdep(y, 0xAAAA)"));
      box.append(cells(places.map((p) => bit(key, p)), (j) => (places[j] % 2 === 0 ? "c5" : "c0"), "key"));
      ui.setCaption(`x = ${x} (${x.toString(2).padStart(8, "0")}) and y = ${y} (${y.toString(2).padStart(8, "0")}). pdep puts the 8 bits of x, in order, into the places of the 1 bits of the mask 0x5555: the even places. The bits of y go into the odd places, with the mask 0xAAAA. The OR of the two is the Morton key **${key}**. pext with the same masks takes x and y back out.`);
    }
    draw();
  });

  /* ---------------------------------------------- squares or hexagons */
  register("hex-cells", (fig) => {
    let grid = "hex", k = 2;
    const ui = frame(fig, { title: "Cells around a point", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 520, H = 330;
    const svg = svgBox(ui.stage, W, H, "ix-hexsvg");
    const tools = toolbar(ui);
    toggle(tools, "Cells", [["square", "squares"], ["hex", "hexagons"]], grid, (v) => { grid = v; draw(); });
    slider(tools, "k", { min: 0, max: 4, step: 1, value: k, format: (v) => String(v) }, (v) => { k = v; draw(); });
    const cx = W / 2, cy = H / 2;
    function draw() {
      svg.textContent = "";
      const ringOf = [];
      if (grid === "square") {
        const side = 34;  // a square of the same area as the hexagon below
        for (let i = -8; i <= 8; i++)
          for (let j = -5; j <= 5; j++) {
            const ring = Math.max(Math.abs(i), Math.abs(j));
            const x = cx + i * side, y = cy + j * side;
            if (x < -side || x > W + side || y < -side || y > H + side) continue;
            rect(svg, x - side / 2 + 1, y - side / 2 + 1, side - 2, side - 2, ring <= k ? `ix-hexcell r${ring}` : "ix-hexcell", 3);
            if (ring === k) ringOf.push(Math.hypot(i, j) * side);
          }
        if (k > 0) {
          seg(svg, cx, cy, cx + side, cy, "ix-dist");
          seg(svg, cx, cy, cx + side, cy - side, "ix-dist");
          label(svg, cx + side / 2, cy + 9, "1", "ix-dist-lbl");
          label(svg, cx + side / 2 + 6, cy - side / 2 - 6, "1.41", "ix-dist-lbl");
        }
        const n = (2 * k + 1) ** 2;
        const near = k * 34, far = k * 34 * Math.SQRT2;
        ui.setCaption(`Squares, like geohash cells: the cells within ${k} step${k === 1 ? "" : "s"} are ${n} cells${k === 1 ? ", the 9 cells of a Redis radius query" : ""}. A square has 4 neighbours across an edge, 1 cell away, and 4 across a corner, 1.41 away.${k ? ` The centres of ring ${k} are between ${(near / 34).toFixed(2)} and ${(far / 34).toFixed(2)} cells away: the block is a square, not a circle.` : ""}`);
      } else {
        const size = 21.1;  // corner distance: a hexagon of the area of the square above
        const D = Math.sqrt(3) * size;  // the distance between the centres of neighbours
        const corners = (x, y) => Array.from({ length: 6 }, (_, i) => {
          const a = Math.PI / 180 * (60 * i - 30);
          return `${(x + (size - 1.2) * Math.cos(a)).toFixed(1)},${(y + (size - 1.2) * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        for (let q = -10; q <= 10; q++)
          for (let r = -6; r <= 6; r++) {
            const x = cx + size * Math.sqrt(3) * (q + r / 2), y = cy + size * 1.5 * r;
            if (x < -size || x > W + size || y < -size || y > H + size) continue;
            const ring = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
            s("polygon", { points: corners(x, y), class: ring <= k ? `ix-hexcell r${ring}` : "ix-hexcell" }, svg);
            if (ring === k) ringOf.push(Math.hypot(x - cx, y - cy));
          }
        if (k > 0) {
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i;
            seg(svg, cx, cy, cx + D * Math.cos(a), cy + D * Math.sin(a), "ix-dist");
          }
          label(svg, cx + D / 2, cy - 8, "1", "ix-dist-lbl");
        }
        const n = 1 + 3 * k * (k + 1);
        const near = ringOf.length ? Math.min(...ringOf) / D : 0, far = ringOf.length ? Math.max(...ringOf) / D : 0;
        ui.setCaption(`Hexagons, like H3 cells: the cells within ${k} step${k === 1 ? "" : "s"} are 1 + 3k(k + 1) = ${n} cells. All 6 neighbours are across an edge, at the same distance.${k ? ` The centres of ring ${k} are between ${near.toFixed(2)} and ${far.toFixed(2)} steps away: closer to a circle than the squares.` : ""}`);
      }
      s("circle", { cx, cy, r: 4, class: "ix-centre" }, svg);
    }
    draw();
  });

  /* ---------------------------------------------- packing an R-tree */
  // 64 points of a small map (towns and some scattered points), packed into
  // leaves of 4 points and nodes of 4 children.
  const MAP_W = 400, MAP_H = 300;
  const MAP_POINTS = (() => {
    const r = rng32(30);
    const towns = [[95, 210, 0.3], [270, 90, 0.25], [300, 220, 0.2], [150, 80, 0.1]];
    const pts = [];
    while (pts.length < 64) {
      let x, y;
      if (r() < 0.75) {
        const u = r();
        let acc = 0, t = towns[0];
        for (const tw of towns) { acc += tw[2] / 0.85; if (u <= acc) { t = tw; break; } }
        const a = 2 * Math.PI * r(), d = 34 * Math.sqrt(-2 * Math.log(1 - r() * 0.999)) * 0.6;
        x = t[0] + d * Math.cos(a);
        y = t[1] + d * Math.sin(a);
      } else {
        x = 15 + r() * (MAP_W - 30);
        y = 15 + r() * (MAP_H - 30);
      }
      if (x > 8 && x < MAP_W - 8 && y > 8 && y < MAP_H - 8) pts.push({ x: Math.round(x), y: Math.round(y), id: pts.length });
    }
    return pts;
  })();
  const unionBox = (bs) => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  // STR with fanout 4: returns the levels, each a list of nodes {box, kids (ids of the level below)} and the slices.
  function strLevels(points, B = 4) {
    let entries = points.map((p) => ({ box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, id: p.id }));
    const levels = [];
    for (;;) {
      if (entries.length <= B) {
        levels.push({ nodes: [{ box: unionBox(entries.map((e) => e.box)), kids: entries.map((e) => e.id) }], cuts: [] });
        return levels;
      }
      const P = Math.ceil(entries.length / B);
      let S = Math.floor(Math.sqrt(P));
      while (S * S < P) S++;
      const cx = (e) => e.box.x0 + e.box.x1, cy = (e) => e.box.y0 + e.box.y1;
      entries.sort((a, b) => cx(a) - cx(b) || cy(a) - cy(b) || a.id - b.id);
      const nodes = [], cuts = [];
      for (let s0 = 0; s0 < entries.length; s0 += S * B) {
        const slice = entries.slice(s0, s0 + S * B).sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b) || a.id - b.id);
        if (s0 > 0) cuts.push((entries[s0 - 1].box.x1 + slice.reduce((m, e) => Math.min(m, e.box.x0), Infinity)) / 2);
        for (let r0 = 0; r0 < slice.length; r0 += B) {
          const run = slice.slice(r0, r0 + B);
          nodes.push({ box: unionBox(run.map((e) => e.box)), kids: run.map((e) => e.id) });
        }
      }
      levels.push({ nodes, cuts });
      entries = nodes.map((n, i) => ({ box: n.box, id: i }));
    }
  }
  function packLevels(points, order, B = 4) {
    let entries = order.map((i) => ({ box: { x0: points[i].x, y0: points[i].y, x1: points[i].x, y1: points[i].y }, id: i }));
    const levels = [];
    for (;;) {
      const nodes = [];
      for (let r0 = 0; r0 < entries.length; r0 += B) {
        const run = entries.slice(r0, r0 + B);
        nodes.push({ box: unionBox(run.map((e) => e.box)), kids: run.map((e) => e.id) });
      }
      levels.push({ nodes, cuts: [] });
      if (nodes.length === 1) return levels;
      entries = nodes.map((n, i) => ({ box: n.box, id: i }));
    }
  }
  function coverage(boxes) {  // the share of the map under at least one box, and under two or more
    let one = 0, two = 0, n = 0;
    for (let x = 2; x < MAP_W; x += 4)
      for (let y = 2; y < MAP_H; y += 4) {
        let c = 0;
        for (const b of boxes) if (x >= b.x0 - 2 && x <= b.x1 + 2 && y >= b.y0 - 2 && y <= b.y1 + 2) c++;
        n++;
        if (c >= 1) one++;
        if (c >= 2) two++;
      }
    return { one: one / n, two: two / n };
  }
  const hilbertOrder = (pts) => pts.map((p) => [hKey(64, Math.min(63, Math.floor(p.x / (MAP_W / 64))), Math.min(63, Math.floor(p.y / (MAP_H / 64)))), p.id]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[1]);
  const randomOrder = (pts) => { const r = rng32(7); const o = pts.map((p) => p.id); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  function drawMap(svg, sy) {
    rect(svg, 0, 0, MAP_W, MAP_H, "ix-mapbg", 8);
    void sy;
  }
  const flipY = (y) => MAP_H - y;  // the map's y grows upward
  register("str-pack", (fig) => {
    let order = "str";
    const ui = frame(fig, { title: "Packing an R-tree", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const svg = svgBox(ui.stage, MAP_W, MAP_H, "ix-map");
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    toggle(tools, "Order", [["str", "Sort-Tile-Recursive"], ["hilbert", "Hilbert curve"], ["random", "random"]], order, (v) => { order = v; player.setFrames(make()); });
    function make() {
      const levels = order === "str" ? strLevels(MAP_POINTS) : packLevels(MAP_POINTS, order === "hilbert" ? hilbertOrder(MAP_POINTS) : randomOrder(MAP_POINTS));
      const fr = [{ show: 0, cap: `64 points of a small map. Leaves hold 4 points, and nodes 4 children. ${order === "str" ? "STR first sorts the points by x." : order === "hilbert" ? "The points are sorted by their Hilbert keys." : "The points come in a random order, as inserts would."}` }];
      if (order === "str") {
        fr.push({ show: 1, cap: "16 leaves are needed, so S = 4 vertical slices of 4 × 4 = 16 points each, in the order of x (the dashed lines)." });
        fr.push({ show: 2, cap: "Each slice is sorted by y and cut into runs of 4 points: the 16 leaves, with small boxes that hardly overlap." });
      } else {
        fr.push({ show: 1, cap: order === "hilbert" ? "The order of the Hilbert keys, drawn as a path: it moves through the map without long jumps." : "The random order, drawn as a path: it jumps all over the map." });
        fr.push({ show: 2, cap: `Runs of 4 points in this order are the 16 leaves.${order === "random" ? " Their boxes are large and cover each other: a query meets many of them." : " Neighbours on the curve are neighbours on the map, so the boxes are small."}` });
      }
      fr.push({ show: 3, cap: `The level above: the 16 leaf boxes are packed into 4 nodes${order === "str" ? " by STR again, by the centres of the boxes" : ", 4 leaves each, in order"}.` });
      fr.push({ show: 4, cap: "The root holds the 4 nodes. A query starts here and visits only the children whose boxes meet it." });
      return fr.map((f) => ({ ...f, levels }));
    }
    const player = new Player(fig, {
      frames: make(), interval: 2300,
      apply: (f) => {
        svg.textContent = "";
        drawMap(svg);
        const leaves = f.levels[0].nodes, mids = f.levels.length > 2 ? f.levels[1].nodes : [];
        if (f.show === 1 && order === "str") for (const c of f.levels[0].cuts) seg(svg, c, 4, c, MAP_H - 4, "ix-cut");
        if (f.show === 1 && order !== "str") {
          const o = order === "hilbert" ? hilbertOrder(MAP_POINTS) : randomOrder(MAP_POINTS);
          s("path", { d: o.map((i, j) => `${j ? "L" : "M"}${MAP_POINTS[i].x} ${flipY(MAP_POINTS[i].y)}`).join(""), class: "ix-path" }, svg);
        }
        if (f.show >= 2) leaves.forEach((n, i) => rect(svg, n.box.x0 - 3, flipY(n.box.y1) - 3, n.box.x1 - n.box.x0 + 6, n.box.y1 - n.box.y0 + 6, `ix-leafbox c${i % 6}`, 3));
        if (f.show >= 3) mids.forEach((n) => rect(svg, n.box.x0 - 7, flipY(n.box.y1) - 7, n.box.x1 - n.box.x0 + 14, n.box.y1 - n.box.y0 + 14, "ix-midbox", 5));
        if (f.show >= 4) { const b = f.levels[f.levels.length - 1].nodes[0].box; rect(svg, b.x0 - 11, flipY(b.y1) - 11, b.x1 - b.x0 + 22, b.y1 - b.y0 + 22, "ix-rootbox", 7); }
        for (const p of MAP_POINTS) s("circle", { cx: p.x, cy: flipY(p.y), r: 2.6, class: "ix-pt" }, svg);
        const cov = coverage(leaves.map((n) => n.box));
        side.textContent = "";
        side.append(panel("the 16 leaf boxes", order === "str" ? "STR" : order === "hilbert" ? "Hilbert" : "random", h("div", { class: "st-kv" },
          h("span", { text: "map under a leaf box" }), h("b", { text: f.show >= 2 ? `${Math.round(cov.one * 100)} %` : "–" }),
          h("span", { text: "map under 2 or more" }), h("b", { text: f.show >= 2 ? `${Math.round(cov.two * 100)} %` : "–" }))));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- range and nearest queries */
  register("rtree-query", (fig) => {
    // One place for both queries: the centre of the range box and the query
    // point of the nearest-neighbour search. Sliders or a drag move it.
    let mode = "range";
    const at = { x: 275, y: 185 }, QW = 90, QH = 70, K = 3;
    const levels = strLevels(MAP_POINTS);  // leaves, the level of 4 nodes, the root
    const leaves = levels[0].nodes, mids = levels[1].nodes;
    const meets = (b, r) => b.x0 <= r.x1 && r.x0 <= b.x1 && b.y0 <= r.y1 && r.y0 <= b.y1;
    const mindist = (b, p) => Math.hypot(Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));
    function make() {
      const fr = [];
      if (mode === "range") {
        const r = { x0: at.x - QW / 2, y0: at.y - QH / 2, x1: at.x + QW / 2, y1: at.y + QH / 2 };
        const st = { mids: new Map(), leaves: new Map(), found: [] };
        const push = (cap) => fr.push({ mids: new Map(st.mids), leaves: new Map(st.leaves), found: st.found.slice(), cap, r });
        push("A range query starts at the root, which holds the boxes of its 4 children.");
        mids.forEach((m, i) => st.mids.set(i, meets(m.box, r) ? "on" : "off"));
        const on = [...st.mids.values()].filter((v) => v === "on").length;
        push(`The root tests the 4 boxes of its children: ${on} of them ${on === 1 ? "meets" : "meet"} the query box (green). The others are skipped with everything below them.`);
        mids.forEach((m, i) => {
          if (!meets(m.box, r)) return;
          m.kids.forEach((li) => st.leaves.set(li, meets(leaves[li].box, r) ? "on" : "off"));
          const hit = m.kids.filter((li) => meets(leaves[li].box, r)).length;
          push(`Node ${i + 1} tests its 4 leaf boxes: ${hit} ${hit === 1 ? "meets" : "meet"} the query.`);
          m.kids.forEach((li) => {
            if (!meets(leaves[li].box, r)) return;
            const got = leaves[li].kids.filter((pi) => meets({ x0: MAP_POINTS[pi].x, y0: MAP_POINTS[pi].y, x1: MAP_POINTS[pi].x, y1: MAP_POINTS[pi].y }, r));
            st.found.push(...got);
            st.leaves.set(li, "read");
            push(`A leaf tests its 4 points: ${got.length} ${got.length === 1 ? "is" : "are"} inside the box.`);
          });
        });
        const read = 1 + [...st.mids.values()].filter((v) => v === "on").length + [...st.leaves.values()].filter((v) => v === "read").length;
        push(`Done: **${plural(st.found.length, "point")}** found, and **${read}** of the ${1 + mids.length + leaves.length} nodes read.`);
      } else {
        const heap = [{ d: 0, kind: "root" }];
        const found = [];
        const st = { mids: new Map(), leaves: new Map() };
        const fmtItem = (it) => `${it.kind === "point" ? `point ${it.id}` : it.kind === "leaf" ? `leaf ${it.id + 1}` : it.kind === "mid" ? `node ${it.id + 1}` : "root"}: ${it.d.toFixed(0)}`;
        const order = (a, b) => a.d - b.d || (a.kind === "point") - (b.kind === "point") || (a.id || 0) - (b.id || 0);
        const push = (cap, last) => fr.push({ mids: new Map(st.mids), leaves: new Map(st.leaves), found: found.slice(), cap, heap: heap.slice().sort(order).slice(0, 7).map(fmtItem), radius: last });
        push(`The ${K} nearest points to the query point. A priority queue holds nodes and points by their distance; for a box, the distance to its nearest place (MINDIST).`, 0);
        while (heap.length && found.length < K) {
          heap.sort(order);
          const it = heap.shift();
          if (it.kind === "point") {
            found.push(it.id);
            push(`The nearest item is **point ${it.id}**, at ${it.d.toFixed(0)}: answer ${found.length}. Nothing in the queue is nearer, and MINDIST never overestimates.`, it.d);
            continue;
          }
          if (it.kind === "root") mids.forEach((m, i) => { heap.push({ d: mindist(m.box, at), kind: "mid", id: i }); st.mids.set(i, "off"); });
          if (it.kind === "mid") { st.mids.set(it.id, "on"); mids[it.id].kids.forEach((li) => { heap.push({ d: mindist(leaves[li].box, at), kind: "leaf", id: li }); st.leaves.set(li, "off"); }); }
          if (it.kind === "leaf") { st.leaves.set(it.id, "read"); leaves[it.id].kids.forEach((pi) => heap.push({ d: Math.hypot(MAP_POINTS[pi].x - at.x, MAP_POINTS[pi].y - at.y), kind: "point", id: pi })); }
          push(`The nearest item is ${fmtItem(it).split(":")[0]} (distance ${it.d.toFixed(0)}): it puts its children into the queue with their distances.`, found.length ? fr[fr.length - 1].radius : 0);
        }
        const read = 1 + [...st.mids.values()].filter((v) => v === "on").length + [...st.leaves.values()].filter((v) => v === "read").length;
        push(`Done: the ${K} nearest points, after reading **${read}** of the ${1 + mids.length + leaves.length} nodes. Only nodes nearer than the last answer were read.`, fr[fr.length - 1].radius);
      }
      return fr;
    }
    const ui = frame(fig, { title: "Queries in an R-tree", kicker: "Animation", split: true });
    ui.stage.classList.add("is-plain");
    const svg = svgBox(ui.stage, MAP_W, MAP_H, "ix-map");
    const side = h("div", { class: "st-side" });
    ui.side.appendChild(side);
    const tools = toolbar(ui);
    toggle(tools, "Query", [["range", "range"], ["knn", "3 nearest"]], mode, (v) => { mode = v; player.setFrames(make()); });
    // After a move, the figure shows the answer at once; Restart replays the steps.
    const moved = () => {
      sx.setValue(at.x);
      sy.setValue(at.y);
      player.setFrames(make());
      player.go(player.frames.length - 1);
    };
    const sx = slider(tools, "x", { min: QW / 2, max: MAP_W - QW / 2, step: 5, value: at.x, format: String }, (v) => { at.x = v; moved(); });
    const sy = slider(tools, "y", { min: QH / 2, max: MAP_H - QH / 2, step: 5, value: at.y, format: String }, (v) => { at.y = v; moved(); });
    tools.appendChild(h("span", { class: "viz-label", text: "Or drag on the map." }));
    const place = (p) => {
      at.x = clamp(Math.round(p.x / 5) * 5, QW / 2, MAP_W - QW / 2);
      at.y = clamp(Math.round((MAP_H - p.y) / 5) * 5, QH / 2, MAP_H - QH / 2);
      moved();
    };
    dragging(svg, place, place);
    const player = new Player(fig, {
      frames: make(), interval: 1800,
      apply: (f) => {
        svg.textContent = "";
        drawMap(svg);
        leaves.forEach((n, i) => { const st = f.leaves.get(i); rect(svg, n.box.x0 - 3, flipY(n.box.y1) - 3, n.box.x1 - n.box.x0 + 6, n.box.y1 - n.box.y0 + 6, `ix-leafbox${st === "read" ? " is-read" : st === "on" ? " is-on" : st === "off" ? " is-off" : ""}`, 3); });
        mids.forEach((n, i) => { const st = f.mids.get(i); rect(svg, n.box.x0 - 7, flipY(n.box.y1) - 7, n.box.x1 - n.box.x0 + 14, n.box.y1 - n.box.y0 + 14, `ix-midbox${st === "on" ? " is-on" : st === "off" ? " is-off" : ""}`, 5); });
        if (f.r) rect(svg, f.r.x0, flipY(f.r.y1), f.r.x1 - f.r.x0, f.r.y1 - f.r.y0, "ix-qbox", 2);
        for (const p of MAP_POINTS) s("circle", { cx: p.x, cy: flipY(p.y), r: f.found.includes(p.id) ? 4.5 : 2.6, class: `ix-pt${f.found.includes(p.id) ? " is-found" : ""}` }, svg);
        if (mode === "knn") {
          if (f.radius) s("circle", { cx: at.x, cy: flipY(at.y), r: f.radius, class: "ix-radius" }, svg);
          s("circle", { cx: at.x, cy: flipY(at.y), r: 5, class: "ix-centre" }, svg);
        }
        side.textContent = "";
        if (mode === "knn") side.append(panel("priority queue", "nearest first", h("div", { class: "ix-queue" }, ...(f.heap || []).map((t) => h("span", { text: t })))));
        else side.append(panel("found", plural(f.found.length, "point"), h("div", { class: "ix-queue" }, h("span", { text: f.found.length ? f.found.slice().sort((a, b) => a - b).join(", ") : "–" }))));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- the node test with SIMD */
  register("rtree-simd", (fig) => {
    // 6 slots in use and 2 empty ones, on a map of 400 x 220
    const SLOTS = [[20, 30, 90, 80], [60, 120, 150, 190], [130, 40, 200, 100], [210, 130, 280, 200], [240, 30, 330, 90], [320, 110, 380, 190]];
    let qx = 150, qy = 70;
    const QW = 110, QH = 80;
    const ui = frame(fig, { title: "Eight boxes in one compare", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 400, H = 220;
    const svg = svgBox(ui.stage, W, H, "ix-map");
    const box = h("div", { class: "st-swiss ix-n8" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    const sx = slider(tools, "query x", { min: 0, max: W - QW, step: 5, value: qx, format: String }, (v) => { qx = v; draw(); });
    const sy = slider(tools, "query y", { min: 0, max: H - QH, step: 5, value: qy, format: String }, (v) => { qy = v; draw(); });
    tools.appendChild(h("span", { class: "viz-label", text: "Or drag the query on the map." }));
    const place = (p) => {  // the pointer is the centre of the query box
      qx = clamp(Math.round((p.x - QW / 2) / 5) * 5, 0, W - QW);
      qy = clamp(Math.round((H - p.y - QH / 2) / 5) * 5, 0, H - QH);
      sx.setValue(qx);
      sy.setValue(qy);
      draw();
    };
    dragging(svg, place, place);
    const fmt = (v) => (v === Infinity ? "∞" : v === -Infinity ? "−∞" : String(v));
    function draw() {
      const q = { x0: qx, y0: qy, x1: qx + QW, y1: qy + QH };
      const slots = Array.from({ length: 8 }, (_, i) => (i < SLOTS.length ? { x0: SLOTS[i][0], y0: SLOTS[i][1], x1: SLOTS[i][2], y1: SLOTS[i][3] } : { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }));
      const rows = [
        ["min_x ≤ q.max_x", (b) => b.x0 <= q.x1],
        ["q.min_x ≤ max_x", (b) => q.x0 <= b.x1],
        ["min_y ≤ q.max_y", (b) => b.y0 <= q.y1],
        ["q.min_y ≤ max_y", (b) => q.y0 <= b.y1],
      ];
      const all = slots.map((b) => rows.every(([, f]) => f(b)));
      svg.textContent = "";
      rect(svg, 0, 0, W, H, "ix-mapbg", 8);
      slots.forEach((b, i) => {
        if (i >= SLOTS.length) return;
        rect(svg, b.x0, H - b.y1, b.x1 - b.x0, b.y1 - b.y0, `ix-leafbox${all[i] ? " is-on" : " is-off"}`, 3);
        label(svg, (b.x0 + b.x1) / 2, H - (b.y0 + b.y1) / 2, String(i), "ix-slot-lbl");
      });
      rect(svg, q.x0, H - q.y1, q.x1 - q.x0, q.y1 - q.y0, "ix-qbox", 2);
      box.textContent = "";
      box.append(cells(slots.map((_, i) => i), () => "is-index", "slot"));
      box.append(cells(slots.map((b) => fmt(b.x0)), (i) => (i >= SLOTS.length ? "is-empty" : ""), "min_x"));
      for (const [name, f] of rows) box.append(cells(slots.map((b) => (f(b) ? "1" : "0")), (i) => (f(slots[i]) ? "is-on" : "is-dim"), name));
      box.append(cells(all.map((v) => (v ? "1" : "0")), (i) => (all[i] ? "is-hit" : "is-dim"), "AND"));
      const mask = all.reduce((m, v, i) => m | ((v ? 1 : 0) << i), 0);
      ui.setCaption(`Each row is one _mm256_cmp_ps on 8 lanes. The AND of the four rows, after _mm256_movemask_ps, is the mask **0b${mask.toString(2).padStart(8, "0")}** (slot 0 on the right): ${all.filter(Boolean).length} of the boxes ${all.filter(Boolean).length === 1 ? "meets" : "meet"} the query. The empty slots 6 and 7 have min = +∞ and max = −∞, so the first row is 0 for them, without a test of the count.`);
    }
    draw();
  });
})();
