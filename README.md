# Tietorakenteet ja algoritmit (unofficial)

This file is written in ASD-STE100 Simplified Technical English (Issue 9).

This site uses the course material of *Tietorakenteet ja algoritmit*. The
original material is at <https://tira.mooc.fi/kevat-2026/>. Antti Laaksonen
<https://github.com/pllk> wrote it.

This repository is a private fork. Antti Laaksonen gave permission for the
changes. The fork is not for commercial use.

Parts III, IV and V continue the algorithms course. They use C++ as the main
language, and they teach performance optimization. `PLAN.md` gives the plan.

The site is at <https://neoharju.github.io/tira-2026>.

Jekyll builds the site with the `github-pages` gem. Thus the build is the same
on GitHub Pages and on your computer. The site has no custom plugins. It loads
nothing from third-party servers: the fonts, KaTeX and all scripts are in
`assets/`.

## Local preview

### With Docker

```bash
docker compose up
```

Open <http://localhost:4000/tira-2026/>. When you change the Markdown, the
layouts or the assets, Jekyll builds the site again, and the browser loads the
page again. On Windows, or if Jekyll does not see the changes, use the
`--force_polling` command in `docker-compose.yml`.

### With Ruby

You must have Ruby 3.3 and Bundler:

```bash
bundle install
```

```bash
LC_ALL=C.UTF-8 bundle exec jekyll serve --livereload
```

The UTF-8 locale is necessary. Without it, Jekyll stops at the first
character that is not ASCII.

## Publication

The site works with the classic build of GitHub Pages ("Deploy from a
branch"). `.github/workflows/pages.yml` builds the site for each push and each
pull request, with the same gem versions, and it does a check of the output.
Thus a build that does not work stops before publication.

To publish from the workflow, not from the classic build, do these steps:

1. Set *Settings → Pages → Source* to *GitHub Actions*.
2. Add the repository variable `DEPLOY_WITH_ACTIONS` with the value `true`.

`baseurl` in `_config.yml` is `/tira-2026`. If the site is at the root of a
domain, set `baseurl` to `""`.

## How to write material

The chapters of Part I are in `_material_1`, and the chapters of Part II are
in `_material_2`. The front matter of a chapter lists its sections. The
navigation and the search show them:

```yaml
---
title: 8. Verkkoalgoritmit
slug: osa8
sections:
  - Verkot ohjelmoinnissa
  - Syvyyshaku
---
```

The other pages are Markdown files in the root directory. The navigation does
not show pages with `hide: true`.

Parts I–II are in Finnish. Parts III–V (`_material_3`–`_material_5`) are in
English. The `lang` value in the front matter gives the language of a page.
`_config.yml` sets `lang` for each part under `defaults`. The language selects
the interface strings: `_data/ui.yml`, and the tables at the top of
`assets/js/site.js` and `assets/js/viz-core.js`.

The icon of a chapter on the front page is `#c-<slug>` from
`_includes/icons.html`. For a new chapter, set `glyph:` to one of the icons
that exist, for example `glyph: osa14`.

`PLAN.md` gives the plan of Parts III–VI: the topics, the tasks, the tools and
the infrastructure. The tasks of Parts III–V are C++ code in `cpp/`: starting
code, tests and benchmarks (see `cpp/README.md`). The `cpp/` folder is not a
part of the website.

These are the format conventions (kramdown, GFM input):

| Item | Format |
| --- | --- |
| Mathematics | `$$...$$` in a line, and as a paragraph alone (KaTeX shows it) |
| Title of a code block | `{: .code-title }` on the line before a title of one line, immediately above the code block |
| Output of a program | a fence without a language (or `console`) after the code block |
| Note box | a `{: .note-title }` paragraph and `<div class="note" markdown="1">…</div>` |
| Task with points | a note box with the title `Task N: name (1 point)`. The box is closed at the start, and its title opens it (`site.js`). |
| Table of a memory layout | `{: .memory }` on the line before the table |
| Table with a header in the first row | `{: .grid-head }` on the line before the table |
| Table with cells that can wrap, so that it fits a narrow page | `{: .fit }` on the line before the table. (Without it, a table is as wide as its longest lines, and it scrolls.) |

### Interactive figures

To add a figure, use:

```liquid
{% include viz.html id="graph-bfs" alt="Description for screen readers." %}
{% include viz.html id="bst" mode="search" alt="…" fallback="img/bhp_2.png" %}
```

* `id` selects the figure. `mode` selects a variant of it. Each figure
  registers itself in `assets/js/viz-*.js` with `register("id", …)`. The start
  of each registration does the modes.
* `alt` is necessary. It is the text alternative of the figure.
* `fallback` is an image. The page shows it when JavaScript is off.

A page with figures loads `assets/js/viz-core.js` and only the figure scripts
of its figures. `_data/assets.yml` gives the script of each figure. It also
gives a short hash of each script and each stylesheet. `head.html` puts the
hash in the URL of the asset. Thus a URL changes only when its file changes,
and browsers keep the other files in their cache.

When you change a file in `assets/js` or `assets/css`, or when you add a
figure, do these steps:

1. Run this command:

   ```bash
   python3 _scripts/asset-data.py
   ```

2. Commit `_data/assets.yml`. If the file is not up to date, the Pages
   workflow fails.

If a figure is not in `_data/assets.yml`, the page loads all the figure
scripts of its part. The `viz` front matter in `_config.yml` names these
scripts:

* Parts I–II: `graphs`, `trees` and `arrays`;
* Part III: `hardware`, `paths`, `speedups`, `web` and `vector` (English
  captions);
* Part IV: `storage`, `indexes` and `engines`.

The code panels show Python with colours. If the title of a panel is `c++`,
they show C++.

The figures replay the code of the course, with the same edge sequence and
the same loops. Thus the states that they show agree with the outputs in the
material. When an example in the text changes, change its figure too.

`assets/js/viz-core.js` has the shared parts: an SVG scene with animated
transitions, the step player (←/→, space, Home/End), and the panels for the
code, the output and the variables.

## Features for the reader

* A light theme and a dark theme. The theme follows the system setting until
  the reader selects one. The colours are those of the
  [intro-to-ai](https://github.com/neoharju/intro-to-ai) site: slate greys and
  one blue accent colour.
* Text size: normal, large or extra large, from the `Aa` menu in the top bar.
  The text of the page becomes larger. The top bar keeps its size.
* Zen mode (`Z` or the lotus button). It hides the navigation and shows the
  text on a calm background. The interactive figures fold behind a thin line
  with an arrow. The arrow opens a figure. `Esc` stops zen mode.
* Tasks with points are closed at the start. The arrow on the title of a task
  opens it, as in intro-to-ai.
* Search: `/` or `Ctrl K` / `⌘ K`.
* A table of contents that shows the current section, a bar that shows how
  much of the page you read, links on the headings, and copy buttons on the
  code blocks.

## Structure

| Path | Contents |
| --- | --- |
| `_layouts/` | `base` (the frame of a page), `default` (a chapter or a page), `home`, `collection` (all chapters of a part on one page), `404` |
| `_includes/` | top bar, navigation, page header, pager, footer, search dialog, icon sprite, `viz.html` |
| `_scripts/asset-data.py` | makes `_data/assets.yml`: the script of each figure, and the hashes of the assets |
| `assets/css/main.css` | the theme: colours, typography, layout, code, tables, zen mode, print |
| `assets/css/viz.css` | the interactive figures |
| `assets/js/boot.js` | sets the theme and zen mode before the browser shows the page |
| `assets/js/site.js` | navigation, table of contents, search, code blocks, KaTeX |
| `zz-search.json` | the search index (`/search.json`). Its name makes Jekyll build it after the pages. |

In production builds (`JEKYLL_ENV=production`, as on GitHub Pages), each page
has a Content Security Policy. The policy allows only resources from the site.

`CORRECTIONS.md` lists the corrections to the content in 2026.

These are the licences of the third-party files in the repository: the Geist
fonts (SIL Open Font License, `assets/fonts/OFL-Geist.txt`) and KaTeX (MIT,
`assets/katex/LICENSE`).
