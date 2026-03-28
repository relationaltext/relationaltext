# LinkedIn Format

LinkedIn posts use a lightweight formatting syntax that supports `**bold**`, `*italic*` / `_italic_`, bullet lists (`• ` or `- `), ordered lists, `@[Name](urn:li:person:ID)` structured mentions, bare `@word` mentions, and `#hashtag` tags. Paragraphs are separated by blank lines. RelationalText imports and exports this format using the `com.linkedin.facet` namespace.

**Package:** `relational-text/linkedin`
**Namespace:** `com.linkedin.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('linkedin', input: string): Document`

Parse a LinkedIn post string into a Document.

```ts
const doc = from('linkedin', 'Excited to share this update!\n\n**Key points:**\n• First insight\n• Second insight\n\n#innovation @[Jane Doe](urn:li:person:abc123)')
```

Handles:

- Inline marks: `**bold**`, `*italic*`, `_italic_`
- Structured mentions: `@[Name](urn:li:...)` — stored with `personName` and `urn` attributes
- Bare mentions: `@word` — stored with `personName` set to the word and empty `urn`
- Hashtags: `#word` — the `#` character is included in the text content; stored with `tag` attribute
- Block types: paragraphs separated by blank lines, `• ` / `- ` bullet lists, `N. ` ordered lists

Consecutive non-blank lines that are not list items are accumulated and flushed as a single paragraph block (the lines are joined with `\n`). An empty input produces a single empty paragraph block.

### `to('linkedin', doc: Document): string`

Render a Document to a LinkedIn post string.

```ts
const post = to('linkedin', doc)
```

Automatically applies any registered lenses targeting `com.linkedin.facet` via `lensGraph.autoTransform()`. A Document parsed from another format will have its features mapped to LinkedIn equivalents before rendering.

Block rendering behaviour:

- `paragraph` — rendered as a text line; consecutive paragraphs are separated by a blank line (`\n`)
- `list-item-text` — rendered with `• ` for bullet lists or `N. ` for ordered lists
- `bullet-list-marker`, `ordered-list-marker`, `list-item-marker` — structural separator blocks that produce no output

Inline rendering behaviour:

- `bold` — `**text**`
- `italic` — `_text_`
- `mention` — `@[personName](urn)` if `urn` is present, else `@personName`
- `hashtag` — `#tag` (using the `tag` attr)

### `ensureLinkedInLexicon(): void`

Register the LinkedIn lexicon and the `LinkedIn → RelationalText` lens with `autoApply: true`. Called automatically by `from('linkedin', ...)` and `to('linkedin', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| LinkedIn syntax | Feature name | Type ID | Expand | RT equivalent |
|---|---|---|---|---|
| `**text**` | `bold` | `com.linkedin.facet#bold` | both | `bold` |
| `*text*` or `_text_` | `italic` | `com.linkedin.facet#italic` | both | `italic` |

### Entities

| LinkedIn syntax | Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|---|
| `@[Name](urn)` | `mention` | `com.linkedin.facet#mention` | `personName`, `urn` | `mention` (`personName` renamed to `handle`) |
| `@word` | `mention` | `com.linkedin.facet#mention` | `personName`, `urn: ""` | `mention` |
| `#word` | `hashtag` | `com.linkedin.facet#hashtag` | `tag` | `hashtag` |

### Block Elements

| Feature name | Type ID | RT equivalent |
|---|---|---|
| `paragraph` | `com.linkedin.facet#paragraph` | `paragraph` |
| `bullet-list-marker` | `com.linkedin.facet#bullet-list-marker` | `bullet-list-marker` |
| `ordered-list-marker` | `com.linkedin.facet#ordered-list-marker` | `ordered-list-marker` |
| `list-item-marker` | `com.linkedin.facet#list-item-marker` | `list-item-marker` |
| `list-item-text` | `com.linkedin.facet#list-item-text` | `list-item-text` |

## Lens Integration

When `ensureLinkedInLexicon()` is called it registers a `LinkedIn → RelationalText` lens (`com.linkedin.to.relationaltext.v1`) with `autoApply: true`. The lens is marked `invertible: false` because `mention` renames the `personName` attr to `handle`.

Notable mappings:

- `mention` `personName` attr is **renamed to `handle`** in the RT hub
- `hashtag` maps to RT `hashtag` (identity name mapping)
- All structural block names map directly

```ts
import { from, to } from 'relational-text/registry'

// LinkedIn → Markdown
const doc = from('linkedin', '**Great news** for everyone!')
const md = to('markdown', doc)
// '**Great news** for everyone!\n\n'

// Markdown → LinkedIn
const mdDoc = from('markdown', '**Great news** for everyone!')
const li = to('linkedin', mdDoc)
// '**Great news** for everyone!'
```

## Examples

### Parse a post with structured mention and hashtag

```ts
import { from } from 'relational-text/registry'

const post = 'Congrats to @[Jane Doe](urn:li:person:abc123) on the launch! #innovation'
const doc = from('linkedin', post)
const json = doc.toJSON()
// text:   "Congrats to Jane Doe on the launch! #innovation"
// facets: [mention over "Jane Doe" with personName="Jane Doe", urn="urn:li:person:abc123",
//          hashtag over "#innovation" with tag="innovation"]
```

### Parse a post with a bare mention

```ts
import { from } from 'relational-text/registry'

const doc = from('linkedin', 'Thanks @alice for the feedback!')
// mention feature over "alice" with personName="alice", urn=""
```

### Parse a post with lists

```ts
import { from } from 'relational-text/registry'

const post = 'Key takeaways:\n• Insight one\n• Insight two\n1. Step one\n2. Step two'
const doc = from('linkedin', post)
// paragraph block ("Key takeaways:"), two bullet items, two ordered items
```

### Multi-line paragraph

```ts
import { from } from 'relational-text/registry'

// Consecutive lines without blank separator are merged into one paragraph
const post = 'Line one\nLine two\n\nNew paragraph'
const doc = from('linkedin', post)
// paragraph("Line one\nLine two"), paragraph("New paragraph")
```

### Export to LinkedIn format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '**Bold** statement.\n\n- Item A\n- Item B\n')
const li = to('linkedin', doc)
// '**Bold** statement.\n• Item A\n• Item B\n'
// bullet items use • prefix in LinkedIn output
```

## Notes

- **Structured mention format.** LinkedIn's API encodes mentions as `@[Display Name](urn:li:person:ID)`. The importer stores both `personName` and `urn` as top-level fields on the feature (not nested under `attrs`). The exporter emits `@[personName](urn)` when `urn` is present, or `@personName` for bare mentions.
- **Hashtag text includes `#`.** The `#` character is included in the stored text content. The `tag` attribute holds the word without the `#`.
- **Paragraphs separated by blank lines.** The exporter inserts a blank line (`\n`) between consecutive paragraph blocks. List items are not separated by blank lines.
- **Bullet list prefix is `• `.** The exporter uses the Unicode bullet character (`•`) for bullet list items regardless of the original input prefix (`• ` or `- ` are both accepted on import).
- **`mention` attr rename.** The LinkedIn `mention` feature uses `personName` for the display name. The RT hub `mention` uses `handle`. The lens renames `personName` → `handle` on the way to RT, making the lens non-invertible.
- **No strikethrough or code marks.** The LinkedIn lexicon does not define strikethrough or inline code features.
- **Expand semantics.** Bold and italic marks expand on both sides. Mention and hashtag are entities (non-expanding).
- **Implicit block type.** The LinkedIn lexicon declares `implicitBlockType: "paragraph"`.
