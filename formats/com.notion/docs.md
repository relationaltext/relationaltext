# Notion

Import and export Notion API block objects as RelationalText documents.

**Package:** `relational-text/notion`
**Namespace:** `com.notion.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('notion', input: NotionBlock[] | string): Document`

Parse a Notion API blocks array into a Document. Accepts either a parsed array or a JSON string.

```ts
const blocks = [
  {
    type: 'heading_1',
    heading_1: {
      rich_text: [
        { type: 'text', text: { content: 'Hello' }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false } },
      ],
    },
  },
  {
    type: 'paragraph',
    paragraph: {
      rich_text: [
        { type: 'text', text: { content: 'World' }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false } },
      ],
    },
  },
]
const doc = from('notion', blocks)
```

Supported block types:

- `paragraph` — plain paragraph
- `callout` — mapped to `paragraph` (callout styling is dropped)
- `heading_1`, `heading_2`, `heading_3` — headings
- `bulleted_list_item` — unordered list item
- `numbered_list_item` — ordered list item
- `quote` — blockquote
- `code` — fenced code block with optional `language`
- `divider` — horizontal rule

Supported inline marks (from `annotations` object on each rich text element):

- `bold`, `italic`, `underline`, `strikethrough`, `code`
- Links from `text.link.url` or `href`

Non-`text` rich text elements (mentions, equations) are skipped. Unknown block types are silently ignored.

### `to('notion', doc: Document): NotionBlock[]`

Render a Document to an array of Notion API block objects.

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\nA **bold** word.')
const blocks = to('notion', doc)
// [
//   { type: 'heading_2', heading_2: { rich_text: [...] } },
//   { type: 'paragraph', paragraph: { rich_text: [...] } },
// ]
```

Automatically applies any registered lenses targeting `com.notion.facet` via `lensGraph.autoTransform()`. Documents from CommonMark, HTML, and other formats convert automatically when their lexicons are registered.

Rendered block types:

- `paragraph`, `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`, `numbered_list_item`
- `quote` (from blockquote containers)
- `code` (with `language` attr preserved)
- `divider` (from `horizontal-rule`)

Unknown block names fall back to `paragraph`.

### `ensureNotionLexicon(): void`

Register the `com.notion.facet` lexicon and the Notion-to-RT lens with `autoApply: true`. Called automatically by `from('notion', ...)` and `to('notion', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| Notion `annotations` | Feature name | Namespace | Expand |
|---|---|---|---|
| `bold: true` | `bold` | `com.notion.facet` | both sides |
| `italic: true` | `italic` | `com.notion.facet` | both sides |
| `underline: true` | `underline` | `com.notion.facet` | both sides |
| `strikethrough: true` | `strikethrough` | `com.notion.facet` | both sides |
| `code: true` | `code` | `com.notion.facet` | neither side |
| `text.link.url` / `href` | `link` (attr: `url`) | `com.notion.facet` | entity |

### Block Elements

| Notion block type | Feature name(s) | attrs |
|---|---|---|
| `paragraph` | `paragraph` | — |
| `callout` | `paragraph` | — |
| `heading_1` | `heading_1` | — |
| `heading_2` | `heading_2` | — |
| `heading_3` | `heading_3` | — |
| `bulleted_list_item` | `bullet-list-marker`, `list-item-marker`, `list-item-text` | — |
| `numbered_list_item` | `ordered-list-marker`, `list-item-marker`, `list-item-text` | — |
| `quote` | `blockquote-marker`, `paragraph` (`parents: ['blockquote']`) | — |
| `code` | `code` | `{ language? }` |
| `divider` | `divider` | — |

### Lens: Notion → RT Hub

The lens `com.notion.to.relationaltext.v1` is `invertible: false` because `heading_1`/`heading_2`/`heading_3` collapse into a single `heading` feature (with a numeric `level` attr), and `divider` → `horizontal-rule` is a name change with no unique inverse.

| Notion feature | RT hub feature | notes |
|---|---|---|
| `bold` | `bold` | identity |
| `italic` | `italic` | identity |
| `underline` | `underline` | identity |
| `strikethrough` | `strikethrough` | identity |
| `code` | `code` | identity |
| `link` | `link` | identity |
| `paragraph` | `paragraph` | identity |
| `heading_1` | `heading` | `addAttrs: { level: 1 }` |
| `heading_2` | `heading` | `addAttrs: { level: 2 }` |
| `heading_3` | `heading` | `addAttrs: { level: 3 }` |
| `code` (block) | `code-block` | featureClass: block |
| `list-item-text` | `list-item-text` | identity |
| `divider` | `horizontal-rule` | name change |
| `blockquote-marker` | `blockquote-marker` | identity |
| `bullet-list-marker` | `bullet-list-marker` | identity |
| `ordered-list-marker` | `ordered-list-marker` | identity |
| `list-item-marker` | `list-item-marker` | identity |

## Examples

### Import from Notion API

```ts
import { from } from 'relational-text/registry'

const blocks = [
  {
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [
        { type: 'text', text: { content: 'Item with ' }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false } },
        { type: 'text', text: { content: 'bold' }, annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false } },
      ],
    },
  },
]

const doc = from('notion', blocks)
```

### Export to Notion API

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\n- item one\n- item two\n\n```js\nconsole.log("hi")\n```')
const blocks = to('notion', doc)
// [
//   { type: 'heading_2', heading_2: { rich_text: [...] } },
//   { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [...] } },
//   { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [...] } },
//   { type: 'code', code: { rich_text: [...], language: 'js' } },
// ]
```

### Accept JSON string directly

```ts
import { from } from 'relational-text/registry'

const json = JSON.stringify([
  { type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Hello' }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false } }] } },
])

const doc = from('notion', json) // same as passing a parsed array
```

## Notes

- **List boundaries**: The importer tracks the type of the previous list item to emit a single `bullet-list-marker` or `ordered-list-marker` per consecutive run of like list items, not one per item. This matches the Kleppmann block model where the list container marker separates runs.
- **Heading granularity**: Notion exposes three heading levels (`heading_1`–`heading_3`). These are preserved verbatim as `com.notion.facet` features, then collapsed into `heading` with a numeric `level` attr by the RT lens.
- **Code blocks**: The `language` attr is taken from `code.language` on import and written back on export. When exporting and no language is present, Notion's conventional `"plain text"` string is used as the default.
- **Non-text rich text**: Notion `rich_text` arrays can contain `mention` or `equation` elements. Only `type: "text"` elements contribute text and marks; others are silently skipped.
- **`color` annotation**: Notion's `color` field is present in API responses but is not captured as a feature. The exporter always writes `color: "default"` in the annotations object.
- **`callout` blocks**: Mapped to `paragraph` on import. The icon and background color of a callout have no RT equivalent and are not preserved.
