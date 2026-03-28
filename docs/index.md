---
layout: home
hero:
  name: RelationalText
  text: Structured annotations for any document format
  tagline: A panproto document model that preserves semantic meaning across editors, protocols, and representations.
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
  - title: Panproto Native
    details: Built on panproto for protocol-level interoperability. Feature types are NSIDs, dereferenceable on the network, so the vocabulary is as open as the web.
  - title: WASM-Powered Parsing
    details: 30+ format adapters compiled from Rust to WebAssembly. Declarative JSON lenses compose and invert for bidirectional conversion.
---

::: warning
This documentation is nearly fully LLM-generated. Proceed with caution. We appreciate any suggestions or reports of issues at [github.com/relationaltext/relationaltext](https://github.com/relationaltext/relationaltext/issues).
:::

<div class="home-prose">

What Pandoc proved for documents, RelationalText generalizes. Every text format — Markdown, ProseMirror, Quill, Bluesky, Notion — can be understood as a vocabulary of typed annotations over a text sequence. Converting between formats is remapping vocabularies, and RelationalText makes that conversion infrastructure first-class: declarative JSON lenses that compose and invert like Haskell optics; SQL and WASM escape hatches for transforms that resist pure declaration; feature types that are NSIDs, dereferenceable records on the network, so the vocabulary is as open as RDF but applied to writing, not abstract graphs. Ship a WASM blob and a lexicon JSON and a new format joins the shared conversion graph without permission or coordination.

Once annotated text is treated as first-class infrastructure, the possibilities compound. Collaborative editing is CRDT-safe. Any byte range can carry typed semantic annotations — not just a hyperlink, but a mention with a handle, a place with coordinates, a product with an ID — the kind of structured enrichment that classical formats could only approximate with generic links. Lenses decouple intent from rendering, so you can preserve human intent — "embed a YouTube video here" — while letting each render pipeline decide what that means independently: a player, a thumbnail, a transcript, a bare link. Documents can store their original format's features as a permanent namespace alongside the normalized hub representation, making backward-compatible re-import possible if the source format ever changes. And because lenses are versioned and bidirectional, format evolution is tractable in both directions: a v1 document upgrades to v2 transparently, and a v2 document still round-trips to v1 wherever the mapping is lossless.

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

.home-prose p + p {
  margin-top: 1.5em;
}
</style>
