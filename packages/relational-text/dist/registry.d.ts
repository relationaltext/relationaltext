import { Document } from './core.js';
import { WasmLensRef, LensSpec } from './lens.js';
import { DocumentJSON } from './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

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

/** Resolves a WASM binary reference to base64-encoded data. */
type BlobResolver = (ref: WasmLensRef) => Promise<string>;
/** Configuration for `init()`. */
interface InitConfig {
    /** Default blob resolver used when formats don't provide inline WASM data. */
    blobResolver?: BlobResolver;
}
/** Options for `registerFormat()`. */
interface RegisterFormatOptions {
    /** Base64-encoded WASM binary data to inject into the lexicon's wasmLens. */
    wasmData?: string;
    /** Additional standalone lenses to register (each with autoApply: true). */
    lenses?: LensSpec[];
    /** Aliases: additional names that map to this format. */
    aliases?: string[];
}
/**
 * Initialize the registry: load the WASM core and register the
 * RelationalText hub lexicon.
 *
 * Must be called (and awaited) before `from()` or `to()`.
 */
declare function init(config?: InitConfig): Promise<void>;
/**
 * Register a format backed by a lexicon JSON object.
 *
 * The lexicon must be an `org.relationaltext.format-lexicon` object with an `id`
 * field (the namespace). If the lexicon contains a `wasmLens`, its
 * `wasmModule.data` will be populated from `opts.wasmData` before registration.
 *
 * Any `opts.lenses` are registered with `autoApply: true`.
 */
declare function registerFormat(name: string, lexicon: Record<string, unknown>, opts?: RegisterFormatOptions): void;
/**
 * Parse an input string in the given format and return a Document.
 *
 * The format must have been registered with `registerFormat()` and must have
 * a WASM adapter with an `importFn`.
 *
 * @throws {Error} If the format is not registered or has no import capability.
 */
declare function from(name: string, input: string): Promise<Document>;
/**
 * Serialize a Document to a string in the given format.
 *
 * Runs `lensGraph.autoTransform()` to convert features to the target namespace,
 * then calls the WASM export function.
 *
 * @throws {Error} If the format is not registered or has no export capability.
 */
declare function to(name: string, doc: Document | DocumentJSON): Promise<string>;
/** Check whether a format name is registered. */
declare function hasFormat(name: string): boolean;
/** List all registered format names (including aliases). */
declare function listFormats(): string[];

export { type BlobResolver, Document, DocumentJSON, type InitConfig, LensSpec, type RegisterFormatOptions, from, hasFormat, init, listFormats, registerFormat, to };
