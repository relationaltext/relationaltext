# OPML

[OPML](http://opml.org/spec2.opml) (Outline Processor Markup Language) is an XML format for outlines. It is used primarily by feed readers to exchange subscription lists and by outliner applications (Workflowy, OmniOutliner) to serialize hierarchical document outlines. Each `<outline>` element in an OPML `<body>` becomes a block in the RelationalText document model.

**Package:** `relational-text/opml`
**Namespace:** `org.opml.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
import { parseOPML } from 'relational-text/opml'
```

### `from('opml', input: OPMLDocument | string): Document`

Parses an OPML document into a RelationalText `Document`.

`input` may be an `OPMLDocument` object (already parsed) or a raw XML string. When given a string, the XML is first parsed by `parseOPML`. Each `<outline>` element becomes one block. Nesting depth is tracked through the `parents` array — child outlines carry parent labels of the form `outline-{depth}` for each ancestor level. Outline attributes (`text`, `title`, `type`, `xmlUrl`, `htmlUrl`, `_note`) are stored as block `attrs`. RSS and Atom outlines (`type="rss"` or `type="atom"`) become `feed` blocks; all other outlines become `outline` blocks. If the OPML contains no outlines, an empty document is returned.

### `to('opml', doc: Document): string`

Renders a RelationalText `Document` to an OPML 2.0 XML string.

Automatically applies any registered lenses that target the `org.opml.facet` namespace. Returns a complete XML document with `<?xml version="1.0" encoding="UTF-8"?>` declaration, `<opml version="2.0">` root, `<head><title>Document</title></head>`, and a `<body>` containing `<outline>` elements. Each block becomes a self-closing `<outline>` element. Special XML characters in attribute values (`&`, `"`, `<`, `>`) are escaped.

### `parseOPML(xml: string): OPMLDocument`

Parses a raw OPML XML string into an `OPMLDocument` object without creating a RelationalText document. Extracts the `<head><title>` element and recursively parses all `<outline>` elements within `<body>`. Both self-closing (`<outline ... />`) and element-pair (`<outline ...>...</outline>`) forms are supported. Returns `{ title?, outlines }`.

### `ensureOPMLLexicon(): void`

Registers the `org.opml.facet` lexicon and the OPML-to-RelationalText lens. Safe to call multiple times. Called automatically by `from('opml', ...)` and `to('opml', ...)`.

## Public Types

```ts
interface OPMLOutline {
  text: string          // display text (required by OPML spec)
  title?: string        // optional title (often same as text)
  type?: string         // 'text' | 'rss' | 'atom' | 'link' | others
  xmlUrl?: string       // feed URL for RSS/Atom outlines
  htmlUrl?: string      // web page URL for the feed or link
  _note?: string        // extended note (Workflowy/OmniOutliner)
  children?: OPMLOutline[]
}

interface OPMLDocument {
  title?: string        // from <head><title>
  outlines: OPMLOutline[]
}
```

## Feature Mapping

### Block types

| OPML outline type | Feature name | RT feature | Attrs stored |
|---|---|---|---|
| `type="rss"` or `type="atom"` | `feed` | `paragraph` | `text`, `title?`, `type`, `xmlUrl?`, `htmlUrl?`, `note?` |
| all other outlines | `outline` | `paragraph` | `text`, `title?`, `type?`, `xmlUrl?`, `htmlUrl?`, `note?` |
| `heading` (if present) | `heading` | `heading` | |

The OPML lexicon defines three block feature types: `outline`, `feed`, and `heading`. The lens maps `outline` and `feed` to RT `paragraph`, and `heading` to RT `heading`. The lens uses `passthrough: keep`.

### Nesting

Nesting is encoded in each block's `parents` array. A top-level outline has `parents: []`. Its children have `parents: ['outline-0']`. Their children have `parents: ['outline-0', 'outline-1']`, and so on. The depth integer matches the zero-based nesting depth of the parent.

### Attrs

The `_note` OPML attribute is stored under the key `note` in block attrs (the leading underscore is dropped). All other outline attributes (`text`, `title`, `type`, `xmlUrl`, `htmlUrl`) are stored verbatim. The `text` attribute is also used as the block's text content.

## Examples

### Import from XML string

```ts
import { from } from 'relational-text/registry'

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="News" title="News">
      <outline type="rss" text="BBC News"
        xmlUrl="https://feeds.bbci.co.uk/news/rss.xml"
        htmlUrl="https://bbc.co.uk/news"/>
      <outline type="rss" text="Reuters"
        xmlUrl="https://feeds.reuters.com/reuters/topNews"/>
    </outline>
    <outline text="Notes">
      <outline text="First note" _note="Some extended note text"/>
    </outline>
  </body>
</opml>`

const doc = from('opml', xml)
```

### Import from parsed object

```ts
import { from } from 'relational-text/registry'
import { type OPMLDocument } from 'relational-text/opml'

const opml: OPMLDocument = {
  title: 'My Outline',
  outlines: [
    {
      text: 'Section One',
      children: [
        { text: 'Item A' },
        { text: 'Item B' },
      ],
    },
    { text: 'Section Two' },
  ],
}

const doc = from('opml', opml)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('opml', xml)
const output = to('opml', doc)
// <?xml version="1.0" encoding="UTF-8"?>
// <opml version="2.0">
//   <head>
//     <title>Document</title>
//   </head>
//   <body>
//     <outline text="News" title="News"/>
//     <outline text="BBC News" type="rss" xmlUrl="https://feeds.bbci.co.uk/news/rss.xml" htmlUrl="https://bbc.co.uk/news"/>
//     <outline text="Reuters" type="rss" xmlUrl="https://feeds.reuters.com/reuters/topNews"/>
//     <outline text="Notes"/>
//     <outline text="First note" _note="Some extended note text"/>
//   </body>
// </opml>
```

### Render outline as Markdown

```ts
import { from, to } from 'relational-text/registry'

const doc = from('opml', xml)
to('markdown', doc)
// Each outline item becomes a paragraph; the hierarchy is flattened.
```

### Parse XML without creating a Document

```ts
import { parseOPML } from 'relational-text/opml'

const { title, outlines } = parseOPML(xml)
// title: 'My Feeds'
// outlines: [{ text: 'News', children: [...] }, ...]
```

## Notes

- The XML parser is a custom token-based implementation that handles arbitrarily nested `<outline>` elements without a DOM library. Both self-closing and element-pair outline forms are supported. Malformed XML (unclosed tags) is handled gracefully — whatever was parsed before the error is returned.
- The `<head><title>` is extracted by `parseOPML` and is available on the `OPMLDocument` object, but it is not stored in the RelationalText document model. On export, `to('opml', ...)` always writes `<title>Document</title>`.
- **Nesting is not reconstructed on export.** The current exporter emits all outlines as flat self-closing `<outline>` elements at the same indentation depth, regardless of their `parents` array. Use `parseOPML` followed by direct tree manipulation to produce nested OPML output.
- OPML has no inline markup. The `text` attribute of each outline becomes the block's text content directly. No inline facets are created during import.
- The `_note` attribute (used by Workflowy and OmniOutliner for extended note text on outline items) is stored under `note` in block attrs, with the leading underscore dropped.
- Attributes on `<outline>` elements that are not recognized (`text`, `title`, `type`, `xmlUrl`, `htmlUrl`, `_note`) are not preserved during import.
