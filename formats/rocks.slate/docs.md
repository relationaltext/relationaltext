# Slate

Slate.js is a customizable rich text editor framework for React. Unlike ProseMirror and TipTap, Slate's document model uses an opaque array of element nodes at the top level (no wrapping `doc` node), and text formatting is encoded as boolean properties directly on text leaf nodes rather than in a separate marks array.

**Package:** `relational-text/slate`
**Namespace:** `rocks.slate.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('slate', input: SlateDocument | string): Document`

Parse a Slate.js JSON document into a RelationalText Document.

```ts
const doc = from('slate', [
  {
    type: 'paragraph',
    children: [
      { text: 'Hello, ' },
      { text: 'world', bold: true },
    ],
  },
])
```

Accepts either a `SlateDocument` array or a JSON string. Supports:

- Inline marks as boolean properties on text leaf nodes: `bold`, `italic`, `underline`, `strikethrough` / `strike`, `code`, `superscript`, `subscript`
- Inline element nodes: `link` (with `url` or `href` field)
- Block types: `paragraph`, heading variants (`heading-one`–`heading-six`, `h1`–`h6`), `code` / `code-block`, `block-quote` / `blockquote`, `bulleted-list` / `ul` / `unordered-list`, `numbered-list` / `ol` / `ordered-list`, `list-item` / `li`, horizontal rule variants (`thematic-break`, `divider`, `horizontal-rule`, `hr`)
- List items may contain either inline text leaves or nested block elements
- Unknown block types fall back to `paragraph`

The result is normalized through the WASM core.

### `to('slate', doc: Document): SlateDocument`

Render a RelationalText Document to a Slate.js JSON array.

```ts
const slateDoc = to('slate', doc)
// [{ type: 'paragraph', children: [...] }, ...]
```

Automatically applies any registered lenses targeting `rocks.slate.facet` via `lensGraph.autoTransform()`. Documents imported from other formats (Markdown, HTML, ProseMirror, TipTap, Quill, etc.) convert automatically through the lens graph.

Output uses the Slate conventional type names: `bulleted-list`, `numbered-list`, `list-item`, `block-quote`, `thematic-break`, `heading-one` through `heading-six`.

### `ensureSlateLexicon(): void`

Explicitly register the Slate lexicon and the `slate-to-relationaltext` lens (with `autoApply: true`). Called automatically by `from('slate', ...)` / `to('slate', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks (boolean leaf properties)

| Slate leaf property | Feature name | RT hub name | Expand |
|---------------------|-------------|-------------|--------|
| `bold: true` | `bold` | `bold` | both sides |
| `italic: true` | `italic` | `italic` | both sides |
| `underline: true` | `underline` | `underline` | both sides |
| `strikethrough: true` / `strike: true` | `strikethrough` | `strikethrough` | both sides |
| `code: true` | `code` | `code` | neither |
| `superscript: true` | `superscript` | `superscript` | neither |
| `subscript: true` | `subscript` | `subscript` | neither |

Both `strikethrough` and `strike` are accepted on import; if both are present on the same leaf only one feature is emitted. Export always uses `strikethrough`.

### Entities

| Slate element / property | Feature name | RT hub name | Attrs |
|--------------------------|-------------|-------------|-------|
| `link` element | `link` | `link` | `url` (falls back to `href`) |
| `hard-break` (via RT hub) | `hard-break` | `line-break` | — |

### Block Elements

| Slate element type | Feature name | RT hub name | Attrs |
|--------------------|-------------|-------------|-------|
| `paragraph` | `paragraph` | `paragraph` | — |
| `heading-one` / `h1` | `heading` | `heading` | `{ level: 1 }` |
| `heading-two` / `h2` | `heading` | `heading` | `{ level: 2 }` |
| `heading-three` / `h3` | `heading` | `heading` | `{ level: 3 }` |
| `heading-four` / `h4` | `heading` | `heading` | `{ level: 4 }` |
| `heading-five` / `h5` | `heading` | `heading` | `{ level: 5 }` |
| `heading-six` / `h6` | `heading` | `heading` | `{ level: 6 }` |
| `code` / `code-block` | `code-block` | `code-block` | — |
| `thematic-break` / `divider` / `horizontal-rule` / `hr` | `horizontal-rule` | `horizontal-rule` | — |
| `block-quote` / `blockquote` | `blockquote-marker` (+ `blockquote` container) | same | — |
| `bulleted-list` / `ul` / `unordered-list` | `bullet-list-marker` (+ `ul` container) | same | — |
| `numbered-list` / `ol` / `ordered-list` | `ordered-list-marker` (+ `ol` container) | same | — |
| `list-item` / `li` | `list-item-marker` + `list-item-text` | same | — |

Structural marker blocks (`blockquote-marker`, `bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) are invisible separators used to encode nesting. They produce no output during export.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const slateDoc = [
  {
    type: 'heading-one',
    children: [{ text: 'Hello' }],
  },
  {
    type: 'paragraph',
    children: [
      { text: 'Visit ' },
      { type: 'link', url: 'https://example.com', children: [{ text: 'our site' }] },
      { text: '.' },
    ],
  },
]

const doc = from('slate', slateDoc)
console.log(doc.text)
// "\uFFFCHello\nVisit our site."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Title\n\n**bold** and _italic_ text')
const slateDoc = to('slate', doc)
// [
//   { type: 'heading-one', children: [{ text: 'Title' }] },
//   {
//     type: 'paragraph',
//     children: [
//       { text: 'bold', bold: true },
//       { text: ' and ' },
//       { text: 'italic', italic: true },
//       { text: ' text' },
//     ],
//   },
// ]
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

// Slate → ProseMirror via the RT hub
const slateDoc = [
  {
    type: 'bulleted-list',
    children: [
      { type: 'list-item', children: [{ text: 'Item one' }] },
      { type: 'list-item', children: [{ text: 'Item two' }] },
    ],
  },
]

const doc = from('slate', slateDoc)
const pmDoc = to('prosemirror', doc)
// { type: 'doc', content: [{ type: 'bullet_list', content: [...] }] }
```

## Notes

- Slate's document model is a plain array — there is no wrapping `doc` node. The `from('slate', ...)` input type is `SlateElement[]` and `to('slate', ...)` returns `SlateElement[]`.
- Text formatting uses boolean properties on leaf nodes (e.g. `{ text: 'hello', bold: true, italic: true }`). There is no marks array. On export, RelationalText marks are translated back to boolean properties on the text leaf.
- Heading types use verbose names on export: `heading-one` through `heading-six`. Import also accepts the shorthand `h1`–`h6` forms.
- List items may contain either inline text leaves directly or nested block elements (paragraphs, nested lists). The importer detects which case applies based on whether the first child is a text leaf or a typed element node.
- Code blocks do not preserve the language attribute — there is no standard slot for it in the default Slate schema. The feature is stored in the RT document but not emitted on export.
- Horizontal rule variants (`thematic-break`, `divider`, `horizontal-rule`, `hr`) are all accepted on import. Export always produces `{ type: 'thematic-break', children: [{ text: '' }] }`.
- Blockquotes on export use `block-quote` (hyphenated). The `children` array will always contain at least one element node to satisfy Slate's invariant that element children are non-empty.
- Block elements on export always include at least one text leaf (`{ text: '' }`) to satisfy Slate's constraint that element children must be non-empty.
