/**
 * Tests for in-lexicon WASM format adapters via registerLexicon.
 *
 * Covers:
 * - registerLexicon registers embedded wasmLens (both directions) and declarative lens
 * - applyLensAsync with importFn (raw: source) → DocumentJSON with native facets
 * - applyLens with declarative lens → hub-normalized DocumentJSON
 * - applyLensAsync with exportFn (raw: target) → raw string wrapped in document
 * - lensGraph.findPath across WASM + declarative hops returns non-null
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyLens,
  applyLensAsync,
  findLens,
  lensGraph,
  RAW_PREFIX,
  type DocumentJSON,
  type LensSpec,
} from '../src/lens.js'
import { registerLexicon, ensureRelationalTextLexicon } from '../src/core.js'

beforeAll(() => {
  ensureRelationalTextLexicon()
})

// ─── Load plaintext adapter WASM ─────────────────────────────────────────────

const WASM_B64_PATH = join(
  new URL(import.meta.url).pathname,
  '../../../../crates/wasm-format-adapter/adapter.wasm.b64',
)

function loadWasmB64(): string {
  return readFileSync(WASM_B64_PATH, 'utf8').trim()
}

// ─── Build lexicon JSON ───────────────────────────────────────────────────────

function buildLexiconJson(wasmData: string): string {
  const wasmLens: LensSpec = {
    $type: 'org.relationaltext.lens',
    id: 'my.plaintext.wasm.v1',
    source: `${RAW_PREFIX}my.plaintext.facet`,
    target: 'my.plaintext.facet',
    wasmModule: { data: wasmData, importFn: 'import', exportFn: 'export' },
  }
  const lens: LensSpec = {
    $type: 'org.relationaltext.lens',
    id: 'my.plaintext.to.relationaltext.v1',
    source: 'my.plaintext.facet',
    target: 'org.relationaltext.facet',
    rules: [
      {
        match: { typeId: 'my.plaintext.facet', name: 'paragraph' },
        replace: { typeId: 'org.relationaltext.facet', name: 'paragraph' },
      },
    ],
  }
  const lexicon = {
    $type: 'org.relationaltext.format-lexicon',
    id: 'my.plaintext.facet',
    features: [
      { typeId: 'my.plaintext.facet#paragraph', featureClass: 'block' },
    ],
    wasmLens,
    lens,
  }
  return JSON.stringify(lexicon)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerLexicon with embedded WASM and declarative lenses', () => {
  let wasmData: string

  beforeAll(() => {
    wasmData = loadWasmB64()
    registerLexicon(buildLexiconJson(wasmData))
  })

  // ─── Lens graph registration ──────────────────────────────────────────────

  it('registers the raw: import edge (raw:ns → ns)', () => {
    const path = findLens(`${RAW_PREFIX}my.plaintext.facet`, 'my.plaintext.facet')
    expect(path).not.toBeNull()
    expect(path!.source).toBe(`${RAW_PREFIX}my.plaintext.facet`)
    expect(path!.target).toBe('my.plaintext.facet')
  })

  it('registers the raw: export edge (ns → raw:ns)', () => {
    const path = findLens('my.plaintext.facet', `${RAW_PREFIX}my.plaintext.facet`)
    expect(path).not.toBeNull()
    expect(path!.source).toBe('my.plaintext.facet')
    expect(path!.target).toBe(`${RAW_PREFIX}my.plaintext.facet`)
  })

  it('registers the native→hub declarative lens', () => {
    const path = findLens('my.plaintext.facet', 'org.relationaltext.facet')
    expect(path).not.toBeNull()
    expect(path!.source).toBe('my.plaintext.facet')
    expect(path!.target).toBe('org.relationaltext.facet')
  })

  it('findPath from raw: to hub returns non-null (two-hop path)', () => {
    const path = lensGraph.findPath(`${RAW_PREFIX}my.plaintext.facet`, 'org.relationaltext.facet')
    expect(path).not.toBeNull()
    expect(path!.source).toBe(`${RAW_PREFIX}my.plaintext.facet`)
    expect(path!.target).toBe('org.relationaltext.facet')
  })

  // ─── WASM import (raw: → native facets) ──────────────────────────────────

  it('imports pipe-delimited text into native paragraph blocks', async () => {
    const wasmLens = lensGraph.findPath(`${RAW_PREFIX}my.plaintext.facet`, 'my.plaintext.facet')!
    const nativeDoc = await applyLensAsync({ text: 'Hello|World', facets: [] }, wasmLens)

    // U+FFFC (3 bytes) + Hello + \n + World
    expect(nativeDoc.text).toBe('\uFFFCHello\nWorld')
    expect(nativeDoc.facets).toHaveLength(2)

    const [f1, f2] = nativeDoc.facets!
    expect(f1.features[0].$type).toBe('my.plaintext.facet')
    expect(f1.features[0].name).toBe('paragraph')
    expect(f1.index.byteStart).toBe(0)
    expect(f1.index.byteEnd).toBe(3) // U+FFFC = 3 UTF-8 bytes

    expect(f2.features[0].$type).toBe('my.plaintext.facet')
    expect(f2.features[0].name).toBe('paragraph')
    expect(f2.index.byteStart).toBe(8) // 3 (FFFC) + 5 (Hello) = 8
    expect(f2.index.byteEnd).toBe(9)   // \n = 1 byte
  })

  it('imports a single-paragraph document (no pipe)', async () => {
    const wasmLens = lensGraph.findPath(`${RAW_PREFIX}my.plaintext.facet`, 'my.plaintext.facet')!
    const nativeDoc = await applyLensAsync({ text: 'Hello', facets: [] }, wasmLens)

    expect(nativeDoc.text).toBe('\uFFFCHello')
    expect(nativeDoc.facets).toHaveLength(1)
    expect(nativeDoc.facets![0].features[0].name).toBe('paragraph')
  })

  // ─── Declarative normalization (native → hub) ─────────────────────────────

  it('normalizes native facets to hub namespace', () => {
    const hubLens = lensGraph.findPath('my.plaintext.facet', 'org.relationaltext.facet')!
    const nativeDoc: DocumentJSON = {
      text: '\uFFFCHello\nWorld',
      facets: [
        { index: { byteStart: 0, byteEnd: 3 }, features: [{ $type: 'my.plaintext.facet', name: 'paragraph' }] },
        { index: { byteStart: 8, byteEnd: 9 }, features: [{ $type: 'my.plaintext.facet', name: 'paragraph' }] },
      ],
    }

    const hubDoc = applyLens(nativeDoc, hubLens)
    expect(hubDoc.facets).toHaveLength(2)
    expect(hubDoc.facets![0].features[0].$type).toBe('org.relationaltext.facet')
    expect(hubDoc.facets![0].features[0].name).toBe('paragraph')
    expect(hubDoc.facets![1].features[0].$type).toBe('org.relationaltext.facet')
    expect(hubDoc.facets![1].features[0].name).toBe('paragraph')
  })

  // ─── WASM export (native → raw:) ─────────────────────────────────────────

  it('exports native facets back to pipe-delimited raw text', async () => {
    const exportLens = lensGraph.findPath('my.plaintext.facet', `${RAW_PREFIX}my.plaintext.facet`)!
    const nativeDoc: DocumentJSON = {
      text: '\uFFFCHello\nWorld',
      facets: [
        { index: { byteStart: 0, byteEnd: 3 }, features: [{ $type: 'my.plaintext.facet', name: 'paragraph' }] },
        { index: { byteStart: 8, byteEnd: 9 }, features: [{ $type: 'my.plaintext.facet', name: 'paragraph' }] },
      ],
    }

    const rawDoc = await applyLensAsync(nativeDoc, exportLens)
    expect(rawDoc.text).toBe('Hello|World')
    expect(rawDoc.facets).toHaveLength(0)
  })

  it('exports a single-paragraph document', async () => {
    const exportLens = lensGraph.findPath('my.plaintext.facet', `${RAW_PREFIX}my.plaintext.facet`)!
    const nativeDoc: DocumentJSON = {
      text: '\uFFFCHello',
      facets: [
        { index: { byteStart: 0, byteEnd: 3 }, features: [{ $type: 'my.plaintext.facet', name: 'paragraph' }] },
      ],
    }

    const rawDoc = await applyLensAsync(nativeDoc, exportLens)
    expect(rawDoc.text).toBe('Hello')
    expect(rawDoc.facets).toHaveLength(0)
  })

  // ─── RAW_PREFIX constant ──────────────────────────────────────────────────

  it('RAW_PREFIX is "raw:"', () => {
    expect(RAW_PREFIX).toBe('raw:')
  })
})
