# WhatsApp Format

WhatsApp supports a simple inline formatting syntax in messages: `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``, triple-backtick code blocks, `> blockquote`, and bullet/ordered lists. It does not support headings or hyperlinks with display text. RelationalText imports and exports this format using the `com.whatsapp.facet` namespace.

**Package:** `relational-text/whatsapp`
**Namespace:** `com.whatsapp.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('whatsapp', input: string): Document`

Parse a WhatsApp-formatted string into a Document.

```ts
const doc = from('whatsapp', 'Hello *world*! _Isn\'t_ this `great`?')
```

Handles:

- Inline marks: `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``
- Block types: plain paragraphs, `> blockquote` lines, `- ` / `• ` bullet lists, `N. ` ordered lists
- Code blocks: triple-backtick fences (no language identifier — WhatsApp does not support syntax highlighting)

Each input line becomes its own paragraph block unless it is part of a list, blockquote, or code block. All lines are processed; blank lines are not skipped (each produces a paragraph).

### `to('whatsapp', doc: Document): string`

Render a Document to a WhatsApp-formatted string.

```ts
const whatsapp = to('whatsapp', doc)
```

Automatically applies any registered lenses targeting `com.whatsapp.facet` via `lensGraph.autoTransform()`. A Document parsed from another format (CommonMark, Slack, etc.) will have its features mapped to WhatsApp equivalents before rendering.

Block rendering behaviour:

- `paragraph` — rendered as a line followed by `\n`
- `list-item-text` — rendered with `- ` for bullet lists or `N. ` for ordered lists
- `code-block` — rendered as a triple-backtick fence (no language tag; WhatsApp ignores it)
- `bullet-list-marker`, `ordered-list-marker`, `list-item-marker`, `blockquote-marker` — structural separator blocks that produce no output

### `ensureWhatsAppLexicon(): void`

Register the WhatsApp lexicon and the `WhatsApp → RelationalText` lens with `autoApply: true`. Called automatically by `from('whatsapp', ...)` and `to('whatsapp', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| WhatsApp syntax | Feature name | Type ID | Expand | RT equivalent |
|---|---|---|---|---|
| `*text*` | `bold` | `com.whatsapp.facet#bold` | both | `bold` |
| `_text_` | `italic` | `com.whatsapp.facet#italic` | both | `italic` |
| `~text~` | `strikethrough` | `com.whatsapp.facet#strikethrough` | both | `strikethrough` |
| `` `text` `` | `code` | `com.whatsapp.facet#code` | none | `code` |

### Block Elements

| Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|
| `paragraph` | `com.whatsapp.facet#paragraph` | — | `paragraph` |
| `code-block` | `com.whatsapp.facet#code-block` | — | `code-block` |
| `blockquote-marker` | `com.whatsapp.facet#blockquote-marker` | — | `blockquote-marker` |
| `bullet-list-marker` | `com.whatsapp.facet#bullet-list-marker` | — | `bullet-list-marker` |
| `ordered-list-marker` | `com.whatsapp.facet#ordered-list-marker` | — | `ordered-list-marker` |
| `list-item-marker` | `com.whatsapp.facet#list-item-marker` | — | `list-item-marker` |
| `list-item-text` | `com.whatsapp.facet#list-item-text` | — | `list-item-text` |
| `horizontal-rule` | `com.whatsapp.facet#horizontal-rule` | — | `horizontal-rule` |

## Lens Integration

When `ensureWhatsAppLexicon()` is called it registers a `WhatsApp → RelationalText` lens (`com.whatsapp.to.relationaltext.v1`) with `autoApply: true`. All mappings are identity (feature names are shared with RT hub conventions). The `passthrough: "keep"` policy means features from other namespaces are preserved in the document.

```ts
import { from, to } from 'relational-text/registry'

// WhatsApp → Markdown
const doc = from('whatsapp', 'Hello *world*!')
const md = to('markdown', doc)
// 'Hello **world**!\n\n'

// Markdown → WhatsApp
const mdDoc = from('markdown', 'Hello **world**!')
const wa = to('whatsapp', mdDoc)
// 'Hello *world*!\n'
```

## Examples

### Parse a WhatsApp message with mixed formatting

```ts
import { from } from 'relational-text/registry'

const doc = from('whatsapp', '*Bold*, _italic_, ~strike~, and `code`.')
const json = doc.toJSON()
// text:   "Bold, italic, strike, and code."
// facets: [bold, italic, strikethrough, code] features over their respective spans
```

### Parse a blockquote

```ts
import { from } from 'relational-text/registry'

const doc = from('whatsapp', '> This is quoted text\nThis is not.')
// blockquote-marker block, then paragraph inside blockquote, then regular paragraph
```

### Parse a bullet list

```ts
import { from } from 'relational-text/registry'

const doc = from('whatsapp', '- first item\n- second item\n• third item')
// Three bullet list items (both - and • prefixes are recognised)
```

### Parse a code block

```ts
import { from } from 'relational-text/registry'

const doc = from('whatsapp', '```\nconst x = 1\n```')
// code-block block (no language attr)
// text content: "const x = 1\n"
```

### Cross-format: CommonMark to WhatsApp

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '**Bold** and ~~strike~~ text.\n\n- item one\n- item two\n')
const wa = to('whatsapp', doc)
// '*Bold* and ~strike~ text.\n- item one\n- item two\n'
```

## Notes

- **No headings.** WhatsApp does not support heading syntax. When exporting a document containing heading blocks, they fall through to the default renderer and are output as plain text lines.
- **No hyperlinks.** WhatsApp does not support Markdown-style inline links with separate display text and URL. There is no `link` feature in the WhatsApp lexicon. URLs in messages are auto-linked by the WhatsApp client.
- **No language tags on code blocks.** The WhatsApp client does not perform syntax highlighting. Code blocks are stored without a `language` attribute; the exporter outputs ` ``` ` fences without a language identifier.
- **Bullet prefixes `- ` and `• `.** The importer recognises both hyphen-space (`- `) and Unicode bullet-space (`• `) as bullet list item prefixes.
- **Expand semantics.** Bold, italic, and strikethrough marks expand on both sides (Peritext model). Inline code does not expand.
- **Implicit block type.** The WhatsApp lexicon declares `implicitBlockType: "paragraph"`.
