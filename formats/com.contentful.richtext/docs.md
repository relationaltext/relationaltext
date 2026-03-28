# Contentful Rich Text

[Contentful Rich Text](https://www.contentful.com/developers/docs/concepts/rich-text/) is a structured JSON document format used by the Contentful headless CMS. It represents content as a tree of typed nodes — blocks containing inline spans — with marks applied per span rather than as overlapping ranges.

**Package:** `relational-text/contentful`
**Namespace:** `com.contentful.richtext.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('contentful', input: ContentfulDocument | string): Document`

Parses a Contentful Rich Text document into a RelationalText `Document`.

`input` may be a `ContentfulDocument` object or a JSON string. Inline marks (`bold`, `italic`, `underline`, `code`, `superscript`, `subscript`) and `hyperlink` nodes are converted to facets. Block node types (`paragraph`, `heading-1` through `heading-6`, `blockquote`, `unordered-list`, `ordered-list`, `list-item`, `hr`) are converted to block features. Embedded entry and asset nodes are silently skipped. The result is normalized through the WASM core.

### `to('contentful', doc: Document): ContentfulDocument`

Renders a RelationalText `Document` to a Contentful Rich Text object.

Automatically applies any registered lenses that target the `com.contentful.richtext.facet` namespace — documents imported from Markdown, HTML, or other formats will be translated to Contentful features before export. Returns a `ContentfulDocument` with `nodeType: 'document'`.

Code blocks that have no native Contentful equivalent are rendered as a `paragraph` containing a `code`-marked text span. Horizontal rules are emitted as `hr` nodes.

### `ensureContentfulLexicon(): void`

Registers the `com.contentful.richtext.facet` lexicon and the Contentful-to-RelationalText lens in the WASM registry. Safe to call multiple times — registration happens only once. Called automatically by `from('contentful', ...)` and `to('contentful', ...)`.

## Feature Mapping

### Inline marks

| Contentful mark type | Feature name | RT feature | Expands |
|---|---|---|---|
| `bold` | `bold` | `bold` | yes |
| `italic` | `italic` | `italic` | yes |
| `underline` | `underline` | `underline` | yes |
| `code` | `code` | `code` | no |
| `superscript` | `superscript` | `superscript` | no |
| `subscript` | `subscript` | `subscript` | no |

### Hyperlinks

| Contentful node type | Feature name | RT feature | Attr mapping |
|---|---|---|---|
| `hyperlink` | `hyperlink` (entity) | `link` | `uri` renamed to `url` |

`hyperlink` nodes carry their URL in `data.uri`. The importer stores this as a `hyperlink` feature with a `uri` attribute. The lens renames `uri` to `url` when translating to RT hub features.

### Block types

| Contentful `nodeType` | Feature name | RT feature | Notes |
|---|---|---|---|
| `paragraph` | `paragraph` | `paragraph` | |
| `heading-1` | `heading-1` | `heading` (level 1) | Lens adds `level` attr |
| `heading-2` | `heading-2` | `heading` (level 2) | |
| `heading-3` | `heading-3` | `heading` (level 3) | |
| `heading-4` | `heading-4` | `heading` (level 4) | |
| `heading-5` | `heading-5` | `heading` (level 5) | |
| `heading-6` | `heading-6` | `heading` (level 6) | |
| `hr` | `hr` | `horizontal-rule` | |
| `blockquote` (container) | `blockquote-marker` | `blockquote-marker` | Child paragraphs carry `parents: ['blockquote']` |
| `unordered-list` (container) | `bullet-list-marker` | `bullet-list-marker` | |
| `ordered-list` (container) | `ordered-list-marker` | `ordered-list-marker` | |
| `list-item` | `list-item-marker` + `list-item-text` | same | |

The lens is marked `invertible: false` because Contentful encodes heading levels as six distinct `nodeType` strings (`heading-1` through `heading-6`) while the RT hub uses a single `heading` feature with a `level` attribute, making the reverse mapping ambiguous.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const cfDoc = {
  nodeType: 'document',
  data: {},
  content: [
    {
      nodeType: 'heading-1',
      data: {},
      content: [{ nodeType: 'text', value: 'Hello World', marks: [], data: {} }],
    },
    {
      nodeType: 'paragraph',
      data: {},
      content: [
        { nodeType: 'text', value: 'This is ', marks: [], data: {} },
        { nodeType: 'text', value: 'bold', marks: [{ type: 'bold' }], data: {} },
        {
          nodeType: 'hyperlink',
          data: { uri: 'https://example.com' },
          content: [{ nodeType: 'text', value: ' link', marks: [], data: {} }],
        },
      ],
    },
  ],
}

const doc = from('contentful', cfDoc)
```

`from('contentful', ...)` also accepts a JSON string:

```ts
const doc = from('contentful', fs.readFileSync('content.json', 'utf8'))
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Hello\n\nThis is **bold** text.')
const cfDoc = to('contentful', doc)
// {
//   nodeType: 'document',
//   data: {},
//   content: [
//     {
//       nodeType: 'heading-1',
//       data: {},
//       content: [{ nodeType: 'text', value: 'Hello', marks: [], data: {} }],
//     },
//     {
//       nodeType: 'paragraph',
//       data: {},
//       content: [
//         { nodeType: 'text', value: 'This is ', marks: [], data: {} },
//         { nodeType: 'text', value: 'bold', marks: [{ type: 'bold' }], data: {} },
//         { nodeType: 'text', value: ' text.', marks: [], data: {} },
//       ],
//     },
//   ],
// }
```

### Cross-format round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('contentful', cfDoc)
to('html', doc)       // render to HTML
to('markdown', doc)   // render to CommonMark
to('contentful', doc) // round-trip back to Contentful Rich Text
```

## Notes

- Contentful's `embedded-entry-inline`, `entry-hyperlink`, and `asset-hyperlink` inline node types are skipped during import — only plain `hyperlink` nodes produce facets.
- Embedded entry and asset blocks (`embedded-entry-block`, `embedded-asset-block`) are silently skipped.
- There is no native code block in Contentful Rich Text. On export, `code-block` features are rendered as a `paragraph` with the code text wrapped in a `code` mark. On import, code-marked paragraphs remain as paragraphs with inline code marks.
- The lens is not invertible. The exporter uses the HIR directly rather than the inverse lens.
