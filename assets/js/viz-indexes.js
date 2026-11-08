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
    const player = new Player(fig, {
      frames, interval: 2600,
      apply: (count) => {
        draw(count);
        const extra = view === "plain" ? " **Plain trie:** every key has a node on all four levels, and most slots are empty."
          : view === "lazy" ? " **Lazy expansion:** a key is a leaf as soon as it is alone, but every level still has a node of 16 slots."
            : "";
        ui.setCaption(ART_CAPS[count] + (count ? extra : ""));
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
      ui.setCaption(`A node with **${c}** children is a **${k.name}**: ${k.bytes} bytes, ${(k.bytes / c).toFixed(1)} bytes per child. A Node256 for the same children would need 2064 bytes, ${(2064 / c).toFixed(1)} per child. With the smallest kind, a node never costs more than 42 bytes per child: the worst case is a Node256 with 49 children.${k.name === "Node48" ? " A Node48 finds a child with two loads: index[b], then the pointer." : k.name === "Node16" ? " A Node16 finds a byte with one SIMD compare." : ""}`);
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
        if (f.show >= 6) box.append(h("div", { class: "st-lanesbox" }, h("span", { class: `st-count${f.ok === false ? " is-bad" : ""}` }, mode === "find" ? "countr_zero" : "popcount", h("b", { text: String(f.answer) }))));
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
            : `Time ${t.toFixed(1)}: ${sc.blocks.filter((b) => b.from <= t && b.to > t).length} of ${T} threads are building a group.`);
      },
    });
  });
})();
