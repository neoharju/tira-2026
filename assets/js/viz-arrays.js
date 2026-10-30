/* Array and table figures: sorting, lists in memory, complexity classes,
   hashing, efficient one-pass algorithms (chapter 3–5), dynamic programming
   tables and linked lists. Cells are scene nodes with a stable identity, so
   moving an element (a swap, a shift) is animated as an actual movement. */
(() => {
  "use strict";
  const V = window.TiraViz;
  if (!V) return;
  const { register, Scene, Player, CodePanel, VarsPanel, frame, h } = V;

  const cellNode = (id, x, y, v, cls = "", w = 44, hh = 44) => ({ id, x, y, label: v, shape: "rect", w, h: hh, rx: 9, cls: `${cls} is-mono` });

  /* ===================================================== insertion sort */
  register("insertion-sort", (fig) => {
    const CODE = `def insertion_sort(items):
    for i in range(1, len(items)):
        for j in range(i - 1, -1, -1):
            if items[j] > items[j + 1]:
                swap(items, j, j + 1)
            else:
                break`;
    const start = [5, 2, 4, 2, 6, 1];
    const ui = frame(fig, { title: "Lisäysjärjestäminen", split: true, kicker: "Animaatio" });
    const W = 400;
    const sc = new Scene(ui.stage, { w: W, h: 170 });
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Tila");
    let items = start.map((v, k) => ({ id: `e${k}`, v }));
    const X = (i) => 50 + i * 60;
    const inversions = (a) => { let c = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i].v > a[j].v) c++; return c; };
    const frames = [];
    let swaps = 0;
    const snap = (cap, line, o = {}) => {
      const nodes = items.map((e, k) => cellNode(e.id, X(k), 82, e.v, (o.cls && o.cls[k]) || (o.sorted != null && k <= o.sorted ? "done" : "")));
      const marks = items.map((e, k) => ({ id: `ix${k}`, type: "text", x: X(k), y: 124, text: String(k), cls: "faint mono" }));
      if (o.i != null) marks.push({ id: "pi", type: "text", x: X(o.i), y: 34, text: "i", cls: "cur mono big" });
      if (o.j != null) marks.push({ id: "pj", type: "text", x: X(o.j), y: 34, text: "j", cls: "done mono big" });
      if (o.sorted != null) marks.push({ id: "br", type: "line", d: `M${X(0) - 22} 146H${X(o.sorted) + 22}`, cls: "done" }, { id: "brt", type: "text", x: (X(0) + X(o.sorted)) / 2, y: 158, text: "järjestetty alkuosa", cls: "done" });
      frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "items", v: `[${items.map((e) => e.v).join(", ")}]` }, { k: "vaihtoja", v: String(swaps) }, { k: "inversioita", v: String(inversions(items)) }] });
    };
    snap("Järjestetään lista [5, 2, 4, 2, 6, 1]. Listassa on 9 inversiota.", 1);
    for (let i = 1; i < items.length; i++) {
      snap(`Kohdan ${i} alkio ${items[i].v} siirretään oikeaan kohtaan järjestetyssä alkuosassa.`, 2, { i, sorted: i - 1, cls: { [i]: "cur" } });
      for (let j = i - 1; j >= 0; j--) {
        if (items[j].v > items[j + 1].v) {
          snap(`${items[j].v} > ${items[j + 1].v}, joten alkiot vaihdetaan.`, [4, 5], { i, j, sorted: i - 1, cls: { [j]: "act", [j + 1]: "cur" } });
          [items[j], items[j + 1]] = [items[j + 1], items[j]];
          swaps++;
          snap(`Vaihto poisti yhden inversion.`, 5, { i, j, sorted: i - 1, cls: { [j]: "cur", [j + 1]: "act" } });
        } else {
          snap(`${items[j].v} ≤ ${items[j + 1].v}, joten alkio on oikealla paikalla ja sisempi silmukka päättyy.`, [6, 7], { i, j, sorted: i, cls: { [j + 1]: "okf" } });
          break;
        }
      }
    }
    snap(`Valmis: [${items.map((e) => e.v).join(", ")}]. Vaihtoja tehtiin ${swaps}, yhtä monta kuin alussa oli inversioita.`, [], { sorted: items.length - 1 });
    new Player(fig, { frames, interval: 1150, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  });

  /* ========================================================= merge sort */
  register("merge-sort", (fig) => {
    const A = [5, 1, 2, 9, 7, 5, 4, 2];
    const ui = frame(fig, { title: "Lomitusjärjestäminen", kicker: "Animaatio" });
    const W = 520;
    const sc = new Scene(ui.stage, { w: W, h: 392 });
    const CW = 38;
    const rowY = (r) => 30 + r * 55;
    // groups per row: split rows 0..3 have size 8 / 2^r; merge rows 4..6 have size 2^(r-3)
    const gsize = (r) => (r <= 3 ? 8 >> r : 1 << (r - 3));
    const X = (r, i) => {
      const g = Math.floor(i / gsize(r));
      const groups = 8 / gsize(r);
      const gap = 14;
      const total = 8 * CW + (groups - 1) * gap;
      return (W - total) / 2 + CW / 2 + i * CW + g * gap;
    };
    const rows = [];
    rows[0] = A.slice();
    for (let r = 1; r <= 3; r++) rows[r] = A.slice();
    const merged = {};
    const frames = [];
    const visible = new Set([0]);
    const snap = (cap, o = {}) => {
      const nodes = [];
      const marks = [];
      for (const r of visible) {
        const vals = r <= 3 ? rows[r] : merged[r] || [];
        vals.forEach((v, i) => {
          if (v == null) return;
          let cls = r === 6 && vals.filter((x) => x != null).length === 8 ? "okf" : "";
          if (o.cls && o.cls[`${r},${i}`]) cls = o.cls[`${r},${i}`];
          nodes.push(cellNode(`r${r}-${i}`, X(r, i), rowY(r), v, cls, CW - 4, 34));
        });
      }
      // connecting lines between consecutive rows
      for (const r of visible) {
        if (r === 0 || !visible.has(r - 1)) continue;
        const gs = gsize(r);
        for (let g = 0; g < 8 / gs; g++) {
          const xc = (X(r, g * gs) + X(r, g * gs + gs - 1)) / 2;
          const prevGs = gsize(r - 1);
          const pg = r <= 3 ? Math.floor((g * gs) / prevGs) : null;
          const sources = r <= 3 ? [pg] : [2 * g, 2 * g + 1].map((x) => x);
          for (const sgrp of sources) {
            const sx = (X(r - 1, sgrp * prevGs) + X(r - 1, sgrp * prevGs + prevGs - 1)) / 2;
            marks.push({ id: `ln${r}-${g}-${sgrp}`, type: "line", d: `M${sx} ${rowY(r - 1) + 18}C${sx} ${rowY(r - 1) + 36} ${xc} ${rowY(r) - 36} ${xc} ${rowY(r) - 18}`, cls: "dash", under: true });
          }
        }
      }
      frames.push({ st: { nodes, edges: [], marks }, cap });
    };
    snap("Järjestetään lista [5, 1, 2, 9, 7, 5, 4, 2]. Ensin lista jaetaan rekursiivisesti puoliksi.");
    for (let r = 1; r <= 3; r++) { visible.add(r); snap(r === 3 ? "Kun listassa on yksi alkio, rekursio päättyy: yksi alkio on valmiiksi järjestyksessä." : `Jaetaan listat puolikkaiksi (${8 >> r} alkiota).`); }
    for (let r = 4; r <= 6; r++) {
      merged[r] = new Array(8).fill(null);
      visible.add(r);
      const gs = gsize(r);
      const src = r === 4 ? rows[3] : merged[r - 1];
      for (let g = 0; g < 8 / gs; g++) {
        const half = gs / 2;
        const left = src.slice(g * gs, g * gs + half);
        const right = src.slice(g * gs + half, g * gs + gs);
        let a = 0;
        let b = 0;
        for (let k = 0; k < gs; k++) {
          const pickLeft = b === right.length || (a < left.length && left[a] <= right[b]);
          const srcIdx = pickLeft ? g * gs + a : g * gs + half + b;
          const otherIdx = pickLeft ? (b < right.length ? g * gs + half + b : null) : (a < left.length ? g * gs + a : null);
          const v = pickLeft ? left[a++] : right[b++];
          merged[r][g * gs + k] = v;
          const cls = { [`${r - 1},${srcIdx}`]: "cur", [`${r},${g * gs + k}`]: "act" };
          if (otherIdx != null) cls[`${r - 1},${otherIdx}`] = "done";
          snap(otherIdx != null
            ? `Lomitus: verrataan puoliskojen pienimpiä jäljellä olevia alkioita ${pickLeft ? v : src[otherIdx]} ja ${pickLeft ? src[otherIdx] : v}. Pienempi, ${v}, siirtyy yhdistettyyn listaan.`
            : `Toinen puolisko on käytetty, joten alkio ${v} siirtyy suoraan yhdistettyyn listaan.`, { cls });
        }
      }
    }
    snap("Valmis: [1, 2, 2, 4, 5, 5, 7, 9]. Jokaisella tasolla lomittaminen vie aikaa O(n), ja tasoja on O(log n).");
    new Player(fig, { frames, interval: 900, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
  });

  /* ============================================ list in memory (ch. 2) */
  register("list-memory", (fig) => {
    const ui = frame(fig, { title: "Lista muistissa", kicker: "Kokeile" });
    const COLS = 12;
    const CW = 36;
    const W = COLS * CW + 40;
    const LAST = 100 + 2 * COLS - 1;
    const sc = new Scene(ui.stage, { w: W, h: 190 });
    const vars = new VarsPanel(ui.side, "Tila");
    const tools = h("div", { class: "viz-tools" });
    ui.main.after(tools);
    const addrXY = (a) => { const k = a - 100; return [20 + CW / 2 + (k % COLS) * CW, 52 + Math.floor(k / COLS) * 92]; };
    let st;
    let next;
    let player = null;
    const reset = () => { st = { start: 100, cap: 8, slots: [1, 2, 3, 4].map((v) => ({ id: `x${v}`, v })) }; next = 5; };
    // slots: array index -> element or null (a gap while elements are moving)
    const render = (o = {}) => {
      const nodes = [];
      const marks = [];
      for (let a = 100; a <= LAST; a++) {
        const [x, y] = addrXY(a);
        marks.push({ id: `ad${a}`, type: "text", x, y: y - 31, text: String(a), cls: "faint mono" });
        const inList = a >= st.start && a < st.start + st.cap;
        const inOld = o.old && a >= o.old.start && a < o.old.start + o.old.cap;
        marks.push({ id: `bx${a}`, type: "rect", x: x - CW / 2 + 2, y: y - 18, w: CW - 4, h: 36, rx: 7, cls: inList ? "cur" : inOld ? "soft" : "none" });
      }
      st.slots.forEach((e, i) => {
        if (!e) return;
        const [x, y] = addrXY(st.start + i);
        nodes.push(cellNode(e.id, x, y, e.v, (o.cls && o.cls[i]) || "", CW - 8, 30));
      });
      (o.ghosts || []).forEach((g) => { const [x, y] = addrXY(g.addr); nodes.push(cellNode(g.id, x, y, g.v, "ghost", CW - 8, 30)); });
      return { nodes, edges: [], marks };
    };
    const size = () => st.slots.filter(Boolean).length;
    const varItems = (moves, cost) => [
      { k: "numbers", v: `[${st.slots.filter(Boolean).map((e) => e.v).join(", ")}]` },
      { k: "koko", v: String(size()) },
      { k: "varattu tila", v: `${st.cap} (${st.start}–${st.start + st.cap - 1})` },
      { k: "siirtoja", v: String(moves), cls: moves > 1 ? "hl" : "" },
    ].concat(cost ? [{ k: "aikavaativuus", v: cost, cls: cost === "O(1)" ? "ok" : "hl" }] : []);
    const play = (frames) => {
      if (!player) player = new Player(fig, { frames, interval: 800, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
      else player.setFrames(frames);
      if (frames.length > 1) player.play();
    };
    // Full region: allocate a twice as large region right after the old one and copy.
    function grow(frames) {
      const old = { start: st.start, cap: st.cap };
      if (old.start + old.cap + 2 * old.cap - 1 > LAST) return -1;
      const items = st.slots.slice();
      st.start = old.start + old.cap;
      st.cap = old.cap * 2;
      st.slots = [];
      frames.push({ st: render({ old, ghosts: items.map((e, i) => ({ id: e.id, v: e.v, addr: old.start + i })) }), cap: `Varattu alue on täynnä! Varataan uusi kaksi kertaa suurempi alue (${st.cap} alkiota) kohdasta ${st.start}.`, vars: varItems(0) });
      let moves = 0;
      items.forEach((e, i) => {
        st.slots.push(e);
        moves++;
        frames.push({ st: render({ old, ghosts: items.slice(i + 1).map((x, k) => ({ id: x.id, v: x.v, addr: old.start + i + 1 + k })), cls: { [i]: "act" } }), cap: `Kopioidaan alkio ${e.v} uuteen paikkaan.`, vars: varItems(moves) });
      });
      return moves;
    }
    const full = () => size() === st.cap;
    const outOfMemory = () => play([{ st: render(), cap: "Tässä havainnollistuksessa muisti loppuu kesken. Palaa alkutilanteeseen.", vars: varItems(0) }]);
    const ops = {
      append() {
        const frames = [];
        let moves = 0;
        if (full()) { moves = grow(frames); if (moves < 0) return outOfMemory(); }
        const e = { id: `x${next}`, v: next++ };
        st.slots.push(e);
        moves++;
        const where = st.start + st.slots.length - 1;
        frames.push({ st: render({ cls: { [st.slots.length - 1]: "okf" } }), cap: moves > 1
          ? `\`append(${e.v})\`: alkio sijoitetaan uuden alueen kohtaan ${where}. Tällä kertaa alkioita täytyi kopioida, mutta alue kasvaa harvoin, joten \`append\` vie keskimäärin aikaa O(1).`
          : `\`append(${e.v})\`: alkio sijoitetaan varatun alueen vapaaseen kohtaan ${where}. Muita alkioita ei tarvitse siirtää.`, vars: varItems(moves, moves > 1 ? "O(n) tällä kertaa" : "O(1)") });
        play(frames);
      },
      insert() {
        if (size() < 1) return;
        const frames = [];
        let moves = 0;
        if (full()) { moves = grow(frames); if (moves < 0) return outOfMemory(); }
        const e = { id: `x${next}`, v: next++ };
        st.slots.push(null);
        for (let k = st.slots.length - 1; k > 1; k--) {
          st.slots[k] = st.slots[k - 1];
          st.slots[k - 1] = null;
          moves++;
          frames.push({ st: render({ cls: { [k]: "act" } }), cap: `\`insert(1, ${e.v})\`: siirretään alkio ${st.slots[k].v} yhden askeleen eteenpäin.`, vars: varItems(moves) });
        }
        st.slots[1] = e;
        moves++;
        frames.push({ st: render({ cls: { 1: "okf" } }), cap: `Alkio ${e.v} kirjoitetaan kohtaan 1. Kaikkia sen jälkeisiä alkioita täytyi siirtää, joten aikaa kuluu O(n).`, vars: varItems(moves, "O(n)") });
        play(frames);
      },
      pop() {
        if (!size()) return;
        const e = st.slots.pop();
        play([{ st: render(), cap: `\`pop()\` poisti viimeisen alkion ${e.v}. Muihin alkioihin ei tarvinnut koskea.`, vars: varItems(0, "O(1)") }]);
      },
      pop1() {
        if (size() < 2) return;
        const frames = [];
        const e = st.slots[1];
        st.slots[1] = null;
        frames.push({ st: render(), cap: `\`pop(1)\` poistaa alkion ${e.v}…`, vars: varItems(0) });
        let moves = 0;
        for (let k = 1; k < st.slots.length - 1; k++) {
          st.slots[k] = st.slots[k + 1];
          st.slots[k + 1] = null;
          moves++;
          frames.push({ st: render({ cls: { [k]: "act" } }), cap: `…ja sen jälkeiset alkiot siirretään taaksepäin: ${st.slots[k].v}.`, vars: varItems(moves) });
        }
        st.slots.pop();
        frames.push({ st: render(), cap: `Valmis. Siirtoja tarvittiin ${moves}: poisto listan keskeltä vie aikaa O(n).`, vars: varItems(moves, "O(n)") });
        play(frames);
      },
    };
    const intro = "Lista [1, 2, 3, 4] on tallennettu muistiin kohdasta 100 alkaen, ja sille on varattu tilaa 8 alkiolle. Kokeile operaatioita ja vertaa siirtojen määrää.";
    const mk = (text, fn, cls = "") => { const b = h("button", { type: "button", class: `viz-btn is-text ${cls}`, text }); b.addEventListener("click", fn); return b; };
    tools.append(mk("append(x)", ops.append, "is-primary"), mk("insert(1, x)", ops.insert), mk("pop()", ops.pop), mk("pop(1)", ops.pop1), h("span", { class: "viz-sep" }),
      mk("Alkutilanne", () => { reset(); play([{ st: render(), cap: intro, vars: varItems(0) }]); }));
    reset();
    play([{ st: render(), cap: intro, vars: varItems(0) }]);
  });

  /* ======================================== complexity classes (ch. 1) */
  register("complexity", (fig) => {
    const ui = frame(fig, { title: "Aikavaativuuksien kasvu", kicker: "Kokeile" });
    const fns = [
      { k: "1", f: () => 1, c: "var(--vz-c5)" },
      { k: "log n", f: (n) => Math.log2(n), c: "var(--vz-c2)" },
      { k: "n", f: (n) => n, c: "var(--vz-c4)" },
      { k: "n log n", f: (n) => n * Math.log2(n), c: "var(--vz-c3)" },
      { k: "n²", f: (n) => n * n, c: "var(--vz-c1)" },
      { k: "n³", f: (n) => n ** 3, c: "var(--vz-c0)" },
    ];
    const on = new Set(fns.map((x) => x.k));
    const legend = h("div", { class: "vz-legend" });
    ui.head.after(legend);
    const W = 520;
    const H = 260;
    const pad = { l: 46, r: 14, t: 14, b: 30 };
    const svg = V.s("svg", { class: "vz-svg", viewBox: `0 0 ${W} ${H}` }, ui.stage);
    const tools = h("div", { class: "viz-tools" });
    const slider = h("input", { type: "range", class: "viz-range", min: "1", max: "7", step: "1", value: "3", "aria-label": "Syötteen koko" });
    const nLabel = h("span", { class: "viz-label" });
    tools.append(h("span", { class: "viz-label", text: "n =" }), nLabel, slider);
    ui.main.after(tools);
    const table = h("div", { class: "viz-panel" });
    ui.side.appendChild(table);
    const maxN = 20;
    const maxY = 400;
    const xs = (n) => pad.l + ((n - 1) / (maxN - 1)) * (W - pad.l - pad.r);
    const ys = (v) => H - pad.b - (Math.min(v, maxY) / maxY) * (H - pad.t - pad.b);
    function draw() {
      svg.textContent = "";
      for (let v = 0; v <= maxY; v += 100) {
        V.s("line", { x1: pad.l, x2: W - pad.r, y1: ys(v), y2: ys(v), class: "vz-gridline" }, svg);
        V.s("text", { x: pad.l - 8, y: ys(v) + 4, class: "vz-tick", "text-anchor": "end" }, svg).textContent = String(v);
      }
      for (let n = 1; n <= maxN; n += n === 1 ? 4 : 5) V.s("text", { x: xs(n), y: H - 10, class: "vz-tick", "text-anchor": "middle" }, svg).textContent = String(n);
      V.s("text", { x: W - pad.r, y: H - 10, class: "vz-tick", "text-anchor": "end" }, svg).textContent = "n";
      V.s("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: "vz-axis" }, svg);
      for (const fn of fns) {
        let d = "";
        for (let i = 0; i <= 200; i++) {
          const n = 1 + (i / 200) * (maxN - 1);
          const v = fn.f(n);
          d += `${i ? "L" : "M"}${xs(n).toFixed(1)} ${ys(v).toFixed(1)}`;
          if (v > maxY) break;
        }
        const p = V.s("path", { d, class: `vz-curve${on.has(fn.k) ? "" : " is-faded"}` }, svg);
        p.style.stroke = fn.c;
      }
    }
    const sup = (k) => String(k).split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]).join("");
    const big = (v) => {
      const e = Math.floor(Math.log10(v));
      const m = v / 10 ** e;
      return e < 6 ? Math.round(v).toLocaleString("fi-FI") : `${m.toFixed(1).replace(".", ",")} · 10${sup(e)}`;
    };
    function readout() {
      const n = 10 ** +slider.value;
      nLabel.textContent = `10${sup(slider.value)}`;
      const rate = 1e8;
      const year = 365.25 * 86400;
      const time = (steps) => {
        const s = steps / rate;
        if (s < 1e-3) return "alle millisekunti";
        if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
        if (s < 120) return `${s.toFixed(s < 10 ? 1 : 0).replace(".", ",")} s`;
        if (s < 7200) return `${(s / 60).toFixed(0)} min`;
        if (s < 172800) return `${(s / 3600).toFixed(0)} h`;
        if (s < year * 2) return `${(s / 86400).toFixed(0)} päivää`;
        return `${big(s / year)} vuotta`;
      };
      const fmtN = (v) => (v < 1e6 ? Math.round(v).toLocaleString("fi-FI") : big(v));
      table.textContent = "";
      table.append(h("div", { class: "viz-panel-head" }, h("span", { text: `Kun n = ${Math.round(n).toLocaleString("fi-FI")} ja 10⁸ askelta sekunnissa` })));
      const t = h("table", { class: "vz-matrix vz-edgelist" });
      t.appendChild(h("tr", {}, h("th", { text: "Aikavaativuus" }), h("th", { text: "Askelia" }), h("th", { text: "Aika" })));
      for (const fn of fns) {
        const v = fn.f(n);
        t.appendChild(h("tr", {}, h("td", { text: `O(${fn.k})` }), h("td", { text: fmtN(v) }), h("td", { text: time(v), class: v / rate > 10 ? "is-no" : v / rate < 1 ? "is-ok" : "" })));
      }
      table.appendChild(t);
      slider.style.setProperty("--p", `${((+slider.value - 1) / 6) * 100}%`);
    }
    for (const fn of fns) {
      const b = h("button", { type: "button", "aria-pressed": "true" }, h("i"), `O(${fn.k})`);
      b.firstChild.style.background = fn.c;
      b.addEventListener("click", () => { if (on.has(fn.k)) on.delete(fn.k); else on.add(fn.k); b.setAttribute("aria-pressed", String(on.has(fn.k))); draw(); });
      legend.appendChild(b);
    }
    slider.addEventListener("input", readout);
    draw();
    readout();
    ui.setCaption("Käyrät näyttävät askelten määrän pienillä n:n arvoilla. Liukusäätimellä näet, kuinka kauan eri aikavaativuuksilla kuluisi suurilla syötteillä, jos tietokone suorittaisi 10⁸ askelta sekunnissa.");
  });

  /* ============================================== hash table (theory) */
  register("hash-table", (fig) => {
    let tab = "chain";
    const N = 10;
    const ui = frame(fig, { title: "Hajautustaulu, N = 10 ja h(x) = 7x", kicker: "Kokeile",
      tabs: [["chain", "Ketjuhajautus"], ["open", "Avoin hajautus"]], tab, onTab: (t) => { tab = t; reset(); } });
    const W = 470;
    const sc = new Scene(ui.stage, { w: W, h: 250 });
    const tools = h("div", { class: "viz-tools" });
    const input = h("input", { class: "viz-input", type: "number", value: "14", "aria-label": "Lisättävä alkio" });
    ui.main.after(tools);
    const X = (k) => 35 + k * 44;
    let table;
    let player = null;
    const state = (o = {}) => {
      const nodes = [];
      const marks = [];
      for (let k = 0; k < N; k++) {
        marks.push({ id: `ix${k}`, type: "text", x: X(k), y: 20, text: String(k), cls: "faint mono" });
        marks.push({ id: `bx${k}`, type: "rect", x: X(k) - 20, y: 34, w: 40, h: 40, rx: 8, cls: o.slot === k ? (o.slotBad ? "bad" : "cur") : "soft" });
      }
      table.forEach((chain, k) => chain.forEach((e, d) => nodes.push(cellNode(e.id, X(k), 54 + d * 46, e.v, o.hl === e.id ? "okf" : "", 36, 36))));
      if (o.calc) marks.push({ id: "calc", type: "text", x: W / 2, y: 236, text: o.calc, cls: "mono big" });
      return { nodes, edges: [], marks };
    };
    let uidN = 0;
    function insertFrames(x, frames) {
      const hx = 7 * x;
      const home = ((hx % N) + N) % N;
      const e = { id: `k${uidN++}`, v: x };
      frames.push({ st: state({ slot: home, calc: `h(${x}) = 7 · ${x} = ${hx}, ${hx} mod 10 = ${home}` }), cap: `Alkion ${x} sijainti on h(${x}) mod 10 = ${home}.` });
      if (tab === "chain") {
        if (table[home].some((y) => y.v === x)) { frames.push({ st: state({ slot: home }), cap: `Alkio ${x} on jo hajautustaulussa.` }); return; }
        const collide = table[home].length > 0;
        table[home].push(e);
        frames.push({ st: state({ slot: home, hl: e.id, calc: `h(${x}) mod 10 = ${home}` }), cap: collide ? `Törmäys! Kohdassa ${home} on jo alkio, joten ${x} lisätään saman kohdan listaan.` : `Alkio ${x} lisätään kohdan ${home} listaan.` });
      } else {
        for (let i = 0; i < N; i++) {
          const p = (home + i) % N;
          if (table[p].length && table[p][0].v === x) { frames.push({ st: state({ slot: p }), cap: `Alkio ${x} on jo hajautustaulussa.` }); return; }
          if (!table[p].length) {
            table[p].push(e);
            frames.push({ st: state({ slot: p, hl: e.id, calc: `p(${x}, ${i}) = ${p}` }), cap: `Kohta ${p} on vapaa, joten alkio ${x} sijoitetaan siihen.` });
            return;
          }
          frames.push({ st: state({ slot: p, slotBad: true, calc: `p(${x}, ${i}) = ${p}` }), cap: `Törmäys: kohdassa ${p} on jo alkio ${table[p][0].v}. Kokeillaan seuraavaa kohtaa.` });
        }
        frames.push({ st: state(), cap: "Hajautustaulu on täynnä." });
      }
    }
    function reset() {
      table = Array.from({ length: N }, () => []);
      input.value = "14";
      const frames = [{ st: state(), cap: tab === "chain" ? "Jokaisessa kohdassa on lista, johon tallennetaan kaikki kohtaan kuuluvat alkiot." : "Jokaisessa kohdassa on enintään yksi alkio. Tässä kokeillaan kohtia p(x, i) = (h(x) + i) mod N, kun i = 0, 1, 2, …" }];
      for (const x of [2, 4, 5, 9, 18, 30]) insertFrames(x, frames);
      frames.push({ st: state(), cap: "Joukon {2, 4, 5, 9, 18, 30} alkiot on lisätty. Lisää seuraavaksi alkio 14, jonka sijainti on sama kuin alkion 4." });
      if (!player) player = new Player(fig, { frames, interval: 1200, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
      else player.setFrames(frames);
    }
    const add = () => {
      const x = parseInt(input.value, 10);
      if (Number.isNaN(x)) return;
      const frames = [{ st: state(), cap: `Lisätään alkio ${x}.` }];
      insertFrames(x, frames);
      player.setFrames(frames);
      player.play();
      input.value = String(x + 10);
    };
    const btn = h("button", { type: "button", class: "viz-btn is-text is-primary", text: "Lisää" });
    btn.addEventListener("click", add);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    const rst = h("button", { type: "button", class: "viz-btn is-text", text: "Alusta" });
    rst.addEventListener("click", reset);
    tools.append(h("span", { class: "viz-label", text: "Alkio" }), input, btn, rst);
    reset();
  });

  /* ================================================== chapter 3 scans */
  register("stock", (fig) => {
    const P = [3, 7, 5, 1, 4, 6, 2, 3];
    const CODE = `def best_profit(prices):
    n = len(prices)
    best = 0
    min_buy_price = prices[0]
    for sell_day in range(n):
        min_buy_price = min(min_buy_price, prices[sell_day])
        best = max(best, prices[sell_day] - min_buy_price)
    return best`;
    const ui = frame(fig, { title: "Osakekauppa yhdellä silmukalla", split: true, kicker: "Animaatio" });
    const W = 400;
    const sc = new Scene(ui.stage, { w: W, h: 250 });
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Muuttujat");
    const X = (d) => 45 + d * 46;
    const base = 205;
    const unit = 24;
    const frames = [];
    let minP = P[0];
    let best = 0;
    let bestPair = null;
    const snap = (cap, line, day) => {
      const nodes = [];
      const marks = [];
      P.forEach((p, d) => {
        const hgt = p * unit;
        let cls = d === day ? "cur" : day != null && d < day ? "done" : "";
        if (bestPair && (d === bestPair[0] || d === bestPair[1]) && day == null) cls = "okf";
        nodes.push({ id: `b${d}`, x: X(d), y: base - hgt / 2, shape: "rect", w: 30, h: hgt, rx: 6, label: p, cls: `${cls} is-mono` });
        marks.push({ id: `dl${d}`, type: "text", x: X(d), y: base + 16, text: `${d}`, cls: "faint mono" });
      });
      marks.push({ id: "dt", type: "text", x: 8, y: base + 16, text: "päivä", cls: "faint", anchor: "start" });
      if (day != null) {
        const y = base - minP * unit;
        marks.push({ id: "minl", type: "line", d: `M${X(0) - 20} ${y}H${X(day) + 20}`, cls: "done dash" });
        marks.push({ id: "mint", type: "text", x: X(0) - 20, y: y - 9, text: `halvin tähän mennessä: ${minP}`, cls: "done", anchor: "start" });
        if (P[day] > minP) marks.push({ id: "gain", type: "line", d: `M${X(day) + 22} ${base - P[day] * unit}V${y}`, cls: "cur" }, { id: "gaint", type: "text", x: X(day) + 26, y: (base - P[day] * unit + y) / 2, text: `+${P[day] - minP}`, cls: "cur mono", anchor: "start" });
      }
      frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "sell_day", v: day == null ? "–" : String(day) }, { k: "min_buy_price", v: String(minP) }, { k: "best", v: String(best), cls: day == null ? "ok" : "" }] });
    };
    snap("Pylväät ovat osakkeen hinnat päivinä 0–7. Silmukka käy päivät läpi kerran.", [2, 3, 4], null);
    for (let d = 0; d < P.length; d++) {
      const oldMin = minP;
      minP = Math.min(minP, P[d]);
      const profit = P[d] - minP;
      const improved = profit > best;
      if (improved) { best = profit; bestPair = [P.indexOf(minP), d]; }
      snap(`Päivä ${d}: hinta ${P[d]}. ${minP < oldMin ? `Uusi halvin hinta ${minP}. ` : ""}Myymällä nyt tuotto olisi ${P[d]} − ${minP} = ${profit}${improved ? `, joka on uusi paras.` : "."}`, [6, 7], d);
    }
    snap(`Paras tuotto on ${best}: osta päivänä ${bestPair[0]} hintaan ${P[bestPair[0]]} ja myy päivänä ${bestPair[1]} hintaan ${P[bestPair[1]]}.`, 8, null);
    new Player(fig, { frames, interval: 1300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  });

  register("two-values", (fig) => {
    const A = [1, 2, 3, 3, 2, 2, 4, 2];
    const CODE = `def count_lists(numbers):
    n = len(numbers)
    a = b = -1
    result = 0
    for i in range(1, n):
        if numbers[i] != numbers[i - 1]:
            if numbers[i] != numbers[a]:
                b = a
            a = i - 1
        result += a - b
    return result`;
    const ui = frame(fig, { title: "Osalistat kahdella osoittimella", split: true, kicker: "Animaatio" });
    const W = 420;
    const sc = new Scene(ui.stage, { w: W, h: 175 });
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Muuttujat");
    const X = (k) => 60 + k * 46;
    const frames = [];
    let a = -1;
    let b = -1;
    let result = 0;
    const per = [0];
    const snap = (cap, line, i) => {
      const nodes = A.map((v, k) => cellNode(`c${k}`, X(k), 82, v, k === i ? "cur" : (i != null && k > b && k <= a) ? "done" : "", 40, 40));
      const marks = [];
      A.forEach((v, k) => marks.push({ id: `ix${k}`, type: "text", x: X(k), y: 116, text: String(k), cls: "faint mono" }));
      per.forEach((r, k) => marks.push({ id: `r${k}`, type: "text", x: X(k), y: 150, text: String(r), cls: k === i ? "cur mono big" : "mono" }));
      marks.push({ id: "rt", type: "text", x: 6, y: 150, text: "tulos", cls: "faint", anchor: "start" });
      const pt = (name, k, cls) => marks.push({ id: `p${name}`, type: "text", x: k >= 0 ? X(k) : 16, y: 38, text: name, cls: `${cls} mono big` });
      if (i != null) {
        pt("i", i, "cur");
        if (a === b) pt("a,b", a, "done"); else { pt("a", a, "done"); pt("b", b, "bad"); }
      }
      frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "i", v: i == null ? "–" : String(i) }, { k: "a", v: String(a) }, { k: "b", v: String(b) }, { k: "result", v: String(result) }] });
    };
    snap("Lasketaan osalistat, joissa on tasan kaksi eri lukua. Kohtaan i päättyviä osalistoja on a − b kappaletta.", [3, 4], null);
    for (let i = 1; i < A.length; i++) {
      let note = "";
      if (A[i] !== A[i - 1]) {
        // With a = -1, numbers[a] is the last element in Python; b stays -1 either way.
        if (a < 0) { if (A[i] !== A[A.length - 1]) b = a; note = `Kohdassa ${i} on eri luku kuin edellisessä kohdassa. Koska a = −1, a siirtyy kohtaan ${i - 1} ja b pysyy arvossa −1. `; }
        else if (A[i] !== A[a]) { b = a; note = `Kohdassa ${i} on eri luku kuin kohdassa a, joten b siirtyy kohtaan a ja a kohtaan ${i - 1} (tapaus 1). `; }
        else note = `Kohdassa ${i} on sama luku kuin kohdassa a, joten vain a siirtyy kohtaan ${i - 1} (tapaus 2). `;
        a = i - 1;
      }
      result += a - b;
      per.push(a - b);
      const num = (x) => (x < 0 ? `(−${-x})` : String(x));
      snap(`${note}Kohtaan ${i} päättyviä osalistoja on a − b = ${num(a)} − ${num(b)} = ${a - b}.`, A[i] !== A[i - 1] ? [6, 7, 8, 9, 10] : 10, i);
    }
    snap(`Valmis: osalistoja on yhteensä ${result}.`, 11, null);
    new Player(fig, { frames, interval: 1500, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  });

  /* ========================================== chapter 4: sliding window */
  register("playlist", (fig) => {
    const S = [1, 2, 1, 3, 5, 4, 3, 1];
    const CODE = `def max_length(songs):
    pos = {}
    start = 0
    length = 0

    for i, song in enumerate(songs):
        if song in pos:
            start = max(start, pos[song] + 1)
        length = max(length, i - start + 1)
        pos[song] = i

    return length`;
    const ui = frame(fig, { title: "Pisin osa ilman toistoja", split: true, kicker: "Animaatio" });
    const sc = new Scene(ui.stage, { w: 420, h: 160 });
    const code = new CodePanel(ui.side, CODE);
    const vars = new VarsPanel(ui.side, "Muuttujat");
    const X = (k) => 45 + k * 47;
    const frames = [];
    const pos = new Map(); // keeps insertion order like a Python dict
    let start = 0;
    let length = 0;
    const snap = (cap, line, i) => {
      const nodes = S.map((v, k) => cellNode(`c${k}`, X(k), 74, v, i != null && k === i ? "cur" : i != null && k >= start && k < i ? "done" : "", 40, 40));
      const marks = [];
      S.forEach((v, k) => marks.push({ id: `ix${k}`, type: "text", x: X(k), y: 108, text: String(k), cls: "faint mono" }));
      if (i != null) {
        marks.push({ id: "win", type: "rect", x: X(start) - 25, y: 47, w: X(i) - X(start) + 50, h: 54, rx: 12, cls: "zone", over: false });
        marks.push({ id: "st", type: "text", x: X(start), y: 30, text: "start", cls: "done mono" });
        marks.push({ id: "len", type: "text", x: (X(start) + X(i)) / 2, y: 136, text: `pituus ${i - start + 1}`, cls: "cur" });
      }
      frames.push({ st: { nodes, edges: [], marks }, cap, line, vars: [{ k: "start", v: String(start) }, { k: "length", v: String(length) }, { k: "pos", v: `{${[...pos].map(([s2, p]) => `${s2}: ${p}`).join(", ")}}` }] });
    };
    snap("Käydään soittolista läpi kerran. Sanakirja `pos` muistaa, missä kukin laulu on esiintynyt viimeksi.", [2, 3, 4], null);
    S.forEach((song, i) => {
      let note = "";
      const seen = pos.has(song);
      if (seen) {
        const ns = Math.max(start, pos.get(song) + 1);
        note = ns !== start ? `Laulu ${song} esiintyi kohdassa ${pos.get(song)}, joten osan täytyy alkaa kohdasta ${ns}. ` : `Laulu ${song} esiintyi kohdassa ${pos.get(song)}, mutta se on jo osan ulkopuolella. `;
        start = ns;
      }
      length = Math.max(length, i - start + 1);
      snap(`${note}Kohtaan ${i} päättyvän osan pituus on ${i - start + 1}.`, seen ? [7, 8, 9] : 9, i);
      pos.set(song, i);
    });
    snap(`Pisimmän toistottoman osan pituus on ${length}: [2, 1, 3, 5, 4].`, 12, null);
    new Player(fig, { frames, interval: 1400, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); code.set(f.line); vars.set(f.vars); } });
  });

  /* ======================================== chapter 5: sweep (restaurant) */
  register("restaurant", (fig) => {
    const arr = [6, 3, 6, 1, 2];
    const dep = [8, 7, 9, 5, 8];
    const ui = frame(fig, { title: "Tapahtumat aikajärjestyksessä", kicker: "Animaatio" });
    const W = 460;
    const sc = new Scene(ui.stage, { w: W, h: 250 });
    const vars = new VarsPanel(ui.side, "Muuttujat");
    const tx = (t) => 60 + t * 40;
    const ry = (c) => 30 + c * 34;
    const events = [];
    arr.forEach((t, c) => events.push([t, 1, c]));
    dep.forEach((t, c) => events.push([t, 2, c]));
    events.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    const frames = [];
    let counter = 0;
    let result = 0;
    const inside = new Set();
    const snap = (cap, t, o = {}) => {
      const nodes = [];
      const marks = [];
      for (let k = 0; k <= 10; k++) marks.push({ id: `tk${k}`, type: "text", x: tx(k), y: 222, text: String(k), cls: "faint mono" });
      marks.push({ id: "ax", type: "line", d: `M${tx(0)} 206H${tx(10)}`, cls: "" });
      arr.forEach((a, c) => {
        marks.push({ id: `nm${c}`, type: "text", x: 10, y: ry(c), text: `#${c + 1}`, cls: "faint mono", anchor: "start" });
        const cls = inside.has(c) ? "cur" : o.gone && o.gone.has(c) ? "done" : "soft";
        marks.push({ id: `iv${c}`, type: "rect", x: tx(a), y: ry(c) - 9, w: tx(dep[c]) - tx(a), h: 18, rx: 9, cls });
      });
      if (t != null) marks.push({ id: "sweep", type: "line", d: `M${tx(t)} 12V206`, cls: "cur" });
      if (o.best) marks.push({ id: "bestzone", type: "rect", x: tx(6), y: 12, w: tx(7) - tx(6), h: 194, rx: 4, cls: "zone" });
      frames.push({ st: { nodes, edges: [], marks }, cap, vars: [{ k: "counter", v: String(counter) }, { k: "result", v: String(result), cls: o.best ? "ok" : "" }] });
    };
    const gone = new Set();
    snap("Jokainen palkki on yhden asiakkaan vierailu. Tapahtumat käsitellään aikajärjestyksessä; samalla hetkellä saapuminen käsitellään ennen lähtöä.", null);
    for (const [t, kind, c] of events) {
      if (kind === 1) { counter++; inside.add(c); } else { counter--; inside.delete(c); gone.add(c); }
      result = Math.max(result, counter);
      snap(`Aika ${t}: asiakas #${c + 1} ${kind === 1 ? "saapuu" : "lähtee"}. Ravintolassa on nyt ${counter} ${counter === 1 ? "asiakas" : "asiakasta"}.`, t, { gone });
    }
    snap(`Suurin määrä asiakkaita oli ${result}: asiakkaat #1, #2, #3 ja #5 ovat yhtä aikaa ravintolassa aikavälillä 6–7.`, null, { gone, best: true });
    new Player(fig, { frames, interval: 1300, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); vars.set(f.vars); } });
  });

  /* ============================================ chapter 10: coin DP table */
  register("coins-dp", (fig) => {
    let tab = "125";
    const ui = frame(fig, { title: "Dynaamisen ohjelmoinnin taulukko", kicker: "Animaatio",
      tabs: [["125", "Pienin määrä [1, 2, 5]"], ["145", "Pienin määrä [1, 4, 5]"], ["count", "Tapojen määrä [1, 2, 5]"]], tab, onTab: (t) => { tab = t; build(); } });
    const X = 13;
    const W = 520;
    const sc = new Scene(ui.stage, { w: W, h: 190 });
    const CX = (s) => 26 + s * 36;
    let player = null;
    function build() {
      const coins = tab === "145" ? [1, 4, 5] : [1, 2, 5];
      const count = tab === "count";
      const res = {};
      const frames = [];
      const snap = (cap, s = null, from = []) => {
        const nodes = [];
        const edges = [];
        const marks = [];
        for (let k = 0; k <= X; k++) {
          marks.push({ id: `ix${k}`, type: "text", x: CX(k), y: 128, text: String(k), cls: "faint mono" });
          const has = k in res;
          nodes.push(cellNode(`c${k}`, CX(k), 104, has ? res[k] : "", k === s ? "cur" : from.includes(k) ? "act" : has ? "done" : "ghost", 32, 32));
        }
        from.forEach((k) => edges.push({ id: `e${k}`, a: `c${k}`, b: `c${s}`, dir: true, bend: -0.55, cls: "act", label: `+${s - k}` }));
        marks.push({ id: "lbl", type: "text", x: CX(0) - 16, y: 156, text: count ? "tapoja muodostaa summa" : "pienin kolikoiden määrä", cls: "faint", anchor: "start" });
        frames.push({ st: { nodes, edges, marks }, cap });
      };
      res[0] = count ? 1 : 0;
      snap(count ? "Summan 0 voi muodostaa yhdellä tavalla: valitsemalla ei yhtään kolikkoa." : "Summan 0 muodostamiseen tarvitaan 0 kolikkoa.", 0);
      for (let s = 1; s <= X; s++) {
        const from = coins.filter((c) => s - c >= 0).map((c) => s - c);
        if (count) {
          res[s] = from.reduce((t, k) => t + res[k], 0);
          snap(`Summa ${s}: viimeinen kolikko on ${list(from.map((k) => s - k))}, joten tapoja on ${from.map((k) => res[k]).join(" + ")} = ${res[s]}.`, s, from);
        } else {
          res[s] = Math.min(...from.map((k) => res[k] + 1));
          snap(`Summa ${s}: vaihtoehdot ovat ${from.map((k) => `${res[k]} + 1`).join(", ")}. Pienin on ${res[s]}.`, s, from);
        }
      }
      snap(count ? `Summan 13 voi muodostaa ${res[X]} eri tavalla.` : `Summan 13 muodostamiseen tarvitaan vähintään ${res[X]} kolikkoa.`);
      if (!player) player = new Player(fig, { frames, interval: 1100, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
      else player.setFrames(frames);
    }
    const list = (xs) => xs.join(", ").replace(/, ([^,]*)$/, " tai $1");
    build();
  });

  /* ========================================== linked list in memory */
  register("linked-list", (fig) => {
    const ui = frame(fig, { title: "Linkitetty lista muistissa", kicker: "Animaatio" });
    const W = 480;
    const sc = new Scene(ui.stage, { w: W, h: 250 });
    const CW = 37;
    const AX = (a) => 22 + (a - 100) * CW + CW / 2;
    const mem0 = { 100: 1, 101: 0, 102: 106, 103: 3, 104: 106, 105: 0, 106: 2, 107: 100, 108: 103 };
    const frames = [];
    const snap = (mem, list, cap, hl = []) => {
      const nodes = [];
      const marks = [];
      const edges = [];
      for (let a = 100; a <= 111; a++) {
        marks.push({ id: `ad${a}`, type: "text", x: AX(a), y: 20, text: String(a), cls: "faint mono" });
        const v = mem[a];
        nodes.push(cellNode(`m${a}`, AX(a), 46, v == null ? "0" : v, hl.includes(a) ? "cur" : v == null ? "ghost" : "", CW - 5, 32));
      }
      // node triples
      for (const start of Object.keys(list.at)) {
        const a = +start;
        marks.push({ id: `tri${a}`, type: "rect", x: AX(a) - CW / 2 + 1, y: 26, w: CW * 3 - 2, h: 40, rx: 9, cls: "done", over: false });
      }
      // logical view
      list.order.forEach((addr, k) => {
        nodes.push({ id: `L${addr}`, x: 70 + k * 105, y: 170, label: String(mem[addr]), shape: "rect", w: 54, h: 40, rx: 10, cls: hl.includes(addr) ? "okf is-mono" : "done is-mono", sub: `@${addr}`, subPos: "below" });
        if (k) {
          edges.push({ id: `n${addr}`, a: `L${list.order[k - 1]}`, b: `L${addr}`, dir: true, bend: -0.22 });
          edges.push({ id: `p${addr}`, a: `L${addr}`, b: `L${list.order[k - 1]}`, dir: true, bend: -0.22, cls: "ghost" });
        }
      });
      marks.push({ id: "lt", type: "text", x: 18, y: 120, text: "listan rakenne: seuraava → ja edellinen ⇠", cls: "faint", anchor: "start" });
      frames.push({ st: { nodes, edges, marks }, cap });
    };
    const base = { at: { 100: 1, 103: 1, 106: 1 }, order: [100, 106, 103] };
    snap(mem0, base, "Lista [1, 2, 3]: jokaisessa solmussa on alkio, viittaus edelliseen ja viittaus seuraavaan alkioon. Viittaus 0 tarkoittaa, ettei viereistä alkiota ole.");
    const mem1 = { ...mem0, 109: 4, 110: 0, 111: 100 };
    snap(mem1, { at: { ...base.at, 109: 1 }, order: base.order }, "Uusi alkio 4 kirjoitetaan vapaaseen kohtaan 109: edellinen 0 ja seuraava 100.", [109, 110, 111]);
    const mem2 = { ...mem1, 101: 109 };
    snap(mem2, { at: { ...base.at, 109: 1 }, order: [109, 100, 106, 103] }, "Lopuksi alkion 1 edellinen-viittaukseksi päivitetään 109. Lista on nyt [4, 1, 2, 3] ja alkaa kohdasta 109. Muita alkioita ei tarvinnut siirtää.", [101, 109]);
    const player = new Player(fig, { frames, interval: 2000, apply: (f, i, instant) => { sc.set(f.st, instant); ui.setCaption(f.cap); } });
    player.playWhenVisible();
  });

})();
