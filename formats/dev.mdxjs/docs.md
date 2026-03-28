# MDX

MDX is Markdown + JSX, combining CommonMark prose with React component syntax. It is the standard format for documentation sites built with Next.js, Docusaurus, Astro, and similar frameworks.

**Package:** `relational-text/mdx`
**Namespace:** `dev.mdxjs.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('mdx', input: string): Document`

Parse an MDX string into a RelationalText Document.

```ts
const doc = from('mdx', `---
title: Hello
---

import { Button } from './Button'

# Heading

A paragraph with **bold** and *italic* text.

<Alert type="warning">
  Watch out!
</Alert>
`)
```

Supports:

- YAML frontmatter (`---` blocks) — each key stored as a `frontmatter` block with `{ key, value }` attrs
- Top-level `import` statements — stored as `import-stmt` blocks with `{ code }` attr
- JSX block elements (`<Component>…</Component>` or `<Component />`) — stored as `jsx-block` blocks
- Inline JSX self-closing tags (`<Tag />`) — stored as `jsx-inline` entities
- JS expressions (`{expr}`) — stored as `expression` entities
- Standard CommonMark: headings, fenced code blocks, blockquotes, lists, horizontal rules, paragraphs
- Inline marks: `**strong**`, `*emphasis*`, `~~strikethrough~~`, `` `code` ``
- Links `[text](url)` and images `![alt](src)`

### `to('mdx', doc: Document): string`

Render a RelationalText Document back to an MDX string.

```ts
const mdx = to('mdx', doc)
```

Frontmatter blocks are collected and emitted as a contiguous YAML block at the top. Import blocks follow immediately after. JSX blocks are emitted as `<Tag>…</Tag>` or `<Tag />`. Everything else renders as standard CommonMark.

Automatically applies any registered lenses targeting `dev.mdxjs.facet` via `lensGraph.autoTransform()`.

### `ensureMDXLexicon(): void`

Explicitly register the MDX lexicon. Called automatically by `from('mdx', ...)` / `to('mdx', ...)` on first use. Safe to call multiple times.

## Feature Mapping

### Inline Marks

| MDX syntax | Feature name | RT hub name |
|------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `` `code` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](src)` | `image` | `image` |
| `<Tag />` (inline) | `jsx-inline` | — |
| `{expr}` | `expression` | — |

### Block Elements

| MDX syntax | Feature name | Attrs |
|------------|-------------|-------|
| `# … ######` | `heading` | `{ level: 1–6 }` |
| ` ```lang ` | `code-block` | `{ language?: string }` |
| `> text` | `blockquote-marker` | — |
| `- text` / `* text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |
| `key: value` (frontmatter) | `frontmatter` | `{ key, value }` |
| `import …` | `import-stmt` | `{ code }` |
| `<Tag>…</Tag>` | `jsx-block` | `{ tag, selfClosing?, props?, content? }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('mdx', `---
title: My Post
date: 2024-01-01
---

import { Callout } from './components'

## Introduction

This is a **paragraph** with a [link](https://example.com).
`)

console.log(doc.text)
// "\uFFFCMy Post\n2024-01-01\nIntroduction\nThis is a paragraph with a link."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_')
const mdx = to('mdx', doc)
// "## Heading\n\n**bold** and *italic*"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('mdx', '# Title\n\nHello **world**.')
const html = to('html', doc)
// '<h1>Title</h1>\n<p>Hello <strong>world</strong>.</p>\n'
```

## Notes

- JSX block detection uses uppercase-first tag names as a heuristic (`<Button>` is JSX, `<div>` is HTML). Lowercase custom elements are not detected as JSX blocks.
- YAML frontmatter is parsed as flat `key: value` lines. Nested YAML structures are not supported.
- `import` statements must start at the beginning of a line (no leading whitespace).
- MDX-specific features (`jsx-block`, `jsx-inline`, `expression`, `frontmatter`, `import-stmt`) have no RT hub equivalents and are silently dropped in cross-format conversions that don't support them.
- The `mdx-to-relationaltext` lens maps `strong`→`bold`, `emphasis`→`italic`, `strikethrough`→`strikethrough`, `link`→`link`, `heading`→`heading`, etc.
