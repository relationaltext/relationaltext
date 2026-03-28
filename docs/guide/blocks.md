# Blocks

Block elements in RelationalText use single-character **markers** embedded in the text string. The block's content follows the marker until the next marker or end of string.

For example, the Markdown list:

```md
- First item
- Second item
```

produces two block facets. Here is what one of them looks like in the wire format:

```json
{ "index": { "byteStart": 0, "byteEnd": 3 }, "features": [{ "$type": "org.commonmark.facet", "name": "unordered-list-item", "parents": ["unordered-list-item"] }] }
```

The facet covers only the marker character; the item text (`"First item"`) follows the marker in the `text` string.

## Block Markers

Two characters are used as block markers:

| Marker | Bytes | Usage |
|--------|-------|-------|
| `\uFFFC` (U+FFFC OBJECT REPLACEMENT CHARACTER) | 3 bytes | First block in the document |
| `\n` (LINE FEED) | 1 byte | Every subsequent block |

Using different characters for the first vs subsequent blocks means the first block does not require a preceding newline, keeping the text compact and avoiding a leading newline in single-block documents.

::: info Embeds and external objects
`\uFFFC` (U+FFFC OBJECT REPLACEMENT CHARACTER) is also used for embeds and other objects — it indicates that external content replaces this position in the rendered output. In these cases the associated feature describes the external object (e.g., an image, video, or card embed).
:::

### Example

A document with two paragraphs:

<WireDisplay
  :text="'\uFFFCHello, world!\nThis is the second paragraph.'"
  :facets='[
    { index: { byteStart: 0,  byteEnd: 3  }, features: [{ "$type": "org.commonmark.facet", name: "paragraph", parents: [] }] },
    { index: { byteStart: 16, byteEnd: 17 }, features: [{ "$type": "org.commonmark.facet", name: "paragraph", parents: [] }] }
  ]'
/>

The facet index covers **only the marker character**. Block content is `text[markerEnd..nextMarkerStart]`.

Breaking down the byte positions:

```
Char: \uFFFC H  e  l  l  o  ,     w  o  r  l  d  !  \n
Byte:  0─3  3  4  5  6  7  8  9  10 11 12 13 14 15 16
```

- `\uFFFC` (U+FFFC) is 3 bytes in UTF-8 → first block marker at bytes 0–3
- `"Hello, world!"` = 13 chars = 13 bytes → occupies bytes 3–16
- `\n` is 1 byte → second block marker at byte 16, so `byteStart: 16, byteEnd: 17`
- Content of second block starts at byte 17

## Block Structure

```ts
interface BlockFeature {
  $type: string
  name: BlockName
  parents: string[]
  attrs?: Record<string, unknown>
}
```

The `$type` is the feature's namespace — `'org.commonmark.facet'` for Markdown-parsed blocks, `'org.w3c.html.facet'` for HTML-parsed blocks, etc. When constructing blocks programmatically, `Document.addBlock()` defaults to `'org.relationaltext.facet'`.

### `name`

The block type identifier. Block names are defined by each format's lexicon — there are no built-in or default names. For example:

- `from('markdown', input)` emits blocks named `paragraph`, `heading`, `unordered-list-item`, `ordered-list-item`, `code-block`, etc. (from the CommonMark spec)
- `from('html', input)` emits blocks using HTML tag names: `p`, `h1`–`h6`, `li`, `pre`, `blockquote`, etc.

Any string is valid for forward compatibility. See the format pages for the specific names each format uses.

### `parents`

The `parents` array encodes nesting. Each entry is the container type name of an ancestor. The HIR builder synthesizes container nodes (e.g., `<ul>`, `<ol>`, `<blockquote>`) from consecutive blocks that share a `parents` prefix.

Example: a bullet list with one item nested inside a blockquote:

```json
[
  { "name": "blockquote-marker", "parents": [], "attrs": {} },
  { "name": "paragraph", "parents": ["blockquote"], "attrs": {} },
  { "name": "bullet-list-marker", "parents": ["blockquote"], "attrs": {} },
  { "name": "list-item-marker", "parents": ["blockquote"], "attrs": {} },
  { "name": "list-item-text", "parents": ["blockquote", "unordered-list-item"], "attrs": {} }
]
```

The HIR builder reads consecutive blocks with a shared `parents` prefix and wraps them in the appropriate container.

::: info Containers and the wire format
Container nodes like `<ul>`, `<ol>`, `<blockquote>` are usually synthesized by the HIR builder from consecutive blocks sharing a `parents[]` prefix — they are NOT required to exist as features. However, when a container needs to carry attributes (for example, an ordered list with a custom `start` number), a corresponding feature with the container's name can optionally appear in the facets. The HIR builder uses its attributes if present.

For example, three list items with `parents: ["unordered-list-item"]` produce a single `HIRContainerNode` with `name: "unordered-list-item"` wrapping all three items. There is no required "unordered-list-item block" feature — it is a container label inferred from the `parents` array.

This is by design: the flat facet array can express arbitrary nesting depth without any recursive structure.
:::

**Step-through: Markdown list → facets → HIR → HTML**

Given the Markdown input:
```markdown
- First item
- Second item
```

The `from('markdown', input)` importer produces:

<WireDisplay
  :text="'\uFFFCFirst item\nSecond item'"
  :facets='[
    { index: { byteStart: 0,  byteEnd: 3  }, features: [{ "$type": "org.commonmark.facet", name: "unordered-list-item", parents: ["unordered-list-item"] }] },
    { index: { byteStart: 13, byteEnd: 14 }, features: [{ "$type": "org.commonmark.facet", name: "unordered-list-item", parents: ["unordered-list-item"] }] }
  ]'
/>

The HIR builder sees two consecutive blocks sharing the same `parents` prefix `["unordered-list-item"]` and synthesizes:
```
HIRContainerNode { name: "unordered-list-item", children: [
  HIRBlockNode { name: "unordered-list-item", children: [Text "First item"] },
  HIRBlockNode { name: "unordered-list-item", children: [Text "Second item"] },
] }
```

The HTML renderer converts the container to `<ul>` and each block to `<li>`:
```html
<ul>
  <li>First item</li>
  <li>Second item</li>
</ul>
```

### `attrs`

Block-specific attributes. Examples:

```json
// Heading level
{ "name": "heading", "parents": [], "attrs": { "level": 2 } }

// Code block language
{ "name": "code-block", "parents": [], "attrs": { "language": "typescript" } }

// GFM table (cell content stored directly in attrs)
{ "name": "table", "parents": [], "attrs": {
    "headers": ["Name", "Value"],
    "rows": [["foo", "1"], ["bar", "2"]]
} }
```

## Block Markers Do Not Expand

Text inserted at a block marker's boundaries shifts the marker rather than extending it. This is the correct behavior for collaborative editing: inserting text before a paragraph header moves the header forward; it does not merge the new text into the header facet.

:::: details Format-Specific Block Names

When parsing a format like CommonMark or HTML, blocks use that format's own `$type` namespace. For example, `from('markdown', input)` emits `$type: "org.commonmark.facet"` for paragraph and heading blocks, not `$type: "org.relationaltext.facet"`. The `name` field uses the format's native identifier (e.g., `"paragraph"`, `"heading"`, `"code-block"`).

A lens transforms these namespaced blocks to another namespace. The `org.relationaltext.facet` `$type` is used when constructing documents programmatically via `Document.addBlock()`.

::: info Multi-format documents
When a document contains features from multiple format lexicons, `parents[]` entries are convention-based string names local to each format's namespace. If two formats use the same block name for different purposes (e.g., both use `paragraph`), they should use their own namespaced `$type` and `name` to distinguish them.
:::

::::

::: info Block model design
The block marker design is inspired by the collaborative editing research of Kleppmann et al. See [Bibliography](/guide/bibliography) for full citations and links.
:::
