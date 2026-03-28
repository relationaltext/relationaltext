# RelationalText Hub Format

The RelationalText hub (`org.relationaltext.facet`) is the canonical interchange format that all other formats convert through. It defines the common vocabulary of blocks, marks, and entities that survive round-trips across all 37+ supported formats.

## Namespaces

All feature types in RelationalText fall into one of three namespace categories:

| Namespace | Purpose |
|-----------|---------|
| `org.relationaltext.richtext.*` | Programmatic API — used when constructing documents with `Document.addMark()`, `Document.addBlock()` |
| `org.relationaltext.facet#*` | Hub lens targets — what importers produce and what `autoTransform()` routes through |
| Format-specific namespaces (e.g. `org.commonmark.facet#*`, `app.bsky.richtext.facet#*`) | Each format's own feature identifiers, before or after lens conversion |

Both `org.relationaltext.richtext.*` and `org.relationaltext.facet#*` are registered by `ensureRelationalTextLexicon()` (called automatically from `core.ts`). Lenses always produce `org.relationaltext.facet#*` compound keys; the richtext.mark/block namespace is what you get when constructing documents from code.

## Functions

```ts
import {
  ensureRelationalTextLexicon,
  registerFeatureType,
  Document,
} from 'relational-text/core'
```

### `ensureRelationalTextLexicon(): void`

Register all `org.relationaltext.facet#*` and `org.relationaltext.richtext.*#*` types with the WASM lexicon. Called automatically when importing `relational-text/core`. Safe to call multiple times — subsequent calls are no-ops.

### `registerFeatureType(descriptor: FeatureTypeDescriptor): void`

Register a single custom feature type at runtime. Use this to extend the hub with application-specific types.

```ts
registerFeatureType({
  typeId: 'com.example.footnote',
  featureClass: 'inline',
  expandStart: false,
  expandEnd: false,
})
```

## Feature Inventory

### Block Elements

Blocks use 1-character markers in the text string (`\uFFFC` for the first block, `\n` for subsequent ones). Nesting is expressed with the `parents` array (Kleppmann model).

| Feature name | `$type` compound key | attrs | Notes |
|--------------|---------------------|-------|-------|
| `paragraph` | `org.relationaltext.facet#paragraph` | — | Default block type |
| `heading` | `org.relationaltext.facet#heading` | `{ level: 1–6 }` | |
| `code-block` | `org.relationaltext.facet#code-block` | `{ language?: string }` | |
| `horizontal-rule` | `org.relationaltext.facet#horizontal-rule` | — | Thematic break |
| `blockquote-marker` | `org.relationaltext.facet#blockquote-marker` | — | Used in `parents[]` for nesting |
| `bullet-list-marker` | `org.relationaltext.facet#bullet-list-marker` | — | List container marker |
| `ordered-list-marker` | `org.relationaltext.facet#ordered-list-marker` | `{ start?: number }` | List container marker |
| `list-item-marker` | `org.relationaltext.facet#list-item-marker` | — | |
| `list-item-text` | `org.relationaltext.facet#list-item-text` | — | Content block within a list item |
| `table` | `org.relationaltext.facet#table` | `{ headers: string[], rows: string[][] }` | |
| `embed` | `org.relationaltext.facet#embed` | `{ src: string }` | Dropped when converting to CommonMark |
| `page-break` | `org.relationaltext.facet#page-break` | — | Maps to `horizontal-rule` in CommonMark |
| `details` | `org.relationaltext.facet#details` | — | Collapsible section; maps to `blockquote-marker` in CommonMark |

### Inline Marks — Expand Both Sides (Peritext)

These marks grow when text is inserted at either boundary (`expandStart: true, expandEnd: true`).

| Feature name | `$type` compound key | attrs |
|--------------|---------------------|-------|
| `bold` | `org.relationaltext.facet#bold` | — |
| `italic` | `org.relationaltext.facet#italic` | — |
| `underline` | `org.relationaltext.facet#underline` | — |
| `strikethrough` | `org.relationaltext.facet#strikethrough` | — |
| `highlight` | `org.relationaltext.facet#highlight` | — |
| `insertion` | `org.relationaltext.facet#insertion` | `{ author?: string, date?: string }` |

### Inline Marks — Expand Neither Side (Peritext)

These marks do not grow when text is inserted at their boundaries (`expandStart: false, expandEnd: false`).

| Feature name | `$type` compound key | attrs |
|--------------|---------------------|-------|
| `code` | `org.relationaltext.facet#code` | — |
| `keyboard` | `org.relationaltext.facet#keyboard` | — |
| `superscript` | `org.relationaltext.facet#superscript` | — |
| `subscript` | `org.relationaltext.facet#subscript` | — |
| `deletion` | `org.relationaltext.facet#deletion` | `{ author?: string, date?: string }` |
| `comment` | `org.relationaltext.facet#comment` | `{ id?: string }` |

### Entity Types

Entities occupy a byte range and do not expand. They are rendered as self-contained elements rather than wrapping spans.

| Feature name | `$type` compound key | attrs | Notes |
|--------------|---------------------|-------|-------|
| `link` | `org.relationaltext.facet#link` | `{ url: string, title?: string }` | `url` (not `uri`); lenses rename as needed |
| `image` | `org.relationaltext.facet#image` | `{ src: string, alt?: string, title?: string }` | |
| `mention` | `org.relationaltext.facet#mention` | `{ handle: string }` | Social @mention |
| `hashtag` | `org.relationaltext.facet#hashtag` | `{ tag: string }` | Social #hashtag |
| `line-break` | `org.relationaltext.facet#line-break` | — | Hard line break |

## The Lens Graph

Without a hub, N formats require N² lenses. With a hub: just N lenses, each connecting one format to the center.

All 37 registered formats connect to the hub via `X-to-relationaltext.lens.json` files. The lens graph resolves multi-hop paths automatically — a document parsed from Quill can be exported to Apple News without any intermediate step in user code.

```
Quill      ─┐
TipTap     ─┤
ProseMirror─┤
Lexical    ─┤                         ┌─ HTML
Slate      ─┤                         ├─ CommonMark / GFM
Discord    ─┼─→  org.relationaltext  ─┤─ Apple News
Slack      ─┤         .facet          ├─ Bluesky (via filter_facets_by_namespace)
Mastodon   ─┤                         └─ (any format with a relationaltext-to-X lens)
Confluence ─┤
...        ─┘
```

The path from a source format to an output format may span multiple hops: e.g., `org.commonmark.facet → org.relationaltext.facet → org.w3c.html.facet`. The lens graph resolves these automatically inside `autoTransform()`.

### The `autoTransform()` Fast-Path

Each `to() renderer calls `lensGraph.autoTransform(doc, targetNamespace)` before rendering. If the document's features are already in `targetNamespace` — or already in `org.relationaltext.facet` with a lens registered to the target — the graph skips intermediate steps. If a document already speaks `org.relationaltext.facet`, no lens is applied; it renders directly.

The `autoTransform` fast-path also short-circuits namespaces: if a document contains no features from a source namespace, passthrough-drop lenses for that namespace are skipped entirely, preventing them from wiping cross-format features.

## Cross-Format Conversion

### Via the `from` / `to` registry

```ts
import { from, to } from 'relational-text'

// Any format → any other format
const doc = from('quill', quillDeltaJson)
const md  = to('markdown', doc)
const html = to('html', doc)
```

### Via individual importers and exporters

```ts
import { from, to } from 'relational-text/registry'

const doc  = from('slack', '*bold* and ~strikethrough~')
const html = to('html', doc)
// '<p><strong>bold</strong> and <s>strikethrough</s></p>\n'
```

### Explicit hub conversion

```ts
import { from } from 'relational-text/registry'
import { applyLens, lensGraph }         from 'relational-text/lens'

const doc = from('tiptap', tipTapJson)

// Inspect features in the org.relationaltext.facet namespace
const rtDoc = lensGraph.autoTransform(doc, 'org.relationaltext.facet')
const marks = rtDoc.features.filter(f =>
  typeof f.$type === 'string' && f.$type.startsWith('org.relationaltext.facet')
)

const md = to('markdown', rtDoc)
```

## Feature Mapping: Hub → CommonMark

The `relationaltext-to-commonmark.lens.json` lens shows which hub features map to CommonMark and which are dropped or approximated.

| Hub feature | CommonMark feature | Notes |
|-------------|-------------------|-------|
| `bold` | `strong` | |
| `italic` | `emphasis` | |
| `code` | `code-span` | |
| `strikethrough` | `strikethrough` | GFM extension |
| `underline` | `underline` | Non-standard; rendered as `<u>` |
| `superscript` | `superscript` | |
| `subscript` | `subscript` | |
| `keyboard` | `keyboard` | |
| `highlight` | `mark` | Rendered as `<mark>` |
| `insertion` | `ins` | `author` → `cite`, `date` → `datetime` |
| `deletion` | `del` | `author` → `cite`, `date` → `datetime` |
| `link` (url) | `link` (uri) | Attr rename |
| `mention` | `link` (uri) | Flattened to a hyperlink |
| `hashtag` | `link` (uri) | Flattened to a hyperlink |
| `line-break` | `line-break` | |
| `image` | `image` | |
| `paragraph` | `paragraph` | |
| `heading` | `heading` | `level` attr preserved |
| `code-block` | `code-block` | `language` attr preserved |
| `horizontal-rule` | `horizontal-rule` | |
| `page-break` | `horizontal-rule` | Approximated |
| `details` | `blockquote-marker` | Approximated |
| `embed` | _(dropped)_ | No CommonMark equivalent |

## The Common Core

A feature is part of the common core if it has a corresponding representation in every output format. Bold survives because every supported format has a bold equivalent. Subscript may not survive in formats that lack inline-level subscript rendering.

**Inline marks:** `bold`, `italic`, `code`, `strikethrough`

**Block elements:** `paragraph`, `heading` (level 1–6), `code-block`, `horizontal-rule`

**Entities:** `link` (with `url`)

Features outside this core — `underline`, `highlight`, `insertion`, `deletion`, `embed`, `page-break`, `details`, social types (`mention`, `hashtag`) — are supported by specific format pairs and survive round-trips between those pairs. They are lost when exported to formats that have no equivalent (e.g., `underline` in plain CommonMark without HTML passthrough).

## Lexicon Registration Detail

```ts

// Called automatically — explicit call only needed in tests or custom setups
ensureRelationalTextLexicon()
```

`ensureRelationalTextLexicon()` calls `register_lexicon(JSON.stringify(relationalTextLexiconData))` once. This bulk-registers all entries from `formats/org.relationaltext/relationaltext.lexicon.json` with the WASM lexicon, covering both the `org.relationaltext.facet#*` hub keys and the legacy `org.relationaltext.richtext.mark#*` / `org.relationaltext.richtext.block#*` programmatic API keys.

The WASM registry starts empty on every module load. Individual format importers register their own lexicons lazily (`ensureXxxLexicon()` called at the top of each `from() / `toXxx` function). The hub lexicon is registered when `core.ts` is first imported — which happens transitively whenever any format module is loaded.
