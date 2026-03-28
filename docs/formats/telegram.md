# Telegram MarkdownV2 Format

Telegram supports several formatting syntaxes for bot messages. RelationalText implements the MarkdownV2 style, which uses `*bold*`, `_italic_`, `__underline__`, `~strikethrough~`, `||spoiler||`, `` `code` ``, triple-backtick code fences, `[text](url)` links, and `> blockquote`. Plain text characters that overlap with markup delimiters must be escaped with a backslash.

**Package:** `relational-text/telegram`
**Namespace:** `org.telegram.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('telegram', input: string): Document`

Parse a Telegram MarkdownV2 string into a Document.

```ts
const doc = from('telegram', 'Hello *bold* and _italic_ text\\!')
```

Handles:

- MarkdownV2 escape sequences: `\\X` for any reserved character — the backslash is stripped and the literal character is stored
- Inline marks: `*bold*`, `_italic_`, `__underline__`, `~strikethrough~`, `||spoiler||`, `` `code` ``
- Links: `[display text](url)` — stored as `text_link` features with `href` attr (the Telegram Bot API entity type name)
- Block types: `> blockquote` lines, `- ` bullet lists, `N. ` ordered lists
- Code blocks: triple-backtick fences with optional language identifier

Each paragraph is one line. The importer does not merge consecutive lines into a single paragraph. An unclosed code block at end-of-input is flushed automatically.

### `to('telegram', doc: Document): string`

Render a Document to a Telegram MarkdownV2 string.

```ts
const mdv2 = to('telegram', doc)
```

Automatically applies any registered lenses targeting `org.telegram.facet` via `lensGraph.autoTransform()`. A Document parsed from another format will have its features converted to Telegram equivalents before rendering.

Plain text characters are escaped using the MarkdownV2 reserved character set: `_ * [ ] ( ) ~ \` > # + - = | { } . !` and backslash itself. Marks in the markup layers override escaping for their delimiters.

Block rendering behaviour:

- `paragraph` — rendered as a line followed by `\n`
- `code-block` — rendered as a triple-backtick fence with optional language tag; the trailing newline added during import is stripped before output
- `list-item-text` — rendered with `- ` for bullet lists or `N. ` for ordered lists
- `bullet-list-marker`, `ordered-list-marker`, `list-item-marker`, `blockquote-marker` — structural separator blocks that produce no output

### `ensureTelegramLexicon(): void`

Register the Telegram lexicon and the `Telegram → RelationalText` lens with `autoApply: true`. Called automatically by `from('telegram', ...)` and `to('telegram', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| MarkdownV2 syntax | Feature name | Type ID | Expand | RT equivalent |
|---|---|---|---|---|
| `*text*` | `bold` | `org.telegram.facet#bold` | both | `bold` |
| `_text_` | `italic` | `org.telegram.facet#italic` | both | `italic` |
| `__text__` | `underline` | `org.telegram.facet#underline` | both | `underline` |
| `~text~` | `strikethrough` | `org.telegram.facet#strikethrough` | both | `strikethrough` |
| `\|\|text\|\|` | `spoiler` | `org.telegram.facet#spoiler` | both | _(dropped by lens)_ |
| `` `text` `` | `code` | `org.telegram.facet#code` | none | `code` |

### Entities

| MarkdownV2 syntax | Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|---|
| `[text](url)` | `text_link` | `org.telegram.facet#text_link` | `href` | `link` (attr renamed to `url`) |

### Block Elements

| Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|
| `paragraph` | `org.telegram.facet#paragraph` | — | `paragraph` |
| `pre` | `org.telegram.facet#pre` | `language?` | `code-block` |
| `blockquote-marker` | `org.telegram.facet#blockquote-marker` | — | `blockquote-marker` |
| `bullet-list-marker` | `org.telegram.facet#bullet-list-marker` | — | `bullet-list-marker` |
| `ordered-list-marker` | `org.telegram.facet#ordered-list-marker` | — | `ordered-list-marker` |
| `list-item-marker` | `org.telegram.facet#list-item-marker` | — | `list-item-marker` |
| `list-item-text` | `org.telegram.facet#list-item-text` | — | `list-item-text` |
| `quote` | `org.telegram.facet#quote` | — | `blockquote-marker` |

## Lens Integration

When `ensureTelegramLexicon()` is called it registers a `Telegram → RelationalText` lens (`org.telegram.to.relationaltext.v1`) with `autoApply: true`. The lens is marked `invertible: false` because:

- `spoiler` is **dropped** (mapped to `null`) — no RT hub equivalent
- `text_link` `href` attr is **renamed to `url`**
- `quote` maps to `blockquote-marker` (name changes)

```ts
import { from, to } from 'relational-text/registry'

// Telegram → Markdown
const doc = from('telegram', 'Hello *bold* world\\!')
const md = to('markdown', doc)
// 'Hello **bold** world!\n\n'

// Markdown → Telegram
const mdDoc = from('markdown', 'Hello **bold** world!')
const tg = to('telegram', mdDoc)
// 'Hello *bold* world\!'
```

## Examples

### Parse MarkdownV2 with escapes

```ts
import { from } from 'relational-text/registry'

const doc = from('telegram', 'Price is \\$5\\.00 and it\\'s *on sale*\\!')
const json = doc.toJSON()
// text:   "Price is $5.00 and it's on sale!"
// facets: [bold over "on sale"]
```

### Parse a link

```ts
import { from } from 'relational-text/registry'

const doc = from('telegram', 'Visit [our site](https://example.com) today\\.')
const json = doc.toJSON()
// text:   "Visit our site today."
// facets: [text_link over "our site" with href="https://example.com"]
```

### Parse a code block with language

```ts
import { from } from 'relational-text/registry'

const input = '```rust\nfn main() {}\n```'
const doc = from('telegram', input)
// code-block block with attrs: { language: 'rust' }
```

### Lists

```ts
import { from } from 'relational-text/registry'

const doc = from('telegram', '- first\n- second\n1. one\n2. two')
// Two bullet list items, then two ordered list items
```

### Cross-format: CommonMark to Telegram

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '**Bold** and _italic_ with a [link](https://example.com).')
const tg = to('telegram', doc)
// '*Bold* and _italic_ with a [link](https://example\.com)\.'
```

## Notes

- **Spoiler text is lossy.** The `spoiler` feature (`||text||`) is dropped when converting to the RT hub. Round-tripping Telegram → RT → Telegram will lose spoiler annotations.
- **Feature name `text_link` not `link`.** The feature name follows the Telegram Bot API entity type naming. The Telegram Bot API uses `text_link` for hyperlinks. This is distinct from the RT hub `link` name. The lens performs the rename automatically.
- **MarkdownV2 escaping is required on export.** All reserved characters in plain text segments are escaped with a backslash. Marks handle their own delimiter characters and do not double-escape them.
- **`quote` block.** The Telegram lexicon includes a `quote` block feature (the expandable quote block available in newer Telegram clients). The lens maps `quote` → `blockquote-marker` in the RT hub.
- **`pre` entity.** The `pre` entity type (preformatted inline block) is mapped to `code-block` in the RT hub.
- **Expand semantics.** Bold, italic, underline, strikethrough, and spoiler marks expand on both sides. Inline code does not expand.
- **Implicit block type.** The Telegram lexicon declares `implicitBlockType: "paragraph"`.
- **One paragraph per line.** The importer does not merge consecutive non-blank lines into a single paragraph block. Each input line becomes its own paragraph unless it starts a list or blockquote.
