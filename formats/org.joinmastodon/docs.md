# Mastodon Format

Mastodon uses a constrained subset of HTML for rich text in posts and profiles. RelationalText imports and exports this format using the `org.joinmastodon.facet` namespace with feature names matching the HTML element names.

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('mastodon', html: string): Document`

Parse a Mastodon / ActivityPub HTML string into a Document.

```ts
const doc = from('mastodon', 
  '<p>Hello <span class="h-card"><a href="/@alice" class="u-url mention">@alice</a></span>!</p>'
)
```

Handles Mastodon's constrained HTML:
- `<p>` paragraphs
- `<br />` line breaks
- `<a href>` hyperlinks
- `<strong>` / `<em>` inline marks
- `<code>` / `<pre>` code elements
- `<span class="h-card">` mention microformat
- `<a class="hashtag">` hashtag links

### `to('mastodon', doc: Document): string`

Render a Document to a Mastodon-compatible HTML string.

```ts
const html = to('mastodon', doc)
// '<p>Hello <span class="h-card"><a href="/@alice" class="u-url mention">@alice</a></span>!</p>\n'
```

Automatically applies any registered lenses targeting `org.joinmastodon.facet` via `lensGraph.autoTransform()`. This means a Document parsed from Markdown will automatically convert CommonMark features to Mastodon features before rendering.

### `ensureMastodonLexicon(): void`

Register the Mastodon lexicon and the `Mastodon→CommonMark` lens. Called automatically by `from('mastodon', ...)` and `to('mastodon', ...)` on first use. Safe to call multiple times.

## Feature Mapping

### Inline Marks

| HTML | Feature name | Notes |
|------|-------------|-------|
| `<strong>`, `<b>` | `strong` | |
| `<em>`, `<i>` | `em` | |
| `<code>` | `code` | |
| `<a href>` | `a` | attrs: `href` |
| `<br />` | `br` | entity, 1 newline character in text |
| Mention microformat | `mention` | attrs: `href`, `handle` |
| Hashtag link | `hashtag` | attrs: `href`, `tag` |

### Block Elements

| HTML | Feature name |
|------|-------------|
| `<p>` | `p` |
| `<pre>` | `pre` |

## Lens Integration

When `ensureMastodonLexicon()` is called, it registers a `Mastodon→CommonMark` lens with `autoApply: true`. This means:

- `to('markdown', mastodonDoc)` works without any extra conversion steps
- `to('mastodon', markdownDoc)` works via the inverse `CommonMark→Mastodon` lens

```ts
import { from, to } from 'relational-text/registry'

// Mastodon → Markdown
const mastodonHtml = '<p>Hello <strong>world</strong>!</p>'
const doc = from('mastodon', mastodonHtml)
const md = to('markdown', doc)
// 'Hello **world**!\n\n'

// Markdown → Mastodon
const mdDoc = from('markdown', 'Hello **world**!')
const mastodon = to('mastodon', mdDoc)
// '<p>Hello <strong>world</strong>!</p>\n'
```

## Mastodon-to-CommonMark Lens

The lens JSON is included in the package and registered automatically:

```json
{
  "$type": "org.relationaltext.lens",
  "source": "org.joinmastodon.facet",
  "target": "org.commonmark.facet",
  "rules": [
    { "match": { "name": "strong" }, "replace": { "name": "strong" } },
    { "match": { "name": "em" },     "replace": { "name": "emphasis" } },
    { "match": { "name": "code" },   "replace": { "name": "code-span" } },
    { "match": { "name": "a" },
      "replace": { "name": "link", "renameAttrs": { "href": "uri" } } },
    { "match": { "name": "mention" },
      "replace": { "name": "link", "renameAttrs": { "href": "uri" }, "dropAttrs": ["handle"] } },
    { "match": { "name": "hashtag" },
      "replace": { "name": "link", "renameAttrs": { "href": "uri" }, "dropAttrs": ["tag"] } },
    { "match": { "name": "br" },    "replace": { "name": "line-break" } },
    { "match": { "name": "p" },     "replace": { "name": "paragraph" } },
    { "match": { "name": "pre" },   "replace": { "name": "code-block" } }
  ]
}
```

## Examples

### Parse a Mastodon mention

```ts
import { from } from 'relational-text/registry'

const html = `
  <p>Hello
    <span class="h-card">
      <a href="https://mastodon.social/@alice" class="u-url mention">@alice</a>
    </span>,
    check out <a href="https://example.com">this link</a>
    and <a href="/tags/rust" class="mention hashtag" rel="tag">#<span>rust</span></a>
  </p>
`
const doc = from('mastodon', html)
const json = doc.toJSON()
// text: "\uFFFCHello @alice, check out this link and #rust"
// facets: mention, link, hashtag features
```

### Cross-format conversion

```ts
import { from, to } from 'relational-text/registry'

const doc = from('mastodon', '<p><strong>Bold</strong> and <em>italic</em></p>')
const html = to('html', doc)
// '<p><strong>Bold</strong> and <em>italic</em></p>\n'
```
