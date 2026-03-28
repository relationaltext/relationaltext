/**
 * WASM format adapter loader.
 *
 * Supports two modes:
 * 1. Inline base64 (universal — works in Node.js and browsers):
 *    createFormatWasm(base64String)
 * 2. Disk-based loading (Node.js only — for dev/testing):
 *    createFormatWasm(import.meta.url, relPath)
 *
 * The inline mode is the default when building with tsup (which inlines
 * .wasm.b64 files as text via the esbuild 'text' loader).
 */
interface FormatWasmAdapter {
    call(fn: string, input: string): string;
}
/**
 * Create a lazy WASM format adapter.
 *
 * Overload 1 — inline base64 (universal, works in browsers):
 *   createFormatWasm(base64String)
 *
 * Overload 2 — disk path (Node.js only):
 *   createFormatWasm(import.meta.url, relPath)
 */
declare function createFormatWasm(b64OrMetaUrl: string, relPath?: string): FormatWasmAdapter;

export { type FormatWasmAdapter, createFormatWasm };
