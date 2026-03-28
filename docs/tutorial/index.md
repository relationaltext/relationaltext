# Your First Pipeline

In this tutorial you'll build a function that converts rich text between any two formats. You'll install the library, parse a document, inspect its wire format, convert to multiple targets simultaneously, and programmatically build a document — all from scratch.

**What you'll have at the end:** a working `convert(from, to, input)` function and a solid mental model of how RelationalText works.

---

## 1. Install and initialize

```bash
npm install relational-text
```

RelationalText ships a pre-built WASM binary. No Rust toolchain required.

Every app must call `initRelationalText()` once before any document operations:

```ts
import { initRelationalText } from 'relational-text'

await initRelationalText()
```

In a test suite:

```ts
import { initRelationalText } from 'relational-text'

beforeAll(() => initRelationalText())
```

---

## 2. Your first conversion

```ts
import { initRelationalText } from 'relational-text'
import { from, to } from 'relational-text/registry'

await initRelationalText()

const doc = from('markdown', '**Hello**, _world_!')
const html = to('html', doc)

console.log(html)
```

**You should see:**

```
<p><strong>Hello</strong>, <em>world</em>!</p>
```

`from('markdown', ...)` parses the Markdown string into a `Document`. `to('html', doc)` renders it. The document object between them is format-neutral.

---

## 3. Look inside the document

Before converting to HTML, inspect what `from('markdown', ...)` actually produced:

```ts
const doc = from('markdown', '**Hello**, _world_!')
console.log(JSON.stringify(doc.toJSON(), null, 2))
```

**You should see:**

```json
{
  "text": "\uFFFCHello, world!",
  "facets": [
    {
      "index": { "byteStart": 0, "byteEnd": 3 },
      "features": [{ "$type": "org.commonmark.facet", "name": "paragraph", "parents": [], "attrs": {} }]
    },
    {
      "index": { "byteStart": 3, "byteEnd": 8 },
      "features": [{ "$type": "org.commonmark.facet", "name": "strong" }]
    },
    {
      "index": { "byteStart": 11, "byteEnd": 16 },
      "features": [{ "$type": "org.commonmark.facet", "name": "emphasis" }]
    }
  ]
}
```

Two things to notice:

- **`text`** is a plain string. The `\uFFFC` at the start is a block marker — it tells the renderer "a paragraph starts here".
- **`facets`** are flat annotations. Each facet covers a byte range `[byteStart, byteEnd)` in the UTF-8 text and carries one or more typed features. Bold and italic are two independent annotations, not nested nodes.

This is the wire format — it never nests. Renderers compute the tree structure on demand.

---

## 4. Same document, multiple formats

The `from` / `to` functions accept any format name, letting you write format-agnostic pipelines:

```ts
import { from, to } from 'relational-text/registry'

await initRelationalText()

const doc = from('markdown', '**Hello** world — check out the [docs](https://example.com)')

console.log(to('html', doc))
console.log(to('slack', doc))
console.log(to('bluesky', doc))
```

**You should see:**

```
<p><strong>Hello</strong> world — check out the <a href="https://example.com">docs</a></p>

*Hello* world — check out the <https://example.com|docs>

Hello world — check out the docs [https://example.com]
```

The same `doc` object, three different string serializations. Bluesky's output looks different because the Bluesky wire format is JSON (the text string plus a facets array), not a markup string — the link becomes a facet annotation in the output.

---

## 5. See what changes across formats

Not every format supports every feature. Try italic on Bluesky:

```ts
const doc = from('markdown', '**bold** and _italic_')

console.log('→ bluesky:', to('bluesky', doc))
console.log('→ slack:  ', to('slack', doc))
console.log('→ html:   ', to('html', doc))
```

**You should see:**

```
→ bluesky: {"text":"\uFFFCbold and italic","facets":[...]}
→ slack:   *bold* and _italic_
→ html:    <p><strong>bold</strong> and <em>italic</em></p>
```

The Bluesky output retains bold (Bluesky supports `app.bsky.richtext.facet#bold`) but drops italic (Bluesky has no italic facet type). The drop is intentional — lenses define what maps to what between namespaces. See [Lenses](/lenses/) for how to inspect and customize these mappings.

---

## 6. Build a document from code

You don't have to start from a markup string. `Document.fromText` creates a plain-text document, and mutation methods layer annotations on top:

```ts
import { initRelationalText, Document } from 'relational-text'
import { to } from 'relational-text/registry'

await initRelationalText()

// "Visit our site" — 14 chars
const doc = Document.fromText('Visit our site')
  .addMark(10, 14, {
    $type: 'org.relationaltext.facet',
    name: 'link',
    attrs: { url: 'https://example.com' },
  })

console.log(to('html', doc))
```

**You should see:**

```html
<p>Visit our <a href="https://example.com">site</a></p>
```

The byte range `[10, 14)` covers "site" (all ASCII here, so bytes = chars). `addMark` works in UTF-8 byte offsets — see [Document Model](/guide/document-model) for how to compute offsets over multibyte characters.

You can chain mutations:

```ts
const doc = Document.fromText('Hello, world!')
  .addMark(0, 5, { $type: 'org.relationaltext.facet', name: 'bold' })
  .addMark(7, 12, { $type: 'org.relationaltext.facet', name: 'italic' })
```

---

## 7. Build a reusable convert function

Putting it all together — a utility that converts between any two registered formats:

```ts
import { initRelationalText } from 'relational-text'
import { from, to, type FormatName } from 'relational-text/registry'

await initRelationalText()

function convert(
  inputFormat: FormatName,
  outputFormat: FormatName,
  input: string,
): string {
  const doc = from(inputFormat, input)
  return to(outputFormat, doc)
}

// Examples:
convert('markdown', 'html',    '**Hello** _world_')
convert('markdown', 'slack',   '**Hello** _world_')
convert('html',     'markdown', '<p><strong>Hello</strong></p>')
convert('quill',    'html',    JSON.stringify({ ops: [{ insert: 'Hello', attributes: { bold: true } }] }))
```

`FormatName` is a union type of all 40+ registered format names. Your editor will autocomplete them.

---

## Next steps

You've seen the core pattern: `from` → `Document` → `to`. Everything else in RelationalText builds on it.

- **[Document Model](/guide/document-model)** — understand the wire format (text + facets) and how byte ranges work
- **[Blocks](/guide/blocks)** — how paragraph, heading, and list structure is encoded
- **[Marks](/guide/marks)** — how inline formatting (bold, italic, links) is encoded
- **[Formats Overview](/formats/)** — all 40+ supported formats and their feature sets
- **[Lenses](/lenses/)** — how feature mappings between namespaces work (and how to write your own)
- **[API Reference](/api/document)** — complete TypeScript API
