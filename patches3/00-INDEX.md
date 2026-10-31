# Part III, weeks 17 and 18: patch series

4 patches against neoharju/tira-2026 `main` (`1d517d9`, "PLAN for follow up
courses"). Apply them in order:

```bash
git am 000*.patch
```

| # | Patch | What it is |
| --- | --- | --- |
| 0001 | Add the C++ template for the tasks of weeks 17 and 18 | `cpp/`: starting code, tests, benchmarks with speed goals, CMake presets. Not part of the website. |
| 0002 | Figures: per-page figure scripts, C++ code panels, chapter icons | `viz` front matter decides which figure scripts a page loads; C++ highlighting; a fix for players that restarted after a view switch; icons for 17 and 18. Finnish pages load the same files as before. |
| 0003 | Figures for chapters 17 and 18 | `viz-hardware.js` (7 figures) and `viz-paths.js` (5 figures). Nothing uses them until 0004. |
| 0004 | Add chapters 17 and 18 (Part III, in English) | `_material_3/17.md` and `18.md`, 8 tasks each. |

Checked: every patch builds with Jekyll; `git am` on `1d517d9` gives exactly
the tested tree; all 145 figures on the 24 pages with figures mount without
console errors or CSP violations; the 12 new figures step through every
frame in light and dark mode, on desktop and phone widths; Finnish pages
change only by the new navigation group and the two icons.

The reference solutions are NOT in these patches (they would be public).
They are in a separate, private zip.
