# Markdown Format

RelationalText implements CommonMark 0.31 (652/652 spec tests passing) with GFM extensions. Features are stored under the `org.commonmark.facet` namespace for CommonMark elements and `org.gfm.facet` for GFM-specific extensions.

## Functions

```ts
import { from, to } from 'relational-text/registry'
import { normalizeMarkdown } from 'relational-text/markdown'
```

### `from('markdown', input: string): Document`

Parse a Markdown string into a Document.

```ts
const doc = from('markdown', '**Hello**, _world_!\n\n- item one\n- item two')
```

Supports:
- CommonMark 0.31 (full spec compliance)
- GFM strikethrough (`~~text~~`)
- GFM pipe tables
- Footnotes (via markdown-it-footnote)
- Definition lists (via markdown-it-deflist)

### `to('markdown', doc: Document | DocumentJSON): string`

Render a Document to a Markdown string.

```ts
const md = to('markdown', doc)
```

- Automatically applies any registered lenses targeting `org.commonmark.facet` via `lensGraph.autoTransform()`
- Documents from other formats (HTML, Mastodon, Quill, ProseMirror) convert automatically

### `normalizeMarkdown(input: string): string`

Normalize insignificant whitespace in a Markdown string without re-parsing.

Removes:
- CRLF line endings (normalized to LF)
- Trailing whitespace on every line
- Leading blank lines
- Trailing blank lines (keeps exactly one trailing newline)
- Runs of 3+ consecutive newlines (collapsed to one blank line)

Useful for round-trip testing: `normalizeMarkdown(x) === normalizeMarkdown(to('markdown', from('markdown', x)))`.

### `ensureMarkdownLexicon(): void`

Explicitly register the CommonMark lexicon (`org.commonmark.facet#*` types) and the GFM lexicon (`org.gfm.facet#*` types). Called automatically by `from('markdown', ...)` / `to('markdown', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks (CommonMark)

| Syntax | Feature name | Namespace |
|--------|-------------|-----------|
| `**bold**` / `__bold__` | `strong` | `org.commonmark.facet` |
| `_italic_` / `*italic*` | `emphasis` | `org.commonmark.facet` |
| `` `code` `` | `code-span` | `org.commonmark.facet` |
| `[text](url)` | `link` (attrs: `uri`, `title`) | `org.commonmark.facet` |
| `![alt](src)` | `image` (attrs: `src`, `alt`, `title`) | `org.commonmark.facet` |
| `  \n` (hard break) | `line-break` | `org.commonmark.facet` |
| `~~text~~` | `strikethrough` | `org.gfm.facet` |

### Block Elements (CommonMark)

| Syntax | Feature name | attrs |
|--------|-------------|-------|
| Paragraph | `paragraph` | — |
| `# Heading` | `heading` | `{ level: 1 }` |
| `## Heading` | `heading` | `{ level: 2 }` |
| Bullet list item | container: `ul`, block: `list-item-text` | — |
| Ordered list item | container: `ol`, block: `list-item-text` | — |
| `> quote` | container: `blockquote` | — |
| ` ``` ` fenced code | `code-block` | `{ language?: string }` |
| Indented code | `code-block` | — |
| `---` | `horizontal-rule` | — |

### Block Elements (GFM)

| Syntax | Feature name | Namespace | attrs |
|--------|-------------|-----------|-------|
| `\| col \| col \|` pipe table | `table` | `org.gfm.facet` | `{ headers: string[], rows: string[][] }` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('markdown', `
# Hello

A paragraph with **bold** and a [link](https://example.com).

- Item one
- Item two
`)

console.log(doc.text)
// "\uFFFCHello\n..."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('html', '<h2>Hello</h2><p><strong>bold</strong> text</p>')
const md = to('markdown', doc)
// '## Hello\n\n**bold** text\n\n'
```

### Round-Trip

```ts
import { from, to } from 'relational-text/registry'
import { normalizeMarkdown } from 'relational-text/markdown'

const input = '**Hello**, _world_!\n\n- a\n- b\n'
const normalized = normalizeMarkdown(input)
const roundTripped = normalizeMarkdown(to('markdown', from('markdown', input)))

console.log(normalized === roundTripped)  // true
```

## Hub Lenses

`ensureMarkdownLexicon()` registers the following hub lenses on demand. RelationalText uses `org.relationaltext.facet` as its hub format — all format-to-format paths go through RT, not directly between source formats.

| Lens | autoApply |
|------|-----------|
| `org.gfm.facet` → `org.relationaltext.facet` | `true` |
| `org.relationaltext.facet` ↔ `org.commonmark.facet` | `true` |

Because all 37 registered formats have a path to the RT hub, `to('markdown', ...)` can accept documents from any of them directly — the lens graph resolves multi-hop paths automatically.
