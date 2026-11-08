/* Figures for Part IV, chapters 31 and 32. Chapter 31: an LSM tree that grows
   key by key, a log that crashes and recovers, a skip list, a lookup in a
   table, chains of crc32, a compaction with snapshots, leveled and tiered
   compaction side by side, Bloom filter rates, the split-block filter in AVX2
   lanes, subcompactions, and two Merkle trees. Chapter 32: latch coupling in a
   B+ tree, the B-link tree, MVCC version chains and snapshots, garbage
   collection, and the check of a history.
   The small examples run the algorithms of the chapters' C++ code; the charts
   show the measurements quoted in the text.
   Part IV pages load this file after viz-indexes.js (the `viz` list in _config.yml). */
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
    const show = () => {
      const lo = +input.min, hi = +input.max;
      input.style.setProperty("--p", `${hi > lo ? ((input.value - lo) / (hi - lo)) * 100 : 0}%`);
      out.textContent = format(+input.value);
    };
    input.addEventListener("input", () => { show(); onInput(+input.value); });
    input.addEventListener("keydown", (e) => e.stopPropagation());  // the arrow keys move the slider, not the player
    tools.append(h("span", { class: "ix-ctl" }, h("span", { class: "viz-label", text: label }), input, out));
    show();
    input.setValue = (v) => { input.value = v; show(); };
    return input;
  }
  function rng(seed) {  // mulberry32: the same numbers on every visit
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fx = (v) => (+v).toFixed(1);
  const seg = (g, x1, y1, x2, y2, cls) => s("line", { x1: fx(x1), y1: fx(y1), x2: fx(x2), y2: fx(y2), class: cls }, g);
  const label = (g, x, y, text, cls = "st-lbl", anchor = "middle") => {
    const t = s("text", { x: fx(x), y: fx(y), class: cls, "text-anchor": anchor }, g);
    t.textContent = text;
    return t;
  };
  const rect = (g, x, y, w, hh, cls, rx = 4) => s("rect", { x: fx(x), y: fx(y), width: fx(Math.max(0, w)), height: fx(Math.max(0, hh)), rx, class: cls }, g);
  const svgBox = (parent, W, H, cls = "") => {
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: `st-svg ${cls}`, role: "img", "aria-hidden": "true" });
    parent.appendChild(svg);
    return svg;
  };
  const arrow = (g, x1, y1, x2, y2, cls) => {  // a line with a small head at (x2, y2)
    seg(g, x1, y1, x2, y2, cls);
    const a = Math.atan2(y2 - y1, x2 - x1), k = 5;
    s("path", { d: `M${fx(x2)} ${fx(y2)}L${fx(x2 - k * Math.cos(a - 0.45))} ${fx(y2 - k * Math.sin(a - 0.45))}L${fx(x2 - k * Math.cos(a + 0.45))} ${fx(y2 - k * Math.sin(a + 0.45))}Z`, class: `${cls} en-head` }, g);
  };
  const panel = (title, note, ...children) => h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: title }), note ? h("span", { text: note }) : null), ...children);
  const cells = (values, cls = () => "", name = null) =>
    h("div", { class: "st-cells" }, name ? h("span", { class: "st-rowname", text: name }) : null,
      ...values.map((v, i) => h("span", { class: `st-cell ${cls(i, v) || ""}`, text: v == null ? "" : String(v) })));
  const stats = (pairs) => h("div", { class: "en-stats" }, ...pairs.map(([k, v, cls]) => h("span", {}, k, h("b", { class: cls || "", text: String(v) }))));
  const kv = (pairs) => h("div", { class: "st-kv" }, ...pairs.flatMap(([k, v]) => [h("span", { text: k }), h("b", { text: String(v) })]));
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const hex = (v, n = 8) => (v >>> 0).toString(16).toUpperCase().padStart(n, "0");

  /* ================================================ chapter 31: LSM trees */

  /* ----------------------------------------- the levels of an LSM tree */
  // A version is {k, q, d}: key, sequence number, delete. The figure has no
  // snapshots, so a compaction keeps only the newest version of each key.
  const byInternal = (a, b) => a.k - b.k || b.q - a.q;
  register("lsm-tree", (fig) => {
    const MEM = 4, L0_TRIGGER = 3, TABLE = 4, L1_LIMIT = 12, KEYS = 100, LEVELS = 3;
    let st, rand, nextId;
    const overlap = (t, lo, hi) => !(t.hi < lo || t.lo > hi);
    const mkTable = (v) => ({ v, lo: v[0].k, hi: v[v.length - 1].k, id: ++nextId, fresh: true });
    function reset() {
      rand = rng(31);
      nextId = 0;
      st = { seq: 0, mem: [], log: 0, levels: Array.from({ length: LEVELS }, () => []), user: 0, disk: 0, ptr: -1, path: null, key: null };
      for (let i = 0; i < 40; i++) write(Math.floor(rand() * KEYS), false);
      st.user = 0;
      st.disk = 0;
      clearFresh();
    }
    function clearFresh() { st.levels.forEach((l) => l.forEach((t) => { t.fresh = false; })); st.path = null; st.key = null; }
    function merge(tables, bottom) {
      const out = [];
      for (const v of tables.flatMap((t) => t.v).sort(byInternal)) if (!out.length || out[out.length - 1].k !== v.k) out.push(v);
      return bottom ? out.filter((v) => !v.d) : out;
    }
    function bottomFor(level, lo, hi) {
      for (let l = level + 1; l < LEVELS; l++) if (st.levels[l].some((t) => overlap(t, lo, hi))) return false;
      return true;
    }
    function compact(level) {
      let upper;
      if (level === 0) upper = st.levels[0];
      else {
        const files = st.levels[level];
        let i = files.findIndex((t) => t.lo > st.ptr);
        if (i < 0) i = 0;
        upper = [files[i]];
        st.ptr = files[i].hi;
      }
      let lo = Math.min(...upper.map((t) => t.lo)), hi = Math.max(...upper.map((t) => t.hi));
      const lower = st.levels[level + 1].filter((t) => overlap(t, lo, hi));
      const stay = st.levels[level + 1].filter((t) => !overlap(t, lo, hi));
      for (const t of lower) lo = Math.min(lo, t.lo), hi = Math.max(hi, t.hi);
      const bottom = bottomFor(level + 1, lo, hi);
      const v = merge([...upper, ...lower], bottom);
      const out = [];
      for (let i = 0; i < v.length; i += TABLE) out.push(mkTable(v.slice(i, i + TABLE)));
      st.disk += v.length;
      st.levels[level + 1] = [...stay, ...out].sort((a, b) => a.lo - b.lo);
      st.levels[level] = level === 0 ? [] : st.levels[level].filter((t) => t !== upper[0]);
      const what = level === 0 ? `Level 0 had ${upper.length} tables. They were merged` : `Level 1 had more than ${L1_LIMIT} versions. Its table ${upper[0].lo}–${upper[0].hi} was merged`;
      return `${what} with ${plural(lower.length, "overlapping table")} of level ${level + 1} into ${plural(out.length, "new table")}${bottom ? " (at the bottom: deletes are dropped)" : ""}.`;
    }
    function maybeCompact() {
      const ev = [];
      for (;;) {
        if (st.levels[0].length >= L0_TRIGGER) ev.push(compact(0));
        else if (st.levels[1].reduce((a, t) => a + t.v.length, 0) > L1_LIMIT) ev.push(compact(1));
        else return ev;
      }
    }
    function write(k, d) {
      st.seq++;
      st.user++;
      st.disk++;  // the record in the log
      st.log++;
      st.mem.push({ k, q: st.seq, d });
      st.mem.sort(byInternal);
      if (st.mem.length < MEM) return [];
      const t = mkTable(st.mem);
      st.mem = [];
      st.log = 0;
      st.levels[0].unshift(t);
      st.disk += t.v.length;
      return [`The memtable was full: a flush wrote it as a new table of level 0, and its log was deleted.`, ...maybeCompact()];
    }
    function get(k) {
      const path = [{ mem: true }];
      const m = st.mem.find((v) => v.k === k);
      if (m) return { path, found: m, where: "the memtable" };
      for (let l = 0; l < LEVELS; l++) {
        for (const t of st.levels[l]) {
          if (!(t.lo <= k && k <= t.hi)) continue;
          const v = t.v.find((x) => x.k === k);
          path.push({ t, found: !!v });
          if (v) return { path, found: v, where: `table ${t.lo}–${t.hi} of level ${l}` };
          if (l > 0) break;  // one table per level below level 0
        }
      }
      return { path, found: null };
    }
    const ui = frame(fig, { title: "Writes and reads in an LSM tree", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 262, X0 = 92, X1 = 624;
    const svg = svgBox(ui.stage, W, H, "en-lsm");
    const counters = h("div", { class: "en-counters" });
    ui.stage.appendChild(counters);
    const tools = toolbar(ui);
    const act = (f) => () => { clearFresh(); ui.setCaption(f()); draw(); };
    button(tools, "Write a key", act(() => {
      const k = Math.floor(rand() * KEYS);
      const ev = write(k, false);
      return `Put key **${k}** with sequence number ${st.seq}: one record appended to the log, and one version added to the memtable. ${ev.join(" ")}`;
    }), "is-primary");
    button(tools, "Write 10 keys", act(() => {
      let flushes = 0, compactions = 0;
      for (let i = 0; i < 10; i++) {
        const ev = write(Math.floor(rand() * KEYS), false);
        flushes += ev.filter((e) => e.startsWith("The memtable")).length;
        compactions += ev.length - (ev.length && ev[0].startsWith("The memtable") ? 1 : 0);
      }
      return `10 puts of random keys: ${plural(flushes, "flush", "flushes")} and ${plural(compactions, "compaction")}. New tables have an orange edge.`;
    }));
    button(tools, "Delete a key", act(() => {
      const live = st.levels.flat().flatMap((t) => t.v).concat(st.mem).filter((v) => !v.d);
      const k = live.length ? live[Math.floor(rand() * live.length)].k : 0;
      const ev = write(k, true);
      return `Delete key **${k}**: a tombstone with sequence number ${st.seq} goes to the log and the memtable. The old versions stay where they are; the tombstone hides them. ${ev.join(" ")}`;
    }));
    button(tools, "Look up a key", act(() => {
      const all = st.levels.flat().flatMap((t) => t.v);
      const k = rand() < 0.7 && all.length ? all[Math.floor(rand() * all.length)].k : Math.floor(rand() * KEYS);
      const r = get(k);
      st.path = r.path;
      st.key = k;
      const searched = r.path.length - 1;
      const where = searched ? `the memtable and ${plural(searched, "table")}` : "the memtable";
      if (!r.found) return `Look up key **${k}**: not in ${where}. The key was never written, or it was dropped with its delete at the bottom.`;
      return `Look up key **${k}**: searched ${where}, and found ${r.found.d ? "a **delete**: the key has no value" : `**sequence number ${r.found.q}**, the newest version`} in ${r.where}. Tables whose key range does not contain ${k} were not searched.`;
    }));
    button(tools, "Reset", act(() => { reset(); return "40 random keys are written. The memtable holds 4 versions; level 0 is compacted at 3 tables, and level 1 holds at most 12 versions."; }));

    const xk = (k) => X0 + ((X1 - X0) * k) / KEYS;
    function drawTable(t, y, hh, level) {
      const on = st.path && st.path.find((p) => p.t === t);
      const cls = `en-table l${level}${t.fresh ? " is-fresh" : ""}${on ? (on.found ? " is-found" : " is-searched") : ""}`;
      const x = xk(t.lo), w = Math.max(7, xk(t.hi + 1) - x - 1);
      rect(svg, x, y, w, hh, cls, 3);
      if (w > 34) label(svg, x + w / 2, y + hh / 2, `${t.lo}–${t.hi}`, "en-tlbl");
    }
    function draw() {
      svg.textContent = "";
      // the memtable and the log
      label(svg, 8, 26, "memtable", "st-tick", "start");
      if (st.path) rect(svg, X0 - 4, 8, MEM * 50 + 2, 36, "en-memframe", 7);
      for (let i = 0; i < MEM; i++) {
        const v = st.mem[i];
        rect(svg, X0 + i * 50, 12, 46, 28, `en-slot${v ? (v.d ? " is-del" : " is-used") : ""}`, 5);
        if (v) label(svg, X0 + i * 50 + 23, 26, v.d ? `${v.k} ✕` : `${v.k}`, "en-slotlbl");
      }
      label(svg, X0 + MEM * 50 + 14, 20, `log: ${plural(st.log, "record")}`, "st-tick", "start");
      for (let i = 0; i < st.log; i++) rect(svg, X0 + MEM * 50 + 14 + i * 12, 28, 10, 8, "en-logrec", 1);
      // the levels
      const rows = [{ y: 60, label: "level 0" }, { y: 128, label: "level 1" }, { y: 172, label: "level 2" }];
      const l0 = st.levels[0];
      label(svg, 8, 82, "level 0", "st-tick", "start");
      label(svg, 8, 96, "(overlap)", "en-sub", "start");
      l0.forEach((t, i) => drawTable(t, rows[0].y + i * 21, 17, 0));
      if (!l0.length) label(svg, X0, 80, "no tables", "en-sub", "start");
      for (let l = 1; l < LEVELS; l++) {
        const y = rows[l].y;
        label(svg, 8, y + 14, `level ${l}`, "st-tick", "start");
        seg(svg, X0, y + 30, X1, y + 30, "en-axisline");
        st.levels[l].forEach((t) => drawTable(t, y, 26, l));
        const n = st.levels[l].reduce((a, t) => a + t.v.length, 0);
        label(svg, 8, y + 28, `${plural(n, "version")}${l === 1 ? ` of ${L1_LIMIT}` : ""}`, "en-sub", "start");
      }
      for (const k of [0, 25, 50, 75, 99]) label(svg, xk(k), 222, String(k), "st-tick");
      label(svg, (X0 + X1) / 2, 240, "keys", "st-axis");
      if (st.key != null) {
        seg(svg, xk(st.key + 0.5), 50, xk(st.key + 0.5), 206, "en-keyline");
        label(svg, xk(st.key + 0.5), 254, `key ${st.key}`, "en-keylbl");
      }
      counters.textContent = "";
      const wa = st.user ? (st.disk / st.user).toFixed(2) : "–";
      counters.append(stats([["versions written by the user", st.user], ["written to the disk by the store", st.disk], ["write amplification", wa]]));
    }
    reset();
    draw();
    ui.setCaption("40 random keys are written. The memtable holds 4 versions; level 0 is compacted at 3 tables, and level 1 holds at most 12 versions. Each table is drawn over its key range. Write keys, delete one, or look one up.");
  });

  /* ------------------------------------------- a log, a crash, recovery */
  register("wal-recovery", (fig) => {
    let rand, recs, synced, crash, rec;
    function reset() {
      rand = rng(7);
      recs = [];
      synced = 0;
      crash = null;
      rec = null;
      for (let i = 0; i < 5; i++) append();
      synced = recs.slice(0, 3).reduce((a, r) => a + r.n, 0);
    }
    const bytes = () => recs.reduce((a, r) => a + r.n, 0);
    function append() { recs.push({ n: 8 + 4 + Math.floor(rand() * 11), id: recs.length + 1 }); }
    const ui = frame(fig, { title: "A log, a crash and its recovery", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 150;
    const svg = svgBox(ui.stage, W, H, "en-wal");
    const tools = toolbar(ui);
    const bAppend = button(tools, "Append a record", () => {
      if (crash && !rec) return ui.setCaption("After a crash, recover first: the store must know where the valid records end.");
      if (rec) { cutToValid(); }
      append();
      ui.setCaption(`Record ${recs.length} is appended: ${recs[recs.length - 1].n} bytes, 8 of them the header (checksum and length). It is in the page cache, not yet on the disk.`);
      draw();
    }, "is-primary");
    button(tools, "Sync", () => {
      if (crash && !rec) return ui.setCaption("The machine crashed: recover first.");
      if (rec) cutToValid();
      synced = bytes();
      ui.setCaption(`fdatasync: all ${synced} bytes are durable now. A crash can no longer lose them.`);
      draw();
    });
    button(tools, "Crash", () => {
      if (crash && !rec) return ui.setCaption("The log already crashed: recover it.");
      if (rec) cutToValid();
      const total = bytes();
      const kept = synced + Math.floor(rand() * (total - synced + 1));
      const garbage = kept > synced && rand() < 0.6 ? Math.min(kept - synced, 1 + Math.floor(rand() * 6)) : 0;
      crash = { kept, garbage };
      ui.setCaption(`Power failure! The disk keeps the ${synced} synced bytes and ${kept - synced} of the ${total - synced} bytes that were not synced${garbage ? `, and the last ${garbage} of them are garbage (a sector half written)` : ""}.`);
      draw();
    });
    button(tools, "Recover", () => {
      if (!crash) return ui.setCaption("Crash the log first, or recover a log without a crash: all records are complete, so recovery finds all of them.");
      let at = 0, good = 0, why = "the log ends after the last record";
      for (const r of recs) {
        if (at + 8 > crash.kept) { why = at < crash.kept ? `the log ends inside the header of record ${r.id}` : ""; break; }
        if (at + r.n > crash.kept) { why = `the log ends inside the payload of record ${r.id}`; break; }
        if (crash.garbage && at + r.n > crash.kept - crash.garbage) { why = `the checksum of record ${r.id} is wrong`; break; }
        at += r.n;
        good++;
      }
      rec = { good, valid: at };
      ui.setCaption(`Recovery reads the records from the start and checks each checksum: **${plural(good, "record")}** are complete and correct, the valid prefix is **${at} bytes**.${why ? ` It stops because ${why}.` : ""} The log is cut there, and new records go after it.`);
      draw();
    });
    button(tools, "Reset", () => { reset(); draw(); ui.setCaption("A log of 5 records; the first 3 were synced."); });
    function cutToValid() {
      recs = recs.slice(0, rec.good);
      synced = Math.min(synced, rec.valid);
      if (synced < rec.valid) synced = rec.valid;  // the recovered prefix is on the disk
      crash = null;
      rec = null;
    }
    function draw() {
      svg.textContent = "";
      const total = Math.max(bytes(), 1);
      const scale = Math.min(5, (W - 40) / Math.max(total, 110));
      const X = (b) => 20 + b * scale;
      let at = 0;
      label(svg, 20, 18, "the log file", "st-tick", "start");
      recs.forEach((r, i) => {
        const lost = crash && at >= crash.kept;
        const part = crash && !lost && at + r.n > crash.kept;
        const status = rec ? (i < rec.good ? " is-good" : i === rec.good ? " is-bad" : " is-after") : "";
        const end = crash ? Math.min(at + r.n, crash.kept) : at + r.n;
        if (lost) rect(svg, X(at), 40, r.n * scale - 1, 44, "en-lost", 3);
        else {
          rect(svg, X(at), 40, Math.max(0, (Math.min(at + 8, end) - at) * scale - (end <= at + 8 ? 1 : 0)), 44, `en-hdr${status}`, 3);
          if (end > at + 8) rect(svg, X(at + 8), 40, (end - at - 8) * scale - 1, 44, `en-pay${status}`, 3);
          if (part) rect(svg, X(end), 40, (at + r.n - end) * scale - 1, 44, "en-lost", 3);
        }
        if (r.n * scale > 26) label(svg, X(at) + (r.n * scale) / 2, 62, `#${r.id}`, lost ? "en-sub" : "en-reclbl");
        at += r.n;
      });
      if (crash && crash.garbage) rect(svg, X(crash.kept - crash.garbage), 36, crash.garbage * scale, 52, "en-garbage", 2);
      seg(svg, X(synced), 30, X(synced), 96, "en-syncline");
      label(svg, X(synced), 108, `synced: ${synced} bytes`, "en-synclbl");
      if (crash) {
        seg(svg, X(crash.kept), 30, X(crash.kept), 96, "en-crashline");
        label(svg, X(crash.kept), 124, `on the disk after the crash: ${crash.kept}`, "en-crashlbl");
      }
      if (rec) label(svg, X(rec.valid), 140, `valid prefix: ${rec.valid}`, "en-validlbl");
      rect(svg, W - 150, 12, 10, 10, "en-hdr", 2);
      label(svg, W - 136, 17, "header", "en-sub", "start");
      rect(svg, W - 86, 12, 10, 10, "en-pay", 2);
      label(svg, W - 72, 17, "payload", "en-sub", "start");
      bAppend.disabled = false;
    }
    reset();
    draw();
    ui.setCaption("A log of 5 records; the first 3 were synced. Each record has a header of 8 bytes (dark: the checksum and the length) and a payload. Append, sync, crash, and recover.");
  });

  /* ------------------------------------------------------- a skip list */
  register("skip-list", (fig) => {
    const START = [[3, 1], [7, 2], [12, 1], [19, 3], [21, 1], [25, 1], [31, 2], [38, 1], [42, 4], [47, 1], [55, 2], [60, 1]];
    const MAXH = 5;
    let nodes, target = 40, rand, inserted = null;
    function reset() { nodes = START.map(([k, hh]) => ({ k, h: hh })); rand = rng(4); inserted = null; }
    const top = () => Math.max(1, ...nodes.map((n) => n.h));
    function nextOn(i, level) {  // the next node after index i (-1: the head) on a level
      for (let j = i + 1; j < nodes.length; j++) if (nodes[j].h > level) return j;
      return -1;
    }
    function frames() {
      const fr = [];
      let x = -1, steps = 0;
      const seen = new Set([-1]);
      fr.push({ x, level: top() - 1, seen: new Set(seen), cap: `Search for **${target}**. The search starts on the top level (${top() - 1}) of the head.` });
      for (let level = top() - 1; level >= 0; level--) {
        for (;;) {
          const nx = nextOn(x, level);
          steps++;
          if (nx >= 0 && nodes[nx].k < target) {
            x = nx;
            seen.add(x);
            fr.push({ x, level, seen: new Set(seen), link: [level, nx], steps, cap: `Level ${level}: the next node, ${nodes[nx].k}, is smaller than ${target}: go right.` });
          } else {
            fr.push({ x, level, seen: new Set(seen), steps, cap: nx < 0 ? `Level ${level}: no next node on this level: go down.` : `Level ${level}: the next node, ${nodes[nx].k}, is not smaller than ${target}: go ${level ? "down" : "no further"}.` });
            break;
          }
        }
      }
      const c = nextOn(x, 0);
      const found = c >= 0 && nodes[c].k === target;
      fr.push({ x, level: 0, seen: new Set(seen), hit: found ? c : null, steps, cap: found ? `**Found** ${target} after ${steps} steps.` : `${target} is not in the list: it would go between ${x < 0 ? "the head" : nodes[x].k} and ${c < 0 ? "the end" : nodes[c].k}. ${steps} steps.` });
      if (inserted != null && inserted === target) fr[fr.length - 1].cap += ` It was inserted with height ${nodes.find((n) => n.k === target).h}: on each of its levels, the last node before it now links to it.`;
      return fr;
    }
    const ui = frame(fig, { title: "Search and insert in a skip list", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 190;
    const svg = svgBox(ui.stage, W, H, "en-skip");
    const tools = toolbar(ui);
    const sl = slider(tools, "Key", { min: 0, max: 64, step: 1, value: target, format: (v) => String(v) }, (v) => { target = v; player.setFrames(frames()); });
    button(tools, "Insert it", () => {
      if (nodes.some((n) => n.k === target)) { ui.setCaption(`${target} is in the list already.`); return; }
      let hh = 1;
      const flips = [];
      while (hh < MAXH) { const r = rand(); flips.push(r < 0.25 ? "yes" : "no"); if (r >= 0.25) break; hh++; }
      nodes.push({ k: target, h: hh });
      nodes.sort((a, b) => a.k - b.k);
      inserted = target;
      player.setFrames(frames());
      player.go(player.frames.length - 1);
      ui.setCaption(`Insert ${target}: coin flips with probability 1/4 ("one more level?": ${flips.join(", ")}) give height **${hh}**. ${player.frames[player.frames.length - 1].cap}`);
    });
    button(tools, "Reset", () => { reset(); player.setFrames(frames()); });
    const LH = 26, BASE = 160;
    const xOf = (i) => 34 + (i + 1) * ((W - 50) / (nodes.length + 1));
    const player = new Player(fig, {
      frames: (reset(), frames()), interval: 1100,
      apply: (f) => {
        svg.textContent = "";
        const T = Math.max(top(), 1);
        for (let level = 0; level < T; level++) label(svg, 10, BASE - level * LH, `${level}`, "st-tick", "start");
        // links
        for (let level = 0; level < T; level++) {
          let from = -1;
          for (;;) {
            const to = nextOn(from, level);
            const x1 = xOf(from) + 11, x2 = to < 0 ? W - 10 : xOf(to) - 12, y = BASE - level * LH;
            const on = f.link && f.link[0] === level && f.link[1] === to;
            if (to < 0) { seg(svg, x1, y, x2 - 6, y, "en-link is-end"); label(svg, W - 8, y, "∅", "en-sub", "end"); break; }
            arrow(svg, x1, y, x2, y, `en-link${on ? " is-on" : ""}`);
            from = to;
          }
        }
        // towers
        const tower = (i, hh, text) => {
          const x = xOf(i);
          for (let level = 0; level < hh; level++) {
            const cur = f.x === i && f.level === level;
            rect(svg, x - 11, BASE - level * LH - 9, 22, 18, `en-cell${f.seen.has(i) ? " is-seen" : ""}${cur ? " is-cur" : ""}${f.hit === i ? " is-hit" : ""}${inserted != null && i >= 0 && nodes[i].k === inserted ? " is-new" : ""}`, 4);
          }
          label(svg, x, BASE + 22, text, i >= 0 && nodes[i].k === target ? "en-keylbl" : "st-tick");
        };
        tower(-1, T, "head");
        nodes.forEach((n, i) => tower(i, n.h, String(n.k)));
        ui.setCaption(f.cap);
      },
    });
    sl.setValue(target);
  });

  /* ---------------------------------------------- a lookup in a table */
  // 18 versions in 6 blocks of 3: [key, seq, value or null for a delete].
  const TBL = [
    [[2, 14, "x"], [2, 3, "a"], [5, 8, null]],
    [[5, 2, "b"], [7, 12, "c"], [7, 6, "d"]],
    [[7, 4, null], [9, 11, "e"], [12, 1, "f"]],
    [[14, 9, "g"], [14, 7, "h"], [17, 13, null]],
    [[17, 5, "i"], [20, 10, "j"], [21, 15, "k"]],
    [[25, 17, null], [25, 16, "l"], [28, 18, "m"]],
  ];
  const ilt = (k1, s1, k2, s2) => k1 < k2 || (k1 === k2 && s1 > s2);
  register("table-lookup", (fig) => {
    let key = 7, snap = 18;
    const index = TBL.map((b) => b[b.length - 1]);
    function frames() {
      const fr = [];
      const tgt = `(${key}, ${snap})`;
      fr.push({ part: "footer", cap: `Look up key **${key}** at snapshot **${snap}**: the newest version of ${key} with a sequence number ≤ ${snap}. The store read the footer when it opened the table: it says where the index and the filter are.` });
      fr.push({ part: "index", cap: `The index has one entry per data block: the last version of the block, as key:seq. Find the first entry that is not smaller than ${tgt} in the internal order: a binary search.` });
      let lo = 0, hi = index.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const [k, q] = index[mid];
        const less = ilt(k, q, key, snap);
        fr.push({ part: "index", lo, hi, mid, cap: `Entry ${mid} is ${k}:${q}. ${less ? `It is smaller than ${tgt}, so the answer is to its right.` : `It is not smaller than ${tgt}: the answer is this entry or one to its left.`}` });
        if (less) lo = mid + 1; else hi = mid;
      }
      if (lo === index.length) {
        fr.push({ part: "index", lo, hi, cap: `No entry is large enough: every version in the table is smaller than ${tgt}. The table has no answer, and no block was read.` });
        return fr;
      }
      const b = lo;
      fr.push({ part: "block", block: b, cap: `The answer can only be in block ${b}. Read it (one read from the disk), and check its checksum: it is correct.` });
      for (let i = 0; i < TBL[b].length; i++) {
        const [k, q, v] = TBL[b][i];
        if (ilt(k, q, key, snap)) { fr.push({ part: "block", block: b, at: i, cap: `Version ${k}:${q} is smaller than ${tgt}: skip it.` }); continue; }
        if (k !== key) { fr.push({ part: "block", block: b, at: i, miss: true, cap: `Version ${k}:${q} is the first one that is not smaller, but its key is ${k}, not ${key}. The table has no version of ${key} that snapshot ${snap} can see.` }); return fr; }
        fr.push({ part: "block", block: b, at: i, hit: true, cap: v == null ? `Version ${k}:${q} is a **delete**: at snapshot ${snap}, key ${key} has no value, and older tables must not be searched.` : `Version ${k}:${q} is the answer: **"${v}"**.` });
        return fr;
      }
      return fr;
    }
    const ui = frame(fig, { title: "A lookup in a table", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 92;
    const svg = svgBox(ui.stage, W, H, "en-tbl");
    const box = h("div", { class: "en-tblbox" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    slider(tools, "Key", { min: 0, max: 30, step: 1, value: key, format: (v) => String(v) }, (v) => { key = v; player.setFrames(frames()); });
    slider(tools, "Snapshot", { min: 0, max: 18, step: 1, value: snap, format: (v) => String(v) }, (v) => { snap = v; player.setFrames(frames()); });
    const parts = [...TBL.map((_, i) => ({ name: `block ${i}`, w: 64, cls: "is-data", block: i })), { name: "filter", w: 46, cls: "is-filter" }, { name: "index", w: 66, cls: "is-index" }, { name: "footer", w: 52, cls: "is-footer" }];
    const player = new Player(fig, {
      frames: frames(), interval: 1700,
      apply: (f) => {
        svg.textContent = "";
        let x = 20;
        label(svg, 20, 14, "the table, from its first byte to its last", "st-tick", "start");
        for (const p of parts) {
          const on = (f.part === "footer" && p.cls === "is-footer") || (f.part === "index" && p.cls === "is-index") || (f.part === "block" && p.block === f.block);
          rect(svg, x, 26, p.w - 3, 36, `en-part ${p.cls}${on ? " is-cur" : ""}`, 4);
          label(svg, x + (p.w - 3) / 2, 44, p.name, "en-partlbl");
          x += p.w;
        }
        label(svg, 20, 80, `the internal order: by key, then the newest version first`, "en-sub", "start");
        box.textContent = "";
        box.append(cells(index.map(([k, q]) => `${k}:${q}`), (i) => {
          if (f.part !== "index" && f.part !== "block") return "is-dim";
          if (f.mid === i) return "is-cur";
          if (f.part === "block" && i === f.block) return "is-hit";
          if (f.lo != null && (i < f.lo || i >= f.hi)) return "is-dim";
          return "";
        }, "index"));
        const b = f.part === "block" ? f.block : null;
        box.append(cells((b == null ? [null, null, null] : TBL[b]).map((e) => (e ? `${e[0]}:${e[1]} ${e[2] == null ? "del" : `"${e[2]}"`}` : "")), (i) => {
          if (b == null) return "is-dim";
          if (f.at === i) return f.hit ? "is-hit" : f.miss ? "is-bad" : "is-cur";
          return f.at != null && i < f.at ? "is-dim" : "";
        }, b == null ? "block" : `block ${b}`));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------- one chain of crc32, or three */
  register("crc-chains", (fig) => {
    let chains = 1;
    const T = 18;
    const ui = frame(fig, { title: "One chain of crc32, or three", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 156;
    const svg = svgBox(ui.stage, W, H, "en-crc");
    const tools = toolbar(ui);
    toggle(tools, "Chains", [[1, "one chain"], [3, "three chains"]], chains, (v) => { chains = v; player.setFrames(make()); });
    function ops() {  // {chain, start, n}: one instruction of 3 cycles
      const out = [];
      if (chains === 1) for (let t = 0; t < T; t += 3) out.push({ chain: 0, start: t, n: out.length });
      else for (let t = 0; t < T; t++) out.push({ chain: t % 3, start: t, n: out.length });
      return out;
    }
    const make = () => Array.from({ length: T + 1 }, (_, t) => ({ t }));
    const X = (c) => 74 + c * ((W - 96) / T);
    const player = new Player(fig, {
      frames: make(), interval: 650,
      apply: ({ t }) => {
        svg.textContent = "";
        for (let c = 0; c <= T; c += 3) {
          seg(svg, X(c), 16, X(c), 112, "en-grid");
          label(svg, X(c), 124, String(c), "st-tick");
        }
        label(svg, (X(0) + X(T)) / 2, 142, "clock cycles", "st-axis");
        for (let k = 0; k < 3; k++) label(svg, 64, 34 + k * 30, `chain ${k}`, k < chains ? "st-tick" : "en-sub", "end");
        let done = 0;
        for (const o of ops()) {
          if (o.start >= t) continue;
          const end = Math.min(o.start + 3, t), fin = o.start + 3 <= t;
          if (fin) done++;
          const y = 22 + o.chain * 30;
          rect(svg, X(o.start) + 1.5, y, X(end) - X(o.start) - 3, 24, `en-op c${o.chain}${fin ? "" : " is-run"}`, 4);
          if (fin) label(svg, (X(o.start) + X(end)) / 2, y + 12, "8 bytes", "en-oplbl");
        }
        if (t < T) seg(svg, X(t), 12, X(t), 116, "ix-now");
        const rate = chains === 1 ? "8 bytes every 3 cycles: **2.7 bytes per cycle**" : "a new instruction every cycle, three running at the same time: **8 bytes per cycle**";
        ui.setCaption(t === 0
          ? (chains === 1 ? "One chain: each crc32 needs the checksum of the one before it, so it cannot start until that one is done (latency 3 cycles)." : "Three chains on three parts of the block: their instructions do not depend on each other, so the CPU starts one every cycle (throughput 1 per cycle).")
          : `Cycle ${t}: ${plural(done, "instruction")} done, ${8 * done} bytes. ${rate}.${chains === 3 && t === T ? " At the end, the three checksums are combined with two pclmulqdq." : ""}`);
      },
    });
  });

  /* ----------------------------------------- a compaction with snapshots */
  const CM_IN = [
    [[2, 11, "u"], [7, 9, "c"], [9, 8, null]],
    [[3, 5, "v"], [7, 6, "b"], [7, 2, "a"], [8, 10, "w"]],
    [[2, 3, "t"], [7, 4, null], [8, 1, "z"], [9, 7, "y"]],
  ];
  const vtxt = (e) => `${e[0]}:${e[1]} ${e[2] == null ? "del" : e[2]}`;
  register("compaction-merge", (fig) => {
    let snaps = [5], bottom = false;
    function make() {
      const fr = [], pos = [0, 0, 0], out = [], dropped = [];
      let cur = [];
      const head = (i) => CM_IN[i][pos[i]];
      const snap = (extra) => fr.push({ pos: [...pos], out: [...out], dropped: [...dropped], cur: [...cur], ...extra });
      const decide = () => {
        const k = cur[0][0], kept = [], why = [];
        cur.forEach((e, j) => {
          if (j === 0) { kept.push(e); why.push(`version ${e[1]} is the newest: kept`); return; }
          const s = snaps.find((x) => x >= e[1]);
          if (s != null && s < cur[j - 1][1]) { kept.push(e); why.push(`snapshot ${s} sees version ${e[1]}: kept`); }
          else { dropped.push(e); why.push(`version ${e[1]}: ${snaps.length ? "no snapshot sees it" : "an older version"}, dropped`); }
        });
        if (bottom) while (kept.length && kept[kept.length - 1][2] == null) { const d = kept.pop(); dropped.push(d); why.push(`version ${d[1]} is a delete with nothing older, at the bottom: dropped`); }
        out.push(...kept);
        cur = [];
        snap({ decided: k, cap: `All versions of key **${k}** have come. ${why.join("; ")}.` });
      };
      snap({ cap: `Three input tables, each sorted in the internal order. ${snaps.length ? `Snapshot ${snaps[0]} is live` : "No snapshot is live"}${bottom ? ", and the output is the bottom level" : ", and the output is not the bottom level"}. The merge takes the smallest head of the three inputs again and again.` });
      for (;;) {
        let best = -1;
        for (let i = 0; i < 3; i++) if (pos[i] < CM_IN[i].length && (best < 0 || ilt(head(i)[0], head(i)[1], head(best)[0], head(best)[1]))) best = i;
        if (best < 0) break;
        const e = head(best);
        if (cur.length && cur[0][0] !== e[0]) decide();
        cur.push(e);
        pos[best]++;
        snap({ from: best, taken: e, cap: `Take ${vtxt(e)} from table ${"ABC"[best]}: the smallest of the heads.` });
      }
      if (cur.length) decide();
      const n = CM_IN.flat().length;
      fr[fr.length - 1].cap += ` Done: ${n} versions read, ${out.length} written.`;
      return fr;
    }
    const ui = frame(fig, { title: "A compaction keeps what readers can see", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-cmbox" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    toggle(tools, "Snapshots", [[true, "snapshot 5"], [false, "none"]], true, (v) => { snaps = v ? [5] : []; player.setFrames(make()); });
    toggle(tools, "Output", [[false, "not the bottom"], [true, "the bottom"]], false, (v) => { bottom = v; player.setFrames(make()); });
    const player = new Player(fig, {
      frames: make(), interval: 1500,
      apply: (f) => {
        box.textContent = "";
        CM_IN.forEach((run, i) => box.append(cells(run.map(vtxt), (j) => (j < f.pos[i] ? (f.from === i && j === f.pos[i] - 1 ? "is-cur" : "is-dim") : j === f.pos[i] ? "is-next" : ""), `table ${"ABC"[i]}`)));
        box.append(cells(f.cur.length ? f.cur.map(vtxt) : ["–"], () => (f.cur.length ? "is-cur" : "is-dim"), "this key"));
        box.append(cells(f.out.length ? f.out.map(vtxt) : ["–"], (j) => (f.decided != null && f.out[j] && f.out[j][0] === f.decided ? "is-hit" : f.out.length ? "" : "is-dim"), "output"));
        box.append(cells(f.dropped.length ? f.dropped.map(vtxt) : ["–"], (j) => (f.dropped.length ? (f.decided != null && f.dropped[j][0] === f.decided ? "is-bad" : "is-gone") : "is-dim"), "dropped"));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------ leveled and tiered, side by side */
  // Puts of random keys, no deletes and no snapshots: a run is a sorted array
  // of distinct keys, and a merge is their union. Sizes are counted in keys.
  function union(runs) {
    const set = new Set();
    for (const r of runs) for (const k of r) set.add(k);
    return Int32Array.from(set).sort();
  }
  function leveledSim(KEYS, MEM) {
    const TABLE = MEM, L0 = 4, L1 = 10 * MEM;
    const st = { levels: [[], [], [], []], disk: 0, ptr: [-1, -1, -1, -1] };
    const lo = (t) => t[0], hi = (t) => t[t.length - 1];
    function compact(l) {
      let upper;
      if (l === 0) upper = st.levels[0];
      else {
        const files = st.levels[l];
        let i = files.findIndex((t) => lo(t) > st.ptr[l]);
        if (i < 0) i = 0;
        upper = [files[i]];
        st.ptr[l] = hi(files[i]);
      }
      let a = Math.min(...upper.map(lo)), b = Math.max(...upper.map(hi));
      const lower = st.levels[l + 1].filter((t) => !(hi(t) < a || lo(t) > b)), stay = st.levels[l + 1].filter((t) => hi(t) < a || lo(t) > b);
      const merged = union([...upper, ...lower]);
      st.disk += merged.length;
      const out = [];
      for (let i = 0; i < merged.length; i += TABLE) out.push(merged.subarray(i, i + TABLE));
      st.levels[l + 1] = [...stay, ...out].sort((x, y) => lo(x) - lo(y));
      st.levels[l] = l === 0 ? [] : st.levels[l].filter((t) => t !== upper[0]);
    }
    return {
      st,
      flush(run) {
        st.levels[0].unshift(run);
        st.disk += run.length;
        for (;;) {
          if (st.levels[0].length >= L0) { compact(0); continue; }
          let did = false;
          for (let l = 1, limit = L1; l + 1 < st.levels.length; l++, limit *= 10) {
            if (st.levels[l].reduce((x, t) => x + t.length, 0) > limit) { compact(l); did = true; break; }
          }
          if (!did) return;
        }
      },
      runs() { return st.levels[0].length + st.levels.slice(1).filter((x) => x.length).length; },
      size() { return st.levels.flat().reduce((x, t) => x + t.length, 0); },
      rows() { return st.levels.map((x, l) => ({ name: `level ${l}`, runs: x.map((t) => t.length), joined: l > 0 })); },
    };
  }
  function tieredSim(MEM) {
    const st = { runs: [], disk: 0 };
    const tier = (n) => Math.max(0, Math.floor(Math.log(n / MEM) / Math.log(4) + 1e-9));
    return {
      st,
      flush(run) {
        st.runs.push(run);
        st.disk += run.length;
        for (;;) {
          const by = new Map();
          st.runs.forEach((r, i) => { const t = tier(r.length); if (!by.has(t)) by.set(t, []); by.get(t).push(i); });
          const full = [...by.entries()].filter(([, ix]) => ix.length >= 4).sort((a, b) => a[0] - b[0])[0];
          if (!full) return;
          const pick = full[1].slice(0, 4);
          const merged = union(pick.map((i) => st.runs[i]));
          st.disk += merged.length;
          st.runs = st.runs.filter((_, i) => !pick.includes(i));
          st.runs.push(merged);
        }
      },
      runs() { return st.runs.length; },
      size() { return st.runs.reduce((x, r) => x + r.length, 0); },
      rows() {
        const rows = [];
        for (const r of st.runs) { const t = tier(r.length); (rows[t] = rows[t] || []).push(r.length); }
        return Array.from({ length: Math.max(rows.length, 3) }, (_, t) => ({ name: `tier ${t}`, runs: rows[t] || [], joined: false }));
      },
    };
  }
  register("lsm-compaction", (fig) => {
    const KEYS = 10000, MEM = 100;
    let mode = "leveled", rand, sims, mem, user, seen;
    function reset() {
      rand = rng(17);
      sims = { leveled: leveledSim(KEYS, MEM), tiered: tieredSim(MEM) };
      mem = new Set();
      user = 0;
      seen = new Set();  // the keys on the disk: the live data
      write(20000);
    }
    function write(n) {
      for (let i = 0; i < n; i++) {
        const k = Math.floor(rand() * KEYS);
        mem.add(k);
        user++;
        if (mem.size >= MEM) {
          const run = Int32Array.from(mem).sort();
          for (const x of run) seen.add(x);
          mem = new Set();
          sims.leveled.flush(run);
          sims.tiered.flush(run);
        }
      }
    }
    const metrics = (sim) => ({ wa: (user + sim.st.disk) / user, ra: sim.runs(), sa: sim.size() / Math.max(1, seen.size) });
    const ui = frame(fig, { title: "Leveled and tiered compaction", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 640;
    const svg = svgBox(ui.stage, W, 170, "en-amp");
    const meters = svgBox(ui.stage, W, 112, "en-amp");
    const tools = toolbar(ui);
    toggle(tools, "Show", [["leveled", "leveled"], ["tiered", "tiered"]], mode, (v) => { mode = v; draw(); });
    button(tools, "Write 100 keys", () => { write(100); draw(); }, "is-primary");
    button(tools, "Write 1000 keys", () => { write(1000); draw(); });
    button(tools, "Reset", () => { reset(); draw(); });
    function draw() {
      svg.textContent = "";
      const rows = sims[mode].rows();
      const RH = Math.min(36, 150 / rows.length);
      const scale = (W - 120) / KEYS;
      label(svg, 12, 10, `${mode} compaction: each box is a table or run, as wide as its keys`, "en-sub", "start");
      rows.forEach((r, i) => {
        const y = 22 + i * RH;
        label(svg, 12, y + RH / 2 - 2, r.name, "st-tick", "start");
        let x = 100;
        for (const n of r.runs) {
          const w = Math.max(2, n * scale);
          rect(svg, x, y, w - (r.joined ? 0.6 : 2), RH - 8, `en-table l${Math.min(i, 3)}`, r.joined ? 1 : 3);
          x += w + (r.joined ? 0 : 2);
        }
        if (!r.runs.length) label(svg, 100, y + RH / 2 - 2, "empty", "en-sub", "start");
      });
      meters.textContent = "";
      const m = { leveled: metrics(sims.leveled), tiered: metrics(sims.tiered) };
      const groups = [["write amplification", "wa", 1], ["read amplification", "ra", 0], ["space amplification", "sa", 2]];
      groups.forEach(([name, key, digits], g) => {
        const x0 = 12 + g * 210, max = Math.max(m.leveled[key], m.tiered[key], 1);
        label(meters, x0, 12, name, "st-tick", "start");
        ["leveled", "tiered"].forEach((which, j) => {
          const y = 26 + j * 34;
          label(meters, x0, y + 9, which, "en-sub", "start");
          rect(meters, x0 + 50, y, 120, 18, "en-meterbg", 4);
          rect(meters, x0 + 50, y, (120 * m[which][key]) / max, 18, `en-meter ${which === mode ? "is-on" : ""}`, 4);
          label(meters, x0 + 176, y + 9, m[which][key].toFixed(digits), "en-meterlbl", "start");
        });
      });
      ui.setCaption(`${user.toLocaleString("en-US")} puts of random keys out of ${KEYS.toLocaleString("en-US")}; a flush every ${MEM} keys. Leveled: the store wrote **${m.leveled.wa.toFixed(1)}** keys to the disk per key from the user, a read may search ${m.leveled.ra} runs, and the disk holds ${m.leveled.sa.toFixed(2)} times the live keys. Tiered: **${m.tiered.wa.toFixed(1)}**, ${m.tiered.ra} runs, and ${m.tiered.sa.toFixed(2)} times.`);
    }
    reset();
    draw();
  });

  /* ------------------------------------------------ Bloom filter rates */
  const bloomClassic = (b, k) => Math.pow(1 - Math.exp(-k / b), k);
  function bloomSplit(b) {  // keys per block: Poisson with mean 256 / b; each word gets one bit of 32 per key
    const lam = 256 / b;
    let p = Math.exp(-lam), sum = 0;
    for (let j = 0; j < lam + 12 * Math.sqrt(lam) + 40; j++) {
      if (j > 0) p *= lam / j;
      sum += p * Math.pow(1 - Math.pow(31 / 32, j), 8);
    }
    return sum;
  }
  register("bloom-fpr", (fig) => {
    let bits = 10, k = 7;
    const ui = frame(fig, { title: "False positive rates of Bloom filters", kicker: "Try it" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 270, X0 = 64, X1 = 610, Y0 = 18, Y1 = 226;
    const svg = svgBox(ui.stage, W, H, "en-fpr st-chart");
    const legend = h("div", { class: "st-legend" }, h("span", { class: "st-lkey c5", text: "classic, best k" }), h("span", { class: "st-lkey c0", text: "classic, your k" }), h("span", { class: "st-lkey c2", text: "split-block (Parquet)" }));
    ui.stage.appendChild(legend);
    const tools = toolbar(ui);
    slider(tools, "Bits per key", { min: 2, max: 20, step: 0.5, value: bits, format: (v) => v.toFixed(1) }, (v) => { bits = v; draw(); });
    slider(tools, "k", { min: 1, max: 16, step: 1, value: k, format: (v) => String(v) }, (v) => { k = v; draw(); });
    const X = (b) => X0 + ((b - 2) / 18) * (X1 - X0);
    const Y = (p) => Y0 + (-Math.log10(Math.max(p, 1e-6)) / 6) * (Y1 - Y0);
    const best = (b) => Math.max(1, Math.round(b * Math.LN2));
    const curve = (f, cls) => {
      let d = "";
      for (let b = 2; b <= 20.001; b += 0.25) d += `${d ? "L" : "M"}${fx(X(b))} ${fx(Y(f(b)))}`;
      s("path", { d, class: `st-curve ${cls}` }, svg);
    };
    function draw() {
      svg.textContent = "";
      for (let e = 0; e <= 6; e++) {
        seg(svg, X0, Y(10 ** -e), X1, Y(10 ** -e), "st-grid");
        label(svg, X0 - 8, Y(10 ** -e), e === 0 ? "100 %" : e === 1 ? "10 %" : e === 2 ? "1 %" : `${10 ** (2 - e)} %`.replace(/^0\.0+1/, (m) => m), "st-tick", "end");
      }
      for (let b = 2; b <= 20; b += 2) label(svg, X(b), Y1 + 14, String(b), "st-tick");
      label(svg, (X0 + X1) / 2, Y1 + 34, "bits per key", "st-axis");
      curve((b) => bloomClassic(b, best(b)), "c5");
      curve((b) => bloomClassic(b, k), "c0");
      curve(bloomSplit, "c2");
      seg(svg, X(bits), Y0, X(bits), Y1, "en-keyline");
      const pc = bloomClassic(bits, k), pb = bloomClassic(bits, best(bits)), ps = bloomSplit(bits);
      s("circle", { cx: fx(X(bits)), cy: fx(Y(pc)), r: 5, class: "st-dot c0 is-on" }, svg);
      s("circle", { cx: fx(X(bits)), cy: fx(Y(ps)), r: 5, class: "en-dot2 is-on" }, svg);
      const pct = (p) => (p >= 0.01 ? `${(100 * p).toFixed(2)} %` : `${(100 * p).toPrecision(2)} %`);
      const one = (p) => `one in ${Math.round(1 / p).toLocaleString("en-US")}`;
      ui.setCaption(`With ${bits.toFixed(1)} bits per key: the classic filter with k = ${k} has **${pct(pc)}** false positives (${one(pc)} lookups of a missing key)${k === best(bits) ? ", and this k is the best" : `; the best k, ${best(bits)}, gives ${pct(pb)}`}. The split-block filter has **${pct(ps)}** (${one(ps)}).`);
    }
    draw();
  });

  /* --------------------------------------- the split-block filter in AVX2 lanes */
  const SALT = [0x47b6137b, 0x44974d91, 0x8824ad5b, 0xa2b7289d, 0x705495c7, 0x2df1424b, 0x9efc4947, 0x5c6bfb31];
  const sbbfBits = (x) => SALT.map((sa) => Math.imul(x, sa) >>> 27);
  register("sbbf-lanes", (fig) => {
    const rand = rng(9);
    const keys = Array.from({ length: 22 }, () => Math.floor(rand() * 4294967296) >>> 0);
    const block = new Array(8).fill(0);
    keys.forEach((x) => sbbfBits(x).forEach((b, i) => { block[i] = (block[i] | (1 << b)) >>> 0; }));
    let other = 0;
    for (;;) { other = Math.floor(rand() * 4294967296) >>> 0; if (sbbfBits(other).some((b, i) => !((block[i] >>> b) & 1))) break; }
    let mode = "in";
    const ui = frame(fig, { title: "Eight bits in one AVX2 register", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-lanes" });
    ui.stage.appendChild(box);
    const svg = svgBox(ui.stage, 640, 252, "en-bits");
    const tools = toolbar(ui);
    toggle(tools, "Key", [["in", "an inserted key"], ["out", "another key"]], mode, (v) => { mode = v; player.setFrames(make()); });
    const STEPS = [
      "`_mm256_set1_epi32`: the low 32 bits x of the hash go into all 8 lanes.",
      "`_mm256_mullo_epi32`: each lane multiplies x by its own salt, modulo 2³² (8 multiplications in one instruction).",
      "`_mm256_srli_epi32(…, 27)`: the top 5 bits of each product, a bit number from 0 to 31.",
      "`_mm256_sllv_epi32`: 1 shifted left by each lane's own number. The mask has exactly one bit in each 32-bit word.",
      "The block of this key: 8 words of 32 bits, with the bits that earlier keys set.",
    ];
    function make() {
      const x = mode === "in" ? keys[7] : other;
      const bits = sbbfBits(x), prods = SALT.map((sa) => Math.imul(x, sa) >>> 0);
      const ok = bits.map((b, i) => !!((block[i] >>> b) & 1));
      const all = ok.every(Boolean);
      const fr = STEPS.map((cap, step) => ({ step, x, bits, prods, ok, cap }));
      fr.push({ step: 5, x, bits, prods, ok, cap: `\`_mm256_testc_si256(block, mask)\`: is every bit of the mask set in the block? ${all ? "**Yes in all 8 words**: the key may be in the table (for an inserted key, surely)." : `**No**: ${ok.filter((v) => !v).length} of the 8 bits are 0 (red). The key is surely not in the table.`}` });
      return fr;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1700,
      apply: (f) => {
        box.textContent = "";
        box.append(cells(f.bits.map(() => (f.step >= 0 ? hex(f.x) : "")), () => "is-big", "x"));
        if (f.step >= 1) box.append(cells(f.prods.map((p) => hex(p)), () => "is-big", "x · salt"));
        if (f.step >= 2) box.append(cells(f.bits.map(String), () => (f.step === 2 ? "is-cur" : ""), ">> 27"));
        svg.textContent = "";
        const CW = 13.5, X0 = 92;
        label(svg, X0, 10, "bit 31", "en-sub", "start");
        label(svg, X0 + 32 * CW, 10, "bit 0", "en-sub", "end");
        for (let w = 0; w < 8; w++) {
          const y = 20 + w * 28;
          label(svg, X0 - 10, y + 7, `word ${w}`, "st-tick", "end");
          for (let b = 31; b >= 0; b--) {
            const x = X0 + (31 - b) * CW;
            const inBlock = f.step >= 4 && (block[w] >>> b) & 1, inMask = f.step >= 3 && f.bits[w] === b;
            let cls = "en-bit";
            if (inBlock) cls += " is-set";
            if (inMask) cls += f.step >= 5 ? (f.ok[w] ? " is-ok" : " is-miss") : " is-mask";
            rect(svg, x, y, CW - 2, 14, cls, 2);
          }
          if (f.step >= 5) label(svg, X0 + 32 * CW + 10, y + 7, f.ok[w] ? "✓" : "✗", f.ok[w] ? "en-okmark" : "en-badmark", "start");
        }
        ui.setCaption(f.cap);
      },
    });
  });

  /* --------------------------------------------------- subcompactions */
  register("subcompactions", (fig) => {
    const T = 4, B = 100;
    let split = "equal", data = "skewed";
    function weights() {
      return Array.from({ length: B }, (_, i) => (data === "even" ? 1 : i >= 20 && i < 34 ? 9 : 0.4));
    }
    function plan() {
      const w = weights(), total = w.reduce((a, b) => a + b, 0);
      let bounds;
      if (split === "equal") bounds = [25, 50, 75];
      else {
        bounds = [];
        let acc = 0;
        for (let i = 0; i < B && bounds.length < T - 1; i++) {
          acc += w[i];
          if (acc >= (total * (bounds.length + 1)) / T) bounds.push(i + 1);
        }
      }
      const edges = [0, ...bounds, B];
      const work = Array.from({ length: T }, (_, p) => w.slice(edges[p], edges[p + 1]).reduce((a, b) => a + b, 0));
      return { w, total, edges, work, end: Math.max(...work) };
    }
    const ui = frame(fig, { title: "Subcompactions in four threads", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 236;
    const svg = svgBox(ui.stage, W, H, "ix-gantt");
    const tools = toolbar(ui);
    toggle(tools, "Keys", [["even", "even"], ["skewed", "skewed"]], data, (v) => { data = v; player.setFrames(make()); });
    toggle(tools, "Boundaries", [["equal", "equal key ranges"], ["index", "from the index"]], split, (v) => { split = v; player.setFrames(make()); });
    const make = () => { const p = plan(); return Array.from({ length: 13 }, (_, i) => ({ p, t: (p.end * i) / 12 })); };
    const player = new Player(fig, {
      frames: make(), interval: 650,
      apply: ({ p, t }) => {
        svg.textContent = "";
        const X = (i) => 74 + (i / B) * (W - 94), max = Math.max(...p.w);
        label(svg, 8, 12, "data along the key range", "st-tick", "start");
        p.w.forEach((v, i) => {
          const part = p.edges.findIndex((e, j) => j > 0 && i < e) - 1;
          rect(svg, X(i), 80 - (v / max) * 56, X(i + 1) - X(i) - 0.5, (v / max) * 56, `st-bar c${[5, 0, 2, 1][part]}`, 0);
        });
        p.edges.slice(1, -1).forEach((e) => seg(svg, X(e), 18, X(e), 88, "en-bound"));
        label(svg, X(0), 96, "0", "st-tick");
        label(svg, X(B), 96, "keys", "st-tick", "end");
        const TX = (x) => 74 + (x / p.end) * (W - 94);
        for (let th = 0; th < T; th++) {
          const y = 112 + th * 26;
          label(svg, 66, y + 10, `thread ${th}`, "st-tick", "end");
          rect(svg, 74, y, W - 94, 20, "ix-idle", 3);
          const w = p.work[th];
          if (t > 0 && w > 0) rect(svg, 74.5, y + 1, Math.max(0, TX(Math.min(w, t)) - 75), 18, `st-bar c${[5, 0, 2, 1][th]}`, 2);
          if (t >= w && t > 0) label(svg, TX(w) + 4, y + 10, w < p.end - 1e-9 ? "waits" : "done", "en-sub", "start");
        }
        seg(svg, TX(t), 104, TX(t), 112 + T * 26, "ix-now");
        const speedup = p.total / p.end;
        ui.setCaption(t >= p.end - 1e-9
          ? `All parts are done after **${p.end.toFixed(0)}** units of work; one thread needs ${p.total.toFixed(0)}. Speedup **${speedup.toFixed(2)}** on ${T} threads.${split === "equal" && data === "skewed" ? " One part has most of the data: three threads wait." : split === "index" ? " The boundaries come from the last keys of the data blocks, so every part has about the same bytes." : ""}`
          : t === 0 ? `${data === "even" ? "Even keys" : "Skewed keys: most data is in a narrow key range"}. ${split === "equal" ? "The boundaries split the key range into 4 equal parts." : "The boundaries are every 4th quantile of the last keys of the data blocks."} Each thread merges one part.` : `Time ${t.toFixed(0)}: ${p.work.filter((w) => w > t).length} of ${T} threads are merging.`);
      },
    });
  });

  /* ------------------------------------------------ two Merkle trees */
  register("merkle-diff", (fig) => {
    const D = 4, L = 1 << D;
    const base = Array.from({ length: L }, (_, i) => i * 7 + 3);
    let b = [...base];
    b[5] += 1;
    b[11] += 1;
    const mix = (x) => {
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
      x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
      return (x ^ (x >>> 16)) >>> 0;
    };
    const short = (v) => hex(v >>> 16, 4);  // the top 16 bits are enough to show
    const tree = (leaves) => {
      const t = new Array(2 * L).fill(0);
      for (let i = 0; i < L; i++) t[L + i] = mix(leaves[i] + 0x9e37);
      for (let i = L - 1; i >= 1; i--) t[i] = mix(Math.imul(t[2 * i], 31) ^ t[2 * i + 1]);
      return t;
    };
    function make() {
      const ta = tree(base), tb = tree(b), fr = [], state = new Map();
      let compared = 0;
      const diffs = [];
      fr.push({ ta, tb, state: new Map(state), compared, cap: "Two replicas of the same 16 key ranges. Replica B has other versions in some ranges (click a leaf of B to change it). diff starts at the roots." });
      const visit = (i) => {
        compared++;
        const same = ta[i] === tb[i];
        state.set(i, same ? "same" : "diff");
        if (!same && i >= L) diffs.push(i - L);
        fr.push({ ta, tb, state: new Map(state), compared, cur: i, cap: same ? `Node ${i}: the hashes are equal (${short(ta[i])}): the same data below. Do not open it.` : i >= L ? `Leaf ${i - L}: the hashes differ: key range ${i - L} must be repaired.` : `Node ${i}: ${short(ta[i])} and ${short(tb[i])} differ: compare its two children.` });
        if (!same && i < L) { visit(2 * i); visit(2 * i + 1); }
      };
      visit(1);
      fr[fr.length - 1].cap += ` In all: ${plural(compared, "hash", "hashes")} compared, ${plural(diffs.length, "range")} to repair${diffs.length ? ` (${diffs.join(", ")})` : ""}, instead of all 16 ranges.`;
      return fr;
    }
    const ui = frame(fig, { title: "Anti-entropy with two Merkle trees", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 320;
    const svg = svgBox(ui.stage, W, H, "en-merkle");
    svg.addEventListener("click", (e) => {
      const g = e.target.closest("[data-leaf]");
      if (!g) return;
      const i = +g.dataset.leaf;
      b[i] = b[i] === base[i] ? base[i] + 1 : base[i];
      player.setFrames(make());
    });
    const tools = toolbar(ui);
    button(tools, "Same data", () => { b = [...base]; player.setFrames(make()); });
    button(tools, "Two ranges differ", () => { b = [...base]; b[5] += 1; b[11] += 1; player.setFrames(make()); });
    const pos = (i, top) => {  // node i of a tree drawn from y = top
      const depth = Math.floor(Math.log2(i)), first = 1 << depth, n = 1 << depth;
      return { x: 20 + ((i - first + 0.5) / n) * (W - 40), y: top + depth * 30 };
    };
    const player = new Player(fig, {
      frames: make(), interval: 900,
      apply: (f) => {
        svg.textContent = "";
        [["A", f.ta, 14], ["B", f.tb, 170]].forEach(([name, t, top]) => {
          label(svg, 8, top + 2, `replica ${name}`, "st-tick", "start");
          for (let i = 2; i < 2 * L; i++) { const p = pos(i, top + 10), q = pos(i >> 1, top + 10); seg(svg, p.x, p.y, q.x, q.y, "st-edge"); }
          for (let i = 1; i < 2 * L; i++) {
            const p = pos(i, top + 10), stt = f.state.get(i);
            const g = s("g", i >= L && name === "B" ? { "data-leaf": i - L, class: "en-clickable" } : {}, svg);
            const leaf = i >= L;
            rect(g, p.x - (leaf ? 17 : 19), p.y - 9, leaf ? 34 : 38, 18, `en-hash${stt === "same" ? " is-same" : stt === "diff" ? " is-diff" : ""}${f.cur === i ? " is-cur" : ""}${leaf && name === "B" && b[i - L] !== base[i - L] ? " is-changed" : ""}`, 5);
            label(g, p.x, p.y, short(t[i]), "en-hashlbl");
          }
        });
        label(svg, W - 8, 16, `hashes compared: ${f.compared}`, "en-sub", "end");
        ui.setCaption(f.cap);
      },
    });
  });

  /* ============================ chapter 32: concurrency control and MVCC */

  /* ------------------------------------------- latch coupling in a tree */
  // Nodes of at most 3 keys; the C++ rules: a leaf splits before the insert,
  // keeps (count + 1) / 2 keys, and its largest key goes up as the separator.
  function lcTree() {
    return {
      r: { keys: [20, 40], kids: ["A", "B", "C"] },
      A: { keys: [8, 14], kids: ["a0", "a1", "a2"] }, B: { keys: [26, 32], kids: ["b0", "b1", "b2"] }, C: { keys: [48], kids: ["c0", "c1"] },
      a0: { keys: [2, 5, 8] }, a1: { keys: [11, 14] }, a2: { keys: [17, 20] }, b0: { keys: [23, 26] }, b1: { keys: [29, 32] },
      b2: { keys: [35, 38, 40] }, c0: { keys: [44, 48] }, c1: { keys: [52, 60] },
    };
  }
  const LC_CAP = 3;
  register("latch-crabbing", (fig) => {
    let mode = "find", full = false;
    function make() {
      const tree = lcTree(), fr = [];
      const latches = new Map();
      let rootLatch = null, most = 0;
      const snap = (cur, cap, extra = {}) => {
        most = Math.max(most, latches.size);
        fr.push({ tree: JSON.parse(JSON.stringify(tree)), latches: new Map(latches), rootLatch, cur, cap, most, ...extra });
      };
      const childOf = (id, k) => tree[id].kids[tree[id].keys.filter((x) => x < k).length];
      const key = mode === "find" ? 29 : full ? 36 : 30;
      const isLeaf = (id) => !tree[id].kids;
      const safe = (id) => tree[id].keys.length < LC_CAP;
      function pessimistic(prefix) {
        rootLatch = "X";
        snap(null, `${prefix}Take root_latch exclusively: the root may split.`);
        let id = "r";
        latches.set(id, "X");
        const held = [id];
        const releaseAbove = () => {
          while (held.length > 1) latches.delete(held.shift());
          rootLatch = null;
        };
        if (safe(id)) { releaseAbove(); snap(id, `The root has room for one more key: it is safe. Release root_latch.`); }
        else snap(id, "The root is full: keep root_latch.");
        while (!isLeaf(id)) {
          const c = childOf(id, key);
          latches.set(c, "X");
          held.push(c);
          if (safe(c)) {
            const above = held.length - 1;
            releaseAbove();
            snap(c, `Latch ${isLeaf(c) ? "the leaf" : `node ${c}`} exclusively. It has room: it is **safe**, so nothing above it can change. Release the ${above === 1 ? "latch" : `${above} latches`} above it.`);
          } else snap(c, `Latch ${isLeaf(c) ? "the leaf" : `node ${c}`} exclusively. It is **full**: it may split, so keep the latches above it.`);
          id = c;
        }
        const leaf = tree[id];
        if (leaf.keys.length < LC_CAP) {
          leaf.keys = [...leaf.keys, key].sort((a, b) => a - b);
          snap(id, `Put ${key} into the leaf.`, { hit: id });
        } else {
          const parent = held[held.length - 2];
          const keep = Math.ceil(leaf.keys.length / 2), right = leaf.keys.slice(keep), sep = leaf.keys[keep - 1];
          leaf.keys = leaf.keys.slice(0, keep);
          const nid = `${id}′`;
          tree[nid] = { keys: right };
          const p = tree[parent];
          const at = p.kids.indexOf(id);
          p.kids.splice(at + 1, 0, nid);
          p.keys.splice(at, 0, sep);
          const half = key <= sep ? leaf : tree[nid];
          half.keys = [...half.keys, key].sort((a, b) => a - b);
          snap(id, `The leaf is full: it **splits**. A new leaf gets ${right.join(", ")}, the separator ${sep} goes into node ${parent}, which we still hold, and ${key} goes into its half.`, { hit: key <= sep ? id : nid, split: nid });
        }
        for (const x of held) latches.delete(x);
        rootLatch = null;
        snap(null, `Release the latches. At most ${plural(most, "latch", "latches")} were held at the same time.`);
      }
      if (mode === "find") {
        rootLatch = "S";
        snap(null, `Find ${key}. Take root_latch shared, so that the root cannot change while we latch it.`);
        latches.set("r", "S");
        snap("r", "Latch the root shared.");
        rootLatch = null;
        snap("r", "Now release root_latch.");
        let id = "r";
        while (!isLeaf(id)) {
          const c = childOf(id, key);
          latches.set(c, "S");
          snap(c, `Latch the child ${isLeaf(c) ? "(the leaf)" : c} shared, **before** releasing its parent.`, { both: [id, c] });
          latches.delete(id);
          snap(c, `Release ${id === "r" ? "the root" : `node ${id}`}. Other threads can pass it now.`);
          id = c;
        }
        snap(id, `${key} is in the leaf. Release its latch. Never more than 2 latches at the same time.`, { hit: id });
        latches.delete(id);
        snap(null, "Done: no latch is held.");
      } else if (mode === "pessimistic") {
        pessimistic(`Insert ${key}. `);
      } else {
        rootLatch = "S";
        snap(null, `Optimistic insert of ${key}. Take root_latch shared.`);
        latches.set("r", "S");
        rootLatch = null;
        snap("r", "Latch the root shared, and release root_latch: an insert that does not split changes only the leaf.");
        let id = "r";
        while (!isLeaf(id)) {
          const c = childOf(id, key);
          latches.set(c, isLeaf(c) ? "X" : "S");
          latches.delete(id);
          snap(c, isLeaf(c) ? "The child is the leaf: latch it **exclusively**, and release its parent." : `Latch node ${c} shared, and release its parent.`);
          id = c;
        }
        if (tree[id].keys.length < LC_CAP) {
          tree[id].keys = [...tree[id].keys, key].sort((a, b) => a - b);
          snap(id, `The leaf has room: put ${key} into it.`, { hit: id });
          latches.delete(id);
          snap(null, "Done. Only shared latches above the leaf: other inserts and finds could pass the root at the same time.");
        } else {
          latches.delete(id);
          snap(null, "The leaf is full and would split, but we hold only its latch. Release it and **start again** with exclusive latches.");
          pessimistic("Again, pessimistically. ");
        }
      }
      return fr;
    }
    const ui = frame(fig, { title: "Latch coupling in a B+ tree", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 236;
    const svg = svgBox(ui.stage, W, H, "en-crab");
    const tools = toolbar(ui);
    toggle(tools, "Operation", [["find", "find"], ["pessimistic", "insert, safe nodes"], ["optimistic", "optimistic insert"]], mode, (v) => { mode = v; player.setFrames(make()); });
    toggle(tools, "Leaf", [[false, "has room"], [true, "is full"]], full, (v) => { full = v; player.setFrames(make()); });
    function layout(tree) {
      const leaves = [];
      for (const m of tree.r.kids) for (const l of tree[m].kids) leaves.push(l);
      const pos = {};
      const lw = (W - 20) / leaves.length;
      leaves.forEach((l, i) => { pos[l] = { x: 10 + lw * (i + 0.5), y: 196, w: Math.min(lw - 6, 66) }; });
      for (const m of tree.r.kids) {
        const xs = tree[m].kids.map((l) => pos[l].x);
        pos[m] = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: 112, w: 66 };
      }
      pos.r = { x: W / 2, y: 40, w: 66 };
      return pos;
    }
    const player = new Player(fig, {
      frames: make(), interval: 1500,
      apply: (f) => {
        svg.textContent = "";
        const pos = layout(f.tree);
        for (const id of Object.keys(f.tree)) {
          if (!f.tree[id].kids) continue;
          for (const c of f.tree[id].kids) seg(svg, pos[id].x, pos[id].y + 13, pos[c].x, pos[c].y - 13, "st-edge");
        }
        for (const [id, n] of Object.entries(f.tree)) {
          const p = pos[id];
          const latch = f.latches.get(id);
          rect(svg, p.x - p.w / 2, p.y - 13, p.w, 26, `en-tnode${f.cur === id ? " is-cur" : ""}${f.hit === id ? " is-hit" : ""}${f.split === id ? " is-new" : ""}${latch ? ` has-${latch}` : ""}`, 5);
          label(svg, p.x, p.y, n.keys.join(" "), "en-tnodelbl");
          if (latch) {
            s("circle", { cx: fx(p.x + p.w / 2 - 2), cy: fx(p.y - 13), r: 8, class: `en-latch is-${latch}` }, svg);
            label(svg, p.x + p.w / 2 - 2, p.y - 13, latch, "en-latchlbl");
          }
        }
        rect(svg, W / 2 - 150, 6, 74, 18, `en-rootlatch${f.rootLatch ? ` has-${f.rootLatch}` : ""}`, 4);
        label(svg, W / 2 - 113, 15, `root_latch${f.rootLatch ? ` ${f.rootLatch}` : ""}`, "en-sub");
        label(svg, W - 8, 15, `latches held now: ${f.latches.size}, at most: ${f.most}`, "en-sub", "end");
        ui.setCaption(f.cap);
      },
    });
  });

  /* -------------------------------------------------- the B-link tree */
  register("blink-tree", (fig) => {
    const S0 = { p: [20], leaves: [{ id: "L1", keys: [5, 12, 16, 18], high: 20 }, { id: "L2", keys: [25, 30], high: "∞" }] };
    const S1 = { p: [20], leaves: [{ id: "L1", keys: [5, 12], high: 14 }, { id: "L1′", keys: [16, 18], high: 20, fresh: true }, { id: "L2", keys: [25, 30], high: "∞" }] };
    const S2 = { p: [14, 20], leaves: S1.leaves.map((l) => ({ ...l, fresh: false })) };
    const frames = [
      { st: S0, cap: "A parent and two leaves of a B-link tree. Every leaf has a **high key**, the largest key that it may hold, and a link to its right sibling. A reader looks for **18**." },
      { st: S0, reader: "P", cap: "The reader reads the parent: 18 ≤ 20, so it goes to the first leaf. It releases the parent and holds no latch on the way: it holds one latch at a time." },
      { st: S1, reader: "gap", writer: "L1", cap: "Before the reader arrives, a writer splits the first leaf: 16 and 18 move to a new right sibling, which gets the old high key 20 and the old right link. The old leaf gets the high key 14 and links to the new leaf. The parent does not know about the new leaf yet." },
      { st: S1, reader: "L1", cap: "The reader arrives at its leaf. 18 is not there, but 18 > 14, the high key: the leaf has split since the parent was read." },
      { st: S1, reader: "L1′", move: true, cap: "So the reader **moves right** along the link, and finds 18 in the new leaf. It needed no latch coupling to get there." },
      { st: S2, writer: "P", cap: "Later the writer adds the separator 14 and the new leaf to the parent. New searches go to the right leaf directly." },
    ];
    const ui = frame(fig, { title: "Moving right in a B-link tree", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const W = 640, H = 170;
    const svg = svgBox(ui.stage, W, H, "en-blink");
    new Player(fig, {
      frames, interval: 2600,
      apply: (f) => {
        svg.textContent = "";
        const n = f.st.leaves.length, lw = 150, gap = (W - n * lw) / (n + 1);
        const lx = (i) => gap + i * (lw + gap);
        const px = W / 2 - 60;
        rect(svg, px, 14, 120, 28, `en-tnode${f.reader === "P" ? " is-cur" : ""}${f.writer === "P" ? " has-X" : ""}`, 5);
        label(svg, px + 60, 28, `parent: ${f.st.p.join(" ")}`, "en-tnodelbl");
        const kids = f.st.p.length + 1;
        for (let i = 0; i < kids; i++) {
          const leaf = f.st.p.length === 1 ? (i === 0 ? 0 : n - 1) : i;
          seg(svg, px + 20 + (i * 80) / Math.max(1, kids - 1), 42, lx(leaf) + lw / 2, 88, "st-edge");
        }
        f.st.leaves.forEach((l, i) => {
          const x = lx(i);
          const cur = f.reader === l.id;
          rect(svg, x, 88, lw, 34, `en-tnode${cur ? (f.move ? " is-hit" : " is-cur") : ""}${l.fresh ? " is-new" : ""}${f.writer === l.id ? " has-X" : ""}`, 5);
          label(svg, x + lw / 2 - 18, 105, l.keys.join(" "), "en-tnodelbl");
          rect(svg, x + lw - 40, 92, 34, 26, "en-high", 4);
          label(svg, x + lw - 23, 105, String(l.high), "en-highlbl");
          if (i + 1 < n) arrow(svg, x + lw + 2, 105, lx(i + 1) - 4, 105, `en-link${f.move && i === 0 ? " is-on" : ""}`);
          label(svg, x + lw / 2, 134, l.id, "en-sub");
        });
        label(svg, lx(0), 154, "high key in the box on the right of each leaf", "en-sub", "start");
        if (f.reader === "gap") label(svg, lx(0) + lw / 2, 76, "reader on its way", "en-keylbl");
        ui.setCaption(f.cap);
      },
    });
  });

  /* ---------------------------------------------- version chains */
  // The script: [what, ...]. A version is {v, c, w}: value, commit (0: pending), writer.
  register("mvcc-chains", (fig) => {
    const steps = [];
    const chains = { A: [{ v: 100, c: 1 }], B: [{ v: 50, c: 1 }], C: [{ v: 70, c: 2 }] };
    const txns = [];
    let last = 2;
    const snap = (cap, extra = {}) => steps.push({ chains: JSON.parse(JSON.stringify(chains)), txns: JSON.parse(JSON.stringify(txns)), last, cap, ...extra });
    const txn = (name) => txns.find((t) => t.name === name);
    const begin = (name) => txns.push({ name, snap: last, commit: null });
    const see = (t, k) => {
      for (const v of chains[k]) if (v.c === 0 ? v.w === t.name : v.c <= t.snap) return v;
      return null;
    };
    snap("Three keys with their version chains, newest first. Accounts A and B hold 150 together. The newest commit timestamp is 2.");
    begin("T1");
    snap("T1 begins: its snapshot is 2, the newest commit.", { focus: "T1" });
    chains.A.unshift({ v: 80, c: 0, w: "T1" });
    chains.B.unshift({ v: 70, c: 0, w: "T1" });
    snap("T1 moves 20 from A to B: two **pending** versions at the heads of the chains. Nobody else sees them, and they lock A and B against other writers.", { focus: "T1" });
    begin("T2");
    snap(`T2 begins with snapshot 2, and reads A: the pending 80 is not for it, so it sees **${see(txn("T2"), "A").v}**.`, { focus: "T2", read: ["A"] });
    last = 3;
    chains.A[0].c = 3;
    chains.B[0].c = 3;
    txn("T1").commit = 3;
    snap("T1 commits: timestamp 3 goes to both of its versions, and only then the newest commit becomes 3.", { focus: "T1" });
    begin("T3");
    snap(`T3 begins with snapshot 3, and reads A: **${see(txn("T3"), "A").v}**.`, { focus: "T3", read: ["A"] });
    snap(`T2 reads B: its snapshot is still 2, so it sees **${see(txn("T2"), "B").v}**. T2 sees 100 + 50 and T3 sees 80 + 70: both see 150, one consistent moment each.`, { focus: "T2", read: ["B"] });
    chains.C.unshift({ v: null, c: 0, w: "T3" });
    snap("T3 deletes C: a pending delete.", { focus: "T3" });
    last = 4;
    chains.C[0].c = 4;
    txn("T3").commit = 4;
    snap("T3 commits at 4. A reader with snapshot 4 or later finds no value for C; readers with an older snapshot still see 70.", { focus: "T3" });
    let chosen = null;
    const ui = frame(fig, { title: "Version chains and snapshots", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-chains" });
    ui.stage.appendChild(box);
    const svg = svgBox(ui.stage, 640, 96, "en-txns");
    const tools = toolbar(ui);
    const sl = slider(tools, "Snapshot", { min: 0, max: 4, step: 1, value: 4, format: (v) => (chosen == null ? "–" : String(v)) }, (v) => { chosen = v; player.go(player.i, true); });
    const player = new Player(fig, {
      frames: steps, interval: 2600,
      apply: (f) => {
        box.textContent = "";
        const reader = f.txns.find((t) => t.name === f.focus);
        for (const k of ["A", "B", "C"]) {
          const vis = (t) => { for (const v of f.chains[k]) if (v.c === 0 ? t && v.w === t.name : t && v.c <= t.snap) return v; return null; };
          const seen = chosen != null ? vis({ name: "", snap: chosen }) : f.read && f.read.includes(k) ? vis(reader) : null;
          box.append(cells(f.chains[k].map((v) => (v.c === 0 ? `${v.v == null ? "del" : v.v} pending ${v.w}` : `${v.v == null ? "del" : v.v} @${v.c}`)), (i) => {
            const v = f.chains[k][i];
            return `${v === seen ? "is-hit" : v.c === 0 ? "is-pending" : ""}`;
          }, `key ${k}`));
        }
        svg.textContent = "";
        const X = (t) => 70 + t * 120;
        for (let t = 0; t <= 4; t++) { seg(svg, X(t), 10, X(t), 74, "en-grid"); label(svg, X(t), 86, String(t), "st-tick"); }
        label(svg, 8, 86, "time", "st-tick", "start");
        f.txns.forEach((t, i) => {
          const y = 12 + i * 20, end = t.commit ?? f.last + 0.6;
          rect(svg, X(t.snap), y, X(end) - X(t.snap), 15, `en-tbar${t.name === f.focus ? " is-cur" : ""}${t.commit ? " is-done" : ""}`, 3);
          label(svg, X(t.snap) - 6, y + 7.5, t.name, "st-tick", "end");
        });
        if (chosen != null) seg(svg, X(chosen), 6, X(chosen), 78, "en-keyline");
        ui.setCaption(chosen != null ? `${f.cap} The slider shows what a reader with snapshot **${chosen}** sees (green).` : f.cap);
        sl.setValue(chosen ?? 4);
      },
    });
  });

  /* ------------------------------------------------ first updater wins */
  register("first-updater", (fig) => {
    let scene = 1;
    function make() {
      const fr = [];
      if (scene === 1) {
        fr.push({ chain: ["900 @4"], a: "begin, snapshot 4", b: "begin, snapshot 4", cap: "Account 1 holds 900, committed at 4. A and B both begin with snapshot 4." });
        fr.push({ chain: ["800 pending A", "900 @4"], a: "write 800", b: "", hot: 0, cap: "A writes 800: a pending version at the head of the chain. It locks the key." });
        fr.push({ chain: ["800 pending A", "900 @4"], a: "", b: "write 1000: **fails**", bad: "b", cap: "B tries to write 1000. The head of the chain is pending, written by another transaction: the write fails, and B must abort. Without this rule, one of the two changes would be lost." });
        fr.push({ chain: ["800 @5", "900 @4"], a: "commit at 5", b: "abort", cap: "A commits at 5. B aborts, and the client can start it again with a new snapshot." });
      } else {
        fr.push({ chain: ["900 @4"], a: "begin, snapshot 4", b: "begin, snapshot 4", cap: "The same start: both transactions have snapshot 4." });
        fr.push({ chain: ["800 pending A", "900 @4"], a: "write 800", b: "", cap: "A writes 800." });
        fr.push({ chain: ["800 @5", "900 @4"], a: "commit at 5", b: "", cap: "A commits at 5, before B writes anything." });
        fr.push({ chain: ["800 @5", "900 @4"], a: "", b: "write 1000: **fails**", bad: "b", cap: "Now B writes. Nothing is pending, but the newest version committed at 5, after B's snapshot 4. B read 900 and would overwrite 800 without knowing it: the write fails, and B aborts. First updater wins." });
      }
      return fr;
    }
    const ui = frame(fig, { title: "First updater wins", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-chains" });
    ui.stage.appendChild(box);
    const tools = toolbar(ui);
    toggle(tools, "Case", [[1, "a pending version"], [2, "a newer commit"]], scene, (v) => { scene = v; player.setFrames(make()); });
    const player = new Player(fig, {
      frames: make(), interval: 2400,
      apply: (f) => {
        box.textContent = "";
        box.append(cells(f.chain, (i) => (f.chain[i].includes("pending") ? "is-pending" : i === 0 ? "is-hit" : ""), "account 1"));
        box.append(cells([f.a ? f.a.replace(/\*\*/g, "") : "–"], () => (f.a ? "is-cur" : "is-dim"), "A"));
        box.append(cells([f.b ? f.b.replace(/\*\*/g, "") : "–"], () => (f.bad === "b" ? "is-bad" : f.b ? "is-cur" : "is-dim"), "B"));
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------ garbage collection */
  register("mvcc-gc", (fig) => {
    const CH = { k1: [9, 7, 5, 2], k2: [8, 3, 1], k3: [6, 4], k4: [10, 2, 1] };  // commit timestamps, newest first
    const DEL = { k3: 6 };  // k3 was deleted at 6
    function make() {
      const fr = [];
      let chains = JSON.parse(JSON.stringify(CH));
      let active = [3, 6, 8];
      const freed = [];
      const snap = (cap, extra = {}) => fr.push({ chains: JSON.parse(JSON.stringify(chains)), active: [...active], wm: Math.min(...active), freed: [...freed], cap, ...extra });
      snap("Four version chains (commit timestamps, newest first) and three active transactions with the snapshots 3, 6 and 8. The **watermark** is the oldest snapshot: 3.");
      const round = (label2) => {
        const wm = Math.min(...active);
        for (const k of Object.keys(chains)) {
          const c = chains[k];
          const i = c.findIndex((t) => t <= wm);
          if (i < 0 || i === c.length - 1) { snap(`${k}: ${i < 0 ? "every version is newer than the watermark" : `the oldest version, ${c[i]}, is the newest at or below ${wm}`}: nothing to free.`, { key: k }); continue; }
          const gone = c.slice(i + 1);
          freed.push(...gone.map((t) => `${k}@${t}`));
          chains[k] = c.slice(0, i + 1);
          snap(`${k}: ${c[i]} is the newest version at or below the watermark ${wm}: every reader sees it or something newer. Free ${gone.join(" and ")}.`, { key: k });
        }
        const k3 = chains.k3;
        if (k3 && k3.length === 1 && DEL.k3 === k3[0] && k3[0] <= Math.min(...active)) {
          delete chains.k3;
          freed.push("k3@6");
          snap(`${label2}k3 is left with only its delete at 6, at or below the watermark: no reader sees a value of k3. The key goes.`, { key: "k3" });
        }
      };
      round("");
      active = [6, 8];
      snap("The transaction with snapshot 3 commits. The watermark moves to **6**.");
      round("");
      snap(`Freed: ${freed.length} versions. A long transaction keeps the watermark back; this is why one forgotten transaction makes a PostgreSQL table grow.`);
      return fr;
    }
    const ui = frame(fig, { title: "Garbage collection under the watermark", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-chains" });
    ui.stage.appendChild(box);
    const svg = svgBox(ui.stage, 640, 54, "en-txns");
    new Player(fig, {
      frames: make(), interval: 2100,
      apply: (f) => {
        box.textContent = "";
        for (const k of Object.keys(CH)) {
          const c = f.chains[k];
          const all = CH[k];
          box.append(cells(all.map((t) => (DEL[k] === t ? `del @${t}` : `@${t}`)), (i) => {
            const t = all[i];
            if (!c || !c.includes(t)) return "is-gone";
            return t <= f.wm && c.indexOf(t) === c.findIndex((x) => x <= f.wm) ? "is-hit" : f.key === k ? "is-cur" : "";
          }, k));
        }
        svg.textContent = "";
        const X = (t) => 40 + t * 56;
        seg(svg, X(0), 22, X(10.5), 22, "en-axisline");
        for (let t = 0; t <= 10; t++) label(svg, X(t), 38, String(t), "st-tick");
        f.active.forEach((t) => { s("circle", { cx: fx(X(t)), cy: 22, r: 6, class: "en-snapdot" }, svg); });
        seg(svg, X(f.wm), 6, X(f.wm), 30, "en-wm");
        label(svg, X(f.wm), 50, `watermark ${f.wm}`, "en-validlbl");
        ui.setCaption(f.cap);
      },
    });
  });

  /* ------------------------------------------------------- write skew */
  register("write-skew", (fig) => {
    const frames = [
      { alice: [1], bob: [1], ta: "", tb: "", cap: "Rule: at least one doctor is on call. Both are on call now (1), committed at 7." },
      { alice: [1], bob: [1], ta: "begin, snapshot 7", tb: "begin, snapshot 7", cap: "Alice and Bob each start a transaction at the same time: both have snapshot 7." },
      { alice: [1], bob: [1], ta: "read bob_on_call: 1", tb: "read alice_on_call: 1", cap: "Each reads the other doctor's key in its snapshot: the other one is on call, so it seems safe to leave." },
      { alice: ["0 pending A", 1], bob: ["0 pending B", 1], ta: "write alice_on_call = 0", tb: "write bob_on_call = 0", cap: "Each writes its own key. They write **different** keys, so first updater wins sees no conflict." },
      { alice: ["0 @8", 1], bob: ["0 @9", 1], ta: "commit at 8", tb: "commit at 9", bad: true, cap: "Both commit. Now **nobody** is on call: the rule is broken. In any serial order, the second transaction would have seen that the first doctor left, and it would have stayed. This is **write skew**: snapshot isolation allows it, serializable isolation does not." },
    ];
    const ui = frame(fig, { title: "Write skew", kicker: "Animation" });
    ui.stage.classList.add("is-plain");
    const box = h("div", { class: "en-chains" });
    ui.stage.appendChild(box);
    new Player(fig, {
      frames, interval: 2600,
      apply: (f) => {
        box.textContent = "";
        const show = (v) => (typeof v === "number" ? `${v} @7` : v);
        box.append(cells(f.alice.map(show), (i) => (String(f.alice[i]).includes("pending") ? "is-pending" : i === 0 ? (f.bad ? "is-bad" : "is-hit") : ""), "alice_on_call"));
        box.append(cells(f.bob.map(show), (i) => (String(f.bob[i]).includes("pending") ? "is-pending" : i === 0 ? (f.bad ? "is-bad" : "is-hit") : ""), "bob_on_call"));
        box.append(cells([f.ta || "–"], () => (f.ta ? "is-cur" : "is-dim"), "Alice"));
        box.append(cells([f.tb || "–"], () => (f.tb ? "is-cur" : "is-dim"), "Bob"));
        ui.setCaption(f.cap);
      },
    });
  });
})();
