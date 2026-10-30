/* Interactive figure engine.
   - Scene: SVG nodes/edges/marks keyed by id; position changes are tweened and
     edges follow their end points, so structures can be re-laid out smoothly.
   - Player: steps through precomputed frames (play, pause, step, scrub, speed).
   - Panels: Python code with the current line highlighted, program output and
     variable chips.
   Visualizations register themselves with TiraViz.register(name, setup) in the
   other viz-*.js files; figures are mounted lazily when they near the viewport. */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const registry = Object.create(null);

  /* ------------------------------------------------------------- helpers */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  function s(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Captions: **bold** and `code`, everything else escaped.
  const rich = (t) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fmt = (v) => {
    if (v === Infinity) return "∞";
    if (v === -Infinity) return "-∞";
    if (Array.isArray(v)) return `[${v.map(fmt).join(", ")}]`;
    if (v && typeof v === "object" && !(v instanceof Set)) return `{${Object.entries(v).map(([k, x]) => `${k}: ${fmt(x)}`).join(", ")}}`;
    if (v instanceof Set) {
      // CPython prints a set of small integers in ascending order.
      const xs = [...v];
      if (xs.every((x) => typeof x === "number")) xs.sort((a, b) => a - b);
      return xs.length ? `{${xs.map(fmt).join(", ")}}` : "set()";
    }
    return String(v);
  };

  /* --------------------------------------------------------------- Scene */
  class Scene {
    constructor(parent, { w = 400, h = 260, r = 19, className = "" } = {}) {
      this.w = w;
      this.h = h;
      this.r = r;
      this.svg = s("svg", { viewBox: `0 0 ${w} ${h}`, class: `vz-svg ${className}`, "aria-hidden": "true", focusable: "false" });
      // Scale small diagrams up at most 1.35× so that labels stay at a readable, consistent size.
      this.svg.style.maxWidth = `${Math.round(w * 1.35)}px`;
      this.gUnder = s("g", { class: "vz-under" }, this.svg);
      this.gEdges = s("g", { class: "vz-edges" }, this.svg);
      this.gNodes = s("g", { class: "vz-nodes" }, this.svg);
      this.gOver = s("g", { class: "vz-over" }, this.svg);
      parent.appendChild(this.svg);
      this.nodes = new Map();
      this.edges = new Map();
      this.marks = new Map();
      this.duration = 480;
      this.raf = 0;
      this.onNodeClick = null;
      this.svg.addEventListener("click", (e) => {
        const g = e.target.closest(".vz-node");
        if (g && this.onNodeClick) this.onNodeClick(g.dataset.id, e);
      });
    }

    resize(w, h) {
      this.w = w;
      this.h = h;
      this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }

    /* state = { nodes: [...], edges: [...], marks: [...] } */
    set(state, instant = false) {
      const seenN = new Set();
      for (const spec of state.nodes || []) {
        const id = String(spec.id);
        seenN.add(id);
        let o = this.nodes.get(id);
        if (!o) {
          o = this.makeNode(id);
          o.x = spec.x;
          o.y = spec.y;
          this.nodes.set(id, o);
          if (!instant) {
            o.g.classList.add("vz-enter");
            setTimeout(() => o.g.classList.remove("vz-enter"), 420);
          }
        } else if (o.leaving) {
          o.leaving = false;
          clearTimeout(o.leaveTimer);
          o.g.classList.remove("vz-exit");
        }
        o.fx = o.x;
        o.fy = o.y;
        o.tx = spec.x;
        o.ty = spec.y;
        this.updateNode(o, spec);
      }
      for (const [id, o] of this.nodes) {
        if (seenN.has(id) || o.leaving) continue;
        this.leave(o, () => this.nodes.delete(id));
      }

      const seenE = new Set();
      for (const spec of state.edges || []) {
        const id = String(spec.id != null ? spec.id : `${spec.a}-${spec.b}`);
        seenE.add(id);
        let o = this.edges.get(id);
        if (!o) {
          o = this.makeEdge(id);
          this.edges.set(id, o);
          if (!instant) {
            o.g.classList.add("vz-enter");
            setTimeout(() => o.g.classList.remove("vz-enter"), 420);
          }
        } else if (o.leaving) {
          o.leaving = false;
          clearTimeout(o.leaveTimer);
          o.g.classList.remove("vz-exit");
        }
        this.updateEdge(o, spec);
      }
      for (const [id, o] of this.edges) {
        if (seenE.has(id) || o.leaving) continue;
        this.leave(o, () => this.edges.delete(id));
      }

      const seenM = new Set();
      for (const spec of state.marks || []) {
        const id = String(spec.id);
        seenM.add(id);
        let o = this.marks.get(id);
        if (!o || o.type !== spec.type) {
          if (o) o.el.remove();
          o = this.makeMark(spec);
          this.marks.set(id, o);
        }
        o.spec = spec;
        this.styleMark(o);
      }
      for (const [id, o] of this.marks) {
        if (seenM.has(id)) continue;
        o.el.remove();
        this.marks.delete(id);
      }

      this.animate(instant || reduced.matches ? 0 : this.duration);
    }

    leave(o, done) {
      o.leaving = true;
      o.g.classList.add("vz-exit");
      o.leaveTimer = setTimeout(() => {
        o.g.remove();
        done();
      }, 300);
    }

    makeNode(id) {
      const g = s("g", { class: "vz-node", "data-id": id }, this.gNodes);
      return { id, g, shape: null, shapeKind: null, label: null, sub: null, badge: null, x: 0, y: 0 };
    }

    updateNode(o, n) {
      const kind = n.shape || "circle";
      const r = n.r || this.r;
      if (o.shapeKind !== kind) {
        if (o.shape) o.shape.remove();
        o.shape = s(kind === "rect" ? "rect" : kind === "tri" ? "path" : "circle", { class: "vz-shape" });
        o.g.insertBefore(o.shape, o.g.firstChild);
        o.shapeKind = kind;
      }
      if (kind === "rect") {
        const w = n.w || 2 * r;
        const hh = n.h || 2 * r;
        o.shape.setAttribute("x", -w / 2);
        o.shape.setAttribute("y", -hh / 2);
        o.shape.setAttribute("width", w);
        o.shape.setAttribute("height", hh);
        o.shape.setAttribute("rx", n.rx != null ? n.rx : 7);
      } else if (kind === "tri") {
        const w = n.w || 34;
        const hh = n.h || 36;
        o.shape.setAttribute("d", `M0 ${-hh / 2}L${w / 2} ${hh / 2}H${-w / 2}Z`);
      } else {
        o.shape.setAttribute("r", r);
      }
      o.r = r;
      o.w = n.w || 2 * r;
      o.h = n.h || 2 * r;
      o.kind = kind;
      o.g.setAttribute("class", `vz-node ${n.cls || ""}${n.click ? " is-clickable" : ""}`);
      if (n.pop) {
        o.g.classList.remove("vz-pop");
        requestAnimationFrame(() => o.g.classList.add("vz-pop"));
      }

      const label = n.label == null ? "" : String(n.label);
      if (!o.label) o.label = s("text", { class: "vz-label" }, o.g);
      if (o.label.textContent !== label) o.label.textContent = label;
      o.label.setAttribute("y", kind === "tri" ? 5 : 0);

      if (n.sub != null && n.sub !== "") {
        if (!o.sub) o.sub = s("text", { class: "vz-sub" }, o.g);
        o.sub.textContent = String(n.sub);
        const pos = n.subPos || "below";
        const off = (kind === "rect" ? (n.h || 2 * r) / 2 : r) + 11;
        const sideOff = (kind === "rect" ? (n.w || 2 * r) / 2 : r) + 8;
        o.sub.setAttribute("x", pos === "right" ? sideOff : pos === "left" ? -sideOff : 0);
        o.sub.setAttribute("y", pos === "above" ? -off : pos === "below" ? off : 0);
        o.sub.style.textAnchor = pos === "right" ? "start" : pos === "left" ? "end" : "middle";
        o.sub.setAttribute("class", `vz-sub${n.subCls ? " " + n.subCls : ""}`);
      } else if (o.sub) {
        o.sub.remove();
        o.sub = null;
      }

      if (n.badge != null && n.badge !== "") {
        if (!o.badge) {
          o.badge = s("g", { class: "vz-badge" }, o.g);
          s("circle", { r: 9 }, o.badge);
          s("text", {}, o.badge);
        }
        o.badge.setAttribute("class", `vz-badge${n.badgeCls ? " " + n.badgeCls : ""}`);
        o.badge.lastChild.textContent = String(n.badge);
        const bx = kind === "rect" ? (n.w || 2 * r) / 2 - 2 : r * 0.78;
        const by = kind === "rect" ? -(n.h || 2 * r) / 2 + 2 : -r * 0.78;
        o.badge.setAttribute("transform", `translate(${bx} ${by})`);
      } else if (o.badge) {
        o.badge.remove();
        o.badge = null;
      }
      if (n.title) {
        let t = o.g.querySelector("title");
        if (!t) t = s("title", {}, o.g);
        t.textContent = n.title;
      }
    }

    makeEdge(id) {
      const g = s("g", { class: "vz-edge", "data-id": id }, this.gEdges);
      const line = s("path", { class: "vz-line" }, g);
      return { id, g, line, head: null, label: null };
    }

    updateEdge(o, e) {
      o.spec = e;
      o.g.setAttribute("class", `vz-edge ${e.cls || ""}`);
      if (e.dir && !o.head) o.head = s("path", { class: "vz-head" }, o.g);
      if (!e.dir && o.head) {
        o.head.remove();
        o.head = null;
      }
      const text = e.label == null ? "" : String(e.label);
      if (text) {
        if (!o.label) {
          o.label = s("g", { class: "vz-elabel" }, o.g);
          s("rect", { rx: 6 }, o.label);
          s("text", {}, o.label);
        }
        const t = o.label.lastChild;
        if (t.textContent !== text) {
          if (t.textContent) {
            o.label.classList.remove("is-bump");
            requestAnimationFrame(() => o.label && o.label.classList.add("is-bump"));
          }
          t.textContent = text;
        }
        o.label.classList.toggle("is-bare", !!e.bare);
        const w = Math.max(18, text.length * 7.1 + 10);
        const rect = o.label.firstChild;
        rect.setAttribute("x", -w / 2);
        rect.setAttribute("y", -9.5);
        rect.setAttribute("width", w);
        rect.setAttribute("height", 19);
      } else if (o.label) {
        o.label.remove();
        o.label = null;
      }
    }

    makeMark(spec) {
      let el;
      if (spec.type === "hull" || spec.type === "rect") el = s("rect", {}, spec.over ? this.gOver : this.gUnder);
      else if (spec.type === "text") el = s("text", {}, this.gOver);
      else if (spec.type === "line") el = s("path", {}, spec.under ? this.gUnder : this.gOver);
      else if (spec.type === "cross") el = s("path", { class: "vz-cross" }, this.gOver);
      else el = s("g", {}, this.gOver);
      return { type: spec.type, el, spec };
    }

    styleMark(o) {
      const m = o.spec;
      if (m.type === "hull") o.el.setAttribute("class", `vz-hull ${m.cls || ""}`);
      else if (m.type === "rect") o.el.setAttribute("class", `vz-rect ${m.cls || ""}`);
      else if (m.type === "text") {
        o.el.setAttribute("class", `vz-text ${m.cls || ""}`);
        if (o.el.textContent !== String(m.text)) o.el.textContent = String(m.text);
        o.el.style.textAnchor = m.anchor || "middle";
      } else if (m.type === "line") o.el.setAttribute("class", `vz-line-mark ${m.cls || ""}`);
    }

    nodePos(id) {
      const o = this.nodes.get(String(id));
      return o ? { x: o.x, y: o.y, o } : null;
    }

    // distance from a node centre to its outline in direction (ux, uy)
    static reach(o, ux, uy) {
      if (!o) return 0;
      if (o.kind === "rect") {
        const hw = o.w / 2;
        const hh = o.h / 2;
        const ax = Math.abs(ux) < 1e-9 ? Infinity : hw / Math.abs(ux);
        const ay = Math.abs(uy) < 1e-9 ? Infinity : hh / Math.abs(uy);
        return Math.min(ax, ay);
      }
      if (o.kind === "tri") return 16;
      return o.r;
    }

    drawEdges() {
      for (const o of this.edges.values()) {
        const e = o.spec;
        const A = this.nodes.get(String(e.a));
        const B = this.nodes.get(String(e.b));
        if (!A || !B) continue;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const bend = e.bend || 0;
        const cx = (A.x + B.x) / 2 + nx * bend * L;
        const cy = (A.y + B.y) / 2 + ny * bend * L;
        let ux = cx - A.x;
        let uy = cy - A.y;
        let ul = Math.hypot(ux, uy) || 1;
        ux /= ul;
        uy /= ul;
        let vx = cx - B.x;
        let vy = cy - B.y;
        let vl = Math.hypot(vx, vy) || 1;
        vx /= vl;
        vy /= vl;
        const ra = Scene.reach(A, ux, uy) + (e.padA || 0);
        const rb = Scene.reach(B, vx, vy) + (e.dir ? 3 : 0) + (e.padB || 0);
        const S = { x: A.x + ux * ra, y: A.y + uy * ra };
        const E = { x: B.x + vx * rb, y: B.y + vy * rb };
        o.line.setAttribute("d", bend ? `M${S.x} ${S.y}Q${cx} ${cy} ${E.x} ${E.y}` : `M${S.x} ${S.y}L${E.x} ${E.y}`);
        if (o.head) {
          const tx = -vx;
          const ty = -vy;
          const bx = E.x - tx * 10;
          const by = E.y - ty * 10;
          o.head.setAttribute("d", `M${E.x} ${E.y}L${bx + ty * 5} ${by - tx * 5}L${bx - ty * 5} ${by + tx * 5}Z`);
        }
        if (o.label) {
          const t = e.lpos != null ? e.lpos : 0.5;
          const px = (1 - t) * (1 - t) * S.x + 2 * (1 - t) * t * cx + t * t * E.x;
          const py = (1 - t) * (1 - t) * S.y + 2 * (1 - t) * t * cy + t * t * E.y;
          const off = e.loff || 0;
          o.label.setAttribute("transform", `translate(${px + nx * off} ${py + ny * off})`);
        }
      }
    }

    drawMarks() {
      for (const o of this.marks.values()) {
        const m = o.spec;
        if (m.type === "hull") {
          const pts = (m.nodes || []).map((id) => this.nodes.get(String(id))).filter(Boolean);
          if (!pts.length) continue;
          const pad = m.pad != null ? m.pad : 14;
          const xs = pts.map((p) => p.x);
          const ys = pts.map((p) => p.y);
          const r = pts[0].kind === "rect" ? Math.max(pts[0].w, pts[0].h) / 2 : pts[0].r;
          const x = Math.min(...xs) - r - pad;
          const y = Math.min(...ys) - r - pad;
          o.el.setAttribute("x", x);
          o.el.setAttribute("y", y);
          o.el.setAttribute("width", Math.max(...xs) - Math.min(...xs) + 2 * (r + pad));
          o.el.setAttribute("height", Math.max(...ys) - Math.min(...ys) + 2 * (r + pad));
          o.el.setAttribute("rx", m.rx != null ? m.rx : 16);
        } else if (m.type === "rect") {
          o.el.setAttribute("x", m.x);
          o.el.setAttribute("y", m.y);
          o.el.setAttribute("width", m.w);
          o.el.setAttribute("height", m.h);
          o.el.setAttribute("rx", m.rx != null ? m.rx : 6);
        } else if (m.type === "text") {
          let x = m.x;
          let y = m.y;
          if (m.at != null) {
            const p = this.nodes.get(String(m.at));
            if (p) {
              x = p.x + (m.dx || 0);
              y = p.y + (m.dy || 0);
            }
          }
          o.el.setAttribute("x", x);
          o.el.setAttribute("y", y);
        } else if (m.type === "line") {
          o.el.setAttribute("d", m.d || `M${m.x1} ${m.y1}L${m.x2} ${m.y2}`);
        } else if (m.type === "cross") {
          let x = m.x;
          let y = m.y;
          if (m.edge) {
            const eo = this.edges.get(String(m.edge));
            if (eo) {
              const len = eo.line.getTotalLength ? eo.line.getTotalLength() : 0;
              if (len) {
                const p = eo.line.getPointAtLength(len / 2);
                x = p.x;
                y = p.y;
              }
            }
          }
          const k = m.size || 8;
          o.el.setAttribute("d", `M${x - k} ${y - k}L${x + k} ${y + k}M${x + k} ${y - k}L${x - k} ${y + k}`);
        }
      }
    }

    place() {
      for (const o of this.nodes.values()) o.g.setAttribute("transform", `translate(${o.x} ${o.y})`);
      this.drawEdges();
      this.drawMarks();
    }

    animate(duration) {
      cancelAnimationFrame(this.raf);
      if (!duration) {
        for (const o of this.nodes.values()) {
          if (o.tx != null) {
            o.x = o.tx;
            o.y = o.ty;
          }
        }
        this.place();
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const k = ease(t);
        for (const o of this.nodes.values()) {
          if (o.tx == null) continue;
          o.x = o.fx + (o.tx - o.fx) * k;
          o.y = o.fy + (o.ty - o.fy) * k;
        }
        this.place();
        if (t < 1) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
  }

  /* -------------------------------------------------------------- Panels */
  const PY_KW = /\b(def|return|for|in|if|elif|else|while|not|and|or|is|None|True|False|class|import|from|break|continue|lambda|pass|global|with|as)\b/;

  function highlightPython(line) {
    let out = "";
    let rest = line;
    const rules = [
      [/^#.*/, "t-c"],
      [/^("[^"]*"|'[^']*')/, "t-s"],
      [/^\b\d+(\.\d+)?\b/, "t-n"],
      [new RegExp("^" + PY_KW.source), "t-k"],
      [/^\b(len|range|print|min|max|sum|sorted|abs|enumerate|any|set|list|dict|float|str|int|self|heapq|reversed)\b/, "t-b"],
      [/^[A-Za-z_]\w*(?=\()/, "t-f"],
    ];
    while (rest.length) {
      let matched = false;
      for (const [re, cls] of rules) {
        const m = re.exec(rest);
        if (m && m.index === 0 && m[0].length) {
          out += `<span class="${cls}">${esc(m[0])}</span>`;
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        const m = /^[A-Za-z_]\w*|^./.exec(rest);
        out += esc(m[0]);
        rest = rest.slice(m[0].length);
      }
    }
    return out;
  }

  class CodePanel {
    constructor(parent, code, title = "python") {
      this.el = h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: title }), h("span", { text: "koodi" })));
      this.pre = h("pre", { class: "viz-code" });
      this.lines = code.replace(/\n$/, "").split("\n").map((ln) => {
        const el = h("span", { class: "ln", html: highlightPython(ln) || " " });
        this.pre.appendChild(el);
        return el;
      });
      this.el.appendChild(this.pre);
      // Long code lines get the full width of the figure instead of a column.
      if (Math.max(...code.split("\n").map((ln) => ln.length)) > 44) this.el.classList.add("is-wide");
      parent.appendChild(this.el);
    }
    set(lines) {
      const want = new Set([].concat(lines || []));
      this.lines.forEach((el, i) => el.classList.toggle("is-hl", want.has(i + 1)));
      const first = this.lines[[...want][0] - 1];
      if (first) {
        const top = first.offsetTop - this.pre.clientHeight / 2;
        if (first.offsetTop < this.pre.scrollTop || first.offsetTop > this.pre.scrollTop + this.pre.clientHeight - 20) this.pre.scrollTop = top;
      }
    }
  }

  class OutputPanel {
    constructor(parent, title = "Tuloste") {
      this.el = h("div", { class: "viz-panel is-term" }, h("div", { class: "viz-panel-head" }, h("span", { text: title }), h("span", { text: "print" })));
      this.box = h("div", { class: "viz-out" });
      this.el.appendChild(this.box);
      parent.appendChild(this.el);
      this.count = -1;
    }
    set(lines) {
      lines = lines || [];
      if (lines.length === this.count && this.box.childElementCount) return;
      const grew = lines.length > this.count;
      this.box.textContent = "";
      if (!lines.length) this.box.appendChild(h("span", { class: "o-empty", text: "(ei vielä tulostusta)" }));
      lines.forEach((ln, i) => this.box.appendChild(h("span", { class: `o-line${grew && i === lines.length - 1 && this.count >= 0 ? " is-new" : ""}`, text: ln })));
      this.count = lines.length;
      this.box.scrollTop = this.box.scrollHeight;
    }
  }

  class VarsPanel {
    constructor(parent, title = "Muuttujat") {
      this.el = h("div", { class: "viz-panel" }, h("div", { class: "viz-panel-head" }, h("span", { text: title })));
      this.box = h("div", { class: "viz-vars" });
      this.el.appendChild(this.box);
      parent.appendChild(this.el);
    }
    set(items) {
      this.box.textContent = "";
      for (const it of items || []) {
        this.box.appendChild(h("span", { class: `viz-var${it.cls ? " is-" + it.cls : ""}` }, h("b", { text: it.k }), h("span", { text: typeof it.v === "string" ? it.v : fmt(it.v) })));
      }
    }
  }

  /* -------------------------------------------------------------- Player */
  class Player {
    constructor(fig, { frames, apply, interval = 1150, autoplay = false, loop = false }) {
      this.fig = fig;
      this.apply = apply;
      this.interval = interval;
      this.loop = loop;
      this.speeds = [0.5, 1, 2, 4];
      this.speedIdx = 1;
      this.i = 0;
      this.timer = 0;
      this.playing = false;
      this.bar = h("div", { class: "viz-bar" });
      this.btnReset = h("button", { type: "button", class: "viz-btn", "aria-label": "Alkuun", title: "Alkuun (Home)", html: icon("reset") });
      this.btnPrev = h("button", { type: "button", class: "viz-btn", "aria-label": "Edellinen vaihe", title: "Edellinen (←)", html: icon("prev") });
      this.btnPlay = h("button", { type: "button", class: "viz-btn is-play", "aria-label": "Toista", title: "Toista / tauko (välilyönti)", html: icon("play") });
      this.btnNext = h("button", { type: "button", class: "viz-btn", "aria-label": "Seuraava vaihe", title: "Seuraava (→)", html: icon("next") });
      this.range = h("input", { type: "range", class: "viz-range", min: 0, max: 0, step: 1, value: 0, "aria-label": "Vaihe" });
      this.count = h("span", { class: "viz-count" });
      this.btnSpeed = h("button", { type: "button", class: "viz-btn is-text", "aria-label": "Nopeus", title: "Toistonopeus", text: "1×" });
      this.bar.append(this.btnReset, this.btnPrev, this.btnPlay, this.btnNext, this.range, this.count, this.btnSpeed);
      fig.appendChild(this.bar);

      this.touched = false;
      this.bar.addEventListener("pointerdown", () => { this.touched = true; });
      this.btnReset.addEventListener("click", () => { this.pause(); this.go(0); });
      this.btnPrev.addEventListener("click", () => { this.pause(); this.go(this.i - 1); });
      this.btnNext.addEventListener("click", () => { this.pause(); this.go(this.i + 1); });
      this.btnPlay.addEventListener("click", () => this.toggle());
      this.btnSpeed.addEventListener("click", () => {
        this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
        this.btnSpeed.textContent = `${this.speeds[this.speedIdx]}×`.replace("0.5", "½");
        if (this.playing) this.schedule();
      });
      this.range.addEventListener("input", () => { this.pause(); this.go(+this.range.value); });
      this.onKey = (e) => {
        if (e.target.closest("input:not([type=range]), textarea, select")) return;
        if (["ArrowRight", "ArrowLeft", " ", "Home", "End"].includes(e.key)) this.touched = true;
        if (e.key === "ArrowRight") { e.preventDefault(); this.pause(); this.go(this.i + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); this.pause(); this.go(this.i - 1); }
        else if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); this.toggle(); }
        else if (e.key === "Home") { e.preventDefault(); this.pause(); this.go(0); }
        else if (e.key === "End") { e.preventDefault(); this.pause(); this.go(this.frames.length - 1); }
      };
      fig.addEventListener("keydown", this.onKey);
      this.autoplay = autoplay;
      this.setFrames(frames);
    }

    setFrames(frames, keep = false) {
      this.pause();
      this.frames = frames;
      this.range.max = Math.max(0, frames.length - 1);
      this.go(keep ? Math.min(this.i, frames.length - 1) : 0, true);
    }

    go(i, instant = false) {
      const n = this.frames.length;
      if (!n) return;
      i = Math.max(0, Math.min(n - 1, i));
      const changed = i !== this.i;
      this.i = i;
      this.apply(this.frames[i], i, instant || !changed);
      this.range.value = i;
      this.range.style.setProperty("--p", n > 1 ? `${(i / (n - 1)) * 100}%` : "0%");
      this.count.textContent = `${i + 1} / ${n}`;
      this.btnPrev.disabled = i === 0;
      this.btnNext.disabled = i === n - 1;
      this.btnReset.disabled = i === 0;
    }

    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        if (this.i >= this.frames.length - 1) {
          if (this.loop) this.go(0); else { this.pause(); return; }
        } else this.go(this.i + 1);
        this.schedule();
      }, this.interval / this.speeds[this.speedIdx]);
    }

    play() {
      if (this.frames.length < 2) return;
      if (this.i >= this.frames.length - 1) this.go(0);
      this.playing = true;
      this.btnPlay.innerHTML = icon("pause");
      this.btnPlay.setAttribute("aria-label", "Tauko");
      this.schedule();
    }

    pause() {
      this.playing = false;
      clearTimeout(this.timer);
      this.btnPlay.innerHTML = icon("play");
      this.btnPlay.setAttribute("aria-label", "Toista");
    }

    toggle() {
      if (this.playing) this.pause(); else this.play();
    }

    // Starts playback once when the figure scrolls into view, unless the reader
    // has already used the controls or prefers reduced motion.
    playWhenVisible(delay = 600, threshold = 0.55) {
      if (reduced.matches || !("IntersectionObserver" in window)) return;
      const io = new IntersectionObserver((es) => {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        setTimeout(() => { if (!this.touched && !this.playing) this.play(); }, delay);
      }, { threshold });
      io.observe(this.fig);
    }

    destroy() {
      this.pause();
      this.fig.removeEventListener("keydown", this.onKey);
      this.bar.remove();
    }
  }

  /* ---------------------------------------------------- Figure scaffolding */
  // Creates the standard figure layout and returns handles to its parts.
  function frame(fig, { title, kicker = "Interaktiivinen", split = false, tabs = null, tab = null, onTab = null }) {
    fig.classList.add("is-ready");
    fig.tabIndex = 0;
    const head = h("div", { class: "viz-head" },
      h("span", { class: "viz-kicker", html: `${icon("spark")}${esc(kicker)}` }),
      h("span", { class: "viz-title", text: title || "" }));
    let tabButtons = [];
    if (tabs && tabs.length > 1) {
      const box = h("div", { class: "viz-tabs", role: "tablist", "aria-label": "Näkymä" });
      tabButtons = tabs.map(([key, label]) => {
        const b = h("button", { type: "button", class: "viz-tab", role: "tab", "aria-selected": String(key === tab), text: label });
        b.addEventListener("click", () => {
          tabButtons.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
          if (onTab) onTab(key);
        });
        box.appendChild(b);
        return b;
      });
      head.appendChild(box);
    }
    const main = h("div", { class: `viz-main${split ? " is-split" : ""}` });
    const stage = h("div", { class: "viz-stage" });
    const side = h("div", { class: "viz-side" });
    main.append(stage, side);
    const caption = h("figcaption", { class: "viz-caption", "aria-live": "polite" });
    fig.append(head, main, caption);
    return {
      head, main, stage, side, caption,
      setCaption: (text) => { caption.innerHTML = rich(text || ""); },
    };
  }

  /* ------------------------------------------------------------- Mounting */
  function mount(fig) {
    if (fig.dataset.mounted) return;
    fig.dataset.mounted = "1";
    const name = fig.dataset.viz;
    const setup = registry[name];
    if (!setup) {
      console.warn(`TiraViz: tuntematon visualisointi "${name}"`);
      return;
    }
    let params = {};
    if (fig.dataset.params) {
      for (const part of fig.dataset.params.split(/[;&]/)) {
        const [k, v] = part.split("=");
        if (k) params[k.trim()] = v == null ? true : v.trim();
      }
    }
    try {
      setup(fig, { mode: fig.dataset.mode || "", params });
    } catch (err) {
      console.error(`TiraViz: visualisointi "${name}" epäonnistui`, err);
      fig.classList.add("is-ready");
      fig.appendChild(h("p", { class: "viz-caption", text: "Kuvaa ei voitu näyttää." }));
    }
  }

  function start() {
    const figs = Array.from(document.querySelectorAll("figure[data-viz]"));
    if (!figs.length) return;
    if (!("IntersectionObserver" in window)) { figs.forEach(mount); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          mount(e.target);
        }
      }
    }, { rootMargin: "600px 0px" });
    figs.forEach((f) => io.observe(f));
    window.addEventListener("beforeprint", () => figs.forEach(mount));
    // Deep links into a page should not jump when figures above get mounted.
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) figs.forEach((f) => { if (f.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) mount(f); });
      if (target) requestAnimationFrame(() => target.scrollIntoView());
    }
  }

  window.TiraViz = { register: (name, fn) => { registry[name] = fn; }, h, s, esc, rich, fmt, icon, Scene, Player, CodePanel, OutputPanel, VarsPanel, frame, reduced, registry, mount };

  if (document.readyState === "complete") start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
