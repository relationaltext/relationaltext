# Slack mrkdwn Format

Slack mrkdwn is Slack's proprietary lightweight markup language used in messages, blocks, and notifications. It uses `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``, triple-backtick code fences, and `<url|display>` angle-bracket links. It is distinct from CommonMark — the syntax is simpler and incompatible.

**Package:** `relational-text/slack`
**Namespace:** `com.slack.mrkdwn.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('slack', input: string): Document`

Parse a Slack mrkdwn string into a Document.

```ts
const doc = from('slack', 'Hello *world*! Check out <https://example.com|this link>.')
```

Handles:

- Inline marks: `*bold*`, `_italic_`, `~strikethrough~`, `` `code` ``
- Links with display text: `<url|display>` — display text is stored as the text content, URL in the `url` attribute
- Bare links: `<url>` — the URL is emitted as both text content and the `url` attribute of a `link` feature
- User and channel refs: `<@user>` / `<#channel>` — emitted as plain text (not structured features)
- Block types: `paragraph`, `> blockquote` lines, `• ` / `- ` / `* ` bullet lists
- Code blocks: triple-backtick fences with optional language identifier

Empty lines are skipped and do not produce empty paragraph blocks. An unclosed code block at end-of-input is flushed automatically.

### `to('slack', doc: Document): string`

Render a Document to a Slack mrkdwn string.

```ts
const mrkdwn = to('slack', doc)
```

Automatically applies any registered lenses targeting `com.slack.mrkdwn.facet` via `lensGraph.autoTransform()`. A Document parsed from Markdown, HTML, or another format will have its features mapped to Slack equivalents before rendering.

Block rendering behaviour:

- `paragraph` — rendered as a plain line followed by `\n`
- `heading` — Slack has no heading syntax; rendered as `*bold text*`
- `list-item-text` — rendered with `- ` prefix
- `code-block` — rendered as a triple-backtick fence with optional language tag
- `horizontal-rule` — rendered as `---`
- `blockquote-marker`, `bullet-list-marker`, `list-item-marker` — structural separator blocks that produce no output; the surrounding context (e.g. `ctx.inBlockquote`) controls the `> ` prefix on paragraph lines

The trailing newline is stripped from the returned string.

### `ensureSlackLexicon(): void`

Register the Slack lexicon and the `Slack → RelationalText` lens with `autoApply: true`. Called automatically by `from('slack', ...)` and `to('slack', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| Slack syntax | Feature name | Type ID | Expand | RT equivalent |
|---|---|---|---|---|
| `*text*` | `bold` | `com.slack.mrkdwn.facet#bold` | both | `bold` |
| `_text_` | `italic` | `com.slack.mrkdwn.facet#italic` | both | `italic` |
| `~text~` | `strike` | `com.slack.mrkdwn.facet#strike` | both | `strikethrough` |
| `` `text` `` | `code` | `com.slack.mrkdwn.facet#code` | none | `code` |

### Entities

| Slack syntax | Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|---|
| `<url\|display>` | `link` | `com.slack.mrkdwn.facet#link` | `url` | `link` |
| `<url>` (bare) | `link` | `com.slack.mrkdwn.facet#link` | `url` | `link` |

### Block Elements

| Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|
| `paragraph` | `com.slack.mrkdwn.facet#paragraph` | — | `paragraph` |
| `code-block` | `com.slack.mrkdwn.facet#code-block` | `language?` | `code-block` |
| `list-item-text` | `com.slack.mrkdwn.facet#list-item-text` | — | `list-item-text` |
| `blockquote-marker` | `com.slack.mrkdwn.facet#blockquote-marker` | — | `blockquote-marker` |
| `bullet-list-marker` | `com.slack.mrkdwn.facet#bullet-list-marker` | — | `bullet-list-marker` |
| `list-item-marker` | `com.slack.mrkdwn.facet#list-item-marker` | — | `list-item-marker` |

## Lens Integration

When `ensureSlackLexicon()` is called it registers a `Slack → RelationalText` lens (`com.slack.to.relationaltext.v1`) with `autoApply: true`. The lens maps all Slack feature names directly to their RT equivalents (all mappings are identity — `bold` → `bold`, `code-block` → `code-block`, etc.). The `passthrough: "keep"` policy means features from other namespaces already in the document are preserved.

This enables bidirectional cross-format conversion through the lens graph:

```ts
import { from, to } from 'relational-text/registry'

// Slack → Markdown
const doc = from('slack', 'Hello *world*!')
const md = to('markdown', doc)
// 'Hello **world**!\n\n'

// Markdown → Slack
const mdDoc = from('markdown', 'Hello **world**!')
const mrkdwn = to('slack', mdDoc)
// 'Hello *world*!'
```

## Examples

### Parse a Slack message with a link

```ts
import { from } from 'relational-text/registry'

const doc = from('slack', "Check out <https://example.com|this article> — it's *great*!")
const json = doc.toJSON()
// text:   "Check out this article — it's great!"
// facets: [link over "this article" with url="https://example.com",
//          bold over "great"]
```

### Parse a code block with language tag

```ts
import { from } from 'relational-text/registry'

const input = '```typescript\nconst x = 1\n```'
const doc = from('slack', input)
// code-block block with attrs: { language: 'typescript' }
// text content: "const x = 1\n"
```

### Export a Markdown document to Slack

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Introduction\n\nHello **world**!\n\n- item one\n- item two\n')
const mrkdwn = to('slack', doc)
// '*Introduction*\nHello *world*!\n- item one\n- item two'
// heading rendered as bold; bullet items with - prefix
```

### Blockquote round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('slack', '> This is quoted\nAnd this is not.')
const out = to('slack', doc)
// '> This is quoted\nAnd this is not.'
```

## Notes

- **`@user` and `#channel` refs are plain text.** The Slack wire format encodes user and channel references as `<@U12345>` or `<#C12345>`. The importer treats angle-bracket refs beginning with `@` or `#` as plain text, not as structured mention features. Full Slack API integration (resolving user IDs) is outside the scope of this importer.
- **No ordered list support.** Slack mrkdwn does not define an ordered list syntax. The importer recognises `• `, `- `, and `* ` as bullet list prefixes only. The exporter renders all list items with `- ` regardless of original list type.
- **Headings degrade to bold.** Slack mrkdwn has no heading syntax. When exporting, heading blocks are rendered as `*heading text*`.
- **Link `url` attr.** The Slack `link` feature stores the URL in a `url` attribute (not `href` or `uri`). The lens maps this directly to the RT `link` `url` attr.
- **Expand semantics.** Bold, italic, and strikethrough marks use Peritext expand-on-both-sides semantics. Inline code does not expand — inserting text adjacent to a code span does not extend it.
