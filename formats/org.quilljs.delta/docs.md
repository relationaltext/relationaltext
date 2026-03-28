# Quill Delta

Quill is an open-source rich text editor with a distinctive operational-transform data model called Delta. A Delta is a flat list of insert operations — each op carries optional inline attributes and may insert text, an image, a video, or a formula. Block structure (headings, lists, code blocks) is encoded in the attributes of trailing newline characters rather than through nesting.

**Package:** `relational-text/quill`
**Namespace:** `org.quilljs.delta.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('quill', input: QuillDelta | string): Document`

Parse a Quill Delta into a RelationalText Document.

```ts
const doc = from('quill', {
  ops: [
    { insert: 'Hello, ' },
    { insert: 'world', attributes: { bold: true } },
    { insert: '\n' },
  ],
})
```

Accepts either a `QuillDelta` object or a JSON string. Supports:

- Inline marks via op attributes: `bold`, `italic`, `underline`, `strike`, `code`, `script: 'super'` / `'sub'`, `link`, `color`, `background`, `font`, `size`
- Block types via trailing-newline op attributes: plain `\n` (paragraph), `{ header: 1–6 }`, `{ list: 'bullet' }`, `{ list: 'ordered' }`, `{ blockquote: true }`, `{ code-block: true }` / `{ code-block: 'language' }`
- Embed ops: `{ insert: { image: url } }`, `{ insert: { video: url } }`, `{ insert: { formula: string } }`
- Multi-line code blocks are accumulated across consecutive code-block newlines and emitted as a single `code-block` feature

The result is normalized through the WASM core.

### `to('quill', doc: Document): QuillDelta`

Render a RelationalText Document to a Quill Delta object.

```ts
const delta = to('quill', doc)
// { ops: [...] }
```

Automatically applies any registered lenses targeting `org.quilljs.delta.facet` via `lensGraph.autoTransform()`. Documents from other formats (Markdown, HTML, ProseMirror, TipTap, etc.) convert automatically through the lens graph.

Each block in the RelationalText document becomes a set of inline text ops followed by a trailing newline op that carries the block-type attributes. This matches the canonical Quill wire format.

### `ensureQuillLexicon(): void`

Explicitly register the Quill Delta lexicon. Called automatically by `from('quill', ...)` / `to('quill', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| Quill attribute | Feature name | RT hub name | Expand |
|-----------------|-------------|-------------|--------|
| `bold: true` | `bold` | `bold` | both sides |
| `italic: true` | `italic` | `italic` | both sides |
| `underline: true` | `underline` | `underline` | both sides |
| `strike: true` | `strike` | `strikethrough` | both sides |
| `code: true` | `code` | `code` | neither |
| `script: 'super'` | `script` (`value: "super"`) | `superscript` | neither |
| `script: 'sub'` | `script` (`value: "sub"`) | `subscript` | neither |
| `color: value` | `color` | (preserved, no RT equivalent) | both sides |
| `background: value` | `background` | (preserved, no RT equivalent) | both sides |
| `font: value` | `font` | (preserved, no RT equivalent) | both sides |
| `size: value` | `size` | (preserved, no RT equivalent) | both sides |
| `link: url` | `link` | `link` | — (entity) |

### Embed Entities

| Quill embed object | Feature name | Attrs |
|-------------------|-------------|-------|
| `{ image: url }` | `image` | `src: url` |
| `{ video: url }` | `video` | `src: url` |
| `{ formula: string }` | `formula` | `value: string` |

### Block Elements

| Trailing `\n` attribute | Feature name | RT hub name | Attrs |
|------------------------|-------------|-------------|-------|
| (none) | `paragraph` | `paragraph` | — |
| `{ header: N }` | `header` | `heading` | `{ level: N }` |
| `{ list: 'bullet' }` | `list-item-text` | `list-item-text` | — (with `bullet-list-marker`, `list-item-marker`) |
| `{ list: 'ordered' }` | `list-item-text` | `list-item-text` | — (with `ordered-list-marker`, `list-item-marker`) |
| `{ blockquote: true }` | `paragraph` (inside `blockquote` container) | `paragraph` | — |
| `{ code-block: true/string }` | `code-block` | `code-block` | `{ language?: string }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const delta = {
  ops: [
    { insert: 'Shopping List' },
    { insert: '\n', attributes: { header: 1 } },
    { insert: 'Apples' },
    { insert: '\n', attributes: { list: 'bullet' } },
    { insert: 'Bananas' },
    { insert: '\n', attributes: { list: 'bullet' } },
  ],
}

const doc = from('quill', delta)
console.log(doc.text)
// "\uFFFCShopping List\n..."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Title\n\n**bold** text\n\n- item one\n- item two')
const delta = to('quill', doc)
// {
//   ops: [
//     { insert: 'Title' },
//     { insert: '\n', attributes: { header: 1 } },
//     { insert: 'bold', attributes: { bold: true } },
//     { insert: ' text' },
//     { insert: '\n' },
//     { insert: 'item one' },
//     { insert: '\n', attributes: { list: 'bullet' } },
//     { insert: 'item two' },
//     { insert: '\n', attributes: { list: 'bullet' } },
//   ],
// }
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

// Quill → TipTap via the RT hub
const delta = {
  ops: [
    { insert: 'Hello', attributes: { bold: true } },
    { insert: '\n' },
  ],
}
const doc = from('quill', delta)
const tipTapDoc = to('tiptap', doc)
// { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }] }] }
```

## Notes

- The Quill Delta format is fundamentally flat: block type is determined by the attributes on the `\n` character that terminates each line, not by nesting. The importer reconstructs the tree structure using a container stack.
- Multi-line code blocks are accumulated internally across consecutive `{ code-block: ... }` lines and emitted as a single `code-block` feature. The language tag is taken from the first line whose `code-block` attribute is a non-empty string (e.g. `{ code-block: 'python' }`).
- When crossing list type boundaries (bullet → ordered or vice versa), the importer emits a fresh `bullet-list-marker` or `ordered-list-marker` so that the RT document faithfully encodes the separate lists.
- Presentational attributes (`color`, `background`, `font`, `size`) are preserved as features in the RT document but have no equivalent in the RT hub. They survive Quill round-trips but are dropped when converting to formats that do not support them.
- The `link` attribute in Quill can be either a string URL or an object with an `href` key. Both forms are accepted on import; export always produces a plain string URL.
- Blockquote paragraphs are encoded in Quill as `{ insert: '\n', attributes: { blockquote: true } }`. On export, any paragraph whose container stack includes `blockquote` gets this attribute.
