# RelationalText Demo

A Next.js 15 application demonstrating live cross-format rich text conversion
and Layers-based semantic annotation. All conversion runs through panproto's
protolens pipeline in WASM — no server round-trips.

## Running

```bash
cd apps/demo
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Main demo (/)

Side-by-side editor panes with live cross-format conversion across all 38
supported formats:

- **TipTap** — ProseMirror-based WYSIWYG editor
- **Lexical** — Meta's Lexical editor
- **HTML** / **Markdown** — rendered output
- **Format selector** — pick any of 38 formats to see the conversion

All panes share a single RelationalText `Document`. Each editor imports and
exports through `from()` / `to()` via the panproto-backed lens graph.

## Recipe demo (/recipe)

A recipe annotation demo using the Layers annotation model as the sole data
representation. `LayeredDocument` is the single source of truth — `Document`
is derived for text rendering only.

Features:

- **Auto-annotation** — parses ingredients, steps, timers, temperatures,
  equipment, and techniques from recipe text
- **Layers annotation editor** — select text to create annotations from the
  recipe ontology (ingredient, cooking-step, timer, temperature, equipment,
  technique) or define new ontology types inline
- **Wikidata integration** — autocomplete search to link annotations to
  Wikidata entities as knowledge references
- **Relations** — create directed relations between annotations (uses,
  requires, part-of, followed-by)
- **Discontiguous spans** — Ctrl/Cmd+select to extend an annotation with
  non-adjacent text segments
- **Ingredient scaling** — adjust servings and all quantities update
- **Cook mode** — step-by-step view with timers
- **Annotation overlay** — highlights from Layers annotation layers with
  per-type visibility toggles
- **Layers inspector** — read-only panel showing the raw Layers data model

### Populating the recipe database

The recipe browser loads recipes from a SQLite database. To populate it,
run from the **repo root**:

```bash
# Download the Wikibooks XML dump (~193 MB) and load it locally
curl -L -o scripts/cache/enwikibooks-pages-articles.xml.bz2 \
  "https://dumps.wikimedia.org/enwikibooks/latest/enwikibooks-latest-pages-articles.xml.bz2"
pnpm tsx scripts/load-wikibooks-dump.ts
node apps/demo/scripts/link-data.mjs
```

The dump loader streams the bz2-compressed XML locally — much faster and more
reliable than API fetching. The last command symlinks `data/recipes.sqlite`
(and other data files) into `public/` so the browser can load them. Without the
database, use "Paste your own recipe" to load the built-in sample.

## Stack

- Next.js 15 (App Router)
- TipTap 2 (with extensions)
- Lexical 0.17
- `relational-text` (workspace package, WASM-backed, panproto 0.11.0)
- Layers annotation model (`pub.layers.annotation`)
