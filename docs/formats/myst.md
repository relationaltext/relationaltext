# MyST Markdown

MyST (Markedly Structured Text) is a CommonMark superset designed for scientific and technical publishing in the Sphinx and Jupyter Book ecosystems. It adds directives, roles, math, admonitions, and cross-reference targets.

**Package:** `relational-text/myst`
**Namespace:** `org.mystmd.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('myst', input: string): Document`

Parse a MyST Markdown string into a RelationalText Document.

```ts
const doc = from('myst', `---
title: My Paper
---

(intro)=
## Introduction

See {term}\`glossary word\` and $E = mc^2$ inline math.

\`\`\`{note}
:class: tip

This is a note directive.
\`\`\`

$$
x = \\frac{-b}{2a}
$$
`)
```

Supports:

- YAML frontmatter (`---` blocks) — each key stored as a `frontmatter` block with `{ key, value }` attrs
- Target labels `(label)=` — stored as `target` attr on the following heading
- Directive blocks ` ```{name} args ` with `:option: val` lines
- Admonition blocks `:::{type} Title … :::`
- Math blocks `$$ … $$` — stored as `math-block` with `{ code }` attr
- Standard CommonMark headings, code blocks, blockquotes, lists, HR, paragraphs
- Inline roles `{name}\`content\`` — stored as `role` entity
- Inline math `$math$` — stored as `math-inline` entity
- Inline marks: `**strong**`, `*emphasis*`, `~~strikethrough~~`, `` `code` ``

### `to('myst', doc: Document): string`

Render a RelationalText Document to a MyST string.

```ts
const myst = to('myst', doc)
```

Automatically applies any registered lenses targeting `org.mystmd.facet` via `lensGraph.autoTransform()`. Frontmatter blocks are assembled into a YAML header. Directive and admonition blocks are round-tripped faithfully. Target labels are emitted before headings that carry a `target` attr.

### `ensureMystLexicon(): void`

Explicitly register the MyST lexicon. Called automatically by `from('myst', ...)` / `to('myst', ...)` on first use.

## Feature Mapping

### Inline Marks

| MyST syntax | Feature name | RT hub name |
|-------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `` `code` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](src)` | `image` | `image` |
| `{name}\`content\`` | `role` | — |
| `$math$` | `math-inline` | — |

### Block Elements

| MyST syntax | Feature name | Attrs |
|-------------|-------------|-------|
| `# … ######` | `heading` | `{ level: 1–6, target?: string }` |
| ` ```lang ``` ` | `code-block` | `{ language?: string }` |
| ` ```{name} args ` | `directive` | `{ name, args?, options? }` |
| `:::{type} Title` | `admonition` | `{ type, title? }` |
| `$$ … $$` | `math-block` | `{ code }` |
| `> text` | `blockquote-marker` | — |
| `- text` / `* text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |
| `key: value` (frontmatter) | `frontmatter` | `{ key, value }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('myst', `
## Results

The value $\\pi \\approx 3.14$.

\`\`\`{figure} diagram.png
:width: 80%

Caption here.
\`\`\`
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_\n\n- item one\n- item two')
const myst = to('myst', doc)
// "## Heading\n\n**bold** and *italic*\n\n- item one\n- item two"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('myst', '## Title\n\nHello **world**.')
const html = to('html', doc)
// '<h2>Title</h2>\n<p>Hello <strong>world</strong>.</p>\n'
```

## Notes

- Directive blocks (` ```{name} `) store their content as plain text and options as `attrs.options`. They are round-tripped faithfully but content is not semantically parsed.
- Math content (`math-inline` and `math-block`) has no RT hub equivalent; it passes through MyST round-trips but is dropped in conversions to formats that don't support math.
- Target labels `(label)=` are stored as `{ target: 'label' }` in the following heading's attrs and are re-emitted on export.
- The `myst-to-relationaltext` lens maps the common CommonMark subset to RT hub names. MyST-specific features (directives, admonitions, math, roles) are not mapped to RT hub equivalents.
