# TipTap

TipTap is a headless, framework-agnostic rich text editor built on ProseMirror. It is widely used in web applications for its extension system and React/Vue integrations. TipTap documents share a similar JSON shape with ProseMirror but use camelCase node type names and have a distinct extension set.

**Package:** `relational-text/tiptap`
**Namespace:** `dev.tiptap.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('tiptap', input: TipTapDoc | string): Document`

Parse a TipTap JSON document into a RelationalText Document.

```ts
const doc = from('tiptap', {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello, ' },
        { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
      ],
    },
  ],
})
```

Accepts either a `TipTapDoc` object or a JSON string. Supports:

- Inline marks: `bold`, `italic`, `underline`, `strike` / `strikethrough`, `code`, `superscript`, `subscript`, `link`
- Block types: `paragraph`, `heading` (with `level` attr), `codeBlock` / `code_block`, `blockquote`, `bulletList` / `bullet_list`, `orderedList` / `ordered_list`, `horizontalRule` / `horizontal_rule`
- List structure: `listItem` / `list_item` containing paragraphs or nested lists
- Inline atoms: `hardBreak` / `hard_break`, inline and block `image`
- Table support: `table` with `tableRow`, `tableHeader`, `tableCell` nodes
- Presentational marks (`textStyle`, `highlight`) are silently dropped on import
- Unknown block types fall back to `paragraph`

The result is normalized through the WASM core.

### `to('tiptap', doc: Document): TipTapDoc`

Render a RelationalText Document to a TipTap JSON object.

```ts
const tipTapDoc = to('tiptap', doc)
// { type: 'doc', content: [...] }
```

Automatically applies any registered lenses targeting `dev.tiptap.facet` via `lensGraph.autoTransform()`. Documents imported from other formats (Markdown, HTML, ProseMirror, Quill, etc.) convert automatically through the lens graph.

Output uses TipTap camelCase node type names: `bulletList`, `orderedList`, `listItem`, `codeBlock`, `horizontalRule`, `hardBreak`.

### `ensureTipTapLexicon(): void`

Explicitly register the TipTap lexicon and the `tiptap-to-relationaltext` lens (with `autoApply: true`). Called automatically by `from('tiptap', ...)` / `to('tiptap', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| TipTap mark type | Feature name | RT hub name | Expand |
|------------------|-------------|-------------|--------|
| `bold` | `bold` | `bold` | both sides |
| `italic` | `italic` | `italic` | both sides |
| `underline` | `underline` | `underline` | both sides |
| `strike` / `strikethrough` | `strike` | `strikethrough` | both sides |
| `code` | `code` | `code` | neither |
| `superscript` | `superscript` | `superscript` | neither |
| `subscript` | `subscript` | `subscript` | neither |
| `textStyle` | (dropped) | — | — |
| `highlight` | (dropped) | — | — |

### Entities

| TipTap node / mark type | Feature name | RT hub name | Attrs |
|-------------------------|-------------|-------------|-------|
| `link` mark | `link` | `link` | `href` → RT `url`; `title?` |
| `image` (inline or block) | `image` | `image` | `src`, `alt`, `title?` |
| `hardBreak` / `hard_break` | `hardBreak` | `line-break` | — |

### Block Elements

| TipTap node type | Feature name | Attrs |
|------------------|-------------|-------|
| `paragraph` | `paragraph` | — |
| `heading` | `heading` | `{ level: 1–6 }` |
| `codeBlock` / `code_block` | `codeBlock` → RT `code-block` | `{ language?: string }` |
| `horizontalRule` / `horizontal_rule` | `horizontalRule` → RT `horizontal-rule` | — |
| `table` | `table` | `{ headers: string[], rows: string[][] }` |
| `blockquote` | `blockquote-marker` (+ `blockquote` container) | — |
| `bulletList` / `bullet_list` | `bullet-list-marker` (+ `ul` container) | — |
| `orderedList` / `ordered_list` | `ordered-list-marker` (+ `ol` / `ol:N` container) | `{ start?: number }` |
| `listItem` / `list_item` | `list-item-marker` (+ item container) | — |
| `paragraph` inside list item | `list-item-text` | — |

Structural marker blocks (`blockquote-marker`, `bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) are invisible separators used to encode nesting. They produce no output during export.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const tipTapDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Hello' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Visit ' },
        {
          type: 'text',
          text: 'our site',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
        { type: 'text', text: '.' },
      ],
    },
  ],
}

const doc = from('tiptap', tipTapDoc)
console.log(doc.text)
// "\uFFFCHello\nVisit our site."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Title\n\n**bold** and _italic_ text')
const tipTapDoc = to('tiptap', doc)
// {
//   type: 'doc',
//   content: [
//     { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
//     {
//       type: 'paragraph',
//       content: [
//         { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
//         { type: 'text', text: ' and ' },
//         { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
//         { type: 'text', text: ' text' },
//       ],
//     },
//   ],
// }
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

// TipTap → ProseMirror via the RT hub
const doc = from('tiptap', {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }] },
  ],
})

const pmDoc = to('prosemirror', doc)
// { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }] }] }
```

## Notes

- Both camelCase (`bulletList`, `orderedList`, `listItem`, `codeBlock`, `horizontalRule`, `hardBreak`) and snake_case (`bullet_list`, `ordered_list`, `list_item`, `code_block`, `horizontal_rule`, `hard_break`) node type names are accepted on import. Export always uses camelCase.
- TipTap `image` nodes are always treated as inline entities (`entity` featureClass), even when they appear at the block level in the TipTap JSON. Block-level images are wrapped in a synthesized `paragraph` block on import and unwrapped back to top-level `image` nodes on export.
- Table content is stored as a flat `{ headers, rows }` structure. Inline marks inside table cells are not preserved — only the plain text content is captured.
- Ordered lists with a `start` attribute other than 1 are preserved: the container is stored as `ol:N` (e.g. `ol:3`) and the `start` attr is restored on export.
- The link `href` attribute is renamed to `url` in the RT hub and renamed back to `href` on export.
- The `ensureTipTapLexicon()` call registers the `tiptap-to-relationaltext` lens with `autoApply: true`, enabling `to('tiptap', ...)` to accept documents from any format that has a path to the RT hub in the lens graph.
