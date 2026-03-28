# Roam Research

Import Roam Research JSON export files as RelationalText documents. Export is not supported — Roam's export format is complex and Roam does not expose a stable API for writing back structured data.

**Package:** `relational-text/roam`
**Namespace:** `com.roamresearch.facet`

## Functions

```ts
import { from } from 'relational-text/registry'
```

### `from('roam', input: RoamExport | string): Document`

Parse a Roam Research JSON export into a Document. Accepts either a parsed `RoamExport` array or a raw JSON string.

```ts
import { from } from 'relational-text/registry'

const pages = [
  {
    title: 'My Page',
    uid: 'page-uid-1',
    children: [
      {
        string: 'A block with **bold** and [[Page Reference]].',
        uid: 'block-uid-1',
        order: 0,
        children: [
          {
            string: 'A nested child block.',
            uid: 'block-uid-2',
            order: 0,
          },
        ],
      },
    ],
  },
]

const doc = from('roam', pages)
```

Roam's JSON export format is an array of pages (`RoamPage[]`). Each page has a `title`, optional `uid`, and optional `children` (`RoamBlock[]`). Each block has a `string` (the content), an optional `uid`, an optional `order` (for sorting siblings), and optional `children`.

The importer:

1. Emits a `page` block for each page, with the page title as inline content.
2. Recursively walks each page's `children`, sorting siblings by `order`.
3. Emits a `block` feature for each block, with inline content parsed from `string`.
4. Tracks nesting depth through the `parents` array on each block feature.

Supported inline syntax in block strings:

- `**bold**` — bold
- `__italic__` — italic (double underscore)
- `^^highlight^^` — highlight (double caret)
- `` `code` `` — inline code
- `[[Page Name]]` — page reference
- `((uid))` — block reference
- `#[[tag with spaces]]` — tag with spaces (hash + double bracket)
- `#word` — simple hashtag
- `[text](url)` — Markdown-style link
- `![alt](url)` — image

### `ensureRoamLexicon(): void`

Register the `com.roamresearch.facet` lexicon and the Roam-to-RT lens with `autoApply: true`. Called automatically by `from('roam', ...)` on first use. Safe to call multiple times.

## TypeScript Types

```ts
/** A single block in Roam's JSON export. */
interface RoamBlock {
  string: string
  uid?: string
  order?: number
  children?: RoamBlock[]
  heading?: number
}

/** A page in Roam's JSON export. */
interface RoamPage {
  title: string
  uid?: string
  children?: RoamBlock[]
}

/** The top-level export format: an array of pages. */
type RoamExport = RoamPage[]
```

## Feature Mapping

### Inline Marks

| Roam syntax | Feature name | Namespace | Expand |
|---|---|---|---|
| `**text**` | `bold` | `com.roamresearch.facet` | both sides |
| `__text__` | `italic` | `com.roamresearch.facet` | both sides |
| `^^text^^` | `highlight` | `com.roamresearch.facet` | both sides |
| `` `text` `` | `code` | `com.roamresearch.facet` | neither side |

### Entity Features (inline)

| Roam syntax | Feature name | attrs |
|---|---|---|
| `[[Page Name]]` | `page-ref` | `{ title }` |
| `((uid))` | `block-ref` | `{ uid }` |
| `#word` / `#[[tag with spaces]]` | `tag` | `{ tag }` |
| `[text](url)` | `link` | `{ uri }` |
| `![alt](url)` | `image` | `{ src, alt? }` |

### Block Elements

| Source | Feature name | attrs |
|---|---|---|
| Page | `page` | `{ title, uid? }` |
| Block | `block` | `{ uid? }` |

Block nesting is represented by the `parents` array. A top-level block under a page has `parents: ['page']`. A block nested one level deep has `parents: ['page', 'block']`. Each additional nesting level appends another `'block'` entry.

### Lens: Roam → RT Hub

The lens `com.roamresearch.to.relationaltext.v1` is `invertible: false`.

| Roam feature | RT hub feature | notes |
|---|---|---|
| `bold` | `bold` | identity |
| `italic` | `italic` | identity |
| `highlight` | `highlight` | identity |
| `code` | `code` | identity |
| `link` | `link` | `renameAttrs: { uri → url }` |
| `image` | `image` | `src` and `alt` preserved |
| `page-ref` | `link` | `renameAttrs: { title → url }` — page name becomes URL |
| `tag` | `hashtag` | `renameAttrs: { tag → tag }` |
| `block` | `paragraph` | structure flattened |
| `page` | `heading` | `addAttrs: { level: 1 }` |

The `block-ref` feature (`((uid))`) has no rule in the lens and is dropped when converting to RT. It can be consumed by downstream tooling before the lens runs.

## Examples

### Import a Roam JSON export file

```ts
import { from, to } from 'relational-text/registry'
import { readFileSync } from 'fs'

const json = readFileSync('roam-export.json', 'utf8')
const doc = from('roam', json)
const md = to('markdown', doc)
```

### Access raw facets

```ts
import { from } from 'relational-text/registry'

const doc = from('roam', [
  {
    title: 'Research',
    children: [
      { string: 'See [[Related Topic]] for more.', order: 0, uid: 'b1' },
    ],
  },
])

const raw = JSON.parse(doc._raw())
// raw.facets contains com.roamresearch.facet features:
// - page block for "Research"
// - block block for "See [[Related Topic]] for more."
// - page-ref entity spanning "Related Topic"
```

### Convert Roam export to Markdown

```ts
import { from, to } from 'relational-text/registry'

const doc = from('roam', [
  {
    title: 'Project Alpha',
    children: [
      { string: '**Goal**: ship by Q2', order: 0 },
      { string: 'Tasks', order: 1, children: [
        { string: 'Design phase', order: 0 },
        { string: 'Implementation', order: 1 },
      ]},
    ],
  },
])

const md = to('markdown', doc)
// # Project Alpha
//
// **Goal**: ship by Q2
//
// Tasks
//
// - Design phase
// - Implementation
```

## Notes

- **Import-only**: There is no `to('roam', ...)` function. Roam Research does not expose a stable programmatic API for writing data, and its internal JSON schema is subject to change. Use `to('markdown', ...)` or another format for export.
- **Block ordering**: Siblings are sorted by their `order` field before processing. If `order` is absent, a default of `0` is used, which preserves the array order for any blocks without an explicit order.
- **Page references**: `[[Page Name]]` is stored as a `page-ref` entity with `{ title: 'Page Name' }` and the page name as the span text. The lens maps `page-ref` to RT `link` with `url` set to the page title. No URL resolution or vault lookup is performed.
- **Block references**: `((uid))` is stored as a `block-ref` entity with `{ uid }` and the literal text `((uid))` as the span. The lens does not have a rule for `block-ref`, so these features are dropped when converting to RT.
- **Highlight syntax**: Roam uses `^^text^^` (double caret) for highlights, in contrast to Obsidian's `==text==`. Both are captured as `highlight` in their respective namespaces, both map to RT `highlight`.
- **Italic syntax**: Roam uses `__text__` (double underscore) for italic rather than the CommonMark `_text_` or `*text*`.
- **Tags**: Both `#word` and `#[[tag with spaces]]` are stored as `tag` entities with the tag name in the `tag` attr (without the `#` prefix). The lens maps them to RT `hashtag` with the same `tag` attr.
- **`heading` field on blocks**: Roam blocks can carry a `heading` field (1, 2, or 3) indicating that the block should render as a heading. This field is not currently parsed by the importer; all blocks are emitted as generic `block` features regardless of their `heading` value.
