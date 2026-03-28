# Convert Between Formats

Use `from()` and `to()` to convert any document between any two formats that RelationalText supports.

## Basic Example: Markdown to HTML

```ts
import { initRelationalText } from 'relational-text'
import { from, to } from 'relational-text'

await initRelationalText()

const doc = from('markdown', '**Hello**, _world_!')
const html = to('html', doc)
// '<p><strong>Hello</strong>, <em>world</em>!</p>\n'
```

`from()` parses the input string into a `Document`. `to()` serializes that document to the target format's string representation.

## Generic Convert Helper

The `FormatName` type is a union of all supported format name strings. Use it to write format-agnostic conversion utilities:

```ts
import { from, to, type FormatName } from 'relational-text'

function convert(
  sourceFormat: FormatName,
  targetFormat: FormatName,
  input: string,
): string {
  const doc = from(sourceFormat, input)
  return to(targetFormat, doc)
}

// Slack message to Markdown
const md = convert('slack', 'markdown', '*Hello* from Slack')

// Quill Delta to HTML
const html = convert('quill', 'html', JSON.stringify({ ops: [{ insert: 'Hello\n' }] }))

// Mastodon HTML to plain Markdown
const plain = convert('mastodon', 'markdown', '<p>Hello <strong>world</strong></p>')
```

## Listing Available Formats

`FORMATS` is a record keyed by every supported format name. Use it when you need to enumerate formats dynamically — for example, to build a UI dropdown or validate user input:

```ts
import { FORMATS, type FormatName } from 'relational-text'

// List all format names
const names = Object.keys(FORMATS) as FormatName[]
// ['markdown', 'html', 'slack', 'discord', 'bluesky', ...]

// Validate a runtime string before passing it to from()/to()
function isFormatName(s: string): s is FormatName {
  return s in FORMATS
}

function safeConvert(src: string, tgt: string, input: string): string | null {
  if (!isFormatName(src) || !isFormatName(tgt)) return null
  return convert(src, tgt, input)
}
```

## Notes

- Both `from()` and `to()` are synchronous. Initialization (`initRelationalText()`) is the only async step.
- The intermediate `Document` is a pure value — you can serialize it, cache it, and pass it to multiple `to()` calls.
- Conversion goes through the `org.relationaltext.facet` hub via the [Lens Graph](../lenses/graph). Some detail may be dropped when a target format has no equivalent for a source feature.

## See Also

- [Getting Started](../guide/getting-started) — installation and initialization
- [Formats Overview](../formats/) — per-format documentation and feature support tables
- [Tutorial](../tutorial/) — step-by-step walkthrough building a multi-format pipeline
