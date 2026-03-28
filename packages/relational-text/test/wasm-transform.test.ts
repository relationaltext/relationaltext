/**
 * Tests for WASM blob transforms via applyLensAsync + WasmLensRef.data.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyLensAsync, type LensSpec, type DocumentJSON } from '../src/lens.js'
import { ensureRelationalTextLexicon } from '../src/core.js'

beforeAll(() => {
  ensureRelationalTextLexicon()
})

// Load the example transform WASM blob from disk.
const WASM_B64_PATH = join(
  new URL(import.meta.url).pathname,
  '../../../../examples/wasm-transform/transform.wasm.b64',
)

function loadWasmB64(): string {
  return readFileSync(WASM_B64_PATH, 'utf8').trim()
}

function makeWasmLens(wasmData: string): LensSpec {
  return {
    $type: 'org.relationaltext.lens',
    id: 'example.strip-marks.v1',
    source: 'org.commonmark.facet',
    target: 'org.commonmark.facet',
    wasmModule: { data: wasmData },
  }
}

describe('applyLensAsync with WASM module', () => {
  it('strips all marks from a document', async () => {
    const wasmData = loadWasmB64()
    const lens = makeWasmLens(wasmData)

    const doc: DocumentJSON = {
      text: 'hello world',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.commonmark.facet', name: 'strong' }],
        },
        {
          index: { byteStart: 6, byteEnd: 11 },
          features: [{ $type: 'org.commonmark.facet', name: 'emphasis' }],
        },
      ],
    }

    const result = await applyLensAsync(doc, lens)

    // The example transform strips all marks → empty facets
    expect(result.text).toBe('hello world')
    expect(result.facets).toHaveLength(0)
  })

  it('preserves text when facets are already empty', async () => {
    const wasmData = loadWasmB64()
    const lens = makeWasmLens(wasmData)

    const doc: DocumentJSON = { text: 'plain text', facets: [] }
    const result = await applyLensAsync(doc, lens)

    expect(result.text).toBe('plain text')
    expect(result.facets).toHaveLength(0)
  })

  it('delegates to applyLens for declarative specs (no wasmModule)', async () => {
    const declarativeSpec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.rename.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'bold' }, replace: { typeId: 'ns.b', name: 'strong' } },
      ],
    }

    const doc: DocumentJSON = {
      text: 'hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'ns.a', name: 'bold' }],
        },
      ],
    }

    const result = await applyLensAsync(doc, declarativeSpec)
    expect(result.facets![0].features[0].$type).toBe('ns.b')
    expect(result.facets![0].features[0].name).toBe('strong')
  })

  it('throws for WasmLensRef with no data and no url', async () => {
    const lens: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.empty-ref.v1',
      source: 'ns.a',
      target: 'ns.b',
      wasmModule: {},
    }
    const doc: DocumentJSON = { text: '', facets: [] }
    await expect(applyLensAsync(doc, lens)).rejects.toThrow(/data.*url|url.*data/i)
  })
})
