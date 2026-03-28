/**
 * TypeScript type definitions for the RelationalText rich text model.
 *
 * These mirror the Rust types in relationaltext-core. The wire format is JSON
 * and matches the atproto facet schema with extended feature types.
 */
/** A rich text document: UTF-8 text plus sorted facets. */
interface DocumentJSON {
    text: string;
    facets?: FacetJSON[];
}
/** A facet: a byte range with one or more typed features. */
interface FacetJSON {
    index: ByteSlice;
    features: FeatureJSON[];
}
/** A half-open byte range [byteStart, byteEnd) into the UTF-8 text. */
interface ByteSlice {
    byteStart: number;
    byteEnd: number;
}
/** Union of all known feature types. Unknown $types are preserved via UnknownFeature. */
type FeatureJSON = MarkFeature | BlockFeature | UnknownFeature;
/**
 * Inline mark feature.
 * Wire type: org.relationaltext.facet
 *
 * Expand semantics (Peritext model): expandStart/expandEnd control whether
 * the mark grows when text is inserted at its boundaries.
 */
interface MarkFeature {
    $type: string;
    name: MarkName;
    attrs?: Record<string, unknown>;
    expandStart?: boolean;
    expandEnd?: boolean;
}
/**
 * Block element feature.
 * Wire type: org.relationaltext.facet
 *
 * The facet covers the block's full content including its trailing \n.
 * `parents` encodes nesting (Kleppmann model) — ancestor block type names.
 * Container elements (ul, ol, blockquote) are inferred during rendering.
 */
interface BlockFeature {
    $type: string;
    name: BlockName;
    parents: string[];
    attrs?: Record<string, unknown>;
}
/** Forward-compat: unknown $type values are preserved. */
interface UnknownFeature {
    $type: string;
    [key: string]: unknown;
}
/**
 * A feature with its byte range baked in — the flat view of a document's annotations.
 *
 * `Document.features` returns this type: each entry is a single feature from a facet,
 * with the facet's `index` merged in so callers don't need to navigate the
 * `facets[i].features[j]` nesting. The wire format still groups features by range
 * (see `FacetJSON`) for rendering and verbosity reasons; this type is the ergonomic
 * iteration surface.
 */
type FlatFeatureJSON = FeatureJSON & {
    readonly index: ByteSlice;
};
type KnownMarkName = 'bold' | 'italic' | 'code' | 'strikethrough' | 'underline' | 'superscript' | 'subscript' | 'keyboard';
/** Mark name — known values or any string for forward compat. */
type MarkName = KnownMarkName | (string & {});
type KnownBlockName = 'paragraph' | 'heading' | 'unordered-list-item' | 'ordered-list-item' | 'blockquote' | 'code-block' | 'horizontal-rule' | 'image' | 'table' | 'definition-term' | 'definition-detail';
/** Block name — known values or any string for forward compat. */
type BlockName = KnownBlockName | (string & {});
/** A node in the Hierarchical Intermediate Representation. */
type HIRNode = HIRBlockNode | HIRContainerNode | HIRTextNode;
/** A block-level element in the HIR. */
interface HIRBlockNode {
    type: 'block';
    name: BlockName;
    attrs: Record<string, unknown>;
    children: HIRNode[];
}
/**
 * A container element inferred from consecutive blocks sharing a `parents` prefix.
 * e.g., <ul>, <ol>, <blockquote>. Never stored in the wire format.
 * `attrs` is promoted from the explicit block marker for the container element, if present.
 */
interface HIRContainerNode {
    type: 'container';
    name: string;
    attrs: Record<string, unknown>;
    children: HIRNode[];
}
/** A text segment with zero or more active marks. */
interface HIRTextNode {
    type: 'text';
    content: string;
    marks: HIRMark[];
}
/**
 * A mark applied to a text segment in the HIR.
 *
 * `kind` is the full `$type` compound key, e.g.:
 * - `"org.relationaltext.facet#bold"` for a bold inline mark
 * - `"app.bsky.richtext.facet#mention"` for a mention entity
 * - `"app.bsky.richtext.facet#link"` for a hyperlink
 * - `"com.example.custom"` for an unregistered extension (type_id as kind)
 */
interface HIRMark {
    kind: string;
    attrs: Record<string, unknown>;
}
/** Input type for adding a mark — $type defaults to the registered namespace if omitted. */
type MarkInput = Omit<MarkFeature, '$type'> & {
    $type?: string;
};
/** Input type for adding a block — $type defaults to the registered namespace if omitted. */
type BlockInput = Omit<BlockFeature, '$type'> & {
    $type?: string;
};
/** Default expand-start behavior per mark type (Peritext model). */
declare const MARK_DEFAULT_EXPAND_START: Record<KnownMarkName, boolean>;
/** Default expand-end behavior per mark type. */
declare const MARK_DEFAULT_EXPAND_END: Record<KnownMarkName, boolean>;

export { type BlockFeature, type BlockInput, type BlockName, type ByteSlice, type DocumentJSON, type FacetJSON, type FeatureJSON, type FlatFeatureJSON, type HIRBlockNode, type HIRContainerNode, type HIRMark, type HIRNode, type HIRTextNode, type KnownBlockName, type KnownMarkName, MARK_DEFAULT_EXPAND_END, MARK_DEFAULT_EXPAND_START, type MarkFeature, type MarkInput, type MarkName, type UnknownFeature };
