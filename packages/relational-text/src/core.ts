/**
 * RelationalText core — Document class and generic feature registration
 *
 * Import this entry point when you only need the Document model without
 * pulling in format-specific adapters.
 *
 * Call `await initRelationalText()` once at application startup before using
 * any Document operations.
 */

export type {
  BlockFeature,
  BlockInput,
  BlockName,
  ByteSlice,
  DocumentJSON,
  FacetJSON,
  FlatFeatureJSON,
  FeatureJSON,
  HIRBlockNode,
  HIRContainerNode,
  HIRMark,
  HIRNode,
  HIRTextNode,
  KnownBlockName,
  KnownMarkName,
  MarkFeature,
  MarkInput,
  MarkName,
  UnknownFeature,
} from './types.js'

export { MARK_DEFAULT_EXPAND_END, MARK_DEFAULT_EXPAND_START } from './types.js'

export { initRelationalText } from './wasm.js'

// ─── Lexicon registration ─────────────────────────────────────────────────────

import { register_feature_type, register_lexicon } from './wasm.js'
import { lensGraph, registerLens, type LensSpec } from './lens.js'

import relationalTextLexiconData from '../../../formats/org.relationaltext/relationaltext.lexicon.json' with { type: 'json' }

/**
 * Register the RelationalText core lexicon (`org.relationaltext.facet#*` and
 * `org.relationaltext.richtext.mark#*` / `org.relationaltext.richtext.block#*` types).
 *
 * Required when constructing documents via `Document.addMark()` or
 * `Document.addBlock()`, or when working with existing RelationalText core data.
 */
let _rtLexiconRegistered = false
export function ensureRelationalTextLexicon(): void {
  if (_rtLexiconRegistered) return
  _rtLexiconRegistered = true
  register_lexicon(JSON.stringify(relationalTextLexiconData))
}

/**
 * Register a format lexicon from a JSON string.
 *
 * Calls the WASM `register_lexicon` for feature type registration, then extracts
 * and registers any embedded lenses:
 * - `wasmLens`: raw:{id} ↔ {id} WASM adapter (both directions registered)
 * - `lens`: {id} ↔ org.relationaltext.facet declarative mapping (registered with autoApply)
 *
 * ```ts
 * registerLexicon(JSON.stringify({
 *   $type: 'org.relationaltext.format-lexicon',
 *   id: 'my.fmt.facet',
 *   features: [...],
 *   wasmLens: { $type: 'org.relationaltext.lens', source: 'raw:my.fmt.facet', target: 'my.fmt.facet', wasmModule: { data: '...', importFn: 'import', exportFn: 'export' } },
 *   lens: { $type: 'org.relationaltext.lens', source: 'my.fmt.facet', target: 'org.relationaltext.facet', rules: [...] },
 * }))
 * ```
 */
export function registerLexicon(json: string): void {
  register_lexicon(json)
  const parsed = JSON.parse(json) as { wasmLens?: unknown; lens?: unknown }
  if (parsed.wasmLens) {
    const wasmLens = parsed.wasmLens as LensSpec
    lensGraph.register(wasmLens)  // forward: raw:{ns} → {ns}
    // Register reverse direction ({ns} → raw:{ns}) using the same wasmModule (exportFn).
    if (wasmLens.wasmModule?.exportFn) {
      lensGraph.register({
        $type: 'org.relationaltext.lens',
        id: `${wasmLens.id}#reverse`,
        source: wasmLens.target,
        target: wasmLens.source,
        wasmModule: wasmLens.wasmModule,
      })
    }
  }
  if (parsed.lens) {
    registerLens(parsed.lens as LensSpec, { autoApply: true })
  }
}

/** Descriptor for a custom feature type to register at runtime. */
export interface FeatureTypeDescriptor {
  /** The full `$type` string (or `$type#name` compound key), optionally with `@version` suffix. */
  typeId: string
  /** Whether this feature is a block marker, inline span, entity, comment, or meta. Default: `"inline"`. */
  featureClass?: 'block' | 'inline' | 'entity' | 'comment' | 'meta'
  /** Expand at the start boundary when text is inserted (Peritext). Default: `false`. */
  expandStart?: boolean
  /** Expand at the end boundary when text is inserted (Peritext). Default: `false`. */
  expandEnd?: boolean
  /** If true, this feature cannot have child content (e.g. HTML void elements like hr, img, br). Default: `false`. */
  void?: boolean
  /** Canonical spec URL for documentation (passed to the registry). */
  specUrl?: string
}

/**
 * Register a single custom feature type at runtime.
 *
 * If `typeId` contains an `@version` suffix (e.g. `org.commonmark.facet#strong@0.31`),
 * the base compound key without the version is also registered automatically so that
 * unversioned features continue to resolve.
 *
 * ```ts
 * registerFeatureType({
 *   typeId: 'com.example.highlight',
 *   featureClass: 'inline',
 *   expandStart: true,
 *   expandEnd: true,
 *   void: false,
 *   specUrl: 'https://example.com/spec#highlight',
 * })
 * ```
 */
export function registerFeatureType(descriptor: FeatureTypeDescriptor): void {
  const payload: Record<string, unknown> = {
    typeId: descriptor.typeId,
    featureClass: descriptor.featureClass ?? 'inline',
    expandStart: descriptor.expandStart ?? false,
    expandEnd: descriptor.expandEnd ?? false,
    void: descriptor.void ?? false,
  }
  if (descriptor.specUrl != null) payload.specUrl = descriptor.specUrl
  register_feature_type(JSON.stringify(payload))

  // Dual-registration: if typeId has a @version suffix, also register the base key
  // so that unversioned features still resolve (approximate matching).
  const atIdx = descriptor.typeId.indexOf('@')
  if (atIdx !== -1) {
    const baseTypeId = descriptor.typeId.slice(0, atIdx)
    register_feature_type(JSON.stringify({ ...payload, typeId: baseTypeId }))
  }
}

import type {
  BlockInput,
  DocumentJSON,
  FacetJSON,
  FlatFeatureJSON,
  HIRNode,
  MarkInput,
} from './types.js'

import * as wasm from './wasm.js'

// ─── Document class ───────────────────────────────────────────────────────────

/**
 * An immutable rich text document.
 *
 * All mutation methods return a new Document instance. The underlying JSON
 * representation is always normalized (facets sorted in canonical order)
 * via the WASM core.
 */
export class Document {
  /** Normalized document JSON string (kept as string to avoid redundant parse/stringify). */
  readonly #json: string

  private constructor(json: string) {
    this.#json = json
  }

  // ─── Factory methods ──────────────────────────────────────────────────────

  /** Create a Document from a plain text string. */
  static fromText(text: string): Document {
    const raw = JSON.stringify({ text, facets: [] })
    const normalized = wasm.parse_document(raw)
    return new Document(normalized)
  }

  /** Parse a Document from an AT Protocol JSON object. */
  static fromJSON(json: DocumentJSON): Document {
    const normalized = wasm.parse_document(JSON.stringify(json))
    return new Document(normalized)
  }

  /** Parse a Document from a JSON string. */
  static parse(jsonString: string): Document {
    const normalized = wasm.parse_document(jsonString)
    return new Document(normalized)
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  get text(): string {
    return (JSON.parse(this.#json) as DocumentJSON).text
  }

  get facets(): readonly FacetJSON[] {
    return (JSON.parse(this.#json) as DocumentJSON).facets ?? []
  }

  /**
   * All features in the document as a flat array, each with its byte range included.
   *
   * This is the ergonomic iteration surface. The wire format groups features by
   * byte range inside `facets` (so renderers can see co-located features together
   * and avoid repeating the index object); `features` flattens that for callers
   * who want to filter, map, or iterate annotations without nested loops.
   *
   * ```ts
   * // Find all links
   * doc.features.filter(f => f.$type === 'app.bsky.richtext.facet#link')
   *
   * // Collect all feature types in use
   * new Set(doc.features.map(f => f.$type))
   * ```
   */
  get features(): readonly FlatFeatureJSON[] {
    return (JSON.parse(this.#json) as DocumentJSON).facets?.flatMap(
      facet => facet.features.map(feat => ({ index: facet.index, ...feat }) as FlatFeatureJSON),
    ) ?? []
  }

  // ─── Text mutations ───────────────────────────────────────────────────────

  /**
   * Insert text at a byte position, adjusting all facet ranges.
   * Respects mark expand semantics (bold expands, code/link do not).
   */
  insertText(bytePos: number, text: string): Document {
    const updated = wasm.insert_text(this.#json, bytePos, text)
    return new Document(updated)
  }

  /**
   * Delete the byte range [byteStart, byteEnd) from the document,
   * adjusting all facet ranges.
   */
  deleteRange(byteStart: number, byteEnd: number): Document {
    const updated = wasm.delete_text(this.#json, byteStart, byteEnd)
    return new Document(updated)
  }

  // ─── Annotation mutations ─────────────────────────────────────────────────

  /** Add an inline mark over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name-only object (defaults to `org.relationaltext.facet`). */
  addMark(byteStart: number, byteEnd: number, mark: MarkInput): Document {
    const m = mark as Record<string, unknown>
    const payload = m.$type != null ? mark : { $type: 'org.relationaltext.facet', ...mark }
    const updated = wasm.add_mark(this.#json, byteStart, byteEnd, JSON.stringify(payload))
    return new Document(updated)
  }

  /** Add a block element over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name/parents object (defaults to `org.relationaltext.facet`). */
  addBlock(byteStart: number, byteEnd: number, block: BlockInput): Document {
    const b = block as Record<string, unknown>
    const payload = b.$type != null ? block : { $type: 'org.relationaltext.facet', ...block }
    const updated = wasm.add_block(this.#json, byteStart, byteEnd, JSON.stringify(payload))
    return new Document(updated)
  }

  /**
   * Remove a mark from [byteStart, byteEnd) by compound key.
   *
   * `typeKey` is the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
   * or a plain `$type` string (e.g. `"app.bsky.richtext.facet#mention"`). Matching uses
   * exact `type_id` equality first, then split-compound-key matching against `type_id + data["name"]`.
   *
   * Facets that become empty after feature removal are deleted entirely.
   */
  removeMark(byteStart: number, byteEnd: number, typeKey: string): Document {
    const updated = wasm.remove_mark(this.#json, byteStart, byteEnd, typeKey)
    return new Document(updated)
  }

  // ─── Output ───────────────────────────────────────────────────────────────

  /** Build the Hierarchical Intermediate Representation (HIR). */
  toHIR(): HIRNode[] {
    return JSON.parse(wasm.to_hir(this.#json)) as HIRNode[]
  }

  /** Serialize to a plain JSON object. */
  toJSON(): DocumentJSON {
    return JSON.parse(this.#json) as DocumentJSON
  }

  /** Serialize to a JSON string. */
  toString(): string {
    return this.#json
  }

  /** Internal: get the raw JSON string (for use by importers). */
  _raw(): string {
    return this.#json
  }
}
