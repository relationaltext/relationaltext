# Org-mode Format

RelationalText implements Org-mode import and export. Features are stored under the `org.orgmode.facet` namespace with feature names drawn from the Org-mode spec's own terminology.

**Package:** `relational-text/org`
**Namespace:** `org.orgmode.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('org', input: string): Document`

Parse an Org-mode string into a Document.

```ts
const doc = from('org', '* Hello\n\nA paragraph with *bold* and /italic/.')
```

Supports:

- Inline marks: `*bold*`, `/italic/`, `_underline_`, `+strikethrough+`, `=verbatim=`, `~code~`
- Links: `[[url]]` and `[[url][description]]`
- Headings: `*` through `******` (levels 1–6), with optional TODO/DONE keyword
- Paragraphs
- Bullet lists (`-` or `+` prefix)
- Ordered lists (`1.` or `1)` prefix)
- Code blocks: `#+BEGIN_SRC lang ... #+END_SRC`
- Blockquotes: `#+BEGIN_QUOTE ... #+END_QUOTE`
- Verse blocks: `#+BEGIN_VERSE ... #+END_VERSE` (treated as paragraph)
- Horizontal rules: five or more dashes (`-----`)
- Comment lines (`# comment`) are skipped

The result is normalized through the WASM core.

### `to('org', doc: Document): string`

Render a Document to an Org-mode string.

```ts
const org = to('org', doc)
```

- Automatically applies any registered lenses targeting `org.orgmode.facet` via `lensGraph.autoTransform()`
- Documents from other formats (Markdown, HTML, Quill, etc.) convert automatically through the lens graph

### `ensureOrgLexicon(): void`

Explicitly register the Org-mode lexicon (`org.orgmode.facet#*` types) and its lens to the RT hub. Called automatically by `from('org', ...)` and `to('org', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| Org-mode syntax | Feature name | expand |
|-----------------|--------------|--------|
| `*text*` | `bold` | both sides |
| `/text/` | `italic` | both sides |
| `_text_` | `underline` | both sides |
| `+text+` | `strike-through` | both sides |
| `=text=` | `verbatim` | neither |
| `~text~` | `code` | neither |

### Entities

| Org-mode syntax | Feature name | Attrs |
|-----------------|--------------|-------|
| `[[url]]` | `link` | `uri` (the raw target) |
| `[[url][desc]]` | `link` | `uri`, `description` |

For `[[url][desc]]` links the covered document text is the description. For bare `[[url]]` links the covered text is the URL itself.

### Block Elements

| Org-mode syntax | Feature name | Attrs |
|-----------------|--------------|-------|
| Paragraph | `paragraph` | — |
| `* Heading` | `heading` | `{ level: 1 }` |
| `** Heading` | `heading` | `{ level: 2 }` |
| `* TODO Task` | `heading` | `{ level: N, todo: "TODO" }` |
| `* DONE Task` | `heading` | `{ level: N, todo: "DONE" }` |
| `#+BEGIN_SRC lang` | `src-block` | `{ language?: string }` |
| Bullet list item | `list-item-text` (parents: `["ul", "unordered-list-item"]`) | — |
| Ordered list item | `list-item-text` (parents: `["ol", "ordered-list-item"]`) | — |
| `#+BEGIN_QUOTE` | `paragraph` (parents: `["blockquote"]`) | — |
| `-----` | `horizontal-rule` | — |

List structure uses internal separator blocks (`bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) that produce no output on export — they exist solely to mark list boundaries in the document model.

### Lens to RelationalText Hub

The `org-to-relationaltext.lens.json` lens is marked `invertible: false`. It maps:

| Org-mode | RelationalText |
|----------|----------------|
| `bold` | `bold` |
| `italic` | `italic` |
| `underline` | `underline` |
| `strike-through` | `strikethrough` |
| `verbatim` | `code` |
| `code` | `code` |
| `link` | `link` (attr `uri` → `url`) |
| `paragraph` | `paragraph` |
| `heading` | `heading` |
| `src-block` | `code-block` |
| `blockquote-marker` | `blockquote-marker` |
| `bullet-list-marker` | `bullet-list-marker` |
| `ordered-list-marker` | `ordered-list-marker` |
| `list-item-marker` | `list-item-marker` |
| `list-item-text` | `list-item-text` |
| `horizontal-rule` | `horizontal-rule` |

Both `verbatim` and `code` collapse to RT `code` — the distinction between Org-mode's literal verbatim (`=`) and its code tilde (`~`) is not preserved through the hub. Use the native `org.orgmode.facet` document if round-tripping this distinction matters.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('org', `
* Introduction

This is a paragraph with *bold*, /italic/, and a [[https://example.com][link]].

** Section

- Item one
- Item two

#+BEGIN_SRC typescript
const x = 1
#+END_SRC
`)

console.log(doc.text)
// "\uFFFCIntroduction\nThis is a paragraph with bold, italic, and a link.\n..."
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('org', '* Hello\n\nA *bold* word.')
const org = to('org', doc)
// '* Hello\nA *bold* word.'
```

### Cross-Format Conversion

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\n**bold** and _italic_\n\n- item one\n- item two')
const org = to('org', doc)
// '** Hello\n*bold* and /italic/\n- item one\n- item two'
```

## Notes

- **Verse blocks** (`#+BEGIN_VERSE ... #+END_VERSE`) are imported as a single `paragraph`. Line breaks within the verse are preserved as literal text but not marked up separately.
- **Comment lines** (`# text` with a space after `#`) are silently dropped on import. There is no `comment` feature type.
- **TODO keywords**: the `todo` attr on a `heading` feature stores the keyword string (`"TODO"` or `"DONE"`). The exporter writes it back as `* TODO Heading text`.
- **Link `uri` attribute**: the Org-mode importer stores the raw link target under the key `uri`. The lens renames it to `url` when converting to the RT hub. The exporter reads `uri` first, then falls back to `href`, when reconstructing link syntax.
- **Timestamp features** (`org.orgmode.facet#timestamp`) are declared in the lexicon as `entity` class but are not yet parsed by the importer. They are reserved for future use.
- **Heading levels** match directly: one star = level 1, six stars = level 6.
- **Inline markup matching**: the regex requires at least one non-space character at each boundary, so `* text *` (space before closing delimiter) does not parse as bold. This matches Org-mode's actual delimiter rules.
