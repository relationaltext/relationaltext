/**
 * Async format registry — dynamic `from`/`to` dispatcher backed by
 * WASM lens graph resolution.
 *
 * Usage:
 *   import { init, registerFormat, from, to } from 'relational-text/registry'
 *
 *   await init()
 *   registerFormat('slack', slackLexicon, { wasmData, lenses: [slackToRt] })
 *   const doc = await from('slack', '*bold*')
 *   const html = await to('html', doc)
 */

import { Document, registerLexicon, ensureRelationalTextLexicon } from './core.js'
import { initRelationalText } from './wasm.js'
import {
  lensGraph,
  registerLens,
  type LensSpec,
  type WasmLensRef,
} from './lens.js'
import type { DocumentJSON } from './types.js'

// ─── Public types ──────────────────────────────────────────────────────────────

/** Resolves a WASM binary reference to base64-encoded data. */
export type BlobResolver = (ref: WasmLensRef) => Promise<string>

/** Configuration for `init()`. */
export interface InitConfig {
  /** Default blob resolver used when formats don't provide inline WASM data. */
  blobResolver?: BlobResolver
}

/** Options for `registerFormat()`. */
export interface RegisterFormatOptions {
  /** Base64-encoded WASM binary data to inject into the lexicon's wasmLens. */
  wasmData?: string
  /** Additional standalone lenses to register (each with autoApply: true). */
  lenses?: LensSpec[]
  /** Aliases: additional names that map to this format. */
  aliases?: string[]
}

// ─── Internal state ────────────────────────────────────────────────────────────

interface FormatEntry {
  /** The lexicon namespace (e.g. "com.slack.mrkdwn.facet"). */
  namespace: string
  /** wasmLens from the lexicon (with data populated). */
  wasmLens?: LensSpec | undefined
}

const formats = new Map<string, FormatEntry>()
let defaultBlobResolver: BlobResolver | undefined
let initialized = false

// ─── WASM instance cache (keyed by namespace, shared across aliases) ──────────

const wasmCache = new Map<string, WebAssembly.Instance>()

// ─── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialize the registry: load the WASM core and register the
 * RelationalText hub lexicon.
 *
 * Must be called (and awaited) before `from()` or `to()`.
 */
export async function init(config?: InitConfig): Promise<void> {
  if (initialized) return
  await initRelationalText()
  ensureRelationalTextLexicon()
  if (config?.blobResolver) {
    defaultBlobResolver = config.blobResolver
  }
  initialized = true
}

// ─── Format registration ───────────────────────────────────────────────────────

/**
 * Register a format backed by a lexicon JSON object.
 *
 * The lexicon must be an `org.relationaltext.format-lexicon` object with an `id`
 * field (the namespace). If the lexicon contains a `wasmLens`, its
 * `wasmModule.data` will be populated from `opts.wasmData` before registration.
 *
 * Any `opts.lenses` are registered with `autoApply: true`.
 */
export function registerFormat(
  name: string,
  lexicon: Record<string, unknown>,
  opts?: RegisterFormatOptions,
): void {
  const namespace = lexicon.id as string
  if (!namespace) {
    throw new Error(`Lexicon must have an 'id' field (the namespace)`)
  }

  // Deep-clone the lexicon so we can inject wasmData without mutating the caller's object.
  const lex = JSON.parse(JSON.stringify(lexicon)) as Record<string, unknown>

  // Inject WASM data into the lexicon's wasmLens if provided.
  let wasmLens: LensSpec | undefined
  if (lex.wasmLens && opts?.wasmData) {
    const wl = lex.wasmLens as { wasmModule?: { data?: string } }
    if (wl.wasmModule) {
      wl.wasmModule.data = opts.wasmData
    }
    wasmLens = lex.wasmLens as LensSpec
  } else if (lex.wasmLens) {
    const wl = lex.wasmLens as { wasmModule?: { data?: string } }
    if (wl.wasmModule?.data) {
      wasmLens = lex.wasmLens as LensSpec
    }
  }

  // Register the lexicon with the WASM core + lens graph.
  registerLexicon(JSON.stringify(lex))

  // Register additional standalone lenses.
  if (opts?.lenses) {
    for (const lens of opts.lenses) {
      registerLens(lens, { autoApply: true })
    }
  }

  // Store the format entry.
  const entry: FormatEntry = { namespace, wasmLens }
  formats.set(name, entry)

  // Register aliases.
  if (opts?.aliases) {
    for (const alias of opts.aliases) {
      formats.set(alias, entry)
    }
  }
}

// ─── WASM instance management ──────────────────────────────────────────────────

async function getWasmInstance(entry: FormatEntry): Promise<WebAssembly.Instance> {
  const cached = wasmCache.get(entry.namespace)
  if (cached) return cached

  const ref = entry.wasmLens?.wasmModule
  if (!ref) {
    throw new Error(`No WASM module registered for namespace '${entry.namespace}'`)
  }

  let instance: WebAssembly.Instance
  if (ref.data) {
    const binary = Uint8Array.from(atob(ref.data), (c) => c.charCodeAt(0))
    ;({ instance } = await WebAssembly.instantiate(binary, {}))
  } else if (defaultBlobResolver) {
    const base64 = await defaultBlobResolver(ref)
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    ;({ instance } = await WebAssembly.instantiate(binary, {}))
  } else if (ref.url) {
    const resp = await fetch(ref.url)
    const buf = await resp.arrayBuffer()
    ;({ instance } = await WebAssembly.instantiate(buf, {}))
  } else {
    throw new Error(
      `No WASM data for namespace '${entry.namespace}'. ` +
      `Provide wasmData in registerFormat opts, set a blobResolver in init(), or set wasmModule.url.`,
    )
  }
  wasmCache.set(entry.namespace, instance)
  return instance
}

function callWasm(instance: WebAssembly.Instance, fn: string, input: string): string {
  const exp = instance.exports as {
    memory: WebAssembly.Memory
    alloc: (size: number) => number
    dealloc: (ptr: number, size: number) => void
    result_len: () => number
    [key: string]: unknown
  }
  const callFn = exp[fn] as ((ptr: number, len: number) => number) | undefined
  if (typeof callFn !== 'function') {
    throw new Error(`WASM module has no export named '${fn}'`)
  }
  const inputBytes = new TextEncoder().encode(input)
  const ptr = exp.alloc(inputBytes.length)
  new Uint8Array(exp.memory.buffer).set(inputBytes, ptr)
  const resultPtr = callFn(ptr, inputBytes.length)
  const len = exp.result_len()
  const result = new TextDecoder().decode(
    new Uint8Array(exp.memory.buffer, resultPtr, len),
  )
  exp.dealloc(ptr, inputBytes.length)
  return result
}

// ─── from() / to() ────────────────────────────────────────────────────────────

/**
 * Parse an input string in the given format and return a Document.
 *
 * The format must have been registered with `registerFormat()` and must have
 * a WASM adapter with an `importFn`.
 *
 * @throws {Error} If the format is not registered or has no import capability.
 */
export async function from(name: string, input: string): Promise<Document> {
  const entry = formats.get(name)
  if (!entry) {
    throw new Error(
      `Unknown format: '${name}'. Registered formats: ${listFormats().join(', ') || '(none)'}`,
    )
  }

  if (!entry.wasmLens?.wasmModule?.importFn) {
    // Try lens-only path: check if there's a raw:ns node in the graph
    // that can be reached. For now, require WASM.
    throw new Error(
      `Format '${name}' has no WASM import function. ` +
      `Ensure the lexicon has a wasmLens with an importFn.`,
    )
  }

  const instance = await getWasmInstance(entry)
  const importFn = entry.wasmLens.wasmModule.importFn
  const rawJson = callWasm(instance, importFn, input)
  return Document.parse(rawJson)
}

/**
 * Serialize a Document to a string in the given format.
 *
 * Runs `lensGraph.autoTransform()` to convert features to the target namespace,
 * then calls the WASM export function.
 *
 * @throws {Error} If the format is not registered or has no export capability.
 */
export async function to(name: string, doc: Document | DocumentJSON): Promise<string> {
  const entry = formats.get(name)
  if (!entry) {
    throw new Error(
      `Unknown format: '${name}'. Registered formats: ${listFormats().join(', ') || '(none)'}`,
    )
  }

  if (!entry.wasmLens?.wasmModule?.exportFn) {
    throw new Error(
      `Format '${name}' has no WASM export function. ` +
      `Ensure the lexicon has a wasmLens with an exportFn.`,
    )
  }

  const document = doc instanceof Document ? doc : Document.fromJSON(doc)
  const transformed = lensGraph.autoTransform(document._raw(), entry.namespace)

  const instance = await getWasmInstance(entry)
  const exportFn = entry.wasmLens.wasmModule.exportFn
  return callWasm(instance, exportFn, transformed)
}

// ─── Query API ─────────────────────────────────────────────────────────────────

/** Check whether a format name is registered. */
export function hasFormat(name: string): boolean {
  return formats.has(name)
}

/** List all registered format names (including aliases). */
export function listFormats(): string[] {
  return [...formats.keys()]
}

// ─── Re-exports for convenience ────────────────────────────────────────────────

export { Document } from './core.js'
export type { DocumentJSON } from './types.js'
export type { LensSpec } from './lens.js'
