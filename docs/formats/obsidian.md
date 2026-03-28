# Obsidian

Import and export Obsidian Markdown as RelationalText documents. Supports CommonMark blocks plus Obsidian-specific extensions: WikiLinks, inline `#tags`, `==highlight==`, and callout blocks (`> [!NOTE]`).

**Package:** `relational-text/obsidian`
**Namespace:** `md.obsidian.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('obsidian', input: string): Document`

Parse an Obsidian Markdown string into a Document.

```ts
const doc = from('obsidian', `
# My Note

A paragraph with **bold**, *italic*, ==highlighted==, and ~~strikethrough~~ text.

A [[WikiLink]] and a [[Page Name#Anchor|Display Text]] link.

#tag1 #another-tag

> [!NOTE]
> This is a callout block.
`)
```

Supported block constructs:

- `# Heading` through `###### Heading` — headings (trailing `#` stripped)
- ```` ``` ```` / `~~~` fenced code blocks with optional language
- `> text` — blockquotes
- `> [!TYPE]` — callout blocks (`NOTE`, `WARNING`, `TIP`, `IMPORTANT`, `CAUTION`, `INFO`, `SUCCESS`, `QUESTION`, `FAILURE`, `DANGER`, `BUG`, `EXAMPLE`, `QUOTE`)
- `- ` / `* ` / `+ ` bullet list items
- `1. ` ordered list items
- `---` / `***` / `___` (3+ chars) — horizontal rule
- Consecutive non-structural lines — paragraph (blank lines terminate paragraphs)

Inline constructs:

- `**bold**` — strong
- `*italic*` / `_italic_` — emphasis
- `~~strikethrough~~` — strikethrough
- `==highlight==` — highlight
- `` `code` `` — inline code span
- `[[Page]]` / `[[Page#Anchor]]` / `[[Page|Display]]` — WikiLink
- `#word` — inline hashtag
- `[text](url)` — standard Markdown link
- `![alt](url)` — image

`^block-id` annotations at the end of paragraph lines are stripped on import and not preserved on export.

### `to('obsidian', doc: Document | DocumentJSON): string`

Render a Document to an Obsidian Markdown string.

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Hello\n\nA **bold** paragraph.\n\n- item\n')
const md = to('obsidian', doc)
// '# Hello\n\nA **bold** paragraph.\n\n- item\n'
```

Automatically applies any registered lenses targeting `md.obsidian.facet` via `lensGraph.autoTransform()`.

Rendered constructs:

- Headings: `# ` through `###### `
- Paragraphs with blank line separation
- Fenced code blocks (` ``` ` with language if present)
- Blockquotes: `> ` prefix per line
- Callout blocks: `> [!TYPE]` first line
- Bullet lists: `- ` prefix
- Ordered lists: `1. ` prefix (renumbered)
- Horizontal rules: `---`
- WikiLinks: `[[Page]]` / `[[Page#Anchor]]` / `[[Page|Display]]`
- Images: `![alt](src)`
- Standard Markdown links: `[text](uri)`

### `ensureObsidianLexicon(): void`

Register the `md.obsidian.facet` lexicon and the Obsidian-to-RT lens with `autoApply: true`. Called automatically by `from('obsidian', ...)` and `to('obsidian', ...)` on first use. Safe to call multiple times.

## Feature Mapping

### Inline Marks

| Syntax | Feature name | Namespace | Expand |
|---|---|---|---|
| `**text**` | `strong` | `md.obsidian.facet` | both sides |
| `*text*` / `_text_` | `emphasis` | `md.obsidian.facet` | both sides |
| `~~text~~` | `strikethrough` | `md.obsidian.facet` | both sides |
| `==text==` | `highlight` | `md.obsidian.facet` | both sides |
| `` `text` `` | `code-span` | `md.obsidian.facet` | neither side |

### Entity Features (inline)

| Syntax | Feature name | attrs |
|---|---|---|
| `[[Page]]` | `wikilink` | `{ page }` |
| `[[Page#Anchor]]` | `wikilink` | `{ page, anchor }` |
| `[[Page\|Display]]` | `wikilink` | `{ page, display? }` |
| `#tag` | `tag` | `{ tagName }` |
| `[text](url)` | `link` | `{ uri }` |
| `![alt](src)` | `image` | `{ src, alt }` |
| `  \n` hard break | `line-break` | — |

### Block Elements

| Syntax | Feature name | attrs |
|---|---|---|
| `# H` – `###### H` | `heading` | `{ level: 1–6 }` |
| Paragraph | `paragraph` | — |
| ` ``` ` block | `code-block` | `{ language? }` |
| `> text` | `blockquote-marker`, `paragraph` (`parents: ['blockquote']`) | — |
| `> [!TYPE]` | `blockquote-marker`, `callout` (`parents: ['blockquote']`) | `{ type }` |
| `- ` / `* ` / `+ ` list | `bullet-list-marker`, `list-item-marker`, `list-item-text` | — |
| `1. ` list | `ordered-list-marker`, `list-item-marker`, `list-item-text` | — |
| `---` etc. | `horizontal-rule` | — |
| Raw HTML block | `html-block` | — |
| Raw HTML inline | `html-inline` | — |

### Lens: Obsidian → RT Hub

The lens `md.obsidian.to.relationaltext.v1` uses `passthrough: "keep"` — features from other namespaces already in the document are preserved unchanged.

| Obsidian feature | RT hub feature | notes |
|---|---|---|
| `strong` | `bold` | name change |
| `emphasis` | `italic` | name change |
| `strikethrough` | `strikethrough` | identity |
| `highlight` | `highlight` | identity |
| `code-span` | `code` | name change |
| `html-inline` | `html-inline` | identity |
| `link` | `link` | `renameAttrs: { uri → url }` |
| `image` | `image` | identity |
| `wikilink` | `link` | `renameAttrs: { page → url }` (anchor/display dropped) |
| `line-break` | `line-break` | identity |
| `paragraph` | `paragraph` | identity |
| `heading` | `heading` | identity (level attr preserved) |
| `code-block` | `code-block` | identity |
| `blockquote-marker` | `blockquote-marker` | identity |
| `callout` | `blockquote-marker` | type attr dropped |
| `bullet-list-marker` | `bullet-list-marker` | identity |
| `ordered-list-marker` | `ordered-list-marker` | identity |
| `list-item-marker` | `list-item-marker` | identity |
| `list-item-text` | `list-item-text` | identity |
| `horizontal-rule` | `horizontal-rule` | identity |
| `html-block` | `html-block` | identity |

## Examples

### Import Obsidian note

```ts
import { from } from 'relational-text/registry'

const doc = from('obsidian', `
# Project Notes

See [[Related Page]] for background.

- Task one #todo
- Task two
`)
```

### Export to Obsidian

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Title\n\nA [link](https://example.com) in a paragraph.')
const md = to('obsidian', doc)
// '## Title\n\nA [link](https://example.com) in a paragraph.\n\n'
```

### WikiLinks with anchor and display text

```ts
import { from } from 'relational-text/registry'

const doc = from('obsidian', 'See [[My Page#section|Click here]] for details.')
// wikilink feature: { page: 'My Page', anchor: 'section', display: 'Click here' }
// Text stored as: 'Click here'
```

### Callout blocks

```ts
import { from, to } from 'relational-text/registry'

const doc = from('obsidian', `
> [!WARNING]
> This action cannot be undone.
`)

const out = to('obsidian', doc)
// '> [!WARNING]\n> This action cannot be undone.\n\n'
```

## Notes

- **WikiLink resolution**: WikiLinks are stored with the raw page name as the `page` attr. No path resolution or vault lookup is performed. When converted to RT via the lens, `page` is renamed to `url` — the page name becomes the link target verbatim.
- **`#tag` parsing**: Tags must start with a letter (`[a-zA-Z]`) and contain only word characters. Tags adjacent to other `#` characters or inside inline code are not parsed as tags.
- **`^block-id` annotations**: Obsidian block IDs of the form `^word-123` at the end of a paragraph line are stripped during import. They are not stored as features and are not reproduced on export.
- **Callout types**: The importer uppercases the callout type (e.g. `[!note]` becomes `{ type: 'NOTE' }`). The renderer outputs the stored type string as-is. The RT lens maps `callout` to `blockquote-marker`, so callout type information is lost when converting to other formats.
- **Paragraph continuations**: Consecutive non-structural lines (not headings, lists, rules, code fences, or blockquotes) are joined with a space and emitted as a single paragraph block. This is consistent with CommonMark's soft-line-break behavior.
- **`passthrough: "keep"`**: The Obsidian lens preserves features from other namespaces (e.g. `org.w3c.html.facet` features from embedded HTML). This means a document that already contains RT or HTML features will not have them stripped when the lens runs.
