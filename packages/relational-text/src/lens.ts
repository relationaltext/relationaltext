/**
 * Lens system for RelationalText — bidirectional, composable transformations between
 * feature lexicon namespaces.
 *
 * All computation is delegated to the Rust/WASM core. TypeScript is a thin
 * JSON-in/JSON-out shim that stores the registered spec list.
 */

import type { DocumentJSON } from './types.js'
import * as wasm from './wasm.js'

// ─── Public types ──────────────────────────────────────────────────────────────

/** ATProto-storable lens record describing a namespace-to-namespace transform. */
export interface LensSpec {
  readonly $type: 'org.relationaltext.lens'
  readonly id: string
  readonly version?: string
  readonly description?: string
  /** Source lexicon NSID (e.g. "org.commonmark.facet"). */
  readonly source: string
  /** Target lexicon NSID (e.g. "org.w3c.html.facet"). */
  readonly target: string
  /** Declarative transform rules. Mutually exclusive with wasmModule. */
  readonly rules?: LensRule[]
  /** Behavior for features not matched by any rule. Default: 'keep'. */
  readonly passthrough?: 'keep' | 'drop'
  /** WASM module reference for complex transforms (Phase 2). */
  readonly wasmModule?: WasmLensRef
  /**
   * When false, `inverseLens()` throws without inspecting the rules.
   * Defaults to true (backward compat). Mark explicitly `false` for provably-lossy lenses.
   */
  readonly invertible?: boolean
}

/** A single transform rule: match a feature and replace (or drop) it.
 *
 * Either `match` or `sql` must be present (but not both).
 * SQL rules are opaque to the pure-Rust engine and are only executed by the SQL engine.
 */
export interface LensRule {
  /** Declarative match pattern. Required for standard match/replace rules; absent for join rules. */
  readonly match?: FeaturePattern
  /** null = drop the feature entirely. */
  readonly replace?: null | FeatureReplacement
  /** Raw SQL statement for this rule. Mutually exclusive with `match`. */
  readonly sql?: string
  /** JOIN DSL: same-range multi-feature merge. Mutually exclusive with match/replace. */
  readonly join?: JoinRule
  /** When true, delete the text at the matched facet's byte range as a post-pass. */
  readonly deleteText?: boolean
}

// ─── JOIN DSL types ───────────────────────────────────────────────────────────

/** A join rule: merges two or more same-range features into one output feature. */
export interface JoinRule {
  readonly primary: JoinParticipant
  readonly joined: JoinedParticipant[]
  readonly produce: JoinProduction
  readonly deleteMatched?: string[]
}

/** The primary (anchor) participant in a join. */
export interface JoinParticipant {
  readonly name: string
  readonly matchAttrs?: Record<string, unknown>
}

/** A participant to join against the primary (by same byte range). */
export interface JoinedParticipant {
  readonly name: string
  readonly matchAttrs?: Record<string, unknown>
  readonly alias: string
  /** false = LEFT JOIN (optional); true = INNER JOIN (required). Default: false. */
  readonly required?: boolean
}

/** What to produce from the join. */
export interface JoinProduction {
  readonly name: JoinAttrSource
  readonly typeId: string
  readonly attrs?: Record<string, JoinAttrSource>
}

/** Where an attribute value comes from in a join. */
export type JoinAttrSource =
  | { readonly from: 'attr'; readonly attr: string; readonly transform?: JoinAttrTransform }
  | { readonly from: 'primaryAttr'; readonly attr: string; readonly transform?: JoinAttrTransform }
  | { readonly from: 'joinedAttr'; readonly alias: string; readonly attr: string; readonly transform?: JoinAttrTransform }
  | { readonly from: 'text'; readonly transform?: JoinAttrTransform }
  | { readonly from: 'literal'; readonly value: unknown }

/** A chain of string transform operations. */
export interface JoinAttrTransform {
  readonly ops: JoinTransformOp[]
}

/** A single string transform operation. */
export type JoinTransformOp =
  | { readonly op: 'ltrim'; readonly chars: string }
  | { readonly op: 'rtrim'; readonly chars: string }
  | { readonly op: 'trim'; readonly chars: string }
  | { readonly op: 'prefix'; readonly value: string }
  | { readonly op: 'suffix'; readonly value: string }

/** Pattern to match against a feature's $type and optional name field. */
export interface FeaturePattern {
  /** $type string or compound key like "$type#name". If omitted, defaults to the lens's `source` NSID. */
  readonly typeId?: string
  /** If set, also match the feature's `name` data field. */
  readonly name?: string
  /** If set, all listed key-value pairs must be present in the feature's attrs for the rule to fire. */
  readonly matchAttrs?: Record<string, unknown>
  /** At least one of the listed values must appear in the attr (treated as array). */
  readonly matchAttrsAny?: Record<string, unknown[]>
  /** All of the listed values must appear in the attr (treated as array). */
  readonly matchAttrsAll?: Record<string, unknown[]>
}

/** A value transform operation for mapAttrValue. */
export type AttrValueOp =
  | { readonly op: 'add';        readonly value: number }
  | { readonly op: 'subtract';   readonly value: number }
  | { readonly op: 'multiply';   readonly value: number }
  | { readonly op: 'prefix';     readonly value: string }
  | { readonly op: 'suffix';     readonly value: string }
  | { readonly op: 'negate' }
  | { readonly op: 'to-string' }
  | { readonly op: 'to-number' }
  | { readonly op: 'to-boolean' }

/** A template for the output feature name: substitutes `{key}` placeholders from attrs.
 *
 * Example: `{ template: "h{level}" }` with `attrs.level === 2` → `"h2"`.
 */
export interface NameTemplate {
  readonly template: string
}

/** How to rewrite a matched feature. */
export interface FeatureReplacement {
  /** New $type for the output feature. If omitted, defaults to the lens's `target` NSID. */
  readonly typeId?: string
  /** New name for the output feature.
   *  - A plain string: literal name (e.g. `"em"`).
   *  - A `NameTemplate` object: interpolates `{key}` from attrs (e.g. `{ template: "h{level}" }`).
   */
  readonly name?: string | NameTemplate
  /** Rename attribute keys: { fromKey: toKey }. */
  readonly renameAttrs?: Record<string, string>
  /** Inject constant attributes. */
  readonly addAttrs?: Record<string, unknown>
  /** Remove attribute keys. */
  readonly dropAttrs?: string[]
  /** Keep only these attribute keys (plus $type and name). Prefer over dropAttrs when the
   *  target format has a fixed attribute set. */
  readonly keepAttrs?: string[]
  /** Transform attribute values using a built-in op. Applied after renameAttrs, before addAttrs. */
  readonly mapAttrValue?: Record<string, AttrValueOp>
}

/** Reference to a WASM binary lens module. */
export interface WasmLensRef {
  /** Content-addressed CID (for ATProto storage). */
  readonly cid?: string
  /** HTTP URL for fetching the WASM binary. */
  readonly url?: string
  /** Inline base64-encoded WASM binary (for testing and small modules). */
  readonly data?: string
  /** WASM export name for the import function: raw string → DocumentJSON. Used when lens source starts with RAW_PREFIX. */
  readonly importFn?: string
  /** WASM export name for the export function: DocumentJSON → raw string. Used when lens target starts with RAW_PREFIX. */
  readonly exportFn?: string
}

/** Prefix for raw-wire-format namespaces in the lens graph. */
export const RAW_PREFIX = 'raw:'

/** A single entry in the rule execution trace from applyLensDebug. */
export interface TraceEntry {
  /** Zero-based index of the rule in the LensSpec's rules array. */
  readonly ruleIndex: number
  /** Number of rows (features) affected — updated or deleted — by this rule. */
  readonly matched: number
  /** Human-readable description, e.g. "emphasis → em" or "SQL escape-hatch". */
  readonly action: string
  /** true when the rule used a raw SQL escape-hatch (rule.sql). */
  readonly isSql: boolean
}

/** Result returned by applyLensDebug, pairing the transformed document with a trace log. */
export interface LensDebugResult {
  readonly document: DocumentJSON
  readonly trace: TraceEntry[]
}

/** A SQL validation error from validateLensSQL. */
export interface LensSqlValidationError {
  /** Zero-based index of the rule that has the bad SQL. */
  readonly ruleIndex: number
  /** Description of the parse error. */
  readonly message: string
}

/** Thrown when attempting to invert a lossy lens. */
export class LensInversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LensInversionError'
  }
}

// ─── Core lens operations (delegated to WASM) ─────────────────────────────────

/**
 * Apply a lens to all features in a document.
 *
 * Features not matched by any rule are either kept (passthrough:'keep', the default)
 * or dropped (passthrough:'drop'). Returns a new DocumentJSON — does not modify
 * the input.
 */
export function applyLens(doc: DocumentJSON, spec: LensSpec): DocumentJSON {
  const result = JSON.parse(wasm.apply_lens(JSON.stringify(doc), JSON.stringify(spec))) as DocumentJSON
  // Ensure `facets` is always an array (serde may omit the key when empty).
  return { ...result, facets: result.facets ?? [] }
}

/**
 * Apply a lens with execution tracing enabled.
 *
 * Returns a LensDebugResult containing both the transformed document and a trace log
 * showing which rules matched and how many features each rule affected.
 */
export function applyLensDebug(doc: DocumentJSON, spec: LensSpec): LensDebugResult {
  const raw = JSON.parse(wasm.apply_lens_traced(JSON.stringify(doc), JSON.stringify(spec))) as {
    document: DocumentJSON
    trace: TraceEntry[]
  }
  const document = { ...raw.document, facets: raw.document.facets ?? [] }
  return { document, trace: raw.trace }
}

/**
 * Validate SQL escape-hatch strings in a lens spec without executing them.
 *
 * Returns an array of validation errors (one per invalid SQL rule). An empty array
 * means all SQL escape-hatches in the spec are syntactically valid.
 */
export function validateLensSQL(spec: LensSpec): LensSqlValidationError[] {
  return JSON.parse(wasm.validate_lens_sql(JSON.stringify(spec))) as LensSqlValidationError[]
}

/**
 * Compute the inverse of a lens by swapping source↔target and inverting each rule.
 *
 * Throws LensInversionError if any rule has replace:null (lossy), if it's a WASM lens,
 * if marked invertible:false, or if any rule has a join field.
 */
export function inverseLens(spec: LensSpec): LensSpec {
  // Check invertible flag first (TypeScript fast-path; Rust also checks).
  if (spec.invertible === false) {
    throw new LensInversionError(
      `Lens '${spec.id ?? spec.source}→${spec.target}' is marked invertible: false`,
    )
  }
  // Check for join rules (not automatically invertible).
  if (spec.rules?.some((r) => r.join != null)) {
    throw new LensInversionError(
      `Lens "${spec.id}" cannot be automatically inverted — contains a join rule`,
    )
  }
  try {
    return JSON.parse(wasm.inverse_lens(JSON.stringify(spec))) as LensSpec
  } catch (e) {
    throw new LensInversionError(String(e))
  }
}

/**
 * Compose two lenses A→B and B→C into a single A→C lens.
 *
 * Returns null if first.target !== second.source (incompatible lenses).
 * Attribute renames compose transitively: { a→b } ∘ { b→c } = { a→c }.
 */
export function composeLenses(first: LensSpec, second: LensSpec): LensSpec | null {
  const raw = wasm.compose_lenses(JSON.stringify(first), JSON.stringify(second))
  return raw ? (JSON.parse(raw as string) as LensSpec) : null
}

// ─── Lens Graph ────────────────────────────────────────────────────────────────

interface LensEdge {
  spec: LensSpec
  autoApply: boolean
}

function identityLens(ns: string): LensSpec {
  return {
    $type: 'org.relationaltext.lens',
    id: `${ns}.identity`,
    source: ns,
    target: ns,
    rules: [],
    passthrough: 'keep',
  }
}

/**
 * A directed graph of lens edges between lexicon namespaces.
 * Spec list is stored in TypeScript; all computation delegates to WASM.
 */
export class LensGraph {
  private readonly edges = new Map<string, LensEdge>()
  private pathCache = new Map<string, LensSpec | null>()

  /** Register a lens edge. Clears the path cache. */
  register(spec: LensSpec, opts: { autoApply?: boolean } = {}): void {
    this.edges.set(`${spec.source}→${spec.target}`, { spec, autoApply: opts.autoApply ?? false })
    this.pathCache.clear()
  }

  /**
   * BFS shortest-path from sourceNs to targetNs (via WASM).
   * Returns a composed LensSpec or null if no path exists.
   * Returns an identity lens when sourceNs === targetNs.
   */
  findPath(sourceNs: string, targetNs: string): LensSpec | null {
    if (sourceNs === targetNs) return identityLens(sourceNs)

    const cacheKey = `${sourceNs}→${targetNs}`
    const cached = this.pathCache.get(cacheKey)
    if (cached !== undefined) return cached

    const specsJson = JSON.stringify([...this.edges.values()].map((e) => e.spec))
    const raw = wasm.find_path_in_graph(specsJson, sourceNs, targetNs)
    const path = raw ? (JSON.parse(raw as string) as LensSpec) : null
    this.pathCache.set(cacheKey, path)
    return path
  }

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
  autoTransform(jsonStr: string, targetNs: string): string {
    let result = jsonStr
    // Collect unique source namespaces that have autoApply edges and a path to target.
    // Apply each source namespace at most once (via findPath which finds shortest path).
    const sourceToPath = new Map<string, LensSpec>()
    for (const [, edge] of this.edges) {
      if (!edge.autoApply || edge.spec.source === targetNs) continue
      const ns = edge.spec.source
      if (sourceToPath.has(ns)) continue
      const path = this.findPath(ns, targetNs)
      if (path) sourceToPath.set(ns, path)
    }
    for (const [ns, path] of sourceToPath) {
      // Skip if the document contains no features from this source namespace.
      if (!result.includes(`"${ns}"`) && !result.includes(`"${ns}#`)) continue
      result = wasm.apply_lens(result, JSON.stringify(path))
    }
    return result
  }
}

/** The global lens graph singleton. */
export const lensGraph = new LensGraph()

// ─── Public registration & query API ──────────────────────────────────────────

/**
 * Register a lens with the global lens graph.
 *
 * Automatically registers the inverse lens if the lens is invertible
 * (no rules with replace:null). Both forward and inverse receive the
 * same autoApply setting.
 */
export function registerLens(spec: LensSpec, opts: { autoApply?: boolean } = {}): void {
  lensGraph.register(spec, opts)
  try {
    lensGraph.register(inverseLens(spec), opts)
  } catch {
    // Lossy lens — inverse is not available, that's fine
  }
}

/**
 * Find the shortest registered transformation path from one namespace to another.
 * Returns null if no path exists.
 */
export function findLens(fromNs: string, toNs: string): LensSpec | null {
  return lensGraph.findPath(fromNs, toNs)
}

/**
 * Transform a document JSON from one namespace to another using the shortest
 * registered lens path. Returns null if no path is registered.
 */
export function transformDocument(
  doc: DocumentJSON,
  fromNs: string,
  toNs: string,
): DocumentJSON | null {
  const lens = lensGraph.findPath(fromNs, toNs)
  return lens ? applyLens(doc, lens) : null
}

// ─── WASM transform support ────────────────────────────────────────────────────

/** Instantiate a WASM module from a base64 string. */
async function loadWasmModule(base64: string): Promise<WebAssembly.Instance> {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const { instance } = await WebAssembly.instantiate(binary, {})
  return instance
}

/**
 * Apply a WASM lens module to a document.
 *
 * The module must export: `memory`, `alloc(i32)->i32`, `dealloc(i32,i32)`, `result_len()->i32`.
 *
 * Dispatch:
 * - source starts with `raw:` and `wasmModule.importFn` is set → call importFn(rawText) → DocumentJSON
 * - target starts with `raw:` and `wasmModule.exportFn` is set → call exportFn(DocumentJSON) → rawText
 * - otherwise → call `transform(DocumentJSON) → DocumentJSON` (existing behavior)
 */
async function applyWasmLens(doc: DocumentJSON, spec: LensSpec): Promise<DocumentJSON> {
  const ref = spec.wasmModule!
  let base64: string
  if (ref.data) {
    base64 = ref.data
  } else if (ref.url) {
    const resp = await fetch(ref.url)
    const buf = await resp.arrayBuffer()
    base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
  } else {
    throw new Error('WasmLensRef must have either data (base64) or url')
  }

  const instance = await loadWasmModule(base64)
  const exports = instance.exports as Record<string, unknown>
  const allocFn = exports['alloc'] as (size: number) => number
  const deallocFn = exports['dealloc'] as (ptr: number, size: number) => void
  const resultLenFn = exports['result_len'] as () => number
  const memory = exports['memory'] as WebAssembly.Memory

  // Determine which function to call and what input to pass.
  const isRawSource = spec.source.startsWith(RAW_PREFIX)
  const isRawTarget = spec.target.startsWith(RAW_PREFIX)

  let inputStr: string
  let callFnName: string
  if (isRawSource && ref.importFn) {
    inputStr = doc.text          // raw wire string → DocumentJSON
    callFnName = ref.importFn
  } else if (isRawTarget && ref.exportFn) {
    inputStr = JSON.stringify(doc)  // DocumentJSON → raw wire string
    callFnName = ref.exportFn
  } else {
    inputStr = JSON.stringify(doc)  // DocumentJSON → DocumentJSON (legacy transform)
    callFnName = 'transform'
  }

  const callFn = exports[callFnName] as ((ptr: number, len: number) => number) | undefined
  if (typeof callFn !== 'function') {
    throw new Error(`WASM module has no export named '${callFnName}'`)
  }

  const encoder = new TextEncoder()
  const inputBytes = encoder.encode(inputStr)

  const ptr = allocFn(inputBytes.length)
  new Uint8Array(memory.buffer).set(inputBytes, ptr)

  const resultPtr = callFn(ptr, inputBytes.length)
  const resultLen = resultLenFn()

  deallocFn(ptr, inputBytes.length)

  const resultBytes = new Uint8Array(memory.buffer, resultPtr, resultLen)
  const resultStr = new TextDecoder().decode(resultBytes)

  if (isRawTarget && ref.exportFn) {
    // The WASM function returned a raw string — wrap it in a document.
    return { text: resultStr, facets: [] }
  }

  const parsed = JSON.parse(resultStr) as DocumentJSON
  return { ...parsed, facets: parsed.facets ?? [] }
}

/**
 * Apply a lens to all features in a document. Supports both declarative lenses
 * and WASM transform modules (via `spec.wasmModule.data` base64 or `spec.wasmModule.url`).
 *
 * For synchronous use cases without WASM modules, prefer `applyLens`.
 */
export async function applyLensAsync(doc: DocumentJSON, spec: LensSpec): Promise<DocumentJSON> {
  if (spec.wasmModule) {
    return applyWasmLens(doc, spec)
  }
  // Delegate to synchronous path for declarative lenses.
  return applyLens(doc, spec)
}
