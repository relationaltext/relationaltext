# Sanity Portable Text

[Sanity Portable Text](https://www.sanity.io/docs/presenting-block-text) is a JSON-based rich text format used by the Sanity headless CMS. Documents are represented as a flat array of typed block objects. Each block has a `style`, an optional `listItem` type, inline `children` spans, and a `markDefs` array that defines named annotations (such as links) referenced by key from span `marks`.

**Package:** `relational-text/sanity`
**Namespace:** `io.sanity.portabletext.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('sanity', input: PortableTextBlock[] | string): Document`

Parses a Sanity Portable Text block array into a RelationalText `Document`.

`input` may be a `PortableTextBlock[]` array or a JSON string. Built-in mark types (`strong`, `em`, `underline`, `code`, `strike-through`, `sup`, `sub`) are stored as inline features using their native Sanity names. `markDef` entries with `_type: 'link'` are stored as `link` features with a `href` attribute. Block styles (`normal`, `h1`–`h6`, `blockquote`) and list items (`bullet`, `number`) are converted to block features. The result is normalized through the WASM core.

### `to('sanity', doc: Document): PortableTextBlock[]`

Renders a RelationalText `Document` to a Sanity Portable Text block array.

Automatically applies any registered lenses that target the `io.sanity.portabletext.facet` namespace — documents imported from Markdown, HTML, or other formats will be translated to Portable Text features before export. Returns a `PortableTextBlock[]` array.

Links are emitted as `markDef` entries with `_type: 'link'` and `href`, referenced from span `marks` arrays by auto-generated key (`link0`, `link1`, …). Duplicate `href` values within a block reuse the same `markDef` entry. Code blocks are emitted as a `normal`-style block with a `code`-marked span. Horizontal rules have no Portable Text equivalent and are silently dropped on export.

### `ensureSanityLexicon(): void`

Registers the `io.sanity.portabletext.facet` lexicon and the Sanity-to-RelationalText lens. Safe to call multiple times. Called automatically by `from('sanity', ...)` and `to('sanity', ...)`.

## Public Types

```ts
interface PortableTextSpan {
  _type: 'span'
  text: string
  marks: string[]
}

interface PortableTextMarkDef {
  _key: string
  _type: string
  href?: string
  [key: string]: unknown
}

interface PortableTextBlock {
  _type: string
  style?: string
  listItem?: 'bullet' | 'number'
  level?: number
  children: PortableTextSpan[]
  markDefs: PortableTextMarkDef[]
}
```

## Feature Mapping

### Inline marks

Feature names follow the Transliteration Principle — native Sanity mark strings become the feature names. The lens maps them to canonical RT hub names.

| Portable Text mark | Feature name | RT feature | Expands |
|---|---|---|---|
| `strong` | `strong` | `bold` | yes |
| `em` | `em` | `italic` | yes |
| `underline` | `underline` | `underline` | yes |
| `strike-through` | `strike-through` | `strikethrough` | yes |
| `code` | `code` | `code` | no |
| `sup` | `sup` | `superscript` | no |
| `sub` | `sub` | `subscript` | no |

### Links

| Portable Text construct | Feature name | RT feature | Attr mapping |
|---|---|---|---|
| `markDef._type: 'link'` | `link` (entity) | `link` | `href` renamed to `url` in RT |

Links in Portable Text are indirect: a span's `marks` array contains a `_key` string referencing a `markDef` entry. The importer resolves this indirection and stores `href` directly on the `link` feature.

### Block styles

| Portable Text `style` / `listItem` | Feature name | RT feature | Notes |
|---|---|---|---|
| `normal` | `normal` | `paragraph` | |
| `h1` | `h1` | `heading` (level 1) | Lens adds `level` attr |
| `h2` | `h2` | `heading` (level 2) | |
| `h3` | `h3` | `heading` (level 3) | |
| `h4` | `h4` | `heading` (level 4) | |
| `h5` | `h5` | `heading` (level 5) | |
| `h6` | `h6` | `heading` (level 6) | |
| `blockquote` | `blockquote-marker` + `normal` | `blockquote-marker` + `paragraph` | |
| `listItem: 'bullet'` | `bullet-list-marker` + `list-item-marker` + `list-item-text` | same | |
| `listItem: 'number'` | `ordered-list-marker` + `list-item-marker` + `list-item-text` | same | |

The lens is marked `invertible: false`.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const blocks = [
  {
    _type: 'block',
    style: 'h1',
    children: [{ _type: 'span', text: 'Hello World', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    style: 'normal',
    children: [
      { _type: 'span', text: 'Visit ', marks: [] },
      { _type: 'span', text: 'our site', marks: ['link0'] },
    ],
    markDefs: [{ _key: 'link0', _type: 'link', href: 'https://example.com' }],
  },
]

const doc = from('sanity', blocks)
```

`from('sanity', ...)` also accepts a JSON string:

```ts
const doc = from('sanity', fs.readFileSync('content.json', 'utf8'))
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Hello\n\nThis is **bold** and _italic_.')
const blocks = to('sanity', doc)
// [
//   { _type: 'block', style: 'h1', children: [{ _type: 'span', text: 'Hello', marks: [] }], markDefs: [] },
//   {
//     _type: 'block',
//     style: 'normal',
//     children: [
//       { _type: 'span', text: 'This is ', marks: [] },
//       { _type: 'span', text: 'bold', marks: ['strong'] },
//       { _type: 'span', text: ' and ', marks: [] },
//       { _type: 'span', text: 'italic', marks: ['em'] },
//       { _type: 'span', text: '.', marks: [] },
//     ],
//     markDefs: [],
//   },
// ]
```

### Cross-format round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('sanity', blocks)
to('html', doc)     // render to HTML
to('markdown', doc) // render to CommonMark
to('sanity', doc)   // round-trip back to Portable Text
```

## Notes

- The importer only processes spans with `_type: 'span'`. Non-span inline nodes (custom blocks embedded as inline content) are skipped.
- Only `markDef` entries with `_type: 'link'` produce features. Unknown `markDef` types are ignored.
- Unknown block `style` values (other than `normal`, `h1`–`h6`, and `blockquote`) are treated as `normal`.
- Portable Text has no native horizontal rule. On export, `horizontal-rule` features are silently dropped.
- List items emit three blocks each in the RT model: a list-type marker (only once per run of the same list type), a `list-item-marker`, and a `list-item-text`. The exporter reconstructs the Portable Text `listItem` + `level: 1` structure from these.
- The importer tracks `prevListType` across blocks to avoid emitting a redundant list-type marker when consecutive list items share the same list type.
- On export, duplicate link `href` values within a single block share one `markDef` entry. The `_key` for each link is auto-generated (`link0`, `link1`, …) and is not round-tripped from the original.
