/* tslint:disable */
/* eslint-disable */

/**
 * Add an [`AnnotationLayer`] to an existing [`LayeredDocument`].
 *
 * `layered_doc_json`: a JSON string produced by `create_layered_document` or a
 * prior call to this function.
 * `layer_json`: a JSON object matching the `AnnotationLayer` schema.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 */
export function add_annotation_layer(layered_doc_json: string, layer_json: string): string;

/**
 * Add a block element facet to a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: must cover exactly the marker character —
 *   `\n` (U+000A, 1 byte) for non-first blocks, or `\uFFFC` (U+FFFC, 3 bytes)
 *   for the first block in a document. The marker is placed BEFORE the block content.
 * `block_json`: a full feature object including `$type` (or `type_id`), e.g.
 *   `{ "$type": "org.relationaltext.facet", "name": "paragraph", "parents": [] }`.
 *   The type must be registered (e.g. via `register_lexicon`).
 *
 * Returns the updated document as a JSON string.
 */
export function add_block(doc_json: string, byte_start: number, byte_end: number, block_json: string): string;

/**
 * Add an inline mark to a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: the range to mark
 * `mark_json`: a full feature object including `$type` (or `type_id`), e.g.
 *   `{ "$type": "org.relationaltext.facet", "name": "bold" }`. The type must be
 *   registered (e.g. via `register_lexicon`) for expand semantics.
 *
 * Returns the updated document as a JSON string.
 */
export function add_mark(doc_json: string, byte_start: number, byte_end: number, mark_json: string): string;

/**
 * Get all annotations that contain the given byte offset.
 *
 * `byte_offset`: a UTF-8 byte position within the expression text.
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 */
export function annotations_at_offset(layered_doc_json: string, byte_offset: number): string;

/**
 * Get all annotations whose span overlaps with the given byte range `[start, end)`.
 *
 * `start`: inclusive start of the byte range (UTF-8).
 * `end`: exclusive end of the byte range (UTF-8).
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 */
export function annotations_in_byte_range(layered_doc_json: string, start: number, end: number): string;

/**
 * Apply a lens to all features in a document.
 *
 * Both arguments are JSON strings. Returns the transformed document as a JSON string.
 *
 * Uses the panproto-backed lens engine directly (no SQL intermediate).
 */
export function apply_lens(doc_json: string, spec_json: string): string;

/**
 * Apply a lens to all features in a document with execution tracing.
 *
 * Returns a JSON object `{ document: DocumentJSON, trace: TraceEntry[] }` where
 * each `TraceEntry` describes how many features a rule matched.
 *
 * `TraceEntry` shape:
 * ```json
 * { "ruleIndex": 0, "matched": 3, "action": "emphasis \u2192 em", "isSql": false }
 * ```
 */
export function apply_lens_traced(doc_json: string, spec_json: string): string;

/**
 * Compose two lenses A→B and B→C.
 *
 * Both arguments are JSON strings (LensSpec). Returns a JSON string (LensSpec)
 * or `null` as a JsValue if the lenses are incompatible (first.target ≠ second.source).
 */
export function compose_lenses(first_json: string, second_json: string): any;

/**
 * Convert a document from one ATProto schema to another using
 * panproto's auto-generated protolens.
 *
 * Takes the source lexicon JSON, target lexicon JSON, and a document
 * JSON string. Returns the converted document as a JSON string.
 *
 * This is the morphism-first conversion path: parse both lexicons,
 * auto-discover the structural alignment, and apply the derived lens.
 */
export function convert_via_panproto(source_lexicon_json: string, target_lexicon_json: string, doc_json: string): string;

/**
 * Create a [`LayeredDocument`] from a [`Document`] JSON string.
 *
 * Wraps the document text as an [`Expression`] with an empty set of annotation
 * layers. The returned JSON can be passed to the other `layered_doc_*` helpers.
 *
 * Returns the [`LayeredDocument`] as a JSON string.
 */
export function create_layered_document(doc_json: string): string;

/**
 * Delete a byte range from the document, adjusting all facet ranges.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`: start of the range to delete (inclusive)
 * `byte_end`: end of the range to delete (exclusive)
 *
 * Returns the updated document as a JSON string.
 */
export function delete_text(doc_json: string, byte_start: number, byte_end: number): string;

/**
 * Auto-detect @mentions, URLs, and #tags in a text string.
 *
 * Returns a JSON array of facets in canonical order.
 * The caller provides the type IDs to use for each detected feature kind.
 * Mentions are stored with a `"handle"` field; links with `"uri"`; tags with `"tag"`.
 */
export function detect_facets(text: string, mention_type_id: string, link_type_id: string, tag_type_id: string): string;

/**
 * Execute SQL statements against a document's facet array.
 *
 * **Deprecated**: The facet-sql engine has been removed. This function now
 * returns the input document unchanged (no-op passthrough).
 */
export function execute_facet_sql(doc_json: string, _sql: string): string;

/**
 * Filter facets to only those containing features in the given namespace.
 *
 * `namespace` is matched as a prefix against each feature's `type_id`
 * (e.g. `"app.bsky.richtext.facet"` keeps only mention/link/tag features).
 * Normalizes the document before filtering. Returns a JSON array of matching facets.
 */
export function filter_facets_by_namespace(doc_json: string, namespace: string): string;

/**
 * BFS shortest path through a list of lens specs from source to target.
 *
 * `specs_json` is a JSON array of LensSpec objects. Returns a JSON string (LensSpec)
 * or `null` as a JsValue if no path exists.
 */
export function find_path_in_graph(specs_json: string, source: string, target: string): any;

/**
 * Insert text at a byte position, adjusting all facet ranges.
 *
 * `doc_json`: the document as a JSON string
 * `byte_pos`: the byte position to insert at (UTF-8)
 * `text`: the text to insert
 *
 * Returns the updated document as a JSON string.
 */
export function insert_text(doc_json: string, byte_pos: number, text: string): string;

/**
 * Compute the inverse of a lens. Throws if the lens is lossy or is a WASM lens.
 *
 * Takes and returns a JSON string (LensSpec).
 */
export function inverse_lens(spec_json: string): string;

/**
 * Delete a byte range from the expression and adjust all annotation anchors.
 *
 * `byte_start`: inclusive start of the range to delete (UTF-8).
 * `byte_end`: exclusive end of the range to delete (UTF-8).
 *
 * Spans fully within the deleted range are collapsed to a zero-width point.
 * Spans partially overlapping are shrunk. Spans after the deletion are shifted left.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 */
export function layered_doc_delete_text(layered_doc_json: string, byte_start: number, byte_end: number): string;

/**
 * Insert text into the expression and adjust all annotation anchors.
 *
 * `byte_pos`: the UTF-8 byte position at which to insert.
 * `text`: the text to insert.
 *
 * Annotation spans starting at or after `byte_pos` are shifted right;
 * spans containing `byte_pos` have their end extended.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 */
export function layered_doc_insert_text(layered_doc_json: string, byte_pos: number, text: string): string;

/**
 * Project a [`LayeredDocument`] back to a [`Document`] with facets.
 *
 * Returns the projected [`Document`] as a JSON string.
 */
export function layered_doc_to_document(layered_doc_json: string): string;

/**
 * Migrate annotations after an ontology change.
 *
 * Input: old ontology JSON, new ontology JSON (both with `ontology` and
 * `typeDefs` fields), and annotations JSON array.
 * Returns: migrated annotations JSON array.
 */
export function migrate_ontology_annotations(old_ontology_json: string, new_ontology_json: string, annotations_json: string): string;

/**
 * Build a panproto schema from ontology TypeDef records (JSON).
 *
 * Input: JSON object with `ontology` and `typeDefs` fields matching the
 * Layers ontology types.
 * Returns: schema metadata as JSON with `vertexCount`, `edgeCount`,
 * `vertices`, and `edges` fields.
 */
export function ontology_to_schema(ontology_json: string): string;

/**
 * Parse a document from AT Protocol JSON.
 *
 * Returns the document as a JSON string (normalized).
 * Throws if the input is not valid JSON or has invalid structure.
 */
export function parse_document(json: string): string;

/**
 * Parse an ATProto lexicon JSON document into a schema and return
 * its metadata as a JSON string.
 *
 * This exposes panproto's `parse_lexicon` through the relationaltext
 * WASM module, enabling browser-side schema operations without a
 * separate panproto WASM dependency.
 *
 * Returns a JSON string with `{ id, vertexCount, edgeCount, vertices, edges }`.
 */
export function parse_lexicon_schema(lexicon_json: string): string;

/**
 * Project annotations from a LayeredDocument by type names.
 *
 * Given a LayeredDocument JSON and a JSON array of annotation labels,
 * returns only the annotations matching those labels across all layers.
 *
 * This provides schema-driven filtering as an alternative to manual
 * iteration over annotation layers.
 */
export function project_annotations_by_type(layered_doc_json: string, type_names_json: string): string;

/**
 * Query annotations on a [`LayeredDocument`] by kind, subkind, and label.
 *
 * Empty strings are treated as "no filter" for each parameter. Pass an empty
 * string `""` for any parameter you want to leave unconstrained.
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 */
export function query_annotations(layered_doc_json: string, kind: string, subkind: string, label: string): string;

/**
 * Register a single custom feature type descriptor.
 *
 * `json` shape:
 * ```json
 * {
 *   "typeId": "com.example.custom#variant",
 *   "featureClass": "block" | "inline" | "entity",
 *   "expandStart": true,
 *   "expandEnd": false
 * }
 * ```
 */
export function register_feature_type(json: string): void;

/**
 * Register all feature types defined in a format-lexicon JSON blob.
 *
 * Accepts a `org.relationaltext.format-lexicon` JSON object (or any object with
 * a top-level `"features"` array). Each entry in the array is registered via
 * the registry's `register_from_json_array` method.
 *
 * TypeIds with `@version` suffixes also register the unversioned base key.
 */
export function register_lexicon(json: string): void;

/**
 * Remove a mark from a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: the exact byte range of the facet to modify
 * `type_key`: the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
 *   or a plain `$type` (e.g. `"app.bsky.richtext.facet#mention"`). Matching tries both
 *   exact `type_id` equality and split-compound-key matching against `type_id + data["name"]`.
 *
 * Facets that become empty after feature removal are deleted entirely.
 * Returns the updated document as a JSON string.
 */
export function remove_mark(doc_json: string, byte_start: number, byte_end: number, type_key: string): string;

/**
 * Build the Hierarchical Intermediate Representation (HIR) from a document.
 *
 * Returns the HIR as a JSON value suitable for rendering.
 */
export function to_hir(doc_json: string): string;

/**
 * Validate SQL escape-hatch strings in a lens spec without executing them.
 *
 * Returns a JSON array of `{ ruleIndex: number, message: string }` objects.
 * An empty array means all SQL rules are syntactically valid.
 *
 * Example:
 * ```json
 * [{ "ruleIndex": 2, "message": "near 'INSRT': syntax error" }]
 * ```
 */
export function validate_lens_sql(_spec_json: string): string;
