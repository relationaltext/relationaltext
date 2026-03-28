# Confluence / JIRA

Import and export Confluence Wiki Markup and JIRA markup as RelationalText documents. Both dialects share the same `com.atlassian.wiki.facet` namespace and are nearly identical in syntax.

**Package:** `relational-text/confluence`
**Namespace:** `com.atlassian.wiki.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('confluence', input: string): Document`

Parse a Confluence wiki markup string into a Document.

```ts
const doc = from('confluence', 'h1. Hello\n\nA paragraph with *bold* and _italic_ text.\n\n* Item one\n* Item two')
```

Supported block constructs:

- `h1.`–`h6.` — headings
- `* item` / `** nested` — bullet lists (supports multi-level nesting with repeated `*`)
- `# item` / `## nested` — ordered lists (supports multi-level nesting with repeated `#`)
- `> text` — blockquote (Confluence / Discord style)
- `bq. text` — blockquote (JIRA style)
- `{code}` / `{code:language}` ... `{code}` — fenced code block
- `{quote}` ... `{quote}` — block-level quote region
- `{note}` / `{warning}` / `{tip}` / `{info}` ... `{closing tag}` — admonition blocks
- `----` (four or more dashes) — horizontal rule
- Plain text line — paragraph

Supported inline constructs:

- `*bold*` — bold
- `_italic_` — italic
- `+underline+` — underline
- `-strikethrough-` — strikethrough
- `^superscript^` — superscript
- `~subscript~` — subscript
- <code v-pre>{{monospace}}</code> — inline code (monospace)
- `[display text|url]` — link with display text
- `[url]` — bare link

### `to('confluence', doc: Document): string`

Render a Document to a Confluence wiki markup string.

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\nA paragraph with **bold** and `code`.')
const markup = to('confluence', doc)
// 'h2. Hello\nA paragraph with *bold* and {{code}}.\n'
```

Automatically applies any registered lenses targeting `com.atlassian.wiki.facet` via `lensGraph.autoTransform()`. Documents from CommonMark, HTML, and other formats convert automatically when their lexicons are registered.

### `from('confluence', input: string): Document`

Parse a JIRA markup string into a Document. JIRA and Confluence share the same syntax. This is an alias for `from('confluence', ...)` that additionally handles the `bq. text` blockquote prefix (which `from('confluence', ...)` also handles).

```ts
const doc = from('confluence', 'h2. Bug Report\n\nbq. Reproduction steps here.\n\n# Step one\n# Step two')
```

### `to('jira', doc: Document): string`

Render a Document to a JIRA markup string. This is an alias for `to('confluence', ...)` — both formats produce identical output.

### `ensureConfluenceLexicon(): void`

Register the `com.atlassian.wiki.facet` lexicon and the Confluence-to-RT lens with `autoApply: true`. Called automatically by all import/export functions on first use. Safe to call multiple times.

## Feature Mapping

### Inline Marks

| Syntax | Feature name | Namespace | Expand |
|---|---|---|---|
| `*text*` | `bold` | `com.atlassian.wiki.facet` | both sides |
| `_text_` | `italic` | `com.atlassian.wiki.facet` | both sides |
| `+text+` | `underline` | `com.atlassian.wiki.facet` | both sides |
| `-text-` | `strikethrough` | `com.atlassian.wiki.facet` | both sides |
| `^text^` | `superscript` | `com.atlassian.wiki.facet` | neither side |
| `~text~` | `subscript` | `com.atlassian.wiki.facet` | neither side |
| <code v-pre>{{text}}</code> | `monospace` | `com.atlassian.wiki.facet` | neither side |
| `[text\|url]` / `[url]` | `link` (attrs: `uri`, `display?`) | `com.atlassian.wiki.facet` | entity |
| `!image.png!` | `image` | `com.atlassian.wiki.facet` | entity |

### Block Elements

| Syntax | Feature name | attrs |
|---|---|---|
| `h1.`–`h6.` | `heading` | `{ level: 1–6 }` |
| Plain paragraph | `paragraph` | — |
| `* item` | `bullet-list-marker`, `list-item-marker`, `list-item-text` | `{ level? }` for nesting |
| `# item` | `ordered-list-marker`, `list-item-marker`, `list-item-text` | `{ level? }` for nesting |
| `> text` / `bq. text` | `blockquote-marker`, `paragraph` (`parents: ['blockquote']`) | — |
| `{quote}` block | `blockquote-marker`, `paragraph` (`parents: ['blockquote']`) | — |
| `{code}` block | `code-block` | `{ language? }` |
| `{note}` / `{warning}` / `{tip}` / `{info}` | `admonition` | `{ type: 'note'\|'warning'\|'tip'\|'info' }` |
| `----` | `horizontal-rule` | — |

### Lens: Confluence → RT Hub

The lens `com.atlassian.wiki.to.relationaltext.v1` is `invertible: false` because `monospace` maps to RT `code` (shared with inline code spans from other formats) and `admonition` collapses to `blockquote-marker`.

| Confluence feature | RT hub feature | notes |
|---|---|---|
| `bold` | `bold` | identity |
| `italic` | `italic` | identity |
| `underline` | `underline` | identity |
| `strikethrough` | `strikethrough` | identity |
| `superscript` | `superscript` | identity |
| `subscript` | `subscript` | identity |
| `monospace` | `code` | name change |
| `link` | `link` | `renameAttrs: { uri → url }` |
| `image` | `image` | identity |
| `paragraph` | `paragraph` | identity |
| `heading` | `heading` | identity (level attr preserved) |
| `code-block` | `code-block` | identity |
| `blockquote-marker` | `blockquote-marker` | identity |
| `bullet-list-marker` | `bullet-list-marker` | identity |
| `ordered-list-marker` | `ordered-list-marker` | identity |
| `list-item-marker` | `list-item-marker` | identity |
| `list-item-text` | `list-item-text` | identity |
| `horizontal-rule` | `horizontal-rule` | identity |
| `admonition` | `blockquote-marker` | type attr dropped |

## Examples

### Import Confluence markup

```ts
import { from } from 'relational-text/registry'

const doc = from('confluence', `
h1. Project Overview

A *bold* statement with a [link|https://example.com].

* First item
* Second item

{code:python}
def hello():
    print("world")
{code}
`)
```

### Export to Confluence

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Title\n\nParagraph with **bold** and ~~strikethrough~~.')
const markup = to('confluence', doc)
// 'h1. Title\nParagraph with *bold* and -strikethrough-.\n'
```

### Import JIRA markup

```ts
import { from } from 'relational-text/registry'

const doc = from('confluence', `
h2. Bug Description

bq. Steps to reproduce the issue.

# Open the application
# Click the button
`)
```

### Admonition blocks

```ts
import { from, to } from 'relational-text/registry'

const doc = from('confluence', '{note}\nThis is a note.\n{note}')
// Stored as: com.atlassian.wiki.facet#admonition { type: 'note' }
// Lens maps to: org.relationaltext.facet#blockquote-marker

const out = to('confluence', doc)
// '{note}\nThis is a note.\n{note}\n'
```

## Notes

- **JIRA vs Confluence**: The two formats are syntactically identical for all constructs currently supported. `from('confluence', ...)` / `to('confluence', ...)` are direct aliases for `from('confluence', ...)` / `to('confluence', ...)`. The only JIRA-specific construct parsed is `bq. text`, which `from('confluence', ...)` also handles.
- **Inline regex parser**: Inline parsing uses a single regular expression. This means patterns like `-strikethrough-` will not match if the content contains a literal `-`. Confluence itself has similar limitations in its regex-based parser.
- **Admonitions**: `{note}`, `{warning}`, `{tip}`, and `{info}` blocks are imported as `admonition` features with a `type` attr. The lens maps them to `blockquote-marker` in RT (the `type` attr is lost). On export from RT, admonition blocks that originated in RT will render as `> paragraph` blockquotes rather than `{note}` macro blocks, because the lens is not invertible.
- **Multi-level lists**: Nesting depth is encoded by repeating the list character (`**`, `##`). The importer records a `level` attr on `list-item-text` for levels deeper than 1 and builds the `parents` array to represent nesting.
- **Link attrs**: The `link` feature stores `uri` (the URL) and optionally `display` (the explicit display text). The lens renames `uri` to `url` in RT. The renderer uses `[inner|uri]` when inner text differs from the URI, and `[uri]` for bare links.
- **Unclosed blocks**: If a `{code}`, `{quote}`, or admonition block is not closed before EOF, the importer flushes its accumulated content as if the closing tag were present.
