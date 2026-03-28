# Logseq

Import Logseq Markdown graph exports as RelationalText documents. Logseq uses an outliner model where every piece of content is a bullet point; its export format is indented Markdown with Logseq-specific inline syntax. Export is not supported.

**Package:** `relational-text/logseq`
**Namespace:** `com.logseq.facet`

## Functions

```ts
import { from } from 'relational-text/registry'
```

### `from('logseq', input: string): Document`

Parse a Logseq Markdown export string into a Document.

```ts
import { from } from 'relational-text/registry'

const doc = from('logseq', `
- First block with **bold** and [[Page Reference]]
  - Child block #tag
  - DONE Completed task
- Another top-level block
  - key:: property value
`)
```

Logseq's export format consists entirely of bullet lines (`- `, `* `, or `+ `) at varying indent levels. Each bullet is one block. Non-bullet lines (headings, blank lines, etc.) are skipped.

Nesting depth is computed from the leading whitespace: each tab counts as one level, and every two spaces count as one level.

Supported constructs:

- **Bullet lines** at any indent: `- content`, `  - child`, `    - grandchild`
- **Task states** at the start of block content: `TODO content`, `DONE content`
- **Property lines**: `key:: value` (stored as a `property` block feature, not inline content)
- **Inline Markdown**: `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
- **Logseq-specific inline**: `[[page ref]]`, `((block ref uuid))`, `#[[tag with spaces]]`, `#word`, `[text](url)`

Empty lines and non-bullet lines are silently skipped.

### `ensureLogseqLexicon(): void`

Register the `com.logseq.facet` lexicon and the Logseq-to-RT lens with `autoApply: true`. Called automatically by `from('logseq', ...)` on first use. Safe to call multiple times.

## Feature Mapping

### Inline Marks

| Syntax | Feature name | Namespace | Expand |
|---|---|---|---|
| `**text**` | `bold` | `com.logseq.facet` | both sides |
| `*text*` | `italic` | `com.logseq.facet` | both sides |
| `~~text~~` | `strikethrough` | `com.logseq.facet` | both sides |
| `` `text` `` | `code` | `com.logseq.facet` | neither side |

### Entity Features (inline)

| Syntax | Feature name | attrs |
|---|---|---|
| `[[Page Name]]` | `page-ref` | `{ title }` |
| `((uuid))` | `block-ref` | `{ uuid }` |
| `#word` / `#[[tag with spaces]]` | `tag` | `{ tagName }` |
| `[text](url)` | `link` | `{ uri }` |

### Block Elements

| Source | Feature name | attrs | parents |
|---|---|---|---|
| Bullet line | `block` | `{ todo?: 'TODO'\|'DONE' }` | depth-based `['block', 'block', ...]` |
| Property line | `property` | `{ key, value }` | depth-based |

Depth is tracked via the `parents` array: a top-level bullet has `parents: []`, a first-level child has `parents: ['block']`, a second-level child has `parents: ['block', 'block']`, and so on.

### Lens: Logseq → RT Hub

The lens `com.logseq.to.relationaltext.v1` is `invertible: false`.

| Logseq feature | RT hub feature | notes |
|---|---|---|
| `bold` | `bold` | identity |
| `italic` | `italic` | identity |
| `strikethrough` | `strikethrough` | identity |
| `code` | `code` | identity |
| `link` | `link` | `renameAttrs: { uri → url }` |
| `page-ref` | `link` | `renameAttrs: { title → url }` — page name becomes URL |
| `tag` | `hashtag` | `renameAttrs: { tagName → tag }` |
| `block` | `list-item-text` | structure preserved |

The `block-ref` and `property` features have no rules in the lens and are dropped when converting to RT. The `todo` attr on `block` is also dropped.

## Examples

### Import a Logseq graph export

```ts
import { from, to } from 'relational-text/registry'

const input = `
- Project notes
  - Design decisions
    - Use Rust for the core
  - TODO Write tests
  - DONE Set up CI
- [[Related Page]] for context
`

const doc = from('logseq', input)
const md = to('markdown', doc)
```

### Access raw facets

```ts
import { from } from 'relational-text/registry'

const doc = from('logseq', '- Hello [[World]] #mytag')
const raw = JSON.parse(doc._raw())

// raw.facets includes:
// - com.logseq.facet#block (the bullet)
// - com.logseq.facet#page-ref spanning "World"
// - com.logseq.facet#tag spanning "#mytag"
```

### Property lines

```ts
import { from } from 'relational-text/registry'

const doc = from('logseq', `
- My Page
  - author:: Jane Smith
  - created:: 2024-01-15
  - Regular block content
`)

const raw = JSON.parse(doc._raw())
// Two property blocks:
//   com.logseq.facet#property { key: 'author', value: 'Jane Smith' }
//   com.logseq.facet#property { key: 'created', value: '2024-01-15' }
// One regular block:
//   com.logseq.facet#block
```

### Convert to Markdown

```ts
import { from, to } from 'relational-text/registry'

const doc = from('logseq', `
- Introduction
  - Background on the problem
  - **Key insight**: always measure first
- Methodology
  - Step one
  - Step two
`)

const md = to('markdown', doc)
// - Introduction
//   - Background on the problem
//   - **Key insight**: always measure first
// - Methodology
//   - Step one
//   - Step two
```

## Notes

- **Import-only**: There is no `to('logseq', ...)` function. Logseq's internal data model is graph-based and version-specific, making reliable export impractical from external tools.
- **Indent detection**: Indentation is computed by counting leading tabs (1 tab = 1 level) and spaces (2 spaces = 1 level). Mixed indentation is handled by summing both counts. Lines with inconsistent indentation may produce unexpected nesting depth.
- **Non-bullet lines skipped**: Logseq's Markdown export wraps all content in bullet points. Any line that does not start with `- `, `* `, or `+ ` (after stripping leading whitespace) is silently ignored. This includes Markdown headings, blank lines, and any preamble.
- **Property lines**: Lines matching `key:: value` (a word, optional hyphens, followed by `::` and a space) are captured as `property` block features with `{ key, value }` attrs. Their content is not parsed for inline markup. Property blocks have no rule in the lens and are dropped when converting to RT.
- **Task states**: `TODO` and `DONE` prefixes at the start of block content are captured in the `todo` attr of the `block` feature (`{ todo: 'TODO' }` or `{ todo: 'DONE' }`). The remaining content after stripping the prefix is parsed for inline markup. The `todo` attr is not present in the lens rules and is dropped on RT conversion.
- **Page references**: `[[Page Name]]` is stored as a `page-ref` entity with `{ title: 'Page Name' }` and the page name as the span text. The lens maps `page-ref` to RT `link` with `url` equal to the page name.
- **Block references**: `((uuid))` is stored as a `block-ref` entity with `{ uuid }` and the literal text `((uuid))` as the span. The lens has no rule for `block-ref`, so these are dropped on RT conversion.
- **Tags**: Both `#word` and `#[[tag with spaces]]` produce a `tag` entity with `{ tagName }` (without the `#` prefix). The lens maps these to RT `hashtag` with `{ tag }`.
- **`block-ref` vs Roam**: Logseq uses `((uuid))` and stores the identifier as `uuid` (UUID string). Roam Research uses the same syntax but stores its identifier as `uid`. Both map to a `block-ref` entity in their respective namespaces.
