/* Site behaviour: theme, zen mode, navigation, table of contents, code blocks,
   math, search and the animated graph on the front page. No dependencies. */
(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) {
      try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    },
  };
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("tira-prefs") : null;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Interface strings in the page language (<html lang>), as in _data/ui.yml.
  const T = root.lang === "en" ? {
    readDone: "Finished", timeLeft: (n) => `about ${n} min left`, anchor: "Link to this section",
    terminal: "terminal", output: "output", copy: "Copy", copied: "Copied", copyFailed: "Failed",
    copyAria: "Copy the code to the clipboard", loading: "Loading the index…", noResults: "No results for",
    chapter: "Chapter", page: "Page", results: (n) => (n === 1 ? "1 result" : `${n} results`),
  } : {
    readDone: "Luettu", timeLeft: (n) => `noin ${n} min jäljellä`, anchor: "Linkki tähän kohtaan",
    terminal: "terminaali", output: "tuloste", copy: "Kopioi", copied: "Kopioitu", copyFailed: "Ei onnistunut",
    copyAria: "Kopioi koodi leikepöydälle", loading: "Ladataan hakemistoa…", noResults: "Ei tuloksia haulle",
    chapter: "Luku", page: "Sivu", results: (n) => (n === 1 ? "1 tulos" : `${n} tulosta`),
  };
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  /* ---------------------------------------------------------------- Theme */
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme() {
    const saved = store.get("tira-theme");
    const dark = saved === "dark" || (saved !== "light" && darkQuery.matches);
    if (dark !== root.classList.contains("dark")) {
      root.classList.toggle("dark", dark);
      document.dispatchEvent(new CustomEvent("tira:theme", { detail: { dark } }));
    }
  }

  function toggleTheme() {
    store.set("tira-theme", root.classList.contains("dark") ? "light" : "dark");
    applyTheme();
    if (channel) channel.postMessage("theme");
  }

  darkQuery.addEventListener("change", applyTheme);

  /* ------------------------------------------------------------- Zen mode */
  let zenUiTimer = 0;

  function setZen(on, broadcast = true) {
    root.classList.toggle("zen", on);
    store.set("tira-zen", on ? "1" : null);
    $$("[data-zen-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(on)));
    if (on) {
      closeNav();
      flashZenUi();
    }
    onScroll();
    if (broadcast && channel) channel.postMessage("zen");
  }

  function flashZenUi() {
    root.classList.add("zen-ui");
    clearTimeout(zenUiTimer);
    zenUiTimer = setTimeout(() => root.classList.remove("zen-ui"), 2200);
  }

  /* ------------------------------------------------------------ Text size */
  // "normal", "large" or "xlarge": a data-font-size attribute on <html> that
  // sets the root font size (boot.js restores it before the first paint).
  const SIZES = ["normal", "large", "xlarge"];
  const currentSize = () => (SIZES.includes(root.getAttribute("data-font-size")) ? root.getAttribute("data-font-size") : "normal");

  // The block of text at the top of the window, so that it stays in place when
  // the text above it grows or shrinks.
  function readingAnchor() {
    const prose = $(".main .prose");
    if (!prose || window.scrollY < 40) return null;
    const box = prose.getBoundingClientRect();
    const bar = root.classList.contains("zen") ? 0 : $("#topbar").getBoundingClientRect().bottom;
    let node = document.elementFromPoint(box.left + box.width / 2, bar + 12);
    while (node && node.parentElement && node.parentElement !== prose) node = node.parentElement;
    return node && prose.contains(node) ? { node, top: node.getBoundingClientRect().top } : null;
  }

  function setSize(size, broadcast = true) {
    if (!SIZES.includes(size)) return;
    const anchor = size !== currentSize() ? readingAnchor() : null;
    if (size === "normal") root.removeAttribute("data-font-size");
    else root.setAttribute("data-font-size", size);
    if (broadcast) store.set("tira-font-size", size === "normal" ? null : size);
    if (anchor) window.scrollBy({ top: anchor.node.getBoundingClientRect().top - anchor.top, behavior: "instant" });
    $$("[data-size]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.size === size)));
    if (broadcast && channel) channel.postMessage("size");
  }

  function initSizeMenu() {
    const menu = $("[data-size-menu]");
    if (!menu) return;
    const toggle = $("[data-size-toggle]", menu);
    const list = $(".size-list", menu);
    const items = $$("[data-size]", list);
    const open = () => {
      list.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      // preventScroll: the menu is in the fixed top bar, but a focus inside the
      // scroll padding would still make the browser scroll the page.
      (items.find((b) => b.getAttribute("aria-checked") === "true") || items[0]).focus({ preventScroll: true });
    };
    const close = (focusToggle) => {
      if (list.hidden) return;
      list.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (focusToggle) toggle.focus({ preventScroll: true });
    };
    toggle.addEventListener("click", () => (list.hidden ? open() : close(false)));
    items.forEach((b) => b.addEventListener("click", () => { setSize(b.dataset.size); close(true); }));
    menu.addEventListener("keydown", (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "ArrowDown" && i >= 0) { e.preventDefault(); items[(i + 1) % items.length].focus({ preventScroll: true }); }
      else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); items[(i + items.length - 1) % items.length].focus({ preventScroll: true }); }
      else if (e.key === "Tab") close(false);
    });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) close(false); });
    setSize(currentSize(), false);
  }

  if (channel) {
    channel.onmessage = (event) => {
      if (event.data === "theme") applyTheme();
      if (event.data === "zen") setZen(store.get("tira-zen") === "1", false);
      if (event.data === "size") setSize(store.get("tira-font-size") || "normal", false);
    };
  }

  /* -------------------------------------------------------- Mobile drawer */
  function openNav() {
    root.classList.add("nav-open");
    const scrim = $("[data-nav-close]");
    if (scrim) scrim.hidden = false;
    $$("[data-nav-toggle]").forEach((b) => {
      b.setAttribute("aria-expanded", "true");
      b.setAttribute("aria-label", "Sulje valikko");
    });
    const current = $(".sidebar .is-current") || $(".sidebar a");
    if (current) {
      current.scrollIntoView({ block: "center" });
      current.focus({ preventScroll: true });
    }
  }

  function closeNav(restoreFocus = false) {
    if (!root.classList.contains("nav-open")) return;
    root.classList.remove("nav-open");
    $$("[data-nav-toggle]").forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-label", "Avaa valikko");
    });
    const scrim = $("[data-nav-close]");
    if (scrim) setTimeout(() => { if (!root.classList.contains("nav-open")) scrim.hidden = true; }, 300);
    if (restoreFocus) {
      const toggle = $("[data-nav-toggle]");
      if (toggle) toggle.focus();
    }
  }

  /* ------------------------------------------- Scroll: progress & topbar */
  let lastY = window.scrollY;
  let ticking = false;
  let proseWords = 0;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      const bar = $("#read-progress-bar");
      if (bar) bar.style.transform = `scaleX(${p})`;

      root.classList.toggle("scrolled", y > 80);
      if (Math.abs(y - lastY) > 6) {
        root.classList.toggle("scrolled-down", y > lastY && y > 240);
        if (y < lastY && root.classList.contains("zen")) flashZenUi();
        lastY = y;
      }

      const time = $("#zen-time");
      if (time && proseWords) {
        const left = Math.ceil((proseWords * (1 - p)) / 180);
        time.textContent = p > 0.995 ? T.readDone : T.timeLeft(Math.max(1, left));
      }
      updateSpy();
    });
  }

  /* ------------------------------------------------------------- TOC & spy */
  let spyHeadings = [];
  let tocLinks = new Map();
  let navLinks = new Map();
  let indicator = null;
  let activeId = null;

  function buildToc() {
    const headings = $$(".main .prose h2[id], .main .prose h3[id]")
      .filter((h) => !h.closest(".note") && h.offsetParent !== null);
    spyHeadings = headings;
    $$(".nav-sections a[data-anchor]").forEach((a) => navLinks.set(a.dataset.anchor, a));

    const toc = $("#toc");
    if (!toc || headings.filter((h) => h.tagName === "H2").length < 2) return;
    const frag = document.createDocumentFragment();
    indicator = document.createElement("span");
    indicator.className = "toc-indicator";
    frag.appendChild(indicator);
    for (const h of headings) {
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.className = h.tagName === "H3" ? "lvl-3" : "lvl-2";
      a.textContent = headingText(h);
      frag.appendChild(a);
      tocLinks.set(h.id, a);
    }
    toc.appendChild(frag);
    toc.parentElement.hidden = false;
  }

  function headingText(h) {
    const clone = h.cloneNode(true);
    $$(".heading-anchor, .h1-num", clone).forEach((x) => x.remove());
    return clone.textContent.trim();
  }

  function updateSpy() {
    if (!spyHeadings.length) return;
    const line = (root.classList.contains("zen") ? 40 : 80) + window.innerHeight * 0.18;
    let current = null;
    for (const h of spyHeadings) {
      if (h.getBoundingClientRect().top <= line) current = h; else break;
    }
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) current = spyHeadings[spyHeadings.length - 1];
    const id = current ? current.id : null;
    if (id === activeId) return;
    activeId = id;

    tocLinks.forEach((a, key) => a.classList.toggle("is-active", key === id));
    const link = id && tocLinks.get(id);
    if (indicator) {
      if (link) {
        indicator.style.opacity = "1";
        indicator.style.height = `${link.offsetHeight}px`;
        indicator.style.transform = `translateY(${link.offsetTop}px)`;
        const box = link.closest(".toc-inner");
        if (box && (link.offsetTop < box.scrollTop || link.offsetTop > box.scrollTop + box.clientHeight - 60)) {
          box.scrollTo({ top: link.offsetTop - box.clientHeight / 3, behavior: "smooth" });
        }
      } else {
        indicator.style.opacity = "0";
      }
    }

    // Sidebar sections only list h2 headings: highlight the enclosing h2.
    let h2 = current;
    if (h2 && h2.tagName === "H3") {
      const i = spyHeadings.indexOf(h2);
      for (let j = i; j >= 0; j--) if (spyHeadings[j].tagName === "H2") { h2 = spyHeadings[j]; break; }
    }
    navLinks.forEach((a, key) => a.classList.toggle("is-active", !!h2 && key === h2.id));
  }

  /* ------------------------------------------------------- Prose helpers */
  function enhanceHeadings() {
    for (const h of $$(".main .prose h2[id], .main .prose h3[id]")) {
      const a = document.createElement("a");
      a.className = "heading-anchor";
      a.href = `#${h.id}`;
      a.setAttribute("aria-label", T.anchor);
      a.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-hash"/></svg>';
      h.appendChild(a);
    }
    for (const h1 of $$(".main .prose h1")) {
      const first = h1.firstChild;
      if (first && first.nodeType === 3) {
        const m = /^(\d+)\.\s+/.exec(first.nodeValue);
        if (m) {
          const span = document.createElement("span");
          span.className = "h1-num";
          span.textContent = `${m[1]}.`;
          first.nodeValue = first.nodeValue.slice(m[0].length);
          h1.insertBefore(span, first);
        }
      }
    }
  }

  const LANG_LABELS = {
    python: "python", py: "python", console: T.terminal, plaintext: T.output, text: T.output,
    cpp: "c++", "c++": "c++", js: "javascript", javascript: "javascript", java: "java",
  };

  function enhanceCode() {
    const blocks = $$(".main .prose div.highlighter-rouge, .main .prose figure.highlight")
      .filter((b) => !b.closest(".code-block"));
    for (const block of blocks) {
      let lang = "";
      const cls = Array.from(block.classList).find((c) => c.startsWith("language-"));
      if (cls) lang = cls.slice(9);
      else {
        const code = $("code[data-lang]", block);
        if (code) lang = code.dataset.lang;
      }
      lang = lang.split("?")[0];
      const terminal = lang === "console" || lang === "plaintext" || lang === "text";

      const wrap = document.createElement("div");
      wrap.className = `code-block${terminal ? " is-terminal" : ""}`;
      const head = document.createElement("div");
      head.className = "code-head";

      const titleEl = block.previousElementSibling;
      if (terminal) head.insertAdjacentHTML("beforeend", '<span class="term-dots" aria-hidden="true"><i></i><i></i><i></i></span>');
      if (titleEl && titleEl.matches("p.code-title")) {
        const t = document.createElement("span");
        t.className = "code-title";
        t.textContent = titleEl.textContent.trim();
        head.appendChild(t);
        titleEl.remove();
      }
      if (lang) {
        const l = document.createElement("span");
        l.className = "code-lang";
        l.textContent = LANG_LABELS[lang] || lang;
        head.appendChild(l);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg><span>${T.copy}</span>`;
      btn.setAttribute("aria-label", T.copyAria);
      btn.addEventListener("click", () => copyCode(block, btn));
      head.appendChild(btn);

      block.parentNode.insertBefore(wrap, block);
      wrap.appendChild(head);
      wrap.appendChild(block);
    }
  }

  async function copyCode(block, btn) {
    const codeCell = $(".rouge-table .code pre", block) || $("pre", block);
    const text = codeCell ? codeCell.innerText.replace(/\n$/, "") : "";
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
    }
    const label = $("span", btn);
    btn.classList.toggle("is-copied", ok);
    btn.querySelector("use").setAttribute("href", ok ? "#i-check" : "#i-copy");
    label.textContent = ok ? T.copied : T.copyFailed;
    setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.querySelector("use").setAttribute("href", "#i-copy");
      label.textContent = T.copy;
    }, 1800);
  }

  function wrapTables() {
    for (const table of $$(".main .prose table")) {
      if (table.classList.contains("rouge-table") || table.closest(".table-wrap, .rouge-table, .viz")) continue;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
  }

  function renderMath() {
    if (typeof window.renderMathInElement !== "function") return;
    const main = $("#main");
    if (!main) return;
    window.renderMathInElement(main, {
      delimiters: [
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
      ignoredClasses: ["viz"],
    });
  }

  /* -------------------------------------------------------------- Search */
  const search = {
    dialog: null,
    input: null,
    list: null,
    count: null,
    docs: null,
    loading: null,
    results: [],
    selected: -1,
  };

  const norm = (s) => {
    let out = "";
    for (const ch of s) {
      const d = ch.normalize("NFD")[0] || ch;
      out += d.toLowerCase()[0] || d;
    }
    return out;
  };
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loadIndex() {
    if (search.loading) return search.loading;
    const url = search.dialog.dataset.index;
    search.loading = fetch(url, { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((docs) => {
        search.docs = docs.map((d) => {
          const text = (d.c || "").replace(/\s+/g, " ").trim();
          const sections = Array.isArray(d.s) ? d.s.map((s) => (typeof s === "string" ? s : s.title || "")) : [];
          return { ...d, text, ntext: norm(text), ntitle: norm(d.t || ""), sections, nsections: sections.map(norm) };
        });
      })
      .catch(() => { search.docs = []; });
    return search.loading;
  }

  function openSearch() {
    if (!search.dialog) return;
    closeNav();
    if (!search.dialog.open) search.dialog.showModal();
    search.input.focus();
    search.input.select();
    loadIndex().then(runSearch);
  }

  function closeSearch() {
    if (search.dialog && search.dialog.open) search.dialog.close();
  }

  function slugify(s) {
    return s.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
  }

  function runSearch() {
    const q = search.input.value.trim();
    const terms = norm(q).split(/\s+/).filter((t) => t.length > 1 || /\d/.test(t));
    search.results = [];
    search.selected = -1;
    if (!terms.length || !search.docs) {
      search.list.innerHTML = q && !search.docs ? `<li class="search-empty">${T.loading}</li>` : "";
      search.count.textContent = "";
      return;
    }
    for (const d of search.docs) {
      let score = 0;
      let firstHit = -1;
      let sectionHit = null;
      let ok = true;
      for (const t of terms) {
        const inTitle = d.ntitle.includes(t);
        const si = d.nsections.findIndex((s) => s.includes(t));
        const ci = d.ntext.indexOf(t);
        if (!inTitle && si < 0 && ci < 0) { ok = false; break; }
        if (inTitle) score += d.ntitle.startsWith(t) ? 40 : 25;
        if (si >= 0) { score += 14; if (!sectionHit) sectionHit = d.sections[si]; }
        if (ci >= 0) {
          let n = 0;
          for (let i = ci; i >= 0 && n < 12; i = d.ntext.indexOf(t, i + t.length)) n++;
          score += 2 + Math.min(n, 12);
          if (firstHit < 0 || ci < firstHit) firstHit = ci;
        }
      }
      if (!ok) continue;
      if (/\/osa\d+\/$/.test(d.u)) score += 3;
      search.results.push({ d, score, firstHit, sectionHit });
    }
    search.results.sort((a, b) => b.score - a.score);
    search.results = search.results.slice(0, 14);

    if (!search.results.length) {
      search.list.innerHTML = `<li class="search-empty">${T.noResults} <strong>${escapeHtml(q)}</strong></li>`;
      search.count.textContent = "";
      return;
    }
    const highlight = (text) => {
      const ntext = norm(text);
      const marks = [];
      for (const t of terms) {
        for (let i = ntext.indexOf(t); i >= 0; i = ntext.indexOf(t, i + t.length)) marks.push([i, i + t.length]);
      }
      marks.sort((a, b) => a[0] - b[0]);
      let out = "";
      let pos = 0;
      for (const [s, e] of marks) {
        if (s < pos) continue;
        out += escapeHtml(text.slice(pos, s)) + "<mark>" + escapeHtml(text.slice(s, e)) + "</mark>";
        pos = e;
      }
      return out + escapeHtml(text.slice(pos));
    };

    search.list.innerHTML = search.results.map((r, i) => {
      const { d } = r;
      let snippet = "";
      let href = d.u;
      if (r.firstHit >= 0) {
        const start = Math.max(0, r.firstHit - 60);
        const end = Math.min(d.text.length, r.firstHit + 110);
        snippet = (start > 0 ? "…" : "") + d.text.slice(start, end) + (end < d.text.length ? "…" : "");
        const exact = d.text.slice(r.firstHit, r.firstHit + terms[0].length);
        if (exact.trim()) href += `#:~:text=${encodeURIComponent(exact)}`;
      }
      if (r.sectionHit) href = `${d.u}#${slugify(r.sectionHit)}`;
      const kind = d.k ? T.chapter : T.page;
      const sub = r.sectionHit ? ` <span class="sr-kind">› ${escapeHtml(r.sectionHit)}</span>` : "";
      return `<li class="search-result" role="option" id="sr-${i}" aria-selected="false">
        <a href="${escapeHtml(href)}"><span class="sr-title">${highlight(d.t)}<span class="sr-kind">${kind}</span>${sub}</span>
        ${snippet ? `<span class="sr-snippet">${highlight(snippet)}</span>` : ""}</a></li>`;
    }).join("");
    search.count.textContent = T.results(search.results.length);
    select(0);
  }

  function select(i) {
    const items = $$(".search-result", search.list);
    if (!items.length) return;
    search.selected = (i + items.length) % items.length;
    items.forEach((li, j) => li.setAttribute("aria-selected", String(j === search.selected)));
    const cur = items[search.selected];
    search.input.setAttribute("aria-activedescendant", cur.id);
    cur.scrollIntoView({ block: "nearest" });
  }

  function initSearch() {
    search.dialog = $("#search");
    if (!search.dialog || typeof search.dialog.showModal !== "function") {
      $$("[data-open-search]").forEach((b) => { b.hidden = true; });
      return;
    }
    search.input = $("#search-input");
    search.list = $("#search-results");
    search.count = $("#search-count");
    let timer = 0;
    search.input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(runSearch, 60);
    });
    search.input.addEventListener("keydown", (e) => {
      // Escape closes the dialog at once (a search input would otherwise only clear its text).
      if (e.key === "Escape") { e.preventDefault(); closeSearch(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); select(search.selected + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); select(search.selected - 1); }
      else if (e.key === "Enter") {
        const cur = $$(".search-result a", search.list)[search.selected];
        if (cur) { e.preventDefault(); closeSearch(); window.location.href = cur.href; }
      }
    });
    search.list.addEventListener("mousemove", (e) => {
      const li = e.target.closest(".search-result");
      if (li) {
        const i = $$(".search-result", search.list).indexOf(li);
        if (i !== search.selected) select(i);
      }
    });
    search.list.addEventListener("click", (e) => { if (e.target.closest("a")) closeSearch(); });
    search.dialog.addEventListener("click", (e) => { if (e.target === search.dialog) closeSearch(); });
    $$("[data-close-search]").forEach((b) => b.addEventListener("click", closeSearch));
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    $$("[data-kbd-mod]").forEach((k) => { k.textContent = mac ? "⌘ K" : "Ctrl K"; });
  }

  /* ------------------------------------------------- Front page graph art */
  function initHeroGraph() {
    const svg = $("#hero-graph");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const nodes = [
      [70, 70], [175, 48], [290, 62], [385, 105], [110, 165], [215, 140], [330, 175],
      [55, 265], [165, 245], [270, 250], [385, 260], [115, 345], [225, 340], [335, 345],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 5], [2, 6], [3, 6], [4, 5], [5, 6],
      [4, 7], [4, 8], [5, 9], [6, 9], [6, 10], [7, 8], [8, 9], [9, 10], [7, 11], [8, 12],
      [9, 12], [9, 13], [10, 13], [11, 12], [12, 13],
    ];
    const adj = nodes.map(() => []);
    edges.forEach(([a, b], i) => { adj[a].push([b, i]); adj[b].push([a, i]); });
    const eEls = edges.map(([a, b]) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", nodes[a][0]); l.setAttribute("y1", nodes[a][1]);
      l.setAttribute("x2", nodes[b][0]); l.setAttribute("y2", nodes[b][1]);
      l.setAttribute("class", "hg-edge");
      svg.appendChild(l);
      return l;
    });
    const nEls = nodes.map(([x, y], i) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "hg-node");
      g.setAttribute("transform", `translate(${x} ${y})`);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", "15");
      const t = document.createElementNS(NS, "text");
      t.textContent = String(i + 1);
      g.append(c, t);
      svg.appendChild(g);
      return g;
    });
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "hg-label");
    label.setAttribute("x", "18");
    label.setAttribute("y", "388");
    svg.appendChild(label);

    let timers = [];
    let running = false;
    let visible = true;
    let src = 4;

    function clear() {
      nEls.forEach((n) => n.setAttribute("class", "hg-node"));
      eEls.forEach((e) => e.setAttribute("class", "hg-edge"));
    }

    function wave() {
      clear();
      const dist = new Array(nodes.length).fill(-1);
      const via = new Array(nodes.length).fill(-1);
      dist[src] = 0;
      const queue = [src];
      for (let i = 0; i < queue.length; i++) {
        const v = queue[i];
        for (const [w, e] of adj[v]) if (dist[w] < 0) { dist[w] = dist[v] + 1; via[w] = e; queue.push(w); }
      }
      const depth = Math.max(...dist);
      label.textContent = `LEVEYSHAKU · ALKUSOLMU ${src + 1}`;
      nEls[src].setAttribute("class", "hg-node is-src");
      for (let d = 1; d <= depth; d++) {
        timers.push(setTimeout(() => {
          dist.forEach((dv, v) => {
            if (dv === d) {
              nEls[v].setAttribute("class", "hg-node is-lit");
              eEls[via[v]].setAttribute("class", "hg-edge is-lit");
            }
          });
        }, d * 650));
      }
      timers.push(setTimeout(() => {
        src = (src + 5) % nodes.length;
        if (running) wave();
      }, depth * 650 + 2600));
    }

    function start() {
      if (running || !visible || document.hidden) return;
      running = true;
      wave();
    }
    function stop() {
      running = false;
      timers.forEach(clearTimeout);
      timers = [];
    }

    if (reducedMotion.matches) {
      wave();
      stop();
      return;
    }
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(svg);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  }

  /* ------------------------------------------------------------- Wiring */
  function init() {
    $$("[data-theme-toggle]").forEach((b) => b.addEventListener("click", toggleTheme));
    $$("[data-zen-toggle]").forEach((b) => {
      b.setAttribute("aria-pressed", String(root.classList.contains("zen")));
      b.addEventListener("click", () => setZen(!root.classList.contains("zen")));
    });
    $$("[data-nav-toggle]").forEach((b) => b.addEventListener("click", () => {
      if (root.classList.contains("nav-open")) closeNav(true); else openNav();
    }));
    $$("[data-nav-close]").forEach((b) => b.addEventListener("click", () => closeNav(true)));
    $$(".sidebar a").forEach((a) => a.addEventListener("click", () => closeNav()));
    $$("[data-open-search]").forEach((b) => b.addEventListener("click", openSearch));
    initSizeMenu();

    renderMath();
    enhanceHeadings();
    enhanceCode();
    wrapTables();
    buildToc();
    initSearch();
    initHeroGraph();

    const prose = $$(".main .prose");
    proseWords = prose.reduce((n, p) => n + (p.textContent.match(/\S+/g) || []).length, 0);

    document.addEventListener("keydown", (e) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        if (search.dialog && search.dialog.open) closeSearch(); else openSearch();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      if (e.key === "/") { e.preventDefault(); openSearch(); }
      else if (e.key === "z" || e.key === "Z") setZen(!root.classList.contains("zen"));
      else if (e.key === "Escape") {
        if (root.classList.contains("nav-open")) closeNav(true);
        else if (root.classList.contains("zen") && !(search.dialog && search.dialog.open)) setZen(false);
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (root.classList.contains("zen") && e.clientY < 70) flashZenUi();
    }, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { activeId = undefined; onScroll(); });
    window.addEventListener("load", () => { activeId = undefined; onScroll(); });
    onScroll();
  }

  // Deferred scripts (KaTeX) run after this one but before DOMContentLoaded.
  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
