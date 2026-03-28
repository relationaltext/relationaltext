# Threads

Threads (Meta) is a social platform that uses a plain-text + facets format similar to Bluesky's atproto. Posts support bold and italic inline formatting, `@mentions`, `#hashtags`, and auto-linked URLs. Blank lines separate paragraphs.

**Package:** `relational-text/threads`
**Namespace:** `com.threads.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('threads', text: string): Document`

Parse a Threads caption string into a RelationalText Document.

```ts
const doc = from('threads', 
  'Hello **world**!\n\nVisit https://example.com or follow @alice.\n\n#typescript #webdev',
)
```

Supports:

- `**bold**` — bold inline mark
- `_italic_` — italic inline mark
- `@handle` — mention entity (stored with `{ handle }` attr)
- `#word` — hashtag entity (stored with `{ tag }` attr)
- `https://…` / `http://…` — auto-linked URL entity (stored with `{ url }` attr)
- Blank lines (`\n\n`) — paragraph boundaries
- Plain text

### `to('threads', doc: Document): string`

Render a RelationalText Document back to a Threads caption string.

```ts
const text = to('threads', doc)
```

Automatically applies lenses targeting `com.threads.facet` via `lensGraph.autoTransform()`. Paragraphs are separated by blank lines. Marks are rendered as `**bold**` and `_italic_`.

### `ensureThreadsLexicon(): void`

Explicitly register the Threads lexicon. Called automatically by `from('threads', ...)` / `to('threads', ...)` on first use.

## Feature Mapping

### Inline Marks

| Threads syntax | Feature name | RT hub name | Expand |
|----------------|-------------|-------------|--------|
| `**text**` | `bold` | `bold` | both sides |
| `_text_` | `italic` | `italic` | both sides |

### Entities

| Threads syntax | Feature name | Attrs |
|----------------|-------------|-------|
| `@handle` | `mention` | `{ handle: string }` |
| `#word` | `hashtag` | `{ tag: string }` |
| `https://…` | `link` | `{ url: string }` |

### Block Elements

| Threads syntax | Feature name |
|----------------|-------------|
| Paragraph (blank-line separated) | `paragraph` |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('threads', 
  'Just shipped **v2.0** of my project!\n\nCheck it out at https://example.com\n\n#webdev @alice',
)
console.log(doc.text)
// "\uFFFCJust shipped v2.0 of my project!\nCheck it out at https://example.com\n#webdev @alice"
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', 'Hello **world**!\n\nA second paragraph.')
const caption = to('threads', doc)
// "Hello **world**!\n\nA second paragraph."
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('threads', 'Hello **world** from @alice!')
const html = to('html', doc)
// '<p>Hello <strong>world</strong> from @alice!</p>\n'
```

## Notes

- Threads has very limited rich text support. Only `**bold**` and `_italic_` inline formatting is parsed. Most markdown syntax (headings, lists, code) is treated as plain text.
- Mentions (`@handle`) and hashtags (`#word`) are stored as entities with their identifier in attrs and preserved during round-trips. When converting to HTML, mentions and hashtags render as plain text since there is no universal URL mapping.
- Auto-linked URLs are stored as `link` entities with `{ url }`. On export, the URL is emitted as plain text (Threads renders URLs as clickable automatically).
- The `threads-to-relationaltext` lens maps `bold`→`bold`, `italic`→`italic`, `mention`→`mention`, `hashtag`→`hashtag`, and `link`→`link`.
