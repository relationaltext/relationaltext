# Rendering

Most rich text formats store content as a tree from the start. An HTML document is a DOM. A ProseMirror document is a schema-constrained node graph. A Quill Delta is a sequence of operations with cumulative attributes that implicitly form a flat paragraph model. The nesting structure is part of the data itself.

RelationalText's wire format is deliberately different: a plain text string annotated with flat, parallel byte-range facets. There is no nesting in the wire format — a bold mark and a link mark that overlap the same region are two independent entries in the `facets` array. This is what makes the format composable, forward-compatible, and amenable to CRDT merge. But it creates a problem when you want to produce output.

## The problem with flat annotations

Take this document:

```
text: "read the docs"
facets:
  [0, 12) → link "https://example.com"
  [5, 12) → bold
```

The overlap at `[5, 12)` — the words "the docs" — has both a link and a bold mark active simultaneously. To render this as HTML you need to decide which tag wraps which:

```html
<a href="...">read <strong>the docs</strong></a>   <!-- link outer -->
<a href="...">read </a><strong><a href="...">the docs</a></strong>  <!-- bold outer, split link -->
```

Neither representation is wrong in principle, but the first is far more useful — and CommonMark's spec explicitly requires links to be outer relative to emphasis when they coincide. The wire format carries no nesting information; the renderer has to impose an order.

This multiplies quickly. Consecutive list items need a `<ul>` wrapper that was never in the wire format. Block boundary markers (`\uFFFC`, `\n`) are sentinel bytes that delimit regions of content but shouldn't appear in output. Unknown feature types need to pass through unchanged without disrupting the structure.

## The HIR as the solution

The HIR (Hierarchical Intermediate Representation) is a computed render tree that resolves all of this in one pass. `doc.toHIR()` produces a tree of blocks, containers, and text nodes — the shape that renderers actually want to walk — without storing that shape permanently in the wire format.

```ts
const doc = from('markdown', '**Hello**, _world_!')
const nodes = doc.toHIR()
// The HIR is computed fresh — not stored in the document
```

Four things the HIR builder does that a naive renderer would have to do itself:

1. **Segments text at every mark boundary** — a region where bold and italic overlap becomes its own text node with both marks in its `marks` array. No renderer has to compute intersections.

2. **Resolves nesting order** — when marks share the same range or overlap, the HIR picks a stable outermost mark using type-based precedence (links are outer; display-level marks like bold and italic are inner). Renderers get a flat `marks[]` array, outermost first, and apply them in reverse to wrap content correctly.

3. **Synthesizes containers** — consecutive block nodes that share a `parents` prefix are grouped into `HIRContainerNode`s (`<ul>`, `<ol>`, `<blockquote>`). These containers exist only in the HIR, not the wire format.

4. **Consumes block markers** — the `\uFFFC` and `\n` sentinel bytes are interpreted as block boundaries. The text content of each block node is the characters *between* its marker and the next, with the sentinel byte itself excluded.

The HIR is always recomputed. It is an interpretation of the wire format, not a stored form.

## Node Types

```ts
type HIRNode = HIRBlockNode | HIRContainerNode | HIRTextNode
```

### `HIRBlockNode`

A block-level element corresponding to a `BlockFeature` in the document.

```ts
interface HIRBlockNode {
  type: 'block'
  name: BlockName
  attrs: Record<string, unknown>
  children: HIRNode[]
}
```

- `name` — block type (e.g. `"paragraph"`, `"heading"`, `"code-block"`)
- `attrs` — block attributes from the wire-format feature (e.g. `{ level: 2 }` for a heading)
- `children` — inline content of this block as `HIRTextNode[]`, or nested `HIRBlockNode[]` / `HIRContainerNode[]`

### `HIRContainerNode`

**Container nodes are never stored in the wire format** — they are synthesized by the HIR builder from consecutive blocks sharing a `parents` prefix.

```ts
interface HIRContainerNode {
  type: 'container'
  name: string
  children: HIRNode[]
}
```

Examples: `<ul>`, `<ol>`, `<blockquote>`. The `name` field matches the container label stored in the block's `parents` array (e.g. `"ul"`, `"ol"`, `"blockquote"`).

### `HIRTextNode`

A text segment with zero or more active marks.

```ts
interface HIRTextNode {
  type: 'text'
  content: string
  marks: HIRMark[]
}
```

Text nodes are never empty. The `marks` array lists every mark active over this segment, outermost first (wider ranges come first in canonical facet order).

### `HIRMark`

```ts
interface HIRMark {
  kind: string
  attrs: Record<string, unknown>
}
```

`kind` is the full `$type` compound key of the source feature:

```
"org.commonmark.facet#strong"          → CommonMark bold
"org.commonmark.facet#emphasis"        → CommonMark italic
"org.commonmark.facet#link"            → CommonMark link
"app.bsky.richtext.facet#mention"      → Bluesky mention
"app.bsky.richtext.facet#link"         → Bluesky link
"org.joinmastodon.facet#strong"        → Mastodon bold
"org.joinmastodon.facet#a"             → Mastodon link
```

For mark features that use a compound key with a `name` field (e.g. `$type: "org.commonmark.facet"` with `name: "strong"`), the `kind` is assembled as `"$type#name"`.

::: warning Attribute names vary by format
Link attributes differ across namespaces: CommonMark uses `uri`, while the RT hub (`org.relationaltext.facet`) uses `url`. If your renderer accepts documents from multiple formats without a prior `autoTransform`, check for both.
:::

`attrs` carries any attribute fields from the original feature (e.g. `{ url: "https://..." }` for an RT hub link, `{ uri: "https://..." }` for a CommonMark link). Note that `{ level: 2 }` is NOT in mark attrs — that's a block attr.

## Live Explorer

::: tip
Try adding overlapping marks and a list to see how the HIR segments text and synthesizes container nodes.
:::

Type Markdown below to see the flat facets, the HIR tree, and the rendered HTML update in real time:

<HIRViewer />

## Building the HIR

### Minimal example

Call `doc.toHIR()` on any `Document` instance:

```ts
import { from } from 'relational-text/registry'

const doc = from('markdown', '**Hello**, _world_!')
const nodes = doc.toHIR()
// [
//   {
//     type: 'block',
//     name: 'paragraph',
//     attrs: {},
//     children: [
//       { type: 'text', content: 'Hello', marks: [{ kind: 'org.commonmark.facet#strong', attrs: {} }] },
//       { type: 'text', content: ', ', marks: [] },
//       { type: 'text', content: 'world', marks: [{ kind: 'org.commonmark.facet#emphasis', attrs: {} }] },
//       { type: 'text', content: '!', marks: [] }
//     ]
//   }
// ]
```

### Production patterns

**Mark coalescing.** The production HTML renderer coalesces consecutive `HIRTextNode` entries with identical mark sets into a single element (e.g., `<strong>hello world</strong>` instead of `<strong>hello</strong><strong> world</strong>`). Implement this for cleaner output:

```ts
function renderTextNodes(nodes: HIRTextNode[]): string {
  // Group consecutive nodes with the same mark signature
  const groups: HIRTextNode[][] = []
  for (const node of nodes) {
    const sig = node.marks.map(m => m.kind).join(',')
    const last = groups[groups.length - 1]
    const lastSig = last?.[0] && last[0].marks.map(m => m.kind).join(',')
    if (lastSig === sig) last.push(node)
    else groups.push([node])
  }
  return groups.map(g => renderText({ ...g[0], content: g.map(n => n.content).join('') })).join('')
}
```

**Mark attribute names vary by format.** Links from CommonMark use `{ uri: "..." }` while RT hub links use `{ url: "..." }`. If your renderer accepts documents from multiple formats without a prior `autoTransform`, check for both attribute names.

**Entity featureClass.** Entities (links, images, mentions, hashtags) appear in `HIRTextNode.marks` just like inline marks, but they carry the visual content in their `attrs`. The content string is the text the entity covers (e.g., the link display text); `mark.attrs` contains the metadata.

## Inline-Only Documents

When a document has no block facets, `toHIR()` returns bare `HIRTextNode[]` at the top level (no wrapping block). Renderers check for this case and wrap inline content if their output format requires it:

```ts
// Inline-only document (no block markers in text)
const doc = Document.fromText('Hello, world!')
const nodes = doc.toHIR()
// nodes[0].type === 'text'  ← no block wrapper

// Renderers handle this:
if (nodes.every(n => n.type === 'text')) {
  // toHTML wraps in <p>; toMarkdown wraps as a paragraph
}
```

## Walking the HIR

A complete minimal renderer that converts a document to HTML-like output:

```ts
import type { HIRNode, HIRBlockNode, HIRContainerNode, HIRTextNode, HIRMark } from 'relational-text'

function render(doc: Document): string {
  return renderNodes(doc.toHIR())
}

function renderNodes(nodes: HIRNode[]): string {
  // Inline-only document: no block wrappers, just the text
  if (nodes.every(n => n.type === 'text')) {
    return `<p>${nodes.map(renderText).join('')}</p>`
  }
  return nodes.map(renderNode).join('')
}

function renderNode(node: HIRNode): string {
  switch (node.type) {
    case 'block':     return renderBlock(node as HIRBlockNode)
    case 'container': return renderContainer(node as HIRContainerNode)
    case 'text':      return renderText(node as HIRTextNode)
  }
}

function renderBlock(node: HIRBlockNode): string {
  const inner = node.children.map(renderNode).join('')
  // node.name is the feature name (e.g. "paragraph", "heading"), not the full compound key.
  // The full compound key ($type#name) is found on HIRMark.kind, not HIRBlockNode.name.
  if (node.name === 'paragraph') return `<p>${inner}</p>`
  if (node.name === 'heading') {
    const level = (node.attrs as { level?: number })?.level ?? 1
    return `<h${level}>${inner}</h${level}>`
  }
  if (node.name === 'code-block') return `<pre><code>${inner}</code></pre>`
  if (node.name === 'horizontal-rule') return `<hr>`
  return `<div>${inner}</div>` // fallback
}

function renderContainer(node: HIRContainerNode): string {
  const inner = node.children.map(renderNode).join('')
  if (node.name === 'blockquote') return `<blockquote>${inner}</blockquote>`
  if (node.name === 'ul')         return `<ul>${inner}</ul>`
  if (node.name === 'ol')         return `<ol>${inner}</ol>`
  if (node.name === 'li')         return `<li>${inner}</li>`
  return inner
}

function renderText(node: HIRTextNode): string {
  let content = escapeHtml(node.content)
  // Marks are ordered from outermost to innermost.
  // Apply in reverse so the outermost mark wraps the fully-decorated content.
  for (const mark of [...node.marks].reverse()) {
    content = applyMark(content, mark)
  }
  return content
}

function applyMark(content: string, mark: HIRMark): string {
  // mark.kind is the full compound key, e.g. "org.relationaltext.facet#bold"
  // mark.attrs carries any additional data from the feature
  if (mark.kind.endsWith('#bold'))          return `<strong>${content}</strong>`
  if (mark.kind.endsWith('#italic'))        return `<em>${content}</em>`
  if (mark.kind.endsWith('#code'))          return `<code>${content}</code>`
  if (mark.kind.endsWith('#underline'))     return `<u>${content}</u>`
  if (mark.kind.endsWith('#strikethrough')) return `<s>${content}</s>`
  if (mark.kind.endsWith('#link')) {
    const url = (mark.attrs as { url?: string; uri?: string })?.url
               ?? (mark.attrs as { uri?: string })?.uri ?? '#'
    return `<a href="${url}">${content}</a>`
  }
  return content // unknown marks pass through as plain text
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

See `html.ts` and `markdown.ts` in the source for the full production renderers.
