# Tietorakenteet ja algoritmit, kevät 2026 (unofficial)

Course material for the University of Helsinki course *Tietorakenteet ja
algoritmit* (spring 2026), published at <https://tira.mooc.fi/kevat-2026/> and 
created by Antti Laaksonen <https://github.com/pllk>.

This is a private fork, modified with permission from Antti Laaksonen and 
is not intended for commercial use.

The site is built with Jekyll through the `github-pages` gem, so it builds the
same way on GitHub Pages and locally. It has no custom plugins and loads
nothing from third-party servers (fonts, KaTeX and all scripts are in
`assets/`).

## Local preview

### With Docker

```bash
docker compose up
```

Open <http://localhost:4000/kevat-2026/>. Edits to the Markdown, layouts and
assets are rebuilt automatically and the browser reloads itself. On Windows,
or anywhere file changes are not picked up, use the `--force_polling` command
in `docker-compose.yml`.

### With Ruby

Ruby 3.3 and Bundler:

```bash
bundle install
```

```bash
LC_ALL=C.UTF-8 bundle exec jekyll serve --livereload
```

The UTF-8 locale is required: without it Jekyll fails on the first non-ASCII
character of the Markdown.

## Publishing

The site works with the classic GitHub Pages build ("Deploy from a branch"),
as before. `.github/workflows/pages.yml` builds the site on every push and pull
request with the same gem versions and checks the output, so a broken build
is caught before it is published. To publish from the workflow instead of the
classic build, set *Settings → Pages → Source* to *GitHub Actions* and add the
repository variable `DEPLOY_WITH_ACTIONS` with the value `true`.

`baseurl` in `_config.yml` is `/kevat-2026`. For a site served from the root
of a domain, set it to `""`.

## Writing material

Chapters live in `_material_1` (part I) and `_material_2` (part II). The
front matter of a chapter lists its sections; they appear in the navigation
and in the search:

```yaml
---
title: 8. Verkkoalgoritmit
slug: osa8
sections:
  - Verkot ohjelmoinnissa
  - Syvyyshaku
---
```

Other pages are Markdown files in the root directory. Pages with `hide: true`
are not listed in the navigation.

Formatting conventions (kramdown, GFM input):

| What | How |
| --- | --- |
| Math | `$$...$$` inline and as a paragraph of its own (rendered with KaTeX) |
| Title for a code block | `{: .code-title }` on the line before a one-line title, directly above the code block |
| Program output | a fence without a language (or `console`) after the code block |
| Note box | `{: .note-title }` paragraph and `<div class="note" markdown="1">…</div>` |
| Memory layout table | `{: .memory }` on the line before the table |
| Table whose first row is a header | `{: .grid-head }` on the line before the table |

### Interactive figures

Figures are included with

```liquid
{% include viz.html id="graph-bfs" alt="Description for screen readers." %}
{% include viz.html id="bst" mode="search" alt="…" fallback="img/bhp_2.png" %}
```

* `id` selects the figure and `mode` a variant of it. Every figure is
  registered in `assets/js/viz-*.js` with `register("id", …)`; the modes are
  handled at the start of each registration.
* `alt` is required: it is the text alternative of the figure.
* `fallback` is an image shown when JavaScript is disabled.

The figures replay the course's own code (same edge order, same loops), so the
states they show match the outputs printed in the material. When an example in
the text changes, update the matching figure as well.

`assets/js/viz-core.js` contains the shared parts: an SVG scene with animated
transitions, the step player (←/→, space, Home/End), and the code, output and
variable panels.

## Reading features

* Light and dark theme (follows the system setting until chosen).
* Zen mode (`Z` or the lotus button): hides the navigation and shows the text
  on a calm background. `Esc` exits.
* Search: `/` or `Ctrl K` / `⌘ K`.
* Table of contents with the current section highlighted, reading progress,
  heading links and copy buttons on code blocks.

## Structure

| Path | Contents |
| --- | --- |
| `_layouts/` | `base` (page frame), `default` (chapter/page), `home`, `collection` (all chapters of a part on one page), `404` |
| `_includes/` | top bar, navigation, page header, pager, footer, search dialog, icon sprite, `viz.html` |
| `assets/css/main.css` | theme: colours, typography, layout, code, tables, zen mode, print |
| `assets/css/viz.css` | interactive figures |
| `assets/js/boot.js` | sets theme and zen mode before the first paint |
| `assets/js/site.js` | navigation, table of contents, search, code blocks, KaTeX rendering |
| `zz-search.json` | search index (`/search.json`); named so that it is rendered after the pages |

In production builds (`JEKYLL_ENV=production`, as on GitHub Pages) every page
has a Content Security Policy that only allows resources from the site itself.

Corrections made to the content in 2026 are listed in `CORRECTIONS.md`.

Licences of bundled third-party files: Geist fonts (SIL Open Font License,
`assets/fonts/OFL-Geist.txt`), KaTeX (MIT, `assets/katex/LICENSE`).
