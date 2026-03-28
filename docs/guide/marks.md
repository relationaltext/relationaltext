# Marks

An **inline mark** annotates a byte range with typographic or semantic meaning — bold, italic, a hyperlink, a hashtag.

## Mark Feature Shape

```ts
interface MarkFeature {
  $type: 'org.relationaltext.richtext.mark'
  name: MarkName
  attrs?: Record<string, unknown>
  expandStart?: boolean
  expandEnd?: boolean
}
```

- `name` — the mark kind. The name comes from the format's own vocabulary: a bold mark might be named `strong`, `bold`, or `b` depending on the format.
- `attrs` — optional key/value pairs (e.g. `{ url: "https://..." }` for a link). Note: the attribute name is format-specific. The RT hub (`org.relationaltext.facet`) uses `url`; CommonMark uses `uri`.
- `expandStart` / `expandEnd` — Peritext expand semantics (see below)

## Example Mark Names from Built-in Formats

Mark names are defined by each format's lexicon — there are no built-in canonical names. The name is the format's own native identifier. Mark names follow the Transliteration Principle — they use the format's own native identifiers. See [Custom Format Guide](/how-to/add-custom-format) for details.

| Format | Example marks |
|--------|--------------|
| CommonMark | `strong`, `emphasis`, `code-span`, `link` |
| GFM | `strikethrough` |
| HTML | `strong`, `em`, `s`, `u`, `sup`, `sub`, `code`, `kbd`, `a` |
| Bluesky | `mention`, `link`, `tag` (via `app.bsky.richtext.facet#*`) |

When constructing documents programmatically via `Document.addMark()`, you use `org.relationaltext.richtext.mark` as the `$type`. See the format pages for format-specific names.

## Overlapping Marks

Marks can have overlapping byte ranges. For example:

```
text:    "Hello world example"
          01234567890123456789
          (byte offsets; for ASCII text, byte and character offsets coincide)

bold:    [5, 15)   covers "world exam"
italic:  [8, 19)   covers "ld example"
overlap: [8, 15)   gets BOTH bold and italic
```

Bold and italic are stored as two separate facets with overlapping ranges. When rendered, the overlap region receives both marks applied. There is no restriction on how marks overlap — the renderer handles nesting.

## Peritext Expand Semantics

The **Peritext model** defines how marks behave at their boundaries during concurrent edits. When two users edit a document simultaneously — one extending a bold word, one inserting text at the boundary — the expand semantics determine which result is correct.

**The practical question**: if your cursor is at the end of a **bold** word and you type a character, does the new character become bold?

- `expandEnd: true` — yes, the new character is included in the bold mark. The mark grows rightward.
- `expandEnd: false` — no, the new character is outside the bold mark. The mark boundary stays fixed.

**Concrete example:**

```
Before:  "Hello world"   (bold covers bytes 0–5: "Hello")
                 ^cursor at byte 5 (after "Hello")

Type "!":
  expandEnd: true  → "Hello! world"   bold covers 0–6 ("Hello!")
  expandEnd: false → "Hello! world"   bold covers 0–5 ("Hello" only)
```

The same logic applies to `expandStart` when inserting before the mark's start boundary.

Note: expand semantics control what happens when you *type* at the boundary of a mark — they do not affect how overlapping marks are stored or rendered.

<ExpandDemo />

The Peritext model controls whether a mark **grows** when text is inserted at its boundaries.

| Mark | expandStart | expandEnd |
|------|-------------|-----------|
| `bold` / `strong` | `true` | `true` |
| `italic` / `emphasis` / `em` | `true` | `true` |
| `strikethrough` | `true` | `true` |
| `underline` | `true` | `true` |
| `code` / `code-span` | `false` | `false` |
| `keyboard` / `kbd` | `false` | `false` |
| `superscript` / `sup` | `false` | `false` |
| `subscript` / `sub` | `false` | `false` |

**Expanding marks** (bold, italic, strikethrough, underline) grow when text is typed at the boundary. If your cursor is at the end of a bold word and you type a character, the new character also becomes bold.

**Non-expanding marks** (code, keyboard, superscript, subscript) do not grow at boundaries. Typing after inline code does not extend the code span.

The `expandStart` and `expandEnd` fields on the wire format override these defaults. The registry-stored behavior applies when neither field is present.

## Marks in the HIR

When the HIR is built from a document, every text segment carries a `marks` array listing all marks active over that segment. Marks are ordered outermost-first: the first entry in `marks` is the outermost wrapper (wider range), while the last is the innermost mark that wraps the text most tightly.

Each mark is represented as an `HIRMark`:

```ts
interface HIRMark {
  kind: string                      // full compound key, e.g. "org.commonmark.facet#strong"
  attrs: Record<string, unknown>    // any attribute fields from the original feature
}
```

The `kind` field is the full compound key assembled from the feature's `$type` and `name` — for example, `"org.commonmark.facet#strong"` for a CommonMark bold mark, or `"app.bsky.richtext.facet#mention"` for a Bluesky mention. Renderers switch on `kind` (or `kind.endsWith('#bold')`) to decide which HTML element or output token to emit.

A concrete example for the text `"**Hello**"` parsed from Markdown:

```ts
{
  type: 'text',
  content: 'Hello',
  marks: [{ kind: 'org.commonmark.facet#strong', attrs: {} }]
}
```

For details on how the HIR is built and how to walk it in a renderer, see the [HIR page](./hir).

## Format-Specific Marks

When parsing a format, marks use that format's namespace. See the format pages (e.g., [Markdown](../formats/markdown), [HTML](../formats/html), [Bluesky](../formats/bluesky)) for the specific mark names each format uses.

## Adding Marks Programmatically

```ts
import { Document } from 'relational-text'

const doc = Document.fromText('Hello, world!')

// Bold "Hello" (bytes 0–5)
// addMark defaults $type to 'org.relationaltext.facet' when omitted
const bold = doc.addMark(0, 5, { name: 'bold' })

// Italic with custom attrs
const italic = bold.addMark(7, 12, { name: 'italic', attrs: { lang: 'en' } })

// Link with explicit $type for a different namespace
// Note: Bluesky's wire format uses 'uri', not 'url', for link attributes.
// The RT hub ('org.relationaltext.facet') uses 'url'. Attribute names are format-specific.
const linked = italic.addMark(7, 12, {
  $type: 'app.bsky.richtext.facet',
  name: 'link',
  attrs: { uri: 'https://example.com' },
} as any)
```

All mutation methods return a **new** Document — the original is unchanged.
