# Lexical

Lexical is Meta's open-source rich text editor framework used in Facebook, Instagram, and other Meta products. It uses a JSON document model where text formatting is encoded as a bitmask integer on text nodes rather than as a separate mark array.

**Package:** `relational-text/lexical`
**Namespace:** `io.lexical.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('lexical', input: LexicalDoc | string): Document`

Parse a Lexical JSON document into a RelationalText Document.

```ts
const doc = from('lexical', {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Hello, ', format: 0, version: 1 },
          { type: 'text', text: 'world', format: 1, version: 1 },  // bold
        ],
        direction: 'ltr', format: '', indent: 0, version: 1,
      },
    ],
    direction: 'ltr', format: '', indent: 0, version: 1,
  },
})
```

Accepts either a `LexicalDoc` object or a JSON string. Supports:

- Inline marks via `format` bitmask on `text` nodes: bold (1), italic (2), strikethrough (4), underline (8), code (16), subscript (32), superscript (64)
- Inline nodes: `linebreak`, `link` / `autolink` (with `url` field)
- Block types: `paragraph`, `heading` (with `tag` field, e.g. `'h1'`), `code` (code block, with `language` field), `quote` (blockquote), `list` (bullet or ordered, with `listType` field), `listitem`
- Rich embed blocks: `youtube` (with `videoID`), `tweet` (with `id`), `embedblock` (with `url`)
- Tables: `table`, `tablerow`, `tablecell` (with `headerState` bitmask)
- `code-highlight` child nodes inside code blocks are treated as plain text (no marks)
- Unknown block types fall back to `paragraph`

The result is normalized through the WASM core.

### `to('lexical', doc: Document): LexicalDoc`

Render a RelationalText Document to a Lexical JSON object.

```ts
const lexDoc = to('lexical', doc)
// { root: { type: 'root', children: [...], direction: 'ltr', format: '', indent: 0, version: 1 } }
```

Automatically applies any registered lenses targeting `io.lexical.facet` via `lensGraph.autoTransform()`. Documents imported from other formats (Markdown, HTML, ProseMirror, TipTap, Quill, etc.) convert automatically through the lens graph.

All output nodes include the Lexical-required `direction`, `format`, `indent`, and `version` fields. Text nodes carry a `format` bitmask derived from the accumulated marks.

### `ensureLexicalLexicon(): void`

Explicitly register the Lexical lexicon and the `lexical-to-relationaltext` lens (with `autoApply: true`). Called automatically by `from('lexical', ...)` / `to('lexical', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks (format bitmask)

| Bitmask bit | Feature name | RT hub name | Expand |
|-------------|-------------|-------------|--------|
| 1 (bold) | `bold` | `bold` | both sides |
| 2 (italic) | `italic` | `italic` | both sides |
| 4 (strikethrough) | `strikethrough` | `strikethrough` | both sides |
| 8 (underline) | `underline` | `underline` | both sides |
| 16 (code) | `code` | `code` | neither |
| 32 (subscript) | `subscript` | `subscript` | neither |
| 64 (superscript) | `superscript` | `superscript` | neither |

### Entities

| Lexical node type | Feature name | RT hub name | Attrs |
|-------------------|-------------|-------------|-------|
| `link` / `autolink` | `link` | `link` | `url` |
| `linebreak` | `linebreak` | `line-break` | — |

### Block Elements

| Lexical node type | Feature name | RT hub name | Attrs |
|-------------------|-------------|-------------|-------|
| `paragraph` | `paragraph` | `paragraph` | — |
| `heading` (tag: `h1`–`h6`) | `heading` | `heading` | `{ level: 1–6 }` |
| `code` | `code-block` | `code-block` | `{ language?: string }` |
| `quote` | `blockquote-marker` (+ `blockquote` container) | `blockquote-marker` | — |
| `list` (listType: `'bullet'`) | `bullet-list-marker` (+ `ul` container) | `bullet-list-marker` | — |
| `list` (listType: `'number'`) | `ordered-list-marker` (+ `ol` / `ol:N` container) | `ordered-list-marker` | `{ start?: number }` |
| `listitem` | `list-item-marker` + `list-item-text` | same | — |
| `youtube` | `embed` | `embed` | `{ embedType: 'youtube', url: string }` |
| `tweet` | `embed` | `embed` | `{ embedType: 'tweet', url: string }` |
| `embedblock` | `embed` | `embed` | `{ embedType: 'iframe', url: string }` |
| `table` | `table` | `table` | `{ headers: string[], rows: string[][] }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const lexDoc = {
  root: {
    type: 'root',
    children: [
      {
        type: 'heading',
        tag: 'h1',
        children: [{ type: 'text', text: 'Hello', format: 0, version: 1 }],
        direction: 'ltr', format: '', indent: 0, version: 1,
      },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Bold and ', format: 1, version: 1 },
          { type: 'text', text: 'italic', format: 3, version: 1 },  // bold | italic
        ],
        direction: 'ltr', format: '', indent: 0, version: 1,
      },
    ],
    direction: 'ltr', format: '', indent: 0, version: 1,
  },
}

const doc = from('lexical', lexDoc)
console.log(doc.text)
// "\uFFFCHello\nBold and italic"
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_')
const lexDoc = to('lexical', doc)
// {
//   root: {
//     type: 'root',
//     children: [
//       { type: 'heading', tag: 'h2', children: [...], ... },
//       { type: 'paragraph', children: [
//           { type: 'text', text: 'bold', format: 1, version: 1 },  // bold
//           { type: 'text', text: ' and ', format: 0, version: 1 },
//           { type: 'text', text: 'italic', format: 2, version: 1 }, // italic
//         ], ... },
//     ],
//     ...
//   },
// }
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const lexDoc = {
  root: {
    type: 'root',
    children: [
      {
        type: 'list',
        listType: 'bullet',
        start: 1,
        children: [
          { type: 'listitem', value: 1, children: [{ type: 'text', text: 'Item one', format: 0, version: 1 }], direction: 'ltr', format: '', indent: 0, version: 1 },
          { type: 'listitem', value: 2, children: [{ type: 'text', text: 'Item two', format: 0, version: 1 }], direction: 'ltr', format: '', indent: 0, version: 1 },
        ],
        direction: 'ltr', format: '', indent: 0, version: 1,
      },
    ],
    direction: 'ltr', format: '', indent: 0, version: 1,
  },
}

const doc = from('lexical', lexDoc)
const html = to('html', doc)
// '<ul><li>Item one</li><li>Item two</li></ul>\n'
```

## Notes

- Lexical text formatting uses a bitmask integer (`format` field) rather than a mark array. Multiple marks are combined with bitwise OR. On export, the bitmask is reconstructed by ORing together the bits for each active mark on a text node.
- The Lexical `heading` node carries the heading level as a `tag` field (e.g. `'h1'`, `'h2'`), not as a numeric attribute. On import, the level is parsed from the tag string. On export, the level is formatted back as `h${level}`.
- The Lexical `code` node type is a code block (not inline code). Inline code is encoded via bitmask bit 16 on a `text` node. The importer handles this distinction correctly.
- Horizontal rules export as `{ type: 'horizontalrule', version: 1 }`. The feature name in the lexicon is `horizontalrule` (lowercase, no hyphen) matching Lexical's native type string.
- YouTube and Twitter embeds are imported as `embed` blocks carrying `{ embedType: 'youtube'/'tweet', url }`. On export, `embed` blocks are emitted as `{ type: 'relationaltext-embed', url, embedType, ... }` since Lexical does not have a standard cross-platform embed node type.
- Table content is stored as a flat `{ headers, rows }` structure. Inline marks inside table cells are not preserved.
- The `listitem` `value` field (item index) is tracked during export and incremented automatically.
- Blockquote (`quote`) nodes in Lexical contain inline nodes directly, not wrapped paragraphs. The importer synthesizes a `paragraph` block inside the `blockquote` container to hold the inline content.
