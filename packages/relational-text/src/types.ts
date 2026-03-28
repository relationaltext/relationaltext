/**
 * TypeScript type definitions for the RelationalText rich text model.
 *
 * These mirror the Rust types in relationaltext-core. The wire format is JSON
 * and matches the atproto facet schema with extended feature types.
 */

// ─── Wire format types ────────────────────────────────────────────────────────

/** A rich text document: UTF-8 text plus sorted facets. */
export interface DocumentJSON {
  text: string
  facets?: FacetJSON[]
}

/** A facet: a byte range with one or more typed features. */
export interface FacetJSON {
  index: ByteSlice
  features: FeatureJSON[]
}

/** A half-open byte range [byteStart, byteEnd) into the UTF-8 text. */
export interface ByteSlice {
  byteStart: number
  byteEnd: number
}

/** Union of all known feature types. Unknown $types are preserved via UnknownFeature. */
export type FeatureJSON =
  | MarkFeature
  | BlockFeature
  | UnknownFeature

/**
 * Inline mark feature.
 * Wire type: org.relationaltext.facet
 *
 * Expand semantics (Peritext model): expandStart/expandEnd control whether
 * the mark grows when text is inserted at its boundaries.
 */
export interface MarkFeature {
  $type: string
  name: MarkName
  attrs?: Record<string, unknown>
  expandStart?: boolean
  expandEnd?: boolean
}

/**
 * Block element feature.
 * Wire type: org.relationaltext.facet
 *
 * The facet covers the block's full content including its trailing \n.
 * `parents` encodes nesting (Kleppmann model) — ancestor block type names.
 * Container elements (ul, ol, blockquote) are inferred during rendering.
 */
export interface BlockFeature {
  $type: string
  name: BlockName
  parents: string[]
  attrs?: Record<string, unknown>
}

/** Forward-compat: unknown $type values are preserved. */
export interface UnknownFeature {
  $type: string
  [key: string]: unknown
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
export type FlatFeatureJSON = FeatureJSON & { readonly index: ByteSlice }

// ─── Mark and block name literals ────────────────────────────────────────────

export type KnownMarkName =
  | 'bold'
  | 'italic'
  | 'code'
  | 'strikethrough'
  | 'underline'
  | 'superscript'
  | 'subscript'
  | 'keyboard'

/** Mark name — known values or any string for forward compat. */
export type MarkName = KnownMarkName | (string & {})

export type KnownBlockName =
  | 'paragraph'
  | 'heading'
  | 'unordered-list-item'
  | 'ordered-list-item'
  | 'blockquote'
  | 'code-block'
  | 'horizontal-rule'
  | 'image'
  | 'table'
  | 'definition-term'
  | 'definition-detail'

/** Block name — known values or any string for forward compat. */
export type BlockName = KnownBlockName | (string & {})

// ─── HIR (Hierarchical Intermediate Representation) ──────────────────────────

/** A node in the Hierarchical Intermediate Representation. */
export type HIRNode = HIRBlockNode | HIRContainerNode | HIRTextNode

/** A block-level element in the HIR. */
export interface HIRBlockNode {
  type: 'block'
  name: BlockName
  attrs: Record<string, unknown>
  children: HIRNode[]
}

/**
 * A container element inferred from consecutive blocks sharing a `parents` prefix.
 * e.g., <ul>, <ol>, <blockquote>. Never stored in the wire format.
 * `attrs` is promoted from the explicit block marker for the container element, if present.
 */
export interface HIRContainerNode {
  type: 'container'
  name: string
  attrs: Record<string, unknown>
  children: HIRNode[]
}

/** A text segment with zero or more active marks. */
export interface HIRTextNode {
  type: 'text'
  content: string
  marks: HIRMark[]
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
export interface HIRMark {
  kind: string
  attrs: Record<string, unknown>
}

// ─── Mark input helpers ───────────────────────────────────────────────────────

/** Input type for adding a mark — $type defaults to the registered namespace if omitted. */
export type MarkInput = Omit<MarkFeature, '$type'> & { $type?: string }

/** Input type for adding a block — $type defaults to the registered namespace if omitted. */
export type BlockInput = Omit<BlockFeature, '$type'> & { $type?: string }

// ─── Expand semantics defaults ────────────────────────────────────────────────

/** Default expand-start behavior per mark type (Peritext model). */
export const MARK_DEFAULT_EXPAND_START: Record<KnownMarkName, boolean> = {
  bold: true,
  italic: true,
  strikethrough: true,
  underline: true,
  code: false,
  keyboard: false,
  superscript: false,
  subscript: false,
}

/** Default expand-end behavior per mark type. */
export const MARK_DEFAULT_EXPAND_END: Record<KnownMarkName, boolean> =
  MARK_DEFAULT_EXPAND_START
