# MultiMarkdown

MultiMarkdown (MMD) is a CommonMark superset created by Fletcher Penney that adds metadata blocks, footnotes, superscript/subscript, highlight, strikethrough, and table captions.

**Package:** `relational-text/multimarkdown`
**Namespace:** `org.multimarkdown.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('multimarkdown', input: string): Document`

Parse a MultiMarkdown string into a RelationalText Document.

```ts
const doc = from('multimarkdown', `Title: My Document
Author: Alice

## Introduction

This has ^superscript^ and ~subscript~ and ==highlight== and ~~strikethrough~~.

See the footnote.[^note]

[^note]: Footnote content here.
`)
```

Supports:

- Metadata block (key-value pairs before the first blank line) — each key stored as a `metadata` block with `{ key, value }` attrs
- Footnote refs (`[^key]`) and definitions (`[^key]: text`)
- Standard CommonMark headings, code blocks, blockquotes, lists, HR, paragraphs
- Inline marks: `**strong**`, `*italic*`, `_italic_`, `~~strikethrough~~`, `==highlight==`, `^superscript^`, `~subscript~`, `` `code` ``

### `to('multimarkdown', doc: Document): string`

Render a RelationalText Document to MultiMarkdown.

```ts
const mmd = to('multimarkdown', doc)
```

Metadata blocks are assembled at the top of the output, separated from the body by a blank line. Automatically applies lenses targeting `org.multimarkdown.facet` via `lensGraph.autoTransform()`.

### `ensureMultiMarkdownLexicon(): void`

Explicitly register the MultiMarkdown lexicon. Called automatically by `from('multimarkdown', ...)` / `to('multimarkdown', ...)` on first use.

## Feature Mapping

### Inline Marks

| MultiMarkdown syntax | Feature name | RT hub name |
|----------------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` / `_text_` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `==text==` | `highlight` | `highlight` |
| `^text^` | `superscript` | `superscript` |
| `~text~` | `subscript` | `subscript` |
| `` `text` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](url "title")` | `image` | `image` |
| `[^key]` | `footnote-ref` | — |

### Block Elements

| MultiMarkdown syntax | Feature name | Attrs |
|----------------------|-------------|-------|
| `# … ######` | `heading` | `{ level: 1–6 }` |
| ` ```lang ``` ` | `code-block` | `{ language?: string }` |
| `> text` | `blockquote-marker` | — |
| `- text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |
| `[^key]: text` | `footnote-def` | `{ key }` |
| `Key: Value` (metadata) | `metadata` | `{ key, value }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('multimarkdown', `Title: My Note
Tags: science

## Findings

The result is x^2^ with ==highlighted== text and ~subscript~.

See note.[^1]

[^1]: The footnote text.
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_')
const mmd = to('multimarkdown', doc)
// "## Heading\n\n**bold** and *italic*"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('multimarkdown', '## Title\n\nHello **world** with ==highlight==.')
const html = to('html', doc)
// '<h2>Title</h2>\n<p>Hello <strong>world</strong> with <mark>highlight</mark>.</p>\n'
```

## Notes

- The metadata block is only recognized at the very start of the document, before any blank line. Each line must be a `Key: Value` pair; the block ends at the first blank line.
- Footnote refs (`[^key]`) and defs (`[^key]: text`) are stored and round-tripped. Cross-format conversions to formats without footnote support will drop them.
- `highlight` (`==text==`) maps to RT hub `highlight`, which in turn maps to HTML `<mark>`.
- The `multimarkdown-to-relationaltext` lens maps the common subset to RT hub names, including `highlight`→`highlight`.
