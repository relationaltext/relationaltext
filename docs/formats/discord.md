# Discord Markdown Format

Discord uses a subset of CommonMark-style markdown for message formatting, extended with Discord-specific features like spoiler tags (`||text||`), underline (`__text__`), and server-relative syntax. RelationalText imports and exports this format using the `com.discord.facet` namespace.

**Package:** `relational-text/discord`
**Namespace:** `com.discord.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('discord', input: string): Document`

Parse a Discord markdown string into a Document.

```ts
const doc = from('discord', 'Hello **world**! ||spoiler text||')
```

Handles:

- Inline marks: `**bold**`, `*italic*`, `_italic_`, `__underline__`, `~~strikethrough~~`, `` `code` ``, `||spoiler||`
- Links: `[display text](url)` — Markdown-style inline links
- Block types: `# H1`, `## H2`, `### H3` headings; `> blockquote`; `- ` / `* ` bullet lists; `1. ` ordered lists; horizontal rules (`---` or `***`)
- Code blocks: triple-backtick fences with optional language identifier
- Discord's `-# small text` is treated as a plain paragraph (no equivalent block type)

Empty lines are skipped. An unclosed code block at end-of-input is flushed automatically.

### `to('discord', doc: Document): string`

Render a Document to a Discord markdown string.

```ts
const markdown = to('discord', doc)
```

Automatically applies any registered lenses targeting `com.discord.facet` via `lensGraph.autoTransform()`. A Document parsed from another format (CommonMark, HTML, etc.) will have its features mapped to Discord equivalents before rendering.

Block rendering behaviour:

- `paragraph` — rendered as a plain line followed by `\n`
- `heading` — rendered as `# ` / `## ` / `### ` prefix based on the `level` attr (capped at 3)
- `list-item-text` — rendered with `- ` for bullet lists or `N. ` for ordered lists
- `code-block` — rendered as a triple-backtick fence with optional language tag
- `horizontal-rule` — rendered as `---`
- `blockquote-marker`, `bullet-list-marker`, `ordered-list-marker`, `list-item-marker` — structural separator blocks that produce no output

The trailing newline is stripped from the returned string.

### `ensureDiscordLexicon(): void`

Register the Discord lexicon and the `Discord → RelationalText` lens with `autoApply: true`. Called automatically by `from('discord', ...)` and `to('discord', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| Discord syntax | Feature name | Type ID | Expand | RT equivalent |
|---|---|---|---|---|
| `**text**` | `bold` | `com.discord.facet#bold` | both | `bold` |
| `*text*` or `_text_` | `italic` | `com.discord.facet#italic` | both | `italic` |
| `__text__` | `underline` | `com.discord.facet#underline` | both | `underline` |
| `~~text~~` | `strikethrough` | `com.discord.facet#strikethrough` | both | `strikethrough` |
| `\|\|text\|\|` | `spoiler` | `com.discord.facet#spoiler` | both | _(dropped by lens)_ |
| `` `text` `` | `code` | `com.discord.facet#code` | none | `code` |

### Entities

| Discord syntax | Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|---|
| `[text](url)` | `link` | `com.discord.facet#link` | `href` | `link` (attr renamed to `url`) |
| (hard line break) | `hard-break` | `com.discord.facet#hard-break` | — | `line-break` |
| (embedded image) | `image` | `com.discord.facet#image` | — | `image` |

### Block Elements

| Feature name | Type ID | Attrs | RT equivalent |
|---|---|---|---|
| `paragraph` | `com.discord.facet#paragraph` | — | `paragraph` |
| `heading` | `com.discord.facet#heading` | `level` (1–3) | `heading` |
| `code-block` | `com.discord.facet#code-block` | `language?` | `code-block` |
| `blockquote-marker` | `com.discord.facet#blockquote-marker` | — | `blockquote-marker` |
| `bullet-list-marker` | `com.discord.facet#bullet-list-marker` | — | `bullet-list-marker` |
| `ordered-list-marker` | `com.discord.facet#ordered-list-marker` | — | `ordered-list-marker` |
| `list-item-marker` | `com.discord.facet#list-item-marker` | — | `list-item-marker` |
| `list-item-text` | `com.discord.facet#list-item-text` | — | `list-item-text` |
| `horizontal-rule` | `com.discord.facet#horizontal-rule` | — | `horizontal-rule` |

## Lens Integration

When `ensureDiscordLexicon()` is called it registers a `Discord → RelationalText` lens (`com.discord.to.relationaltext.v1`) with `autoApply: true`. The lens is marked `invertible: false` because the `spoiler` feature is dropped (mapped to `null`) and the link `href` attr is renamed to `url`.

Notable mappings:

- `spoiler` is **dropped** — Discord spoiler text has no equivalent in the RT hub format
- `link` `href` attr is **renamed to `url`** to match RT conventions
- `hard-break` → `line-break`
- All structural block names map directly (identity mapping)

```ts
import { from, to } from 'relational-text/registry'

// Discord → Markdown
const doc = from('discord', 'Hello **world**!')
const md = to('markdown', doc)
// 'Hello **world**!\n\n'

// Markdown → Discord
const mdDoc = from('markdown', '# Title\n\nHello **world**!')
const discord = to('discord', mdDoc)
// '# Title\nHello **world**!'
```

## Examples

### Parse a Discord message with formatting

```ts
import { from } from 'relational-text/registry'

const doc = from('discord', '**Bold** and ~~strike~~ and ||spoiler||')
const json = doc.toJSON()
// text:   "Bold and strike and spoiler"
// facets: [bold over "Bold", strikethrough over "strike", spoiler over "spoiler"]
```

### Parse a message with headings and a list

```ts
import { from } from 'relational-text/registry'

const input = '# Heading\n\n- first item\n- second item\n1. ordered one\n2. ordered two'
const doc = from('discord', input)
// heading block (level: 1), two list-item-text blocks in ul, two in ol
```

### Parse a code block

```ts
import { from } from 'relational-text/registry'

const input = '```python\nprint("hello")\n```'
const doc = from('discord', input)
// code-block block with attrs: { language: 'python' }
```

### Cross-format: CommonMark to Discord

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Section\n\n**Bold** text with a [link](https://example.com).\n')
const discord = to('discord', doc)
// '## Section\n**Bold** text with a [link](https://example.com).'
```

## Notes

- **Spoiler text is lossy.** The `spoiler` feature (`||text||`) is dropped when converting to the RT hub. Round-tripping Discord → RT → Discord will lose spoiler annotations.
- **Headings capped at level 3.** Discord supports `#`, `##`, and `###` headings. The exporter caps any heading with `level > 3` at `### `.
- **Link attribute is `href` in the source.** The Discord `link` feature stores the URL as `href`. The lens renames this to `url` to match RT hub conventions. The exporter reads `href` from the HIR mark attrs (falling back to `uri`) when writing `[text](url)` output.
- **`-# small text` treated as paragraph.** Discord's subtext syntax (`-# `) has no semantic equivalent in RT; the importer treats it as a plain paragraph.
- **Expand semantics.** Bold, italic, underline, strikethrough, and spoiler marks expand on both sides. Inline code does not expand.
- **Implicit block type.** The Discord lexicon declares `implicitBlockType: "paragraph"` — text content without an explicit block feature is treated as belonging to a paragraph.
