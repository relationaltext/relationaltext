# BBCode

[BBCode](https://www.bbcode.org/) (Bulletin Board Code) is a lightweight markup language used in web forums and bulletin board systems. Tags are enclosed in square brackets (`[b]bold[/b]`). BBCode has no single formal specification — this adapter follows the common conventions shared by phpBB, vBulletin, and similar systems.

**Package:** `relational-text/bbcode`
**Namespace:** `org.bbcode.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('bbcode', input: string): Document`

Parses a BBCode string into a RelationalText `Document`.

The importer handles block structure (`[quote]`, `[list]`, `[list=1]`, multi-line `[code]`) and inline marks within each block (`[b]`, `[i]`, `[u]`, `[s]`, `[code]`, `[color]`, `[size]`, `[url]`, `[img]`). Newlines outside explicit block tags flush the current line as a `paragraph`. Empty lines outside lists and blockquotes emit an empty paragraph when prior content exists. The result is normalized through the WASM core.

### `to('bbcode', doc: Document): string`

Renders a RelationalText `Document` to a BBCode string.

Automatically applies any registered lenses that target the `org.bbcode.facet` namespace — documents imported from Markdown, HTML, or other formats will be translated to BBCode features before export. Returns a plain string with BBCode markup.

### `ensureBBCodeLexicon(): void`

Registers the `org.bbcode.facet` lexicon and the BBCode-to-RelationalText lens. Safe to call multiple times. Called automatically by `from('bbcode', ...)` and `to('bbcode', ...)`.

## Feature Mapping

### Inline marks

| BBCode tag | Feature name | RT feature | Expands |
|---|---|---|---|
| `[b]` | `b` | `bold` | yes |
| `[i]` | `i` | `italic` | yes |
| `[u]` | `u` | `underline` | yes |
| `[s]` | `s` | `strikethrough` | yes |
| `[code]` (inline) | `code` | `code` | no |
| `[color=X]` | `color` (entity) | `color` (kept) | no |
| `[size=X]` | `size` (entity) | `size` (kept) | no |

The `color` and `size` features are BBCode-specific and have no RT hub equivalent. The lens uses `passthrough: keep`, so they survive round-trips through the RT hub. The `color` attribute on the `color` feature holds the raw color value from the tag. The `size` attribute on the `size` feature holds the raw size value.

### Link and image entities

| BBCode tag | Feature name | RT feature | Attr mapping |
|---|---|---|---|
| `[url=href]text[/url]` | `url` (entity) | `link` | `href` renamed to `url` in RT |
| `[url]text[/url]` | `url` (entity) | `link` | inner text used as `href` |
| `[img]src[/img]` | `img` (entity) | `image` | `src` attr |

The `[img]` entity inserts a placeholder space character into the document text so that byte offsets remain consistent.

### Block types

| BBCode construct | Feature name | RT feature | Notes |
|---|---|---|---|
| Line of text | `paragraph` | `paragraph` | Default block type |
| `[code]` spanning newlines | `code-block` | `code-block` | Only when line buffer is empty before `[code]` and content has a newline |
| `[quote]` | `blockquote-marker` | `blockquote-marker` | Paragraphs inside carry `parents: ['blockquote']` |
| `[list]` | `bullet-list-marker` | `bullet-list-marker` | |
| `[list=1]` (any attr) | `ordered-list-marker` | `ordered-list-marker` | |
| `[*]` | `list-item-marker` + `list-item-text` | same | |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const bbcode = `[b]Hello[/b] World

[quote]
A quoted paragraph.
[/quote]

[list]
[*]First item
[*]Second [i]item[/i]
[/list]`

const doc = from('bbcode', bbcode)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Hello\n\nThis is **bold** and ~~struck~~.')
const bbcode = to('bbcode', doc)
// Hello
//
// This is [b]bold[/b] and [s]struck[/s].
```

### Inline code vs. code block

The importer distinguishes inline and block code by context. `[code]` is treated as a block only when the current line buffer is empty and the content between `[code]` and `[/code]` contains at least one newline:

```ts
from('bbcode', 'See [code]x = 1[/code] inline.')
// → paragraph with inline code mark on "x = 1"

from('bbcode', '[code]\nx = 1\ny = 2\n[/code]')
// → code-block feature
```

### Link forms

```ts
from('bbcode', '[url=https://example.com]click here[/url]')
// → link entity, href='https://example.com', text='click here'

from('bbcode', '[url]https://example.com[/url]')
// → link entity, href='https://example.com', text='https://example.com'
```

### Cross-format round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('bbcode', '[b]Hello[/b] [i]world[/i]')
to('html', doc)   // '<p><strong>Hello</strong> <em>world</em></p>'
to('bbcode', doc) // '[b]Hello[/b] [i]world[/i]'
```

## Notes

- BBCode tags are matched case-insensitively during import (all tag names are lower-cased before matching).
- Unmatched or unknown closing tags are silently ignored.
- Block-level tags (`[quote]`, `[list]`, `[*]`) encountered inside an inline parse context stop inline parsing and return control to the top-level block parser.
- On export, marks are applied from innermost to outermost: given stacked marks `bold` and `italic` on the same range, the output is `[b][i]text[/i][/b]`.
- `[img]` entities are stored with a placeholder space character in the document text to preserve byte offset consistency.
- The `[color]` and `[size]` features are passed through the RT hub unchanged (no lens mapping). They survive Contentful/Sanity round-trips only if no lossy lens strips them.
