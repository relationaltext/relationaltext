# Bibliography

The design of RelationalText synthesizes several research threads in collaborative editing,
rich text annotation, and decentralized protocols. This page lists the primary sources.

---

## Peritext: A CRDT for Rich-Text Collaboration

**Litt, G., Litt, S., Kleppmann, M., and van Hardenberg, P.**
"Peritext: A CRDT for Rich-Text Collaboration."
*Proceedings of the ACM on Human-Computer Interaction*, Vol. 6, No. CSCW2, Article 531 (November 2022).
DOI: [10.1145/3555644](https://doi.org/10.1145/3555644)

Peritext defines **expand semantics** for inline marks in a CRDT: each mark type carries
`expandStart` and `expandEnd` flags that determine whether the mark grows when text is
inserted at its boundaries. Bold expands on both sides (new characters inherit surrounding
formatting); inline code and links do not (new characters adjacent to a code span should
not become code). RelationalText stores these flags verbatim in lexicon entries and uses
them during `insert_text` to adjust facet ranges.

---

## Block Elements in Collaborative Editors

**Kleppmann, M.**
"Block elements in collaborative text editors." (Essay/blog post, 2023.)
https://www.inkandswitch.com/peritext/

The block element model that RelationalText uses derives from this work and the broader
Automerge/Peritext project. The key architectural insight is that block structure should
be encoded as **boundary marker characters** inserted into the text sequence rather than
as a separate tree. Content between consecutive marker characters forms a block; the
marker's associated feature record carries the block type and attributes.

RelationalText uses `\uFFFC` (U+FFFC, Object Replacement Character) for the first block
marker in a document and `\n` (U+000A) for all subsequent ones, matching the Automerge
block element proposal. Nesting is expressed via a `parents: string[]` array on each
block feature rather than through reference chains, making orphaned-ancestor scenarios
impossible.

---

## atjson

**Offscreen.io (Condé Nast).**
*atjson* — a framework for creating format-independent rich text.
GitHub: https://github.com/CondeNast/atjson

atjson pioneered the model of separating document content (a plain string) from its markup
(typed, byte-range annotations). RelationalText adopts this core insight: the `text` field
and the `facets` array are orthogonal. The text is always valid on its own; facets are
metadata layered on top.

The **Hierarchical Intermediate Representation (HIR)** — a rendering tree derived from
flat, potentially-overlapping annotations — is also drawn from atjson. RelationalText's
WASM `to_hir` function implements the same flat-to-tree conversion, resolving overlapping
spans into non-overlapping ranges before constructing block and inline nodes.

---

## AT Protocol Rich Text Facets

**Bluesky / AT Protocol.**
Rich text facets specification.
https://atproto.com/specs/richtext

atproto's richtext/facets system is the wire format that RelationalText extends. The
`{ text: string, facets: Facet[] }` shape, byte-range indexing, and the `app.bsky.richtext.facet`
namespace for mentions, links, and tags are all preserved verbatim. RelationalText adds
block features, expand semantics, and a multi-namespace lens system while remaining
backwards-compatible: `toBluesky()` filters to the `app.bsky.richtext.facet` namespace
before posting to the AppView.

---

## CommonMark Specification

**MacFarlane, J., et al.**
*CommonMark Spec*, version 0.31.2.
https://spec.commonmark.org/0.31.2/

RelationalText's Markdown importer and exporter implement the full CommonMark 0.31.2
specification. The test suite runs all 652 normative examples from the spec and passes
all 652. The `org.commonmark.facet` lexicon names are drawn from CommonMark's own
terminology (`emphasis`, `strong`, `code-span`, `fenced-code-block`, `link`, etc.).

---

## WHATWG HTML Living Standard

**WHATWG.**
*HTML Living Standard.*
https://html.spec.whatwg.org/

The `org.w3c.html.facet` lexicon is derived from the WHATWG HTML Living Standard element
set. Every element defined in the spec appears in `whatwg-html.lexicon.json`; feature names
are the element tag names as written in the spec (`p`, `h1`–`h6`, `strong`, `em`, `a`,
`pre`, `code`, `blockquote`, `ul`, `ol`, `li`, etc.). The spec URL for the lexicon is
`https://html.spec.whatwg.org/`.
