# Format Registry

## `from(format, input)`

```ts
function from(format: FormatName, input: string): Document
```

Parse a string in the given format. Lazily registers the format's lexicon on first call — no explicit setup required.

```ts
import { from } from 'relational-text'

const doc = from('markdown', '# Hello\n\nThis is **bold** text.')
```

---

## `to(format, doc)`

```ts
function to(format: FormatName, doc: Document): string
```

Serialize a document to the given format. Applies `autoTransform` via the lens graph before rendering, so features from a different source namespace are translated when a lens path exists.

```ts
import { from, to } from 'relational-text'

const doc = from('markdown', '# Hello\n\nThis is **bold** text.')
const html = to('html', doc)
// '<h1>Hello</h1>\n<p>This is <strong>bold</strong> text.</p>'
```

---

## `FORMATS`

```ts
const FORMATS: Record<FormatName, { from: (input: string) => Document; to: (doc: Document) => string }>
```

Registry of all built-in format adapters. Access individual adapters by name or iterate to enumerate all supported formats.

```ts
import { FORMATS } from 'relational-text'

// List all registered format names
const names = Object.keys(FORMATS)

// Use an adapter directly
const doc = FORMATS.slack.from('*bold* and _italic_')
const md = FORMATS.markdown.to(doc)
```

---

## `FormatName`

Union type of all registered format name strings.

```ts
type FormatName =
  | 'markdown' | 'html' | 'bluesky' | 'mastodon' | 'slack' | 'discord'
  | 'telegram' | 'whatsapp' | 'linkedin' | 'threads' | 'bbcode'
  | 'quill' | 'prosemirror' | 'tiptap' | 'lexical' | 'slate'
  | 'notion' | 'contentful' | 'sanity'
  | 'mdx' | 'myst' | 'pandoc' | 'multimarkdown' | 'gitlab' | 'markdoc'
  | 'confluence' | 'dokuwiki' | 'mediawiki' | 'textile' | 'fountain'
  | 'obsidian' | 'logseq' | 'roam' | 'org' | 'opml' | 'jupyter'
  | 'applenews' | 'automerge'
```

---

## Example: `convert` helper

The `from`/`to` pair composes naturally into a single-line conversion utility.

```ts
import { from, to, FormatName } from 'relational-text'

function convert(sourceFormat: FormatName, targetFormat: FormatName, input: string): string {
  return to(targetFormat, from(sourceFormat, input))
}

const slack = convert('markdown', 'slack', '**bold** and _italic_')
// '*bold* and _italic_'

const html = convert('quill', 'html', JSON.stringify(quillDelta))
```
