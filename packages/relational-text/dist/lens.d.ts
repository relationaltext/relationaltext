import { DocumentJSON } from './types.js';

/**
 * Lens system for RelationalText — bidirectional, composable transformations between
 * feature lexicon namespaces.
 *
 * All computation is delegated to the Rust/WASM core. TypeScript is a thin
 * JSON-in/JSON-out shim that stores the registered spec list.
 */

/** ATProto-storable lens record describing a namespace-to-namespace transform. */
interface LensSpec {
    readonly $type: 'org.relationaltext.lens';
    readonly id: string;
    readonly version?: string;
    readonly description?: string;
    /** Source lexicon NSID (e.g. "org.commonmark.facet"). */
    readonly source: string;
    /** Target lexicon NSID (e.g. "org.w3c.html.facet"). */
    readonly target: string;
    /** Declarative transform rules. Mutually exclusive with wasmModule. */
    readonly rules?: LensRule[];
    /** Behavior for features not matched by any rule. Default: 'keep'. */
    readonly passthrough?: 'keep' | 'drop';
    /** WASM module reference for complex transforms (Phase 2). */
    readonly wasmModule?: WasmLensRef;
    /**
     * When false, `inverseLens()` throws without inspecting the rules.
     * Defaults to true (backward compat). Mark explicitly `false` for provably-lossy lenses.
     */
    readonly invertible?: boolean;
}
/** A single transform rule: match a feature and replace (or drop) it.
 *
 * Either `match` or `sql` must be present (but not both).
 * SQL rules are opaque to the pure-Rust engine and are only executed by the SQL engine.
 */
interface LensRule {
    /** Declarative match pattern. Required for standard match/replace rules; absent for join rules. */
    readonly match?: FeaturePattern;
    /** null = drop the feature entirely. */
    readonly replace?: null | FeatureReplacement;
    /** Raw SQL statement for this rule. Mutually exclusive with `match`. */
    readonly sql?: string;
    /** JOIN DSL: same-range multi-feature merge. Mutually exclusive with match/replace. */
    readonly join?: JoinRule;
    /** When true, delete the text at the matched facet's byte range as a post-pass. */
    readonly deleteText?: boolean;
}
/** A join rule: merges two or more same-range features into one output feature. */
interface JoinRule {
    readonly primary: JoinParticipant;
    readonly joined: JoinedParticipant[];
    readonly produce: JoinProduction;
    readonly deleteMatched?: string[];
}
/** The primary (anchor) participant in a join. */
interface JoinParticipant {
    readonly name: string;
    readonly matchAttrs?: Record<string, unknown>;
}
/** A participant to join against the primary (by same byte range). */
interface JoinedParticipant {
    readonly name: string;
    readonly matchAttrs?: Record<string, unknown>;
    readonly alias: string;
    /** false = LEFT JOIN (optional); true = INNER JOIN (required). Default: false. */
    readonly required?: boolean;
}
/** What to produce from the join. */
interface JoinProduction {
    readonly name: JoinAttrSource;
    readonly typeId: string;
    readonly attrs?: Record<string, JoinAttrSource>;
}
/** Where an attribute value comes from in a join. */
type JoinAttrSource = {
    readonly from: 'attr';
    readonly attr: string;
    readonly transform?: JoinAttrTransform;
} | {
    readonly from: 'primaryAttr';
    readonly attr: string;
    readonly transform?: JoinAttrTransform;
} | {
    readonly from: 'joinedAttr';
    readonly alias: string;
    readonly attr: string;
    readonly transform?: JoinAttrTransform;
} | {
    readonly from: 'text';
    readonly transform?: JoinAttrTransform;
} | {
    readonly from: 'literal';
    readonly value: unknown;
};
/** A chain of string transform operations. */
interface JoinAttrTransform {
    readonly ops: JoinTransformOp[];
}
/** A single string transform operation. */
type JoinTransformOp = {
    readonly op: 'ltrim';
    readonly chars: string;
} | {
    readonly op: 'rtrim';
    readonly chars: string;
} | {
    readonly op: 'trim';
    readonly chars: string;
} | {
    readonly op: 'prefix';
    readonly value: string;
} | {
    readonly op: 'suffix';
    readonly value: string;
};
/** Pattern to match against a feature's $type and optional name field. */
interface FeaturePattern {
    /** $type string or compound key like "$type#name". If omitted, defaults to the lens's `source` NSID. */
    readonly typeId?: string;
    /** If set, also match the feature's `name` data field. */
    readonly name?: string;
    /** If set, all listed key-value pairs must be present in the feature's attrs for the rule to fire. */
    readonly matchAttrs?: Record<string, unknown>;
    /** At least one of the listed values must appear in the attr (treated as array). */
    readonly matchAttrsAny?: Record<string, unknown[]>;
    /** All of the listed values must appear in the attr (treated as array). */
    readonly matchAttrsAll?: Record<string, unknown[]>;
}
/** A value transform operation for mapAttrValue. */
type AttrValueOp = {
    readonly op: 'add';
    readonly value: number;
} | {
    readonly op: 'subtract';
    readonly value: number;
} | {
    readonly op: 'multiply';
    readonly value: number;
} | {
    readonly op: 'prefix';
    readonly value: string;
} | {
    readonly op: 'suffix';
    readonly value: string;
} | {
    readonly op: 'negate';
} | {
    readonly op: 'to-string';
} | {
    readonly op: 'to-number';
} | {
    readonly op: 'to-boolean';
};
/** A template for the output feature name: substitutes `{key}` placeholders from attrs.
 *
 * Example: `{ template: "h{level}" }` with `attrs.level === 2` → `"h2"`.
 */
interface NameTemplate {
    readonly template: string;
}
/** How to rewrite a matched feature. */
interface FeatureReplacement {
    /** New $type for the output feature. If omitted, defaults to the lens's `target` NSID. */
    readonly typeId?: string;
    /** New name for the output feature.
     *  - A plain string: literal name (e.g. `"em"`).
     *  - A `NameTemplate` object: interpolates `{key}` from attrs (e.g. `{ template: "h{level}" }`).
     */
    readonly name?: string | NameTemplate;
    /** Rename attribute keys: { fromKey: toKey }. */
    readonly renameAttrs?: Record<string, string>;
    /** Inject constant attributes. */
    readonly addAttrs?: Record<string, unknown>;
    /** Remove attribute keys. */
    readonly dropAttrs?: string[];
    /** Keep only these attribute keys (plus $type and name). Prefer over dropAttrs when the
     *  target format has a fixed attribute set. */
    readonly keepAttrs?: string[];
    /** Transform attribute values using a built-in op. Applied after renameAttrs, before addAttrs. */
    readonly mapAttrValue?: Record<string, AttrValueOp>;
}
/** Reference to a WASM binary lens module. */
interface WasmLensRef {
    /** Content-addressed CID (for ATProto storage). */
    readonly cid?: string;
    /** HTTP URL for fetching the WASM binary. */
    readonly url?: string;
    /** Inline base64-encoded WASM binary (for testing and small modules). */
    readonly data?: string;
    /** WASM export name for the import function: raw string → DocumentJSON. Used when lens source starts with RAW_PREFIX. */
    readonly importFn?: string;
    /** WASM export name for the export function: DocumentJSON → raw string. Used when lens target starts with RAW_PREFIX. */
    readonly exportFn?: string;
}
/** Prefix for raw-wire-format namespaces in the lens graph. */
declare const RAW_PREFIX = "raw:";
/** A single entry in the rule execution trace from applyLensDebug. */
interface TraceEntry {
    /** Zero-based index of the rule in the LensSpec's rules array. */
    readonly ruleIndex: number;
    /** Number of rows (features) affected — updated or deleted — by this rule. */
    readonly matched: number;
    /** Human-readable description, e.g. "emphasis → em" or "SQL escape-hatch". */
    readonly action: string;
    /** true when the rule used a raw SQL escape-hatch (rule.sql). */
    readonly isSql: boolean;
}
/** Result returned by applyLensDebug, pairing the transformed document with a trace log. */
interface LensDebugResult {
    readonly document: DocumentJSON;
    readonly trace: TraceEntry[];
}
/** A SQL validation error from validateLensSQL. */
interface LensSqlValidationError {
    /** Zero-based index of the rule that has the bad SQL. */
    readonly ruleIndex: number;
    /** Description of the parse error. */
    readonly message: string;
}
/** Thrown when attempting to invert a lossy lens. */
declare class LensInversionError extends Error {
    constructor(message: string);
}
/**
 * Apply a lens to all features in a document.
 *
 * Features not matched by any rule are either kept (passthrough:'keep', the default)
 * or dropped (passthrough:'drop'). Returns a new DocumentJSON — does not modify
 * the input.
 */
declare function applyLens(doc: DocumentJSON, spec: LensSpec): DocumentJSON;
/**
 * Apply a lens with execution tracing enabled.
 *
 * Returns a LensDebugResult containing both the transformed document and a trace log
 * showing which rules matched and how many features each rule affected.
 */
declare function applyLensDebug(doc: DocumentJSON, spec: LensSpec): LensDebugResult;
/**
 * Validate SQL escape-hatch strings in a lens spec without executing them.
 *
 * Returns an array of validation errors (one per invalid SQL rule). An empty array
 * means all SQL escape-hatches in the spec are syntactically valid.
 */
declare function validateLensSQL(spec: LensSpec): LensSqlValidationError[];
/**
 * Compute the inverse of a lens by swapping source↔target and inverting each rule.
 *
 * Throws LensInversionError if any rule has replace:null (lossy), if it's a WASM lens,
 * if marked invertible:false, or if any rule has a join field.
 */
declare function inverseLens(spec: LensSpec): LensSpec;
/**
 * Compose two lenses A→B and B→C into a single A→C lens.
 *
 * Returns null if first.target !== second.source (incompatible lenses).
 * Attribute renames compose transitively: { a→b } ∘ { b→c } = { a→c }.
 */
declare function composeLenses(first: LensSpec, second: LensSpec): LensSpec | null;
/**
 * A directed graph of lens edges between lexicon namespaces.
 * Spec list is stored in TypeScript; all computation delegates to WASM.
 */
declare class LensGraph {
    private readonly edges;
    private pathCache;
    /** Register a lens edge. Clears the path cache. */
    register(spec: LensSpec, opts?: {
        autoApply?: boolean;
    }): void;
    /**
     * BFS shortest-path from sourceNs to targetNs (via WASM).
     * Returns a composed LensSpec or null if no path exists.
     * Returns an identity lens when sourceNs === targetNs.
     */
    findPath(sourceNs: string, targetNs: string): LensSpec | null;
    /**
     * Apply all autoApply lenses that can reach targetNs to the document JSON string.
     *
     * Only applies a lens path when the document actually contains features from that
     * path's source namespace. This prevents a lens with passthrough:'drop' (composed
     * from e.g. RT→CommonMark) from wiping out features that belong to a different
     * source namespace that hasn't been processed yet.
     *
     * @param jsonStr - Raw document JSON string
     * @param targetNs - Target lexicon namespace
     */
    autoTransform(jsonStr: string, targetNs: string): string;
}
/** The global lens graph singleton. */
declare const lensGraph: LensGraph;
/**
 * Register a lens with the global lens graph.
 *
 * Automatically registers the inverse lens if the lens is invertible
 * (no rules with replace:null). Both forward and inverse receive the
 * same autoApply setting.
 */
declare function registerLens(spec: LensSpec, opts?: {
    autoApply?: boolean;
}): void;
/**
 * Find the shortest registered transformation path from one namespace to another.
 * Returns null if no path exists.
 */
declare function findLens(fromNs: string, toNs: string): LensSpec | null;
/**
 * Transform a document JSON from one namespace to another using the shortest
 * registered lens path. Returns null if no path is registered.
 */
declare function transformDocument(doc: DocumentJSON, fromNs: string, toNs: string): DocumentJSON | null;
/**
 * Apply a lens to all features in a document. Supports both declarative lenses
 * and WASM transform modules (via `spec.wasmModule.data` base64 or `spec.wasmModule.url`).
 *
 * For synchronous use cases without WASM modules, prefer `applyLens`.
 */
declare function applyLensAsync(doc: DocumentJSON, spec: LensSpec): Promise<DocumentJSON>;

export { type AttrValueOp, type FeaturePattern, type FeatureReplacement, type JoinAttrSource, type JoinAttrTransform, type JoinParticipant, type JoinProduction, type JoinRule, type JoinTransformOp, type JoinedParticipant, type LensDebugResult, LensGraph, LensInversionError, type LensRule, type LensSpec, type LensSqlValidationError, type NameTemplate, RAW_PREFIX, type TraceEntry, type WasmLensRef, applyLens, applyLensAsync, applyLensDebug, composeLenses, findLens, inverseLens, lensGraph, registerLens, transformDocument, validateLensSQL };
