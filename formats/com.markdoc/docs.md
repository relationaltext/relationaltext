# Markdoc

Markdoc is Stripe's CommonMark-based content authoring format. It extends CommonMark with structured tags (`{% tag %}`), variables (`$var`), annotations, conditionals, and YAML frontmatter for building documentation sites with custom components.

**Package:** `relational-text/markdoc`
**Namespace:** `com.markdoc.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('markdoc', text: string): Document`

Parse a Markdoc string into a RelationalText Document.

```ts
const doc = from('markdoc', `---
title: My Page
---

## Introduction

This is a paragraph with **bold** and *italic* text.

{% callout type="warning" %}
This is a callout block.
{% /callout %}

A variable: {% $pageTitle %}

An inline tag: {% badge label="New" /%}
`)
```

Supports:

- YAML frontmatter (`---` blocks) — each key stored as a `frontmatter` block with `{ key, value }` attrs
- Block tags `{% tag attrs %}…{% /tag %}` — stored as `tag-block` blocks with `{ tag, attrs? }` attrs
- Self-closing block tags `{% tag attrs /%}` — stored as `tag-block` blocks with `{ selfClosing: true }`
- Inline self-closing tags `{% tag /%}` — stored as `tag-inline` entities
- Variable interpolation `{% $varname %}` — stored as `variable` entities with `{ name }` attr
- Standard CommonMark: headings, code blocks, blockquotes, lists, HR, paragraphs
- Inline marks: `**strong**`, `*emphasis*`, `~~strikethrough~~`, `` `code` ``
- Links `[text](url)` and images `![alt](src)`

### `to('markdoc', doc: Document): string`

Render a RelationalText Document back to a Markdoc string.

```ts
const md = to('markdoc', doc)
```

Automatically applies lenses targeting `com.markdoc.facet` via `lensGraph.autoTransform()`. Frontmatter blocks are assembled into a YAML header. Tag blocks are emitted as `{% tag %}…{% /tag %}`.

### `ensureMarkdocLexicon(): void`

Explicitly register the Markdoc lexicon. Called automatically by `from('markdoc', ...)` / `to('markdoc', ...)` on first use.

## Feature Mapping

### Inline Marks

| Markdoc syntax | Feature name | RT hub name |
|----------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `` `code` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](src)` | `image` | `image` |
| `{% $var %}` | `variable` | — |
| `{% tag /%}` (inline) | `tag-inline` | — |

### Block Elements

| Markdoc syntax | Feature name | Attrs |
|----------------|-------------|-------|
| `# … ######` | `heading` | `{ level: 1–6 }` |
| ` ```lang ``` ` | `code-block` | `{ language?: string }` |
| `{% tag %}…{% /tag %}` | `tag-block` | `{ tag, attrs?, selfClosing? }` |
| `> text` | `blockquote-marker` | — |
| `- text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |
| `key: value` (frontmatter) | `frontmatter` | `{ key, value }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('markdoc', `---
title: Getting Started
---

## Overview

Install the package:

\`\`\`sh
npm install @markdoc/markdoc
\`\`\`

{% callout type="info" %}
Read the docs for more details.
{% /callout %}
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_')
const md = to('markdoc', doc)
// "## Heading\n\n**bold** and *italic*"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdoc', '## Title\n\nHello **world**.')
const html = to('html', doc)
// '<h2>Title</h2>\n<p>Hello <strong>world</strong>.</p>\n'
```

## Notes

- Markdoc tag attributes are stored in `attrs.attrs` as a plain object. Attribute values that are strings, booleans, or numbers are preserved; complex expressions are stored as strings.
- Markdoc-specific features (`tag-block`, `tag-inline`, `variable`, `frontmatter`) have no RT hub equivalents and are dropped in cross-format conversions to formats that don't support them.
- YAML frontmatter is parsed as flat `key: value` pairs. Nested YAML is not supported.
- The `markdoc-to-relationaltext` lens maps `strong`→`bold`, `emphasis`→`italic`, `link`→`link`, `heading`→`heading`, etc.
