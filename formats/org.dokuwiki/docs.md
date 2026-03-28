# DokuWiki Format

RelationalText implements DokuWiki markup import and export. Features are stored under the `org.dokuwiki.facet` namespace with feature names drawn from DokuWiki's own syntax documentation.

**Package:** `relational-text/dokuwiki`
**Namespace:** `org.dokuwiki.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('dokuwiki', input: string): Document`

Parse a DokuWiki markup string into a Document.

```ts
const doc = from('dokuwiki', '====== Page Title ======\n\nA paragraph with **bold** and //italic//.')
```

Supports:

- Inline marks: `**bold**`, `//italic//`, `__underline__`, `''monospace''`, `<del>strikethrough</del>`
- Internal wiki links: `[[page]]` and `[[page|display text]]`
- External links: `[[https://url]]` and `[[https://url|display text]]`
- Images: <code v-pre>{{src}}</code> and <code v-pre>{{src|alt}}</code>
- Forced line break: `\\`
- No-parse escapes: `%%literal%%` and `<nowiki>literal</nowiki>` (both emitted as plain text)
- Headings: `======` (level 1) through `==` (level 6) — DokuWiki's equals-count is inverted
- Paragraphs
- Bullet lists: two or more spaces + `*` + space (indent depth controls nesting)
- Ordered lists: two or more spaces + `-` + space (indent depth controls nesting)
- Blockquotes: `> text` lines and `<blockquote>...</blockquote>` tags
- Code blocks: `<code>...</code>` and `<code lang>...</code>`
- Horizontal rules: four or more dashes (`----`)

The result is normalized through the WASM core. Unclosed `<code>` blocks at end-of-file are flushed automatically.

### `to('dokuwiki', doc: Document): string`

Render a Document to a DokuWiki markup string.

```ts
const wiki = to('dokuwiki', doc)
```

- Automatically applies any registered lenses targeting `org.dokuwiki.facet` via `lensGraph.autoTransform()`
- Documents from other formats (Markdown, HTML, etc.) convert automatically through the lens graph

### `ensureDokuWikiLexicon(): void`

Explicitly register the DokuWiki lexicon (`org.dokuwiki.facet#*` types) and its lens to the RT hub. Called automatically by `from('dokuwiki', ...)` and `to('dokuwiki', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| DokuWiki syntax | Feature name | expand |
|-----------------|--------------|--------|
| `**text**` | `bold` | both sides |
| `//text//` | `italic` | both sides |
| `__text__` | `underline` | both sides |
| `<del>text</del>` | `strikethrough` | both sides |
| `''text''` | `monospace` | neither |

### Entities

| DokuWiki syntax | Feature name | Attrs |
|-----------------|--------------|-------|
| `[[page]]` | `wikilink` | `page` |
| `[[page\|display]]` | `wikilink` | `page`, `display` |
| `[[https://url]]` | `extlink` | `uri` |
| `[[https://url\|display]]` | `extlink` | `uri` (display text is the covered text span) |
| <code v-pre>{{src}}</code> | `image` | `src` |
| <code v-pre>{{src&#124;alt}}</code> | `image` | `src`, `alt` |
| `\\` (forced newline) | `line-break` | — |

Link detection: if the target of a `[[...]]` link starts with `https://` or `http://`, it becomes an `extlink`; otherwise a `wikilink`.

### Block Elements

| DokuWiki syntax | Feature name | Attrs |
|-----------------|--------------|-------|
| Paragraph | `paragraph` | — |
| `====== H1 ======` | `heading` | `{ level: 1 }` |
| `===== H2 =====` | `heading` | `{ level: 2 }` |
| `== H6 ==` | `heading` | `{ level: 6 }` |
| `<code>` / `<code lang>` | `code-block` | `{ language?: string }` |
| Bullet list item (`  * `) | `list-item-text` (parents: `["ul", "unordered-list-item"]`) | — |
| Ordered list item (`  - `) | `list-item-text` (parents: `["ol", "ordered-list-item"]`) | — |
| `> text` / `<blockquote>` | `paragraph` (parents: `["blockquote"]`) | — |
| `----` | `horizontal-rule` | — |

DokuWiki headings use an inverted equals-count: `======` (six equals) = level 1, `==` (two equals) = level 6. The formula is `level = 7 - equalsCount`. The exporter inverts this: `equalsCount = 7 - level`, clamped to a minimum of 2.

List structure uses internal separator blocks (`bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) that produce no output on export.

### Lens to RelationalText Hub

The `dokuwiki-to-relationaltext.lens.json` lens is marked `invertible: false`. It maps:

| DokuWiki | RelationalText |
|----------|----------------|
| `bold` | `bold` |
| `italic` | `italic` |
| `underline` | `underline` |
| `strikethrough` | `strikethrough` |
| `monospace` | `code` |
| `line-break` | `line-break` |
| `wikilink` | `link` (attr `page` → `url`) |
| `extlink` | `link` (attr `uri` → `url`) |
| `image` | `image` (`src` and `alt` preserved) |
| `paragraph` | `paragraph` |
| `heading` | `heading` |
| `code-block` | `code-block` |
| `blockquote-marker` | `blockquote-marker` |
| `bullet-list-marker` | `bullet-list-marker` |
| `ordered-list-marker` | `ordered-list-marker` |
| `list-item-marker` | `list-item-marker` |
| `list-item-text` | `list-item-text` |
| `horizontal-rule` | `horizontal-rule` |

`monospace` maps to RT `code` — DokuWiki does not distinguish monospace from code span semantically. Both `wikilink` and `extlink` map to RT `link`. The distinction between internal wiki pages and external URLs is not preserved through the hub.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('dokuwiki', `
====== My Wiki Page ======

This is a paragraph with **bold**, //italic//, and [[https://example.com|a link]].

===== Section =====

  * Item one
  * Item two

<code javascript>
const x = 1
</code>
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('dokuwiki', '====== Hello ======\n\n**bold** text.')
const wiki = to('dokuwiki', doc)
// '====== Hello ======\n**bold** text.'
```

### Cross-Format Conversion

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\n**bold** and _italic_\n\n- item one\n- item two')
const wiki = to('dokuwiki', doc)
// '===== Hello =====\n**bold** and //italic//\n  * item one\n  * item two'
```

## Notes

- **Heading level convention**: DokuWiki's equals-count is the inverse of the heading level. Six equals = H1, two equals = H6. The exporter clamps to a minimum of two equals signs regardless of level.
- **`monospace` vs `code`**: DokuWiki's `''text''` is stored as `monospace`. Through the lens it becomes RT `code`, but on export back to DokuWiki native documents it renders as `''text''`.
- **Link disambiguation**: the importer detects external links by checking whether the target begins with `http://` or `https://`. All other `[[...]]` links are treated as internal wiki pages (`wikilink`).
- **`%%...%%` and `<nowiki>...</nowiki>`**: both no-parse escapes are emitted as plain text. The escape markers themselves are not stored as features and are not reproduced on export.
- **Unclosed code blocks**: if a `<code>` tag is never closed before end-of-file, the accumulated lines are flushed as a `code-block` automatically.
- **List nesting**: indent depth (in groups of two spaces) determines the nesting level. The nesting is encoded in the `parents` array on `list-item-text` features.
- **Blockquote rendering**: on export, paragraphs inside a `blockquote` container are rendered as plain paragraphs without a leading `>` marker. The `<blockquote>` wrapping is not reconstructed on export.
