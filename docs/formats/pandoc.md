# Pandoc Markdown

Pandoc Markdown is a CommonMark superset supported by the universal document converter [Pandoc](https://pandoc.org). It adds YAML metadata blocks, fenced divs, bracketed spans, superscript/subscript, strikethrough, footnotes, and heading IDs.

**Package:** `relational-text/pandoc`
**Namespace:** `org.pandoc.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('pandoc', input: string): Document`

Parse a Pandoc Markdown string into a RelationalText Document.

```ts
const doc = from('pandoc', `---
title: My Document
author: Alice
---

## Introduction {#intro}

This has ^superscript^ and ~subscript~ and ~~strikethrough~~.

::: aside
A fenced div with class "aside".
:::

See the note.[^1]

[^1]: Footnote content here.
`)
```

Supports:

- YAML front matter (`---` blocks) — each key stored as a `metadata` block with `{ key, value }` attrs
- Headings with optional `{#id}` attribute suffix
- Fenced divs (`::: class … :::`) — stored as `div` blocks with `{ class }` attr
- Footnote refs (`[^key]`) and footnote definitions (`[^key]: text`)
- Bracketed spans (`[text]{.class #id}`)
- Standard CommonMark headings, code blocks, blockquotes, lists, HR, paragraphs
- Inline marks: `**strong**`, `*italic*`, `_italic_`, `~~strikethrough~~`, `^superscript^`, `~subscript~`, `` `code` ``

### `to('pandoc', doc: Document): string`

Render a RelationalText Document to Pandoc Markdown.

```ts
const md = to('pandoc', doc)
```

Metadata blocks are assembled into a YAML front-matter block at the top. Automatically applies lenses targeting `org.pandoc.facet` via `lensGraph.autoTransform()`.

### `ensurePandocLexicon(): void`

Explicitly register the Pandoc lexicon. Called automatically by `from('pandoc', ...)` / `to('pandoc', ...)` on first use.

## Feature Mapping

### Inline Marks

| Pandoc syntax | Feature name | RT hub name |
|---------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` / `_text_` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `^text^` | `superscript` | `superscript` |
| `~text~` | `subscript` | `subscript` |
| `` `text` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](src)` | `image` | `image` |
| `[text]{.class}` | `span` | — |
| `[^key]` | `footnote-ref` | — |

### Block Elements

| Pandoc syntax | Feature name | Attrs |
|---------------|-------------|-------|
| `# … ######` (+ optional `{#id}`) | `heading` | `{ level: 1–6, id?: string }` |
| ` ```lang ``` ` | `code-block` | `{ language?: string, id?: string }` |
| `::: class … :::` | `div` | `{ class?: string }` |
| `[^key]: text` | `footnote-def` | `{ key }` |
| `> text` | `blockquote-marker` | — |
| `- text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |
| `key: value` (front matter) | `metadata` | `{ key, value }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('pandoc', `---
title: My Paper
---

## Results {#results}

The formula: x^2^ + y^2^ = z^2^.

- First item
- Second item with ~~deleted~~ text

See the note.[^note]

[^note]: Footnote text here.
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_\n\n1. one\n2. two')
const pd = to('pandoc', doc)
// "## Heading\n\n**bold** and *italic*\n\n1. one\n2. two"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('pandoc', '## Title {#t}\n\nHello **world**.')
const html = to('html', doc)
// '<h2>Title</h2>\n<p>Hello <strong>world</strong>.</p>\n'
```

## Notes

- YAML front matter is parsed as flat `key: value` pairs. Nested YAML structures are stored as literal strings.
- Fenced divs (`::: class`) produce `div` blocks; on export, `div` blocks are wrapped with `:::`.
- Footnote refs (`[^key]`) are stored as inline `footnote-ref` entities. Footnote defs (`[^key]: text`) are `footnote-def` blocks. Both round-trip faithfully; cross-format conversions that don't support footnotes will drop them.
- The `pandoc-to-relationaltext` lens maps the core CommonMark subset to RT hub names. Pandoc-specific features (fenced divs, spans, footnotes, metadata) are not mapped to RT hub equivalents.
