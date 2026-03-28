# HTML Format

RelationalText uses WHATWG HTML (via parse5) for import and export. Features are stored under the `org.w3c.html.facet` namespace with feature names equal to the HTML element tag name — `<strong>` becomes `strong`, `<p>` becomes `p`, and so on.

**Package:** `relational-text/html`
**Namespace:** `org.w3c.html.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('html', html: string): Document`

Parse an HTML string into a Document.

```ts
const doc = from('html', '<p>Hello, <strong>world</strong>!</p>')
```

- Block structure is derived from block-level elements (`<p>`, `<h1>`–`<h6>`, `<ul>`, `<ol>`, etc.)
- Inline marks are derived from span-level elements (`<strong>`, `<em>`, `<code>`, `<a>`, etc.)
- **All non-event attributes** (`class`, `id`, `data-*`, `style`, etc.) are captured verbatim on every element, enabling lossless round-trips even for elements with custom attributes
- Inline HTML pairs in CommonMark input are captured as `org.w3c.html.facet#{tagname}` spans; unmatched or complex inline HTML is stored as `raw` features
- Whitespace-only text nodes between block elements are discarded
- The result is normalized through the WASM core

### `to('html', doc: Document | DocumentJSON): string`

Render a Document to an HTML string.

```ts
const html = to('html', doc)
// '<p>Hello, <strong>world</strong>!</p>\n'
```

- Automatically applies any registered lenses targeting `org.w3c.html.facet` via `lensGraph.autoTransform()`
- Documents parsed from other formats (Markdown, Mastodon, Quill, ProseMirror, etc.) convert automatically through the lens graph before rendering

### `ensureHtmlLexicon(): void`

Explicitly register the HTML lexicon (`org.w3c.html.facet#*` types). Called automatically by `from('html', ...)` and `to('html', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

Feature names equal the element tag name. Every element in the WHATWG HTML spec is registered in the lexicon with the appropriate `featureClass` (`block`, `inline`, or `entity`).

### Inline Marks

Standard inline elements (all captured, attribute-preserving):

`<strong>`, `<b>`, `<em>`, `<i>`, `<s>`, `<strike>`, `<u>`, `<sup>`, `<sub>`, `<code>`, `<kbd>`, `<q>`, `<small>`, `<cite>`, `<dfn>`, `<var>`, `<samp>`, `<span>`, `<mark>`

Elements with semantically significant attributes:

| Element | Notable attrs |
|---------|--------------|
| `<abbr>` | `title` (abbreviation expansion) |
| `<time>` | `datetime` |
| `<del>` | `cite`, `datetime` |
| `<ins>` | `cite`, `datetime` |

### Block Elements

| Element | Feature name | Notes |
|---------|-------------|-------|
| `<p>` | `p` | Standard paragraph |
| `<h1>`–`<h6>` | `h1`–`h6` | Six heading levels |
| `<pre>` | `pre` | Preformatted text; child `<code>` preserved |
| `<hr>` | `hr` | Horizontal rule |
| `<blockquote>` | `blockquote` | Block-level quotation |
| `<ul>` | `ul` | Unordered list container |
| `<ol>` | `ol` | Ordered list container |
| `<li>` | `li` | List item; `list: "ul" \| "ol"` synthesized from parent |
| `<dl>` | `dl` | Definition list |
| `<dt>` | `dt` | Definition term |
| `<dd>` | `dd` | Definition detail |
| `<figure>` | `figure` | |
| `<figcaption>` | `figcaption` | |
| `<address>` | `address` | |
| `<summary>` | `summary` | (inside `<details>`) |
| `<div>`, `<section>`, `<article>`, `<nav>`, `<aside>`, `<header>`, `<footer>`, `<main>` | same as tag name | Structural containers; captured verbatim |

### Entities

| Element | Attrs |
|---------|-------|
| `<a>` | All attrs captured; `href` required for the feature to be emitted |
| `<br>` | — |
| `<img>` | All attrs captured (`src`, `alt`, `title`, etc.) |
| `<raw>` | `raw: string` — verbatim inline HTML stored when a token has no matching close tag |

### Lens to RelationalText Hub

The `html-to-relationaltext.lens.json` lens maps:

| HTML | RelationalText |
|------|----------------|
| `strong`, `b` | `bold` |
| `em`, `i` | `italic` |
| `s`, `strike`, `del` | `strikethrough` |
| `u` | `underline` |
| `sup` | `superscript` |
| `sub` | `subscript` |
| `code` | `code` |
| `kbd` | `keyboard` |
| `mark` | `highlight` |
| `ins` | `insertion` |
| `a` (href) | `link` (url) |
| `img` | `image` (src, alt) |
| `br` | `line-break` |
| `p` | `paragraph` |
| `h1`–`h6` | `heading` (level 1–6) |
| `pre` | `code-block` |
| `hr` | `horizontal-rule` |
| `blockquote` | `blockquote-marker` |
| `li` (list: "ul") | `list-item-text` (parents: `["ul"]`) |
| `li` (list: "ol") | `list-item-text` (parents: `["ol"]`) |

All other HTML-specific elements (`div`, `section`, `nav`, etc.) are dropped (`passthrough: drop`).

The inverse lens (`relationaltext-to-html.lens.json`) maps RT hub features back to HTML and is used by `to('html', ...)`.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('html', `
  <h1>Title</h1>
  <p>A paragraph with a <a href="https://example.com">link</a>.</p>
  <ul>
    <li>Item one</li>
    <li>Item two</li>
  </ul>
`)

console.log(doc.text)
// "\uFFFCTitle\nA paragraph with a link.\n\uFFFC\nItem one\nItem two"
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\n**bold** and _italic_')
const html = to('html', doc)
// '<h2>Hello</h2>\n<p><strong>bold</strong> and <em>italic</em></p>\n'
```

### Cross-Format Round-Trip

```ts
import { from, to } from 'relational-text/registry'

const input = '<p><strong>Hello</strong>, <em>world</em>!</p>'
const doc = from('html', input)
const output = to('html', doc)
// '<p><strong>Hello</strong>, <em>world</em>!</p>\n'
```

## Notes

- **Transliteration principle**: Feature names are the literal HTML tag names — no semantic mapping happens in the importer. `<strong>` is stored as `strong`, not `bold`. The `html-to-relationaltext` lens is the only place where HTML tag names are mapped to RT hub names.
- **All attributes captured**: Every non-event attribute is preserved verbatim on every element. This enables lossless HTML round-trips even for elements with custom `data-*`, `class`, or `style` attributes. When HTML features pass through the lens graph to other formats, format-specific renderers ignore unknown attrs gracefully.
- **Attribute order**: The WASM serializer uses `serde_json::BTreeMap` for feature data, so attribute order in round-tripped HTML is always alphabetical. `sha256(html) === sha256(to('html', from('html', html)))` holds up to attribute ordering and insignificant whitespace.
- **Inline HTML in Markdown**: `from('markdown', ...)` detects matched open/close HTML tag pairs in inline context and stores them as `org.w3c.html.facet#{tagname}` marks. Unmatched tokens (self-closing tags, processing instructions, CDATA, malformed comments) are stored as `org.w3c.html.facet#raw` with `{ raw: token }`.
- **`<pre>` and code blocks**: `<pre>` is stored as `pre` (a block element). A child `<code>` element inside `<pre>` is also captured as an inline `code` feature over the preformatted content. The RT→HTML lens maps `code-block` to `<pre><code>...</code></pre>`.
- **`passthrough: drop`**: The `html-to-relationaltext` lens uses `passthrough: drop` — HTML-specific structural elements without RT equivalents (`div`, `section`, `nav`, `aside`, etc.) are discarded when converting to other formats. They are preserved in the RT document; only the hub lens discards them.
