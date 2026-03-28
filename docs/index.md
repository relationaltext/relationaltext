---
layout: home
hero:
  name: RelationalText
  text: Structured annotations for any document format
  tagline: A document model built on panproto that preserves semantic meaning across editors, protocols, and representations.
  actions:
    - theme: brand
      text: Try the Demo
      link: https://demo.relationaltext.org
    - theme: alt
      text: Get Started
      link: /guide/getting-started
features:
  - title: Semantic Annotations
    details: Typed inline annotations that survive format conversion — not just bold and italic, but ingredients, mentions, coordinates, and any structured data.
  - title: Built on panproto
    details: Cross-format conversion powered by panproto's algebraic lens engine. Declarative JSON lenses compose, invert, and migrate — with provably correct schema evolution.
    link: https://panproto.dev
    linkText: Learn about panproto
  - title: WASM-Powered Parsing
    details: 30+ format adapters compiled from Rust to WebAssembly. Ship a WASM blob and a lexicon and a new format joins the conversion graph.
---

::: warning
This documentation is nearly fully LLM-generated. Proceed with caution. We appreciate any suggestions or reports of issues at [github.com/relationaltext/relationaltext](https://github.com/relationaltext/relationaltext/issues).
:::

<div class="home-prose">

## How it works

Every text format — Markdown, ProseMirror, Quill, Bluesky, Notion — can be understood as a vocabulary of typed annotations over a text sequence. Converting between formats is remapping vocabularies. RelationalText makes that conversion infrastructure first-class.

The core insight: documents are UTF-8 text plus byte-ranged facets (typed annotations). Each facet carries features identified by NSIDs — the same namespace system used by AT Protocol — so the vocabulary of annotations is as open as the web itself.

## The panproto engine

Format conversion is powered by [panproto](https://panproto.dev), an engine for schematic version control built on generalized algebraic theories. RelationalText uses panproto at every layer:

- **Schema representation** — format lexicons (JSON Schema, ATProto Lexicon, and others) are parsed into panproto's algebraic schema model
- **Lens compilation** — declarative JSON lens rules compile to panproto protolens chains: `rename`, `drop`, `add`, `pullback`, and directed equations
- **Migration** — panproto computes provably correct migrations between schema versions, so format evolution is tractable in both directions
- **Instance transformation** — documents convert to panproto instances, transform through the lens chain, and convert back

This means a v1 document upgrades to v2 transparently, and a v2 document still round-trips to v1 wherever the mapping is lossless.

## Why it matters

Once annotated text is treated as first-class infrastructure, the possibilities compound. Collaborative editing is CRDT-safe. Any byte range can carry typed semantic annotations — not just a hyperlink, but a mention with a handle, a place with coordinates, a product with an ID. Lenses decouple intent from rendering, so "embed a YouTube video here" can mean a player, a thumbnail, a transcript, or a bare link depending on context. Documents store their original format's features as a permanent namespace alongside the normalized hub representation, making backward-compatible re-import always possible.

Ship a WASM blob and a lexicon JSON and a new format joins the shared conversion graph without permission or coordination.

</div>

<style>
.home-prose {
  max-width: 688px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  font-size: 1.1rem;
  line-height: 1.75;
  color: var(--vp-c-text-1);
}

.home-prose h2 {
  margin-top: 2em;
  margin-bottom: 0.5em;
  font-size: 1.4rem;
}

.home-prose p + p {
  margin-top: 1.5em;
}

.home-prose ul {
  margin-top: 0.75em;
  padding-left: 1.5em;
}

.home-prose li {
  margin-top: 0.4em;
}
</style>
