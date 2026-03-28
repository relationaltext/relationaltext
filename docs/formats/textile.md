# Textile

[Textile](https://textile-lang.com/) is a lightweight markup language designed for human-readable plain text that converts cleanly to HTML. It uses punctuation-based inline syntax and line-prefix block syntax. Textile was widely used in early web publishing tools such as Redmine, Basecamp, and various blog platforms.

**Package:** `relational-text/textile`
**Namespace:** `org.textile.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('textile', input: string): Document`

Parses a Textile markup string into a RelationalText `Document`.

The importer processes the input line by line. Each line is classified by its prefix: headings (`h1.` through `h6.`), blockquotes (`bq.`), code blocks (`bc.`), horizontal rules (`---`), bullet list items (`* `), ordered list items (`# `), and explicit paragraphs (`p.`). Unrecognized lines are treated as paragraphs. Within each block, inline markup is parsed with a regex-based scanner. Blank lines reset the list tracking context. The result is normalized through the WASM core.

### `to('textile', doc: Document): string`

Renders a RelationalText `Document` to a Textile markup string.

Automatically applies any registered lenses that target the `org.textile.facet` namespace — documents imported from Markdown, HTML, or other formats will be translated to Textile features before export. Returns a plain string. A trailing newline is removed from the output if present.

Multi-line code blocks use the `bc..` extended form followed by a blank line. Single-line code blocks use the `bc.` form.

### `ensureTextileLexicon(): void`

Registers the `org.textile.facet` lexicon and the Textile-to-RelationalText lens. Safe to call multiple times. Called automatically by `from('textile', ...)` and `to('textile', ...)`.

## Feature Mapping

### Inline marks

Textile distinguishes between `*bold*` (typographic bold) and `**strong**` (semantic strong). Both are stored as distinct feature names following the Transliteration Principle. The lens maps both to the RT `bold` feature.

| Textile syntax | Feature name | RT feature | Expands |
|---|---|---|---|
| `**text**` | `strong` | `bold` | yes |
| `*text*` | `bold` | `bold` | yes |
| `__text__` | `italic` | `italic` | yes |
| `_text_` | `italic` | `italic` | yes |
| `+text+` | `underline` | `underline` | yes |
| `-text-` | `del` | `strikethrough` | yes |
| `^text^` | `superscript` | `superscript` | no |
| `~text~` | `subscript` | `subscript` | no |
| `@text@` | `code` | `code` | no |

The `==text==` literal syntax strips the delimiters and emits the content as plain text, bypassing inline markup processing.

### Link and image entities

| Textile syntax | Feature name | Attrs | RT feature |
|---|---|---|---|
| `"display":url` | `link` (entity) | `uri`, `display` | `link` |
| `!src!` | `image` (entity) | `src` | `image` |
| `!src(alt)!` | `image` (entity) | `src`, `alt` | `image` |

### Block types

Textile uses a single `heading` feature with a `level` attribute rather than separate per-level feature names.

| Textile syntax | Feature name | Attrs | RT feature |
|---|---|---|---|
| plain line | `paragraph` | — | `paragraph` |
| `p. text` | `paragraph` | — | `paragraph` |
| `h1. text` | `heading` | `level: 1` | `heading` |
| `h2. text` | `heading` | `level: 2` | `heading` |
| … | … | … | … |
| `h6. text` | `heading` | `level: 6` | `heading` |
| `bq. text` | `blockquote-marker` + `paragraph` | — | `blockquote-marker` + `paragraph` |
| `bc. text` | `code-block` | — | `code-block` |
| `---` | `horizontal-rule` | — | `horizontal-rule` |
| `* text` | `bullet-list-marker` + `list-item-marker` + `list-item-text` | — | list structure |
| `# text` | `ordered-list-marker` + `list-item-marker` + `list-item-text` | — | list structure |

The lens uses `passthrough: keep`.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const textile = `h1. Hello World

This is *bold* and _italic_ with a "link":https://example.com.

bq. A blockquote paragraph.

* First item
* Second item

---`

const doc = from('textile', textile)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Section\n\nThis is **bold** and _italic_.')
const textile = to('textile', doc)
// h2. Section
//
// This is **bold** and _italic_.
```

### Code blocks

Single-line code block (export):

```
bc. print("hello")
```

Multi-line code block (export):

```
bc..
line one
line two

```

### Cross-format round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('textile', 'h2. Section\n\nSome *bold* text.')
to('html', doc)     // '<h2>Section</h2><p>Some <strong>bold</strong> text.</p>'
to('markdown', doc) // '## Section\n\nSome **bold** text.'
to('textile', doc)  // 'h2. Section\n\nSome **bold** text.'
```

## Notes

- Blank lines between blocks reset the list tracking state (`prevListType`), so the next list item will emit a fresh list-type marker block.
- The importer uses a single-pass line-by-line strategy with a regex-based inline scanner. Textile's advanced attribute syntax (CSS class/id like `p(class).`, column spans, table syntax) is not currently supported — such lines fall through to paragraph treatment.
- Nested list syntax (`**` for nested bullets, `##` for nested ordered) is partially supported: a fresh list marker block is emitted, but nesting depth is not tracked as separate container levels in the current implementation.
- On export, `strong` marks render as `**...**` and `bold` marks render as `*...*`, preserving the Textile distinction between the two. This means import→export round-trips preserve the original syntax for both.
- The `==text==` literal pass-through syntax is stripped of its delimiters on import; there is no round-trip representation in the RT model.
- Image alt text is stored in the `alt` attribute and exported as `!src(alt)!`.
- The lens uses `passthrough: keep`, so features from other namespaces without a Textile equivalent are retained in the document rather than dropped.
