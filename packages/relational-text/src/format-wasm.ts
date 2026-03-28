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

export interface FormatWasmAdapter {
  call(fn: string, input: string): string
}

function compileWasm(b64: string): WebAssembly.Instance {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const mod = new WebAssembly.Module(bytes)
  return new WebAssembly.Instance(mod)
}

function callWasm(inst: WebAssembly.Instance, fn: string, input: string): string {
  const exp = inst.exports as {
    memory: WebAssembly.Memory
    alloc: (size: number) => number
    dealloc: (ptr: number, size: number) => void
    result_len: () => number
    [key: string]: unknown
  }
  const callFn = exp[fn] as (ptr: number, len: number) => number
  const inputBytes = new TextEncoder().encode(input)
  const ptr = exp.alloc(inputBytes.length)
  new Uint8Array(exp.memory.buffer).set(inputBytes, ptr)
  const resultPtr = callFn(ptr, inputBytes.length)
  const len = exp.result_len()
  const result = new TextDecoder().decode(
    new Uint8Array(exp.memory.buffer, resultPtr, len)
  )
  exp.dealloc(ptr, inputBytes.length)
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _nodeRequire: ((id: string) => any) | null = null

try {
  const nodeModule = await import('node:' + 'module')
  _nodeRequire = nodeModule.createRequire(import.meta.url)
} catch {
  // Browser environment — _nodeRequire stays null
}

function loadFromDisk(metaUrl: string, relPath: string): WebAssembly.Instance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeRequire = (id: string): any => {
    if (!_nodeRequire) {
      throw new Error(
        'Disk-based WASM loading requires Node.js. ' +
        'Use the inline form: createFormatWasm(base64String)'
      )
    }
    return _nodeRequire(id)
  }
  const { fileURLToPath } = nodeRequire('node:url') as typeof import('node:url')
  const { join, dirname } = nodeRequire('node:path') as typeof import('node:path')
  const fs = nodeRequire('node:fs') as typeof import('node:fs')
  const absPath = join(dirname(fileURLToPath(metaUrl)), relPath)
  const b64 = fs.readFileSync(absPath, 'utf8').trim()
  return compileWasm(b64)
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
export function createFormatWasm(b64OrMetaUrl: string, relPath?: string): FormatWasmAdapter {
  let inst: WebAssembly.Instance | null = null

  return {
    call(fn: string, input: string): string {
      if (!inst) {
        if (relPath !== undefined) {
          // Disk-based loading (Node.js)
          inst = loadFromDisk(b64OrMetaUrl, relPath)
        } else {
          // Inline base64 (universal)
          inst = compileWasm(b64OrMetaUrl.trim())
        }
      }
      return callWasm(inst, fn, input)
    },
  }
}
