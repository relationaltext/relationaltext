# relationaltext-core

The pure Rust engine behind RelationalText. Contains the document model, lexicon
registry, HIR builder, lens system (panproto-backed), Layers annotation data
model, position tracking, and normalization logic. No WASM, no format-specific
knowledge — all format registrations happen at runtime through the lexicon system.

This crate is used directly by `relationaltext-wasm` (which wraps it for
WASM-bindgen export) and by `relationaltext-sqlite` (the SQLite extension).

## Key types

| Type | Module | Description |
|---|---|---|
| `Document` | `document` | Text + facets (formatting annotations) |
| `Facet` | `document` | Byte range (`ByteSlice`) + `Vec<Feature>` |
| `Feature` | `document` | `type_id: String` + `data: serde_json::Map` |
| `LexiconRegistry` | `lexicon` | Maps type IDs to `LexiconBehavior` |
| `HirNode` | `hir` | Rendered tree node (block, container, text + marks) |
| `LayeredDocument` | `layers` | Document + Layers annotation layers |
| `AnnotationLayer` | `layers` | Kind/subkind + `Vec<Annotation>` |
| `Annotation` | `layers` | Anchor + label + value + knowledge refs |

## Modules

- `document` — `Document`, `Facet`, `Feature`, `ByteSlice`
- `lexicon` — `LexiconRegistry`, `LexiconBehavior`, `FeatureClass`
- `hir` — flat facets -> render tree
- `normalize` — `sort_facets`, `validate`, `coalesce_marks`
- `position` — byte/char conversion, `adjust_facets_for_insert/delete`
- `lens` — panproto-backed lens engine: `apply_lens_to_doc` uses
  `panproto_lens::get` with protolens chain, vertex remap, field
  transforms, complement tracking. Post-restrict handlers for
  matchAttrs, template names, join rules, parent references.
- `layers/` — Layers annotation data model (`pub.layers.*` ATProto
  lexicons): `LayeredDocument`, `AnnotationLayer`, `Annotation`,
  `Segmentation`, `Ontology`, `Graph`, `Alignment`, `Judgment`,
  `Corpus`, `Resource`, with live anchor adjustment and querying
- `panproto_bridge/` — Document <-> WInstance conversion, protolens
  chain construction from LensSpec rules, value conversion
- `serde_atproto` — camelCase JSON serialization matching AT Protocol

## Dependencies

- `panproto-gat`, `panproto-schema`, `panproto-inst`, `panproto-lens`,
  `panproto-mig`, `panproto-protocols`, `panproto-expr` — the panproto
  engine powers all cross-format conversion

## License

MIT OR Apache-2.0

Copyright 2026 Blaine Cook
