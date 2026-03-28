# ProseMirror

ProseMirror is a toolkit for building rich text editors used as the underlying engine for TipTap, Atlassian Confluence, and many other applications. Its documents are represented as JSON trees of typed nodes with marks.

**Package:** `relational-text/prosemirror`
**Namespace:** `org.prosemirror.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('prosemirror', input: PMDoc | string): Document`

Parse a ProseMirror JSON document into a RelationalText Document.

```ts
const doc = from('prosemirror', {
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

Accepts either a `PMDoc` object or a JSON string. Supports:

- Inline marks: `bold` / `strong`, `italic` / `em`, `underline`, `strike` / `strikethrough`, `code`, `superscript`, `subscript`, `link`
- Block types: `paragraph`, `heading` (with `level` attr), `code_block` / `codeBlock`, `blockquote`, `bullet_list` / `bulletList`, `ordered_list` / `orderedList`, `horizontal_rule` / `horizontalRule`
- List structure: `list_item` / `listItem` containing paragraphs or nested lists
- Inline atoms: `hard_break` / `hardBreak`, inline and block `image`
- Unknown block types fall back to `paragraph`

The result is normalized through the WASM core.

### `to('prosemirror', doc: Document): PMDoc`

Render a RelationalText Document to a ProseMirror JSON object.

```ts
const pmDoc = to('prosemirror', doc)
// { type: 'doc', content: [...] }
```

Automatically applies any registered lenses targeting `org.prosemirror.facet` via `lensGraph.autoTransform()`. Documents imported from other formats (Markdown, HTML, TipTap, Quill, etc.) convert automatically through the lens graph before rendering.

Output uses the ProseMirror canonical snake_case node type names: `bullet_list`, `ordered_list`, `list_item`, `code_block`, `horizontal_rule`, `hard_break`.

### `ensureProseMirrorLexicon(): void`

Explicitly register the ProseMirror lexicon. Called automatically by `from('prosemirror', ...)` / `to('prosemirror', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| ProseMirror mark type | Feature name | RT hub name | Expand |
|-----------------------|-------------|-------------|--------|
| `bold` / `strong` | `bold` | `bold` | both sides |
| `italic` / `em` | `italic` | `italic` | both sides |
| `underline` | `underline` | `underline` | both sides |
| `strike` / `strikethrough` | `strike` | `strikethrough` | both sides |
| `code` | `code` | `code` | neither |
| `superscript` | `superscript` | `superscript` | neither |
| `subscript` | `subscript` | `subscript` | neither |

### Entities

| ProseMirror node / mark type | Feature name | RT hub name | Attrs |
|------------------------------|-------------|-------------|-------|
| `link` mark | `link` | `link` | `href` → RT `url`; `title?` |
| `image` (inline or block) | `image` | `image` | `src`, `alt`, `title?` |
| `hard_break` / `hardBreak` | `hard-break` | `line-break` | — |

### Block Elements

| ProseMirror node type | Feature name | Attrs |
|-----------------------|-------------|-------|
| `paragraph` | `paragraph` | — |
| `heading` | `heading` | `{ level: 1–6 }` |
| `code_block` / `codeBlock` | `code-block` | `{ language?: string }` |
| `horizontal_rule` / `horizontalRule` | `horizontal-rule` | — |
| `image` (block-level) | `image` | `src`, `alt`, `title?` |
| `blockquote` | `blockquote-marker` (+ `blockquote` container) | — |
| `bullet_list` / `bulletList` | `bullet-list-marker` (+ `ul` container) | — |
| `ordered_list` / `orderedList` | `ordered-list-marker` (+ `ol` / `ol:N` container) | `{ start?: number }` |
| `list_item` / `listItem` | `list-item-marker` (+ item container) | — |
| `paragraph` inside list item | `list-item-text` | — |

Structural marker blocks (`blockquote-marker`, `bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) are invisible separators used to encode nesting. They produce no output during export.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const pmDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'Hello' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'A ' },
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' text.' },
      ],
    },
  ],
}

const doc = from('prosemirror', pmDoc)
console.log(doc.text)
// "\uFFFCHello\nA link and bold text."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_')
const pmDoc = to('prosemirror', doc)
// {
//   type: 'doc',
//   content: [
//     { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
//     {
//       type: 'paragraph',
//       content: [
//         { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
//         { type: 'text', text: ' and ' },
//         { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
//       ],
//     },
//   ],
// }
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('prosemirror', {
  type: 'doc',
  content: [
    {
      type: 'bullet_list',
      content: [
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }] },
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }] },
      ],
    },
  ],
})

const html = to('html', doc)
// '<ul><li>Item one</li><li>Item two</li></ul>\n'
```

## Notes

- Both snake_case (`bullet_list`, `ordered_list`, `list_item`, `code_block`, `horizontal_rule`, `hard_break`) and camelCase (`bulletList`, `orderedList`, `listItem`, `codeBlock`, `horizontalRule`, `hardBreak`) node type names are accepted on import. Export always uses snake_case.
- Ordered lists with a `start` attribute other than 1 are preserved: the container is stored as `ol:N` (e.g. `ol:3`) and the `start` attr is restored on export.
- The link `href` attribute is renamed to `url` in the RT hub and renamed back to `href` on export.
- Images can appear as block-level nodes or as inline atoms. Block images occupy their own block marker; inline images occupy a span using the `alt` text as the span content.
- Code block content has a trailing `\n` appended during import per CommonMark convention. This newline is stripped before export so the `code_block` content matches the original.
- Unknown block types are treated as paragraphs on import. Unknown mark types are silently dropped.
