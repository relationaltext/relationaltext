# MediaWiki Format

RelationalText implements MediaWiki markup import and export. Features are stored under the `org.mediawiki.facet` namespace with feature names drawn from MediaWiki's own help documentation.

**Package:** `relational-text/mediawiki`
**Namespace:** `org.mediawiki.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('mediawiki', input: string): Document`

Parse a MediaWiki markup string into a Document.

```ts
const doc = from('mediawiki', "== Introduction ==\n\nA paragraph with '''bold''' and ''italic''.")
```

Supports:

- Inline marks: `'''bold'''`, `''italic''`, `'''''bold+italic'''''`, `<code>inline code</code>`
- Internal wiki links: `[[Page Title]]` and `[[Page Title|Display text]]`
- External links: `[https://url Display text]` and `[https://url]` (bare)
- File images: `[[File:name.jpg]]`, `[[File:name.jpg|thumb|Caption]]`
- Templates: <code v-pre>{{TemplateName}}</code> and <code v-pre>{{TemplateName|args}}</code>
- Footnotes/references: `<ref>content</ref>`
- Line breaks: `<br>`, `<br/>`, `<br />`
- No-parse literal: `<nowiki>text</nowiki>` (emitted as plain text)
- Headings: `==` through `======` (levels 2–6)
- Paragraphs
- Bullet lists: `*` prefix (multiple `*` for nesting)
- Ordered lists: `#` prefix (multiple `#` for nesting)
- Definition terms: `; term`
- Blockquote / definition details: `: text` (indented lines)
- Horizontal rules: `----`

The result is normalized through the WASM core.

### `to('mediawiki', doc: Document): string`

Render a Document to a MediaWiki markup string.

```ts
const wiki = to('mediawiki', doc)
```

- Automatically applies any registered lenses targeting `org.mediawiki.facet` via `lensGraph.autoTransform()`
- Documents from other formats (Markdown, HTML, etc.) convert automatically through the lens graph

### `ensureMediaWikiLexicon(): void`

Explicitly register the MediaWiki lexicon (`org.mediawiki.facet#*` types) and its lens to the RT hub. Called automatically by `from('mediawiki', ...)` and `to('mediawiki', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Mapping

### Inline Marks

| MediaWiki syntax | Feature name | expand |
|------------------|--------------|--------|
| `'''text'''` | `bold` | both sides |
| `''text''` | `italic` | both sides |
| `'''''text'''''` | `bold` + `italic` (two overlapping facets) | both sides |
| `<code>text</code>` | `code` | neither |

Bold+italic (`'''''...'''''`) is split into two separate overlapping facets covering the same byte range — one `bold` and one `italic`.

### Entities

| MediaWiki syntax | Feature name | Attrs |
|------------------|--------------|-------|
| `[[Page]]` | `wikilink` | `page` |
| `[[Page\|Display]]` | `wikilink` | `page`, `display` |
| `[https://url Display]` | `extlink` | `uri`, `display` |
| `[https://url]` | `extlink` | `uri` |
| `[[File:name.jpg]]` | `image` | `src` |
| `[[File:name.jpg\|thumb\|Caption]]` | `image` | `src`, `caption` |
| <code v-pre>{{Name}}</code> | `template` | `templateName` |
| <code v-pre>{{Name&#124;arg1}}</code> | `template` | `templateName`, `args` |
| `<ref>content</ref>` | `ref` | `content` |
| `<br />` | `line-break` | — |

Images and `ref`/`template` entities use a zero-width space (U+200B) as a placeholder character in the document text. The visual content is carried entirely in feature attributes.

### Block Elements

| MediaWiki syntax | Feature name | Attrs |
|------------------|--------------|-------|
| Paragraph | `paragraph` | — |
| `== Heading ==` | `heading` | `{ level: 2 }` |
| `=== Heading ===` | `heading` | `{ level: 3 }` |
| `====== Heading ======` | `heading` | `{ level: 6 }` |
| `* item` (bullet) | `list-item-text` (parents: `["ul", "unordered-list-item"]`) | `{ level: N }` |
| `# item` (ordered) | `list-item-text` (parents: `["ol", "ordered-list-item"]`) | `{ level: N }` |
| `: text` (indented line) | `paragraph` (parents: `["blockquote"]`) | — |
| `; term` | `definition-term` | — |
| `----` | `horizontal-rule` | — |

MediaWiki headings begin at level 2: `==` = H2, `===` = H3, up to `======` = H6. Single-equals headings are accepted by the parser but are unusual in MediaWiki pages.

List nesting is encoded by repeating the marker character: `**` is a nested bullet inside a bullet. The nesting level is stored in the `level` attr on `list-item-text` features and used by the exporter to reconstruct the correct number of `*` or `#` characters.

List structure uses internal separator blocks (`bullet-list-marker`, `ordered-list-marker`, `list-item-marker`) that produce no output on export.

### Lens to RelationalText Hub

The `mediawiki-to-relationaltext.lens.json` lens is marked `invertible: false`. It maps:

| MediaWiki | RelationalText |
|-----------|----------------|
| `bold` | `bold` |
| `italic` | `italic` |
| `code` | `code` |
| `wikilink` | `link` (attr `page` → `url`) |
| `extlink` | `link` (attr `uri` → `url`) |
| `image` | `image` |
| `line-break` | `line-break` |
| `paragraph` | `paragraph` |
| `heading` | `heading` |
| `blockquote-marker` | `blockquote-marker` |
| `bullet-list-marker` | `bullet-list-marker` |
| `ordered-list-marker` | `ordered-list-marker` |
| `list-item-marker` | `list-item-marker` |
| `list-item-text` | `list-item-text` |
| `horizontal-rule` | `horizontal-rule` |
| `definition-term` | `definition-term` |
| `definition-detail` | `definition-detail` |
| `template` | `template` |
| `ref` | `ref` |

`wikilink` and `extlink` both map to RT `link`. The distinction between internal wiki pages and external URLs is not preserved through the hub. `template` and `ref` entity types pass through to the RT hub unchanged — they have no direct equivalent in most other formats.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('mediawiki', `
== Introduction ==

A paragraph with '''bold''', ''italic'', and a [[Main Page|link]].

=== Subsection ===

* Item one
** Nested item
* Item two

; Term
: Definition detail

[[File:logo.png|thumb|A caption]]
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('mediawiki', "== Hello ==\n\n'''bold''' text.")
const wiki = to('mediawiki', doc)
// "== Hello ==\n'''bold''' text."
```

### Cross-Format Conversion

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Hello\n\n**bold** and _italic_\n\n- item one\n- item two')
const wiki = to('mediawiki', doc)
// "== Hello ==\n'''bold''' and ''italic''\n* item one\n* item two"
```

## Notes

- **Heading level convention**: MediaWiki `==` maps to level 2 (H2), not H1. The importer stores the literal equals-count as the level value. The exporter reproduces the same number of equals signs.
- **Bold+italic**: `'''''text'''''` produces two separate facets (`bold` and `italic`) covering the same byte range. On export, each mark is wrapped independently using its own delimiter, so deeply nested bold+italic may not recombine into `'''''`.
- **Wikilink vs extlink**: `[[Page]]` without an `http://` or `https://` prefix is stored as `wikilink`; external links using bare-bracket syntax (`[url text]`) are always `extlink`.
- **Image placeholder**: `[[File:...]]` inserts a U+200B zero-width space into the document text. The image content is in the `src` and `caption` attrs. Known layout parameters (`thumb`, `left`, `right`, `center`, `frame`, `frameless`, `border`, etc.) are stripped; only the final non-parameter segment is treated as a caption.
- **Template and ref placeholders**: Templates (<code v-pre>{{name}}</code>) and `<ref>` tags also use U+200B as a placeholder. The exporter reads `templateName`/`args` and `content` attrs to reconstruct the original syntax.
- **`<nowiki>` escapes**: content inside `<nowiki>...</nowiki>` is emitted as plain text. The escape markers are not stored as features.
- **Definition lists**: `; term` produces a `definition-term` block. `: text` (colon-indent) produces a `paragraph` inside a `blockquote` container. The `definition-detail` block type is declared in the lexicon and emitted by the exporter when a `definition-detail` feature appears in the document.
