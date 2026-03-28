import { DocumentJSON, FacetJSON, FlatFeatureJSON, MarkInput, BlockInput, HIRNode } from './types.js';
export { BlockFeature, BlockName, ByteSlice, FeatureJSON, HIRBlockNode, HIRContainerNode, HIRMark, HIRTextNode, KnownBlockName, KnownMarkName, MARK_DEFAULT_EXPAND_END, MARK_DEFAULT_EXPAND_START, MarkFeature, MarkName, UnknownFeature } from './types.js';
export { initRelationalText } from './wasm.js';
import './wasm/relationaltext_wasm.js';

/**
 * RelationalText core — Document class and generic feature registration
 *
 * Import this entry point when you only need the Document model without
 * pulling in format-specific adapters.
 *
 * Call `await initRelationalText()` once at application startup before using
 * any Document operations.
 */

declare function ensureRelationalTextLexicon(): void;
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
declare function registerLexicon(json: string): void;
/** Descriptor for a custom feature type to register at runtime. */
interface FeatureTypeDescriptor {
    /** The full `$type` string (or `$type#name` compound key), optionally with `@version` suffix. */
    typeId: string;
    /** Whether this feature is a block marker, inline span, entity, comment, or meta. Default: `"inline"`. */
    featureClass?: 'block' | 'inline' | 'entity' | 'comment' | 'meta';
    /** Expand at the start boundary when text is inserted (Peritext). Default: `false`. */
    expandStart?: boolean;
    /** Expand at the end boundary when text is inserted (Peritext). Default: `false`. */
    expandEnd?: boolean;
    /** If true, this feature cannot have child content (e.g. HTML void elements like hr, img, br). Default: `false`. */
    void?: boolean;
    /** Canonical spec URL for documentation (passed to the registry). */
    specUrl?: string;
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
declare function registerFeatureType(descriptor: FeatureTypeDescriptor): void;

/**
 * An immutable rich text document.
 *
 * All mutation methods return a new Document instance. The underlying JSON
 * representation is always normalized (facets sorted in canonical order)
 * via the WASM core.
 */
declare class Document {
    #private;
    private constructor();
    /** Create a Document from a plain text string. */
    static fromText(text: string): Document;
    /** Parse a Document from an AT Protocol JSON object. */
    static fromJSON(json: DocumentJSON): Document;
    /** Parse a Document from a JSON string. */
    static parse(jsonString: string): Document;
    get text(): string;
    get facets(): readonly FacetJSON[];
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
    get features(): readonly FlatFeatureJSON[];
    /**
     * Insert text at a byte position, adjusting all facet ranges.
     * Respects mark expand semantics (bold expands, code/link do not).
     */
    insertText(bytePos: number, text: string): Document;
    /**
     * Delete the byte range [byteStart, byteEnd) from the document,
     * adjusting all facet ranges.
     */
    deleteRange(byteStart: number, byteEnd: number): Document;
    /** Add an inline mark over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name-only object (defaults to `org.relationaltext.facet`). */
    addMark(byteStart: number, byteEnd: number, mark: MarkInput): Document;
    /** Add a block element over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name/parents object (defaults to `org.relationaltext.facet`). */
    addBlock(byteStart: number, byteEnd: number, block: BlockInput): Document;
    /**
     * Remove a mark from [byteStart, byteEnd) by compound key.
     *
     * `typeKey` is the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
     * or a plain `$type` string (e.g. `"app.bsky.richtext.facet#mention"`). Matching uses
     * exact `type_id` equality first, then split-compound-key matching against `type_id + data["name"]`.
     *
     * Facets that become empty after feature removal are deleted entirely.
     */
    removeMark(byteStart: number, byteEnd: number, typeKey: string): Document;
    /** Build the Hierarchical Intermediate Representation (HIR). */
    toHIR(): HIRNode[];
    /** Serialize to a plain JSON object. */
    toJSON(): DocumentJSON;
    /** Serialize to a JSON string. */
    toString(): string;
    /** Internal: get the raw JSON string (for use by importers). */
    _raw(): string;
}

export { BlockInput, Document, DocumentJSON, FacetJSON, type FeatureTypeDescriptor, FlatFeatureJSON, HIRNode, MarkInput, ensureRelationalTextLexicon, registerFeatureType, registerLexicon };
