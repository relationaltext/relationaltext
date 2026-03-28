/**
 * Tests for the RelationalText lens system.
 *
 * Covers: applyLens, inverseLens, composeLenses, LensGraph, registerLens,
 * transformDocument, and cross-format round-trips via the built-in lenses.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import {
  LensGraph,
  LensInversionError,
  applyLens,
  applyLensDebug,
  composeLenses,
  findLens,
  inverseLens,
  lensGraph,
  registerLens,
  transformDocument,
  validateLensSQL,
  type JoinAttrSource,
  type JoinRule,
  type LensRule,
  type LensSpec,
  type TraceEntry,
} from '../src/lens.js'
import { RELATIONALTEXT_TO_HTML, GFM_TO_RELATIONALTEXT, COMMONMARK_TO_RELATIONALTEXT } from '../src/lenses/builtins.js'
import htmlToRelationaltextData from '../../../formats/org.w3c.html/html-to-relationaltext.lens.json' with { type: 'json' }
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import { registerFeatureType, Document, type DocumentJSON } from '../src/core.js'

beforeAll(() => {
  registerTestFormats('markdown', 'html', 'bluesky')
})

// ─── applyLens ────────────────────────────────────────────────────────────────

describe('applyLens', () => {
  const renameSpec: LensSpec = {
    $type: 'org.relationaltext.lens',
    id: 'test.rename.v1',
    source: 'ns.a',
    target: 'ns.b',
    rules: [
      { match: { typeId: 'ns.a', name: 'mark' },
        replace: { typeId: 'ns.b', name: 'mark' } },
    ],
  }

  it('renames matching features', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, renameSpec)
    expect(result.facets![0]!.features[0]!.$type).toBe('ns.b')
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['name']).toBe('mark')
  })

  it('keeps unmatched features by default (passthrough: keep)', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.other', name: 'x' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, renameSpec)
    expect(result.facets![0]!.features[0]!.$type).toBe('ns.other')
  })

  it('drops unmatched features when passthrough: drop', async () => {
    const spec: LensSpec = { ...renameSpec, passthrough: 'drop' }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.other', name: 'x' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    expect(result.facets).toHaveLength(0)
  })

  it('drops features when rule.replace is null', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.drop.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'mark' }, replace: null },
      ],
    }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    expect(result.facets).toHaveLength(0)
  })

  it('renames attribute keys via renameAttrs', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.rename-attr.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'link' },
          replace: { typeId: 'ns.b', name: 'link', renameAttrs: { uri: 'href' } } },
      ],
    }
    const doc: DocumentJSON = {
      text: 'example',
      facets: [{
        index: { byteStart: 0, byteEnd: 7 },
        features: [{ $type: 'ns.a', name: 'link', uri: 'https://example.com' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['href']).toBe('https://example.com')
    expect(feat['uri']).toBeUndefined()
  })

  it('preserves text unchanged', async () => {
    const doc: DocumentJSON = { text: 'hello world', facets: [] }
    const result = applyLens(doc, renameSpec)
    expect(result.text).toBe('hello world')
  })

  it('preserves facet byte ranges unchanged', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 1, byteEnd: 4 },
        features: [{ $type: 'ns.a', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, renameSpec)
    expect(result.facets![0]!.index).toEqual({ byteStart: 1, byteEnd: 4 })
  })
})

// ─── inverseLens ──────────────────────────────────────────────────────────────

describe('inverseLens', () => {
  it('swaps source and target', async () => {
    // Use GFM_TO_RELATIONALTEXT which has no template name rules and is invertible
    const inv = inverseLens(GFM_TO_RELATIONALTEXT)
    expect(inv.source).toBe('org.relationaltext.facet')
    expect(inv.target).toBe('org.gfm.facet')
  })

  it('inverts simple name renames', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'emphasis' },
          replace: { typeId: 'ns.b', name: 'em' } },
      ],
    }
    const inv = inverseLens(spec)
    // typeId is simplified to None when it equals the new source/target
    expect(inv.rules![0]!.match).toEqual({ name: 'em' })
    expect(inv.rules![0]!.replace).toEqual({ name: 'emphasis' })
  })

  it('inverts renameAttrs (swaps key/value)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'link' },
          replace: { typeId: 'ns.b', name: 'a', renameAttrs: { uri: 'href' } } },
      ],
    }
    const inv = inverseLens(spec)
    expect(inv.rules![0]!.replace!.renameAttrs).toEqual({ href: 'uri' })
  })

  it('throws LensInversionError for lossy lenses (replace:null)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.lossy.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' }, replace: null },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
  })

  it('throws LensInversionError for dropAttrs (lossy)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.dropatts.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x', dropAttrs: ['secret'] } },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
  })

  it('throws LensInversionError for keepAttrs (lossy)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.keepattrs.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x', keepAttrs: ['level'] } },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
  })

  it('throws LensInversionError for non-invertible mapAttrValue op (prefix)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.prefix.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x', mapAttrValue: { url: { op: 'prefix', value: 'https://' } } } },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
  })

  it('addAttrs in forward become dropAttrs in inverse', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.add.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x', addAttrs: { injected: 'val' } } },
      ],
    }
    const inv = inverseLens(spec)
    expect(inv.rules![0]!.replace!.dropAttrs).toContain('injected')
    expect(inv.rules![0]!.replace!.addAttrs).toBeUndefined()
  })

  it('negate is self-inverse in mapAttrValue', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.negate.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x', mapAttrValue: { checked: { op: 'negate' } } } },
      ],
    }
    const inv = inverseLens(spec)
    expect(inv.rules![0]!.replace!.mapAttrValue!['checked']).toEqual({ op: 'negate' })
  })

  it('add {n} inverts to subtract {n} in mapAttrValue', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.add.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'h' },
          replace: { typeId: 'ns.b', name: 'h', mapAttrValue: { level: { op: 'add', value: 1 } } } },
      ],
    }
    const inv = inverseLens(spec)
    expect(inv.rules![0]!.replace!.mapAttrValue!['level']).toEqual({ op: 'subtract', value: 1 })
  })

  it('mapAttrValue key is translated through inverse rename', async () => {
    // Forward: rename a→b, then map b (add 1). Inverse must map a (subtract 1).
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.key-translate.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'x',
                     renameAttrs: { a: 'b' },
                     mapAttrValue: { b: { op: 'add', value: 1 } } } },
      ],
    }
    const inv = inverseLens(spec)
    const invReplace = inv.rules![0]!.replace!
    expect(invReplace.renameAttrs).toEqual({ b: 'a' })
    expect(invReplace.mapAttrValue!['a']).toEqual({ op: 'subtract', value: 1 })
    expect(invReplace.mapAttrValue!['b']).toBeUndefined()
  })

  it('double-inverse restores original rules', async () => {
    // Use GFM_TO_RELATIONALTEXT (no template rules, fully invertible)
    const doubleInv = inverseLens(inverseLens(GFM_TO_RELATIONALTEXT))
    expect(doubleInv.source).toBe(GFM_TO_RELATIONALTEXT.source)
    expect(doubleInv.target).toBe(GFM_TO_RELATIONALTEXT.target)
    expect(doubleInv.rules).toEqual(GFM_TO_RELATIONALTEXT.rules)
  })

  it('throws LensInversionError for a lens marked invertible: false', async () => {
    const spec: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'test.noninvertible.v1',
      source: 'ns.a',
      target: 'ns.b',
      invertible: false,
      rules: [
        { match: { typeId: 'ns.a', name: 'x' }, replace: { typeId: 'ns.b', name: 'x' } },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
    expect(() => inverseLens(spec)).toThrow(/invertible: false/)
  })

  it('error message for invertible: false includes lens id and target', async () => {
    const spec: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'my.custom.lens.v1',
      source: 'ns.src',
      target: 'ns.dst',
      invertible: false,
      rules: [],
    }
    expect(() => inverseLens(spec)).toThrow("Lens 'my.custom.lens.v1→ns.dst' is marked invertible: false")
  })

  it('html-to-relationaltext built-in lens is marked invertible: false', async () => {
    const htmlToRtLens = htmlToRelationaltextData as unknown as LensSpec
    expect(htmlToRtLens.invertible).toBe(false)
  })

  it('inverseLens on html-to-relationaltext throws LensInversionError', async () => {
    const htmlToRtLens = htmlToRelationaltextData as unknown as LensSpec
    expect(() => inverseLens(htmlToRtLens)).toThrow(LensInversionError)
    expect(() => inverseLens(htmlToRtLens)).toThrow(/invertible: false/)
  })

  it('normal lens without invertible field still works (backward compat)', async () => {
    // A lens without invertible field should default to true and succeed
    const spec: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'test.normal.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' }, replace: { typeId: 'ns.b', name: 'y' } },
      ],
    }
    // No invertible field → should succeed
    expect(() => inverseLens(spec)).not.toThrow()
    const inv = inverseLens(spec)
    expect(inv.source).toBe('ns.b')
    expect(inv.target).toBe('ns.a')
  })
})

// ─── Iso round-trip laws ───────────────────────────────────────────────────────
// applyLens(applyLens(doc, spec), inverseLens(spec)) === doc  for all Iso lenses.

describe('inverseLens — Iso round-trip laws', () => {
  function roundTrip(spec: LensSpec, doc: DocumentJSON): DocumentJSON {
    return applyLens(applyLens(doc, spec), inverseLens(spec))
  }

  const baseDoc = (attrs: Record<string, unknown>): DocumentJSON => ({
    text: 'x',
    facets: [{
      index: { byteStart: 0, byteEnd: 1 },
      features: [{ $type: 'ns.a', name: 'x', ...attrs } as Record<string, unknown> as never],
    }],
  })

  it('negate round-trip restores original boolean', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'rt.negate',
      source: 'ns.a', target: 'ns.b',
      rules: [{ match: { typeId: 'ns.a', name: 'x' },
                replace: { typeId: 'ns.b', name: 'x', mapAttrValue: { checked: { op: 'negate' } } } }],
    }
    const result = roundTrip(spec, baseDoc({ checked: true }))
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['checked']).toBe(true)
  })

  it('add/subtract round-trip restores original number', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'rt.add',
      source: 'ns.a', target: 'ns.b',
      rules: [{ match: { typeId: 'ns.a', name: 'x' },
                replace: { typeId: 'ns.b', name: 'x', mapAttrValue: { level: { op: 'add', value: 3 } } } }],
    }
    const result = roundTrip(spec, baseDoc({ level: 2 }))
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['level']).toBe(2)
  })

  it('addAttrs round-trip removes injected keys', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'rt.addattrs',
      source: 'ns.a', target: 'ns.b',
      rules: [{ match: { typeId: 'ns.a', name: 'x' },
                replace: { typeId: 'ns.b', name: 'x', addAttrs: { injected: 'val' } } }],
    }
    const doc = baseDoc({})
    const result = roundTrip(spec, doc)
    expect(result.facets![0]!.features[0]!.$type).toBe('ns.a')
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['injected']).toBeUndefined()
  })

  it('renameAttrs + mapAttrValue round-trip (key translation)', async () => {
    // rename a→b, then add 1 to b; inverse must subtract 1 from a (not b)
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'rt.rename-map',
      source: 'ns.a', target: 'ns.b',
      rules: [{ match: { typeId: 'ns.a', name: 'x' },
                replace: { typeId: 'ns.b', name: 'x',
                           renameAttrs: { a: 'b' },
                           mapAttrValue: { b: { op: 'add', value: 1 } } } }],
    }
    const result = roundTrip(spec, baseDoc({ a: 5 }))
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['a']).toBe(5)
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['b']).toBeUndefined()
  })

  it('GFM_TO_RELATIONALTEXT double-inverse is identity on a real document', async () => {
    // RELATIONALTEXT_TO_HTML is not invertible (template heading rule). Use GFM_TO_RELATIONALTEXT instead.
    // Note: fromMarkdown produces a mix of org.gfm.facet and org.commonmark.facet features;
    // only GFM-specific features (strikethrough) should round-trip back to org.gfm.facet.
    const doc = (await from('markdown', '~~strike~~')).toJSON()
    const result = roundTrip(GFM_TO_RELATIONALTEXT, doc)
    // GFM strikethrough should be back in the GFM namespace after round-trip
    const types = result.facets?.flatMap((f) => f.features.map((ft) => ft.$type)) ?? []
    expect(types.some((t) => t === 'org.gfm.facet')).toBe(true)
    // All types should be either gfm or commonmark (no leftovers from intermediate step)
    expect(types.every((t) => t === 'org.gfm.facet' || t === 'org.commonmark.facet')).toBe(true)
  })
})

// ─── composeLenses ────────────────────────────────────────────────────────────

describe('composeLenses', () => {
  it('returns null for incompatible lenses (first.target ≠ second.source)', async () => {
    const a: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'a',
      source: 'ns.x',
      target: 'ns.y',
      rules: [],
    }
    const b: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'b',
      source: 'ns.z',
      target: 'ns.w',
      rules: [],
    }
    expect(composeLenses(a, b)).toBeNull()
  })

  it('composes source and target namespaces', async () => {
    const a: LensSpec = { $type: 'org.relationaltext.lens', id: 'a', source: 'ns.x', target: 'ns.y', rules: [] }
    const b: LensSpec = { $type: 'org.relationaltext.lens', id: 'b', source: 'ns.y', target: 'ns.z', rules: [] }
    const c = composeLenses(a, b)
    expect(c!.source).toBe('ns.x')
    expect(c!.target).toBe('ns.z')
  })

  it('composes attribute renames transitively', async () => {
    const ab: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'ab',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'link' },
          replace: { typeId: 'ns.b', name: 'link', renameAttrs: { uri: 'href' } } },
      ],
    }
    const bc: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'bc',
      source: 'ns.b',
      target: 'ns.c',
      rules: [
        { match: { typeId: 'ns.b', name: 'link' },
          replace: { typeId: 'ns.c', name: 'link', renameAttrs: { href: 'url' } } },
      ],
    }
    const composed = composeLenses(ab, bc)!
    // uri→href then href→url should compose to uri→url
    expect(composed.rules![0]!.replace!.renameAttrs).toEqual({ uri: 'url' })
  })

  it('composes drop rules (first drops → still dropped)', async () => {
    const ab: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'ab',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' }, replace: null },
      ],
    }
    const bc: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'bc',
      source: 'ns.b',
      target: 'ns.c',
      rules: [],
    }
    const composed = composeLenses(ab, bc)!
    expect(composed.rules![0]!.replace).toBeNull()
  })
})

// ─── LensGraph ────────────────────────────────────────────────────────────────

describe('LensGraph', () => {
  it('findPath returns direct edge', async () => {
    const graph = new LensGraph()
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [],
    }
    graph.register(spec)
    const path = graph.findPath('ns.a', 'ns.b')
    expect(path).not.toBeNull()
    expect(path!.source).toBe('ns.a')
    expect(path!.target).toBe('ns.b')
  })

  it('findPath returns identity for same namespace', async () => {
    const graph = new LensGraph()
    const path = graph.findPath('ns.a', 'ns.a')
    expect(path).not.toBeNull()
    expect(path!.source).toBe('ns.a')
    expect(path!.target).toBe('ns.a')
  })

  it('findPath returns null when no path exists', async () => {
    const graph = new LensGraph()
    expect(graph.findPath('ns.a', 'ns.z')).toBeNull()
  })

  it('finds multi-hop path via BFS', async () => {
    const graph = new LensGraph()
    const ab: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'ab',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'y' } },
      ],
    }
    const bc: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'bc',
      source: 'ns.b',
      target: 'ns.c',
      rules: [
        { match: { typeId: 'ns.b', name: 'y' },
          replace: { typeId: 'ns.c', name: 'z' } },
      ],
    }
    graph.register(ab)
    graph.register(bc)
    const path = graph.findPath('ns.a', 'ns.c')
    expect(path).not.toBeNull()
    expect(path!.source).toBe('ns.a')
    expect(path!.target).toBe('ns.c')
    // Composed path should map ns.a#x → ns.c#z
    expect(path!.rules![0]!.replace!.typeId).toBe('ns.c')
    expect(path!.rules![0]!.replace!.name).toBe('z')
  })

  it('prefers shorter BFS path', async () => {
    const graph = new LensGraph()
    // Direct A→C and indirect A→B→C: BFS should find direct
    const ac: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'ac-direct',
      source: 'ns.a',
      target: 'ns.c',
      rules: [{ match: { typeId: 'ns.a', name: 'x' }, replace: { typeId: 'ns.c', name: 'direct' } }],
    }
    const ab: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'ab',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{ match: { typeId: 'ns.a', name: 'x' }, replace: { typeId: 'ns.b', name: 'via-b' } }],
    }
    const bc: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'bc',
      source: 'ns.b',
      target: 'ns.c',
      rules: [{ match: { typeId: 'ns.b', name: 'via-b' }, replace: { typeId: 'ns.c', name: 'indirect' } }],
    }
    graph.register(ac)
    graph.register(ab)
    graph.register(bc)
    const path = graph.findPath('ns.a', 'ns.c')!
    // Should use direct edge (id = 'ac-direct'), not composed 2-hop
    expect(path.id).toBe('ac-direct')
  })
})

// ─── registerLens ─────────────────────────────────────────────────────────────

describe('registerLens', () => {
  it('auto-registers the inverse lens', async () => {
    const graph = new LensGraph()
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.fwd',
      source: 'ns.x',
      target: 'ns.y',
      rules: [
        { match: { typeId: 'ns.x', name: 'a' }, replace: { typeId: 'ns.y', name: 'b' } },
      ],
    }
    // Register manually against our local graph
    graph.register(spec)
    graph.register(inverseLens(spec))

    const fwd = graph.findPath('ns.x', 'ns.y')
    const inv = graph.findPath('ns.y', 'ns.x')
    expect(fwd).not.toBeNull()
    expect(inv).not.toBeNull()
    // typeId is simplified to None when it equals the new source/target
    expect(inv!.rules![0]!.match).toEqual({ name: 'b' })
    expect(inv!.rules![0]!.replace).toEqual({ name: 'a' })
  })
})

// ─── findLens / transformDocument ─────────────────────────────────────────────

describe('findLens', () => {
  it('finds the built-in MARKDOWN→HTML lens', async () => {
    const lens = findLens('org.commonmark.facet', 'org.w3c.html.facet')
    expect(lens).not.toBeNull()
    expect(lens!.source).toBe('org.commonmark.facet')
    expect(lens!.target).toBe('org.w3c.html.facet')
  })

  it('finds the auto-registered HTML→MARKDOWN inverse', async () => {
    const lens = findLens('org.w3c.html.facet', 'org.commonmark.facet')
    expect(lens).not.toBeNull()
    expect(lens!.source).toBe('org.w3c.html.facet')
    expect(lens!.target).toBe('org.commonmark.facet')
  })
})

describe('transformDocument', () => {
  it('transforms a document using the found lens', async () => {
    const doc = (await from('markdown', '**bold**')).toJSON()
    const result = transformDocument(doc, 'org.commonmark.facet', 'org.w3c.html.facet')
    expect(result).not.toBeNull()
    // The strong feature should now be org.w3c.html.facet#strong
    const features = result!.facets?.flatMap((f) => f.features) ?? []
    const strong = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'strong',
    )
    expect(strong!.$type).toBe('org.w3c.html.facet')
  })

  it('returns null when no path exists', async () => {
    const doc = (await from('markdown', 'hello')).toJSON()
    const result = transformDocument(doc, 'org.commonmark.facet', 'ns.nonexistent')
    expect(result).toBeNull()
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('cross-format rendering via built-in lenses', () => {
  describe('to(html, from(markdown, ...))', () => {
    it('renders bold', async () => {
      const html = await to('html', await from('markdown', '**bold**'))
      expect(html).toContain('<strong>bold</strong>')
    })

    it('renders italic (emphasis → em)', async () => {
      const html = await to('html', await from('markdown', '*italic*'))
      expect(html).toContain('<em>italic</em>')
    })

    it('renders strikethrough', async () => {
      const html = await to('html', await from('markdown', '~~strike~~'))
      expect(html).toContain('<s>strike</s>')
    })

    it('renders inline code (code-span → code)', async () => {
      const html = await to('html', await from('markdown', '`code`'))
      expect(html).toContain('<code>code</code>')
    })

    it('renders links with href attr (uri → href rename)', async () => {
      const html = await to('html', await from('markdown', '[link](https://example.com)'))
      expect(html).toContain('<a href="https://example.com">link</a>')
    })

    it('renders headings', async () => {
      const html = await to('html', await from('markdown', '## Title'))
      expect(html).toContain('<h2>Title</h2>')
    })

    it('renders paragraphs', async () => {
      const html = await to('html', await from('markdown', 'Hello world'))
      expect(html).toContain('<p>Hello world</p>')
    })

    it('renders code blocks', async () => {
      const html = await to('html', await from('markdown', '```js\nconsole.log(1)\n```'))
      expect(html).toContain('<pre><code')
      expect(html).toContain('console.log(1)')
    })

    it('renders unordered lists', async () => {
      const html = await to('html', await from('markdown', '- item one\n- item two'))
      expect(html).toContain('<ul>')
      expect(html).toContain('<li>item one</li>')
    })

    it('renders ordered lists', async () => {
      const html = await to('html', await from('markdown', '1. first\n2. second'))
      expect(html).toContain('<ol>')
      expect(html).toContain('<li>first</li>')
    })

    it('renders blockquotes', async () => {
      const html = await to('html', await from('markdown', '> quoted'))
      expect(html).toContain('<blockquote>')
      expect(html).toContain('quoted')
    })

    it('renders horizontal rules', async () => {
      const html = await to('html', await from('markdown', '---'))
      expect(html).toContain('<hr />')
    })

    it('full round-trip: bold + link', async () => {
      const html = await to('html', await from('markdown', '**bold** [link](https://x.com)'))
      expect(html).toBe('<p><strong>bold</strong> <a href="https://x.com">link</a></p>\n')
    })
  })

  describe('to(markdown, from(html, ...))', () => {
    it('renders bold', async () => {
      const md = await to('markdown', await from('html', '<p><strong>bold</strong></p>'))
      expect(md).toContain('**bold**')
    })

    it('renders italic (em → emphasis)', async () => {
      const md = await to('markdown', await from('html', '<p><em>italic</em></p>'))
      expect(md).toContain('*italic*')
    })

    it('renders links (href → uri rename)', async () => {
      const md = await to('markdown', await from('html', '<p><a href="https://example.com">link</a></p>'))
      expect(md).toContain('[link](https://example.com)')
    })

    it('renders headings', async () => {
      const md = await to('markdown', await from('html', '<h2>Title</h2>'))
      expect(md).toContain('## Title')
    })

    it('renders paragraphs', async () => {
      const md = await to('markdown', await from('html', '<p>Hello world</p>'))
      expect(md).toContain('Hello world')
    })

    it('full round-trip: italic + text', async () => {
      const md = await to('markdown', await from('html', '<p><em>italic</em> text</p>'))
      expect(md).toBe('*italic* text\n')
    })
  })

  describe('mixed-namespace documents', () => {
    it('toHTML handles a document that already has HTML features', async () => {
      // fromHTML produces org.w3c.html.facet features; toHTML should handle them
      const doc = await from('html', '<p><strong>already html</strong></p>')
      const html = await to('html', doc)
      expect(html).toContain('<strong>already html</strong>')
    })

    it('toMarkdown handles a document that already has Markdown features', async () => {
      const doc = await from('markdown', '**already markdown**')
      const md = await to('markdown', doc)
      expect(md).toContain('**already markdown**')
    })
  })
})

// ─── CommonMark → HTML path (two-step via RT hub) ────────────────────────────

describe('CommonMark → HTML via RT hub', () => {
  it('path from org.commonmark.facet to org.w3c.html.facet exists', async () => {
    const found = lensGraph.findPath('org.commonmark.facet', 'org.w3c.html.facet')
    expect(found).not.toBeNull()
  })

  it('COMMONMARK_TO_RELATIONALTEXT maps emphasis → italic', async () => {
    const rule = COMMONMARK_TO_RELATIONALTEXT.rules!.find((r) => r.match?.name === 'emphasis')
    expect(rule!.replace!.name).toBe('italic')
  })

  it('COMMONMARK_TO_RELATIONALTEXT maps code-span → code', async () => {
    const rule = COMMONMARK_TO_RELATIONALTEXT.rules!.find((r) => r.match?.name === 'code-span')
    expect(rule!.replace!.name).toBe('code')
  })

  it('COMMONMARK_TO_RELATIONALTEXT maps link with uri→url rename', async () => {
    const rule = COMMONMARK_TO_RELATIONALTEXT.rules!.find((r) => r.match?.name === 'link')
    expect(rule!.replace!.name).toBe('link')
    expect(rule!.replace!.renameAttrs).toEqual({ uri: 'url' })
  })

  it('RELATIONALTEXT_TO_HTML maps italic → em', async () => {
    const rule = RELATIONALTEXT_TO_HTML.rules!.find((r) => r.match?.name === 'italic')
    expect(rule!.replace!.name).toBe('em')
  })

  it('RELATIONALTEXT_TO_HTML maps link with url→href rename', async () => {
    const rule = RELATIONALTEXT_TO_HTML.rules!.find((r) => r.match?.name === 'link')
    expect(rule!.replace!.name).toBe('a')
    expect(rule!.replace!.renameAttrs).toEqual({ url: 'href' })
  })

  it('double-inverse is equivalent (source/target/rules match)', async () => {
    // Use GFM_TO_RELATIONALTEXT (no template rules, fully invertible)
    const doubleInv = inverseLens(inverseLens(GFM_TO_RELATIONALTEXT))
    expect(doubleInv.source).toBe(GFM_TO_RELATIONALTEXT.source)
    expect(doubleInv.target).toBe(GFM_TO_RELATIONALTEXT.target)
    expect(doubleInv.rules).toEqual(GFM_TO_RELATIONALTEXT.rules)
  })
})

// ─── GFM_TO_RELATIONALTEXT lens ────────────────────────────────────────────────────

describe('GFM_TO_RELATIONALTEXT lens spec', () => {
  it('has correct source and target', async () => {
    expect(GFM_TO_RELATIONALTEXT.source).toBe('org.gfm.facet')
    expect(GFM_TO_RELATIONALTEXT.target).toBe('org.relationaltext.facet')
  })

  it('is registered in the global lens graph', async () => {
    const found = lensGraph.findPath('org.gfm.facet', 'org.relationaltext.facet')
    expect(found).not.toBeNull()
  })

  it('path from org.gfm.facet to org.w3c.html.facet exists (gfm→rt→html)', async () => {
    const found = lensGraph.findPath('org.gfm.facet', 'org.w3c.html.facet')
    expect(found).not.toBeNull()
  })

  it('converts org.gfm.facet#strikethrough to org.relationaltext.facet#strikethrough', async () => {
    const doc: DocumentJSON = {
      text: 'abc',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.gfm.facet', name: 'strikethrough' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, GFM_TO_RELATIONALTEXT)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('org.relationaltext.facet')
    expect(feat['name']).toBe('strikethrough')
  })
})

describe('cross-format rendering — GFM features', () => {
  it('to(html, from(markdown, ~~strike~~)) renders <s>strike</s>', async () => {
    const html = await to('html', await from('markdown', '~~strike~~'))
    expect(html).toContain('<s>strike</s>')
  })

  it('to(markdown, from(markdown, ~~strike~~)) preserves strikethrough syntax', async () => {
    const md = await to('markdown', await from('markdown', '~~strike~~'))
    expect(md).toContain('~~strike~~')
  })
})

// ─── Version-aware lens matching ─────────────────────────────────────────────

describe('version-aware lens matching', () => {
  it('unversioned pattern matches versioned feature name', async () => {
    // Feature has a versioned name; rule pattern is unversioned — should still match
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.version.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'mark' },
          replace: { typeId: 'ns.b', name: 'renamed' } },
      ],
    }
    const doc: DocumentJSON = {
      text: 'abc',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'ns.a', name: 'mark@1.0' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    expect(result.facets).toHaveLength(1)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('ns.b')
    expect(feat['name']).toBe('renamed')
  })

  it('versioned compound pattern matches unversioned feature', async () => {
    // Rule pattern is a versioned compound key; feature has unversioned name
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.version.v2',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a#mark@1.0' },
          replace: { typeId: 'ns.b', name: 'renamed' } },
      ],
    }
    const doc: DocumentJSON = {
      text: 'abc',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'ns.a', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    expect(result.facets).toHaveLength(1)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('ns.b')
    expect(feat['name']).toBe('renamed')
  })

  it('LensSpec version field survives inverse', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'version.test',
      version: '2.0',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        { match: { typeId: 'ns.a', name: 'x' },
          replace: { typeId: 'ns.b', name: 'y' } },
      ],
    }
    // inverseLens should not throw; source/target should be swapped
    const inv = inverseLens(spec)
    expect(inv.source).toBe('ns.b')
    expect(inv.target).toBe('ns.a')
    // typeId is simplified to None when it equals the new source/target
    expect(inv.rules![0]!.match).toEqual({ name: 'y' })
    expect(inv.rules![0]!.replace).toEqual({ name: 'x' })
  })
})

// ─── Version-stripping dual registration ─────────────────────────────────────

describe('registerFeatureType — version stripping', () => {
  it('registers the base key when typeId has @version suffix', async () => {
    // Register a versioned type
    registerFeatureType({
      typeId: 'test.version.facet#highlight@2.0',
      featureClass: 'inline',
      expandStart: true,
      expandEnd: true,
    })
    // A document with the unversioned type should still parse and produce a HIR mark
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'test.version.facet', name: 'highlight' } as Record<string, unknown> as never],
      }],
    }
    // If registration works, parse_document won't throw and the feature is preserved
    const parsed = Document.fromJSON(doc)
    expect(parsed.facets).toHaveLength(1)
  })
})

// ─── keepAttrs and mapAttrValue descriptors ───────────────────────────────────

describe('keepAttrs and mapAttrValue descriptors', () => {
  const makeDoc = (attrs: Record<string, unknown>): DocumentJSON => ({
    text: 'hello',
    facets: [{
      index: { byteStart: 0, byteEnd: 5 },
      features: [{ $type: 'ns.a', name: 'heading', ...attrs } as Record<string, unknown> as never],
    }],
  })

  it('keepAttrs keeps only listed attrs and $type/name', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.keep.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{
        match: { typeId: 'ns.a', name: 'heading' },
        replace: { typeId: 'ns.b', name: 'heading', keepAttrs: ['level'] },
      }],
    }
    const result = applyLens(makeDoc({ level: 2, extra: 'drop-me', other: 99 }), spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('ns.b')
    expect(feat['name']).toBe('heading')
    expect(feat['level']).toBe(2)
    expect(feat['extra']).toBeUndefined()
    expect(feat['other']).toBeUndefined()
  })

  it('mapAttrValue add increments a numeric attr (integer preserved)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.map-add.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{
        match: { typeId: 'ns.a', name: 'heading' },
        replace: { typeId: 'ns.b', name: 'heading', mapAttrValue: { level: { op: 'add', value: 1 } } },
      }],
    }
    const result = applyLens(makeDoc({ level: 2 }), spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['level']).toBe(3)
  })

  it('mapAttrValue prefix prepends to a string attr', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.map-prefix.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{
        match: { typeId: 'ns.a', name: 'heading' },
        replace: { typeId: 'ns.b', name: 'heading', mapAttrValue: { url: { op: 'prefix', value: 'https://' } } },
      }],
    }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'heading', url: 'example.com' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['url']).toBe('https://example.com')
  })

  it('mapAttrValue negate flips a boolean attr', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.map-negate.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{
        match: { typeId: 'ns.a', name: 'heading' },
        replace: { typeId: 'ns.b', name: 'heading', mapAttrValue: { checked: { op: 'negate' } } },
      }],
    }
    const doc: DocumentJSON = {
      text: 'x',
      facets: [{
        index: { byteStart: 0, byteEnd: 1 },
        features: [{ $type: 'ns.a', name: 'heading', checked: true } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['checked']).toBe(false)
  })

  it('mapAttrValue noop on wrong type leaves value unchanged', async () => {
    // add on a string is a noop
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.map-noop.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{
        match: { typeId: 'ns.a', name: 'heading' },
        replace: { typeId: 'ns.b', name: 'heading', mapAttrValue: { label: { op: 'add', value: 1 } } },
      }],
    }
    const doc: DocumentJSON = {
      text: 'x',
      facets: [{
        index: { byteStart: 0, byteEnd: 1 },
        features: [{ $type: 'ns.a', name: 'heading', label: 'hello' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['label']).toBe('hello')  // unchanged
  })
})

// ─── implicit typeId in lens rules ───────────────────────────────────────────

describe('implicit typeId in lens rules', () => {
  it('match.typeId defaults to spec.source when omitted', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.implicit.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        // No typeId — defaults to source/target
        { match: { name: 'mark' }, replace: { name: 'mark' } },
      ],
    }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    expect(result.facets![0]!.features[0]!.$type).toBe('ns.b')
    expect((result.facets![0]!.features[0]! as Record<string, unknown>)['name']).toBe('mark')
  })

  it('feature with different $type does not match implicit source typeId', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.implicit.v2',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{ match: { name: 'mark' }, replace: { name: 'mark' } }],
    }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.other', name: 'mark' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    // ns.other doesn't match implicit ns.a, passthrough: keep leaves it unchanged
    expect(result.facets![0]!.features[0]!.$type).toBe('ns.other')
  })

  it('inverseLens of implicit-typeId spec restores compact form on double-inverse', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.implicit.v3',
      source: 'ns.a',
      target: 'ns.b',
      rules: [{ match: { name: 'x' }, replace: { name: 'x' } }],
    }
    const inv = inverseLens(spec)
    const doubleInv = inverseLens(inv)
    expect(doubleInv.source).toBe(spec.source)
    expect(doubleInv.target).toBe(spec.target)
    // Both should have the same compact form (no typeId in rules)
    expect(doubleInv.rules).toEqual(spec.rules)
  })
})

// ─── matchAttrs ───────────────────────────────────────────────────────────────

describe('matchAttrs', () => {
  it('fires only when attrs match', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.match-attrs.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          match: { typeId: 'ns.a', name: 'heading', matchAttrs: { level: 1 } },
          replace: { typeId: 'ns.b', name: 'h1', dropAttrs: ['level'] },
        },
      ],
    }
    const doc: DocumentJSON = {
      text: 'Title',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'heading', level: 1 } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('ns.b')
    expect(feat['name']).toBe('h1')
    // dropAttrs should have removed level
    expect(feat['level']).toBeUndefined()
  })

  it('does not fire on non-matching attrs (feature passes through)', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.match-attrs-no-fire.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          match: { typeId: 'ns.a', name: 'heading', matchAttrs: { level: 1 } },
          replace: { typeId: 'ns.b', name: 'h1' },
        },
      ],
    }
    const doc: DocumentJSON = {
      text: 'Title',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.a', name: 'heading', level: 2 } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, spec)
    // level:2 doesn't match matchAttrs:{level:1} → passthrough: keep
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('ns.a')
    expect(feat['name']).toBe('heading')
    expect(feat['level']).toBe(2)
  })

  it('inverseLens: matchAttrs+dropAttrs → addAttrs in inverse', async () => {
    // Forward: match heading with level=1, drop level → becomes h1 without level.
    // Inverse: match h1, add level=1 back → becomes heading with level.
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.match-attrs-inv.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          match: { typeId: 'ns.a', name: 'heading', matchAttrs: { level: 1 } },
          replace: { typeId: 'ns.b', name: 'h1', dropAttrs: ['level'] },
        },
      ],
    }
    const inv = inverseLens(spec)
    const invRule = inv.rules![0]!
    // Inverse match: { name: 'h1' } — no matchAttrs (the level was dropped, not injected)
    expect(invRule.match!.name).toBe('h1')
    expect(invRule.match!.matchAttrs).toBeUndefined()
    // Inverse replace: addAttrs { level: 1 } to restore the dropped value
    expect(invRule.replace!.addAttrs).toEqual({ level: 1 })
  })

  it('inverseLens: addAttrs → matchAttrs+dropAttrs in inverse', async () => {
    // Forward: match unordered-list-item (no matchAttrs), inject list="ul" in replace.
    // Inverse: match li when list="ul" (matchAttrs), drop list attr.
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.add-attrs-inv.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          match: { typeId: 'ns.a', name: 'unordered-list-item' },
          replace: { typeId: 'ns.b', name: 'li', addAttrs: { list: 'ul' } },
        },
      ],
    }
    const inv = inverseLens(spec)
    const invRule = inv.rules![0]!
    // Inverse match must have matchAttrs { list: 'ul' }
    expect(invRule.match!.matchAttrs).toEqual({ list: 'ul' })
    // Inverse replace must drop list attr
    expect(invRule.replace!.dropAttrs).toContain('list')
    // Inverse replace must NOT have addAttrs
    expect(invRule.replace!.addAttrs).toBeUndefined()
  })
})

// ─── RELATIONALTEXT_TO_HTML heading rules ─────────────────────────────────────

describe('RELATIONALTEXT_TO_HTML — heading template rule', () => {
  // headings arrive as RT `heading` features with `attrs: { level: N }`.
  // RELATIONALTEXT_TO_HTML maps them to `h{level}` via a template rule.

  function applyRTToHTML(doc: DocumentJSON): DocumentJSON {
    // Apply CM→RT first (fromMarkdown produces CM features), then RT→HTML.
    const rt = applyLens(doc, COMMONMARK_TO_RELATIONALTEXT)
    return applyLens(rt, RELATIONALTEXT_TO_HTML)
  }

  it('heading level 2 maps to h2 with level attr dropped', async () => {
    const doc = (await from('markdown', '## Hello')).toJSON()
    const result = applyRTToHTML(doc)
    const features = result.facets?.flatMap((f) => f.features) ?? []
    const h2 = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'h2',
    )
    expect(h2).toBeDefined()
    expect(h2!.$type).toBe('org.w3c.html.facet')
    const attrs = (h2 as Record<string, unknown>)['attrs'] as Record<string, unknown> | undefined
    expect(attrs?.['level']).toBeUndefined()
  })

  it('heading level 1 maps to h1', async () => {
    const doc = (await from('markdown', '# Title')).toJSON()
    const result = applyRTToHTML(doc)
    const features = result.facets?.flatMap((f) => f.features) ?? []
    const h1 = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'h1',
    )
    expect(h1).toBeDefined()
    expect(h1!.$type).toBe('org.w3c.html.facet')
  })

  it('heading level 3 maps to h3', async () => {
    const doc = (await from('markdown', '### Section')).toJSON()
    const result = applyRTToHTML(doc)
    const features = result.facets?.flatMap((f) => f.features) ?? []
    const h3 = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'h3',
    )
    expect(h3).toBeDefined()
    expect(h3!.$type).toBe('org.w3c.html.facet')
  })

  it('paragraph maps to p', async () => {
    const doc = (await from('markdown', 'Hello world')).toJSON()
    const result = applyRTToHTML(doc)
    const features = result.facets?.flatMap((f) => f.features) ?? []
    const p = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'p',
    )
    expect(p).toBeDefined()
    expect(p!.$type).toBe('org.w3c.html.facet')
  })

  it('no old heading name remains after both lens hops', async () => {
    const doc = (await from('markdown', '## Hello')).toJSON()
    const result = applyRTToHTML(doc)
    const features = result.facets?.flatMap((f) => f.features) ?? []
    const oldHeading = features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'heading',
    )
    expect(oldHeading).toBeUndefined()
  })
})

describe('list item rules with addAttrs — inverse behavior', () => {
  // Note: unordered-list-item/ordered-list-item are container labels in the parents
  // array, NOT standalone features. The forward rules are for round-tripping HTML
  // imports back to CommonMark; the lens inverse direction is tested below.
  //
  // These tests use a partial lens to verify addAttrs inverse behavior.
  // These tests use a partial lens with just the li rules to verify the addAttrs
  // inverse behavior.

  const liOnlyLens: LensSpec = {
    $type: 'community.lexicon.lens',
    id: 'li-only.test.v1',
    source: 'org.commonmark.facet',
    target: 'org.w3c.html.facet',
    rules: [
      { match: { name: 'unordered-list-item' }, replace: { name: 'li', addAttrs: { list: 'ul' } } },
      { match: { name: 'ordered-list-item' }, replace: { name: 'li', addAttrs: { list: 'ol' } } },
    ],
  }

  it('inverse lens: li(list="ul") maps back to unordered-list-item', async () => {
    const inv = inverseLens(liOnlyLens)
    const doc: DocumentJSON = {
      text: '\uFFFCitem',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.w3c.html.facet', name: 'li', list: 'ul' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, inv)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('org.commonmark.facet')
    expect(feat['name']).toBe('unordered-list-item')
    expect(feat['list']).toBeUndefined()
  })

  it('inverse lens: li(list="ol") maps back to ordered-list-item', async () => {
    const inv = inverseLens(liOnlyLens)
    const doc: DocumentJSON = {
      text: '\uFFFCitem',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.w3c.html.facet', name: 'li', list: 'ol' } as Record<string, unknown> as never],
      }],
    }
    const result = applyLens(doc, inv)
    const feat = result.facets![0]!.features[0]! as Record<string, unknown>
    expect(feat['$type']).toBe('org.commonmark.facet')
    expect(feat['name']).toBe('ordered-list-item')
    expect(feat['list']).toBeUndefined()
  })
})

describe('RELATIONALTEXT_TO_HTML — template name heading rule', () => {
  // The heading rule uses a template name { template: "h{level}" } which collapses
  // 6 separate rules (h1-h6) into one. This makes the lens non-invertible.

  it('inverseLens(RELATIONALTEXT_TO_HTML) throws LensInversionError (template name is lossy)', async () => {
    expect(() => inverseLens(RELATIONALTEXT_TO_HTML)).toThrow(LensInversionError)
  })

  it('RELATIONALTEXT_TO_HTML has single heading rule (template, not 6 separate matchAttrs rules)', async () => {
    const headingRules = RELATIONALTEXT_TO_HTML.rules!.filter((r) => r.match?.name === 'heading')
    expect(headingRules).toHaveLength(1)
    const rule = headingRules[0]!
    expect(rule.replace!.name).toEqual({ template: 'h{level}' })
    expect(rule.replace!.dropAttrs).toContain('level')
  })

  it('forward rule: all 6 heading levels work via two-step CM→RT→HTML path', async () => {
    const doc = (await from('markdown', '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6')).toJSON()
    const rt = applyLens(doc, COMMONMARK_TO_RELATIONALTEXT)
    const result = applyLens(rt, RELATIONALTEXT_TO_HTML)
    const names = (result.facets ?? [])
      .flatMap((f) => f.features)
      .map((f) => (f as Record<string, unknown>)['name'])
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(names).toContain(`h${level}`)
    }
  })

  // The non-heading invertible rules are tested via a custom lens below
  it('simple name rename rules (em, s, p, etc.) remain invertible via a custom lens', async () => {
    const partialLens: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'partial.test.v1',
      source: 'org.commonmark.facet',
      target: 'org.w3c.html.facet',
      rules: [
        { match: { name: 'emphasis' }, replace: { name: 'em' } },
        { match: { name: 'paragraph' }, replace: { name: 'p' } },
        { match: { name: 'strikethrough' }, replace: { name: 's' } },
        { match: { name: 'horizontal-rule' }, replace: { name: 'hr' } },
        { match: { name: 'code-block' }, replace: { name: 'pre' } },
      ],
    }
    const inv = inverseLens(partialLens)
    expect(inv.rules!.find((r) => r.match?.name === 'em')?.replace?.name).toBe('emphasis')
    expect(inv.rules!.find((r) => r.match?.name === 'p')?.replace?.name).toBe('paragraph')
    expect(inv.rules!.find((r) => r.match?.name === 's')?.replace?.name).toBe('strikethrough')
    expect(inv.rules!.find((r) => r.match?.name === 'hr')?.replace?.name).toBe('horizontal-rule')
    expect(inv.rules!.find((r) => r.match?.name === 'pre')?.replace?.name).toBe('code-block')
  })
})

// ─── LensRule sql field ───────────────────────────────────────────────────────

describe('LensRule sql field', () => {
  it('applyLens with SQL rules passes through unchanged (SQL engine removed)', async () => {
    // The SQL engine was removed — SQL rules are now no-ops.
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.sql-only.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          sql: "UPDATE features SET type_id = 'ns.b', name = 'mark' WHERE strip_version(type_id) = 'ns.a'",
        },
      ],
    }
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'ns.a', name: 'emphasis' }],
        },
      ],
    }
    // SQL rules are no-ops — the feature stays unchanged.
    const result = applyLens(doc, spec)
    expect(result.facets).toHaveLength(1)
    expect(result.facets![0].features[0].$type).toBe('ns.a')
    expect(result.facets![0].features[0].name).toBe('emphasis')
  })

  it('inverseLens rejects a lens with SQL rules', async () => {
    const spec: LensSpec = {
      $type: 'org.relationaltext.lens',
      id: 'test.sql-inv.v1',
      source: 'ns.a',
      target: 'ns.b',
      rules: [
        {
          sql: "UPDATE features SET type_id = 'ns.b' WHERE type_id = 'ns.a'",
        },
      ],
    }
    expect(() => inverseLens(spec)).toThrow(/SQL rules.*cannot be automatically inverted/i)
  })

  it('LensRule with only sql field is a valid interface value', async () => {
    // Type-level: can construct a LensRule with only sql (no match/replace)
    const rule = { sql: 'SELECT 1' }
    expect(rule.sql).toBe('SELECT 1')
    expect((rule as { match?: unknown }).match).toBeUndefined()
  })
})

// ─── applyLensDebug ────────────────────────────────────────────────────────────────────────────────

describe('applyLensDebug', () => {
  const renameSpec: LensSpec = {
    $type: 'community.lexicon.lens',
    id: 'test.debug.v1',
    source: 'ns.src',
    target: 'ns.tgt',
    rules: [
      { match: { typeId: 'ns.src', name: 'emphasis' }, replace: { name: 'em' } },
      { match: { typeId: 'ns.src', name: 'strong' }, replace: { name: 'strong' } },
    ],
  }

  it('returns the transformed document', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.src', name: 'emphasis' } as Record<string, unknown> as never],
      }],
    }
    const { document } = applyLensDebug(doc, renameSpec)
    expect(document.facets![0]!.features[0]!.$type).toBe('ns.tgt')
    expect((document.facets![0]!.features[0]! as Record<string, unknown>)['name']).toBe('em')
  })

  it('returns a trace with one entry per rule', async () => {
    const doc: DocumentJSON = {
      text: 'hello world',
      facets: [
        { index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'ns.src', name: 'emphasis' } as Record<string, unknown> as never] },
        { index: { byteStart: 6, byteEnd: 11 }, features: [{ $type: 'ns.src', name: 'strong' } as Record<string, unknown> as never] },
      ],
    }
    const { trace } = applyLensDebug(doc, renameSpec)
    expect(trace).toHaveLength(2)
  })

  it('trace[0] has correct ruleIndex and isSql fields', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.src', name: 'emphasis' } as Record<string, unknown> as never],
      }],
    }
    const { trace } = applyLensDebug(doc, renameSpec)
    expect(trace[0]!.ruleIndex).toBe(0)
    // Per-rule match counting is not yet instrumented in the panproto pipeline
    expect(trace[0]!.isSql).toBe(false)
  })

  it('reports matched:0 when no features match a rule', async () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'ns.src', name: 'code' } as Record<string, unknown> as never],
      }],
    }
    // Neither 'emphasis' nor 'strong' matches 'code'
    const { trace } = applyLensDebug(doc, renameSpec)
    expect(trace[0]!.matched).toBe(0)
    expect(trace[1]!.matched).toBe(0)
  })

  it('trace entries have the correct ruleIndex values', async () => {
    const doc: DocumentJSON = {
      text: 'hello world',
      facets: [
        { index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'ns.src', name: 'emphasis' } as Record<string, unknown> as never] },
        { index: { byteStart: 6, byteEnd: 11 }, features: [{ $type: 'ns.src', name: 'strong' } as Record<string, unknown> as never] },
      ],
    }
    const { trace } = applyLensDebug(doc, renameSpec)
    expect(trace.map((e: TraceEntry) => e.ruleIndex)).toEqual([0, 1])
  })

  it('works with the RELATIONALTEXT_TO_HTML built-in lens', async () => {
    const doc: DocumentJSON = {
      text: 'hello world',
      facets: [
        { index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'org.relationaltext.facet', name: 'italic' } as Record<string, unknown> as never] },
        { index: { byteStart: 6, byteEnd: 11 }, features: [{ $type: 'org.relationaltext.facet', name: 'bold' } as Record<string, unknown> as never] },
      ],
    }
    const { document, trace } = applyLensDebug(doc, RELATIONALTEXT_TO_HTML)
    // The document should have HTML feature types
    const typeIds = document.facets!.flatMap((f) => f.features.map((feat) => feat.$type))
    expect(typeIds.every((t) => t === 'org.w3c.html.facet')).toBe(true)
    // Trace should have as many entries as rules
    expect(trace.length).toBe(RELATIONALTEXT_TO_HTML.rules!.length)
  })
})

// ─── validateLensSQL ────────────────────────────────────────────────────────────────────────────

describe('validateLensSQL', () => {
  const baseSpec: LensSpec = {
    $type: 'community.lexicon.lens',
    id: 'test.validate.v1',
    source: 'ns.src',
    target: 'ns.tgt',
    rules: [],
  }

  it('returns empty array for a lens with no SQL rules', async () => {
    const spec: LensSpec = {
      ...baseSpec,
      rules: [
        { match: { name: 'emphasis' }, replace: { name: 'em' } },
        { match: { name: 'strong' }, replace: { name: 'strong' } },
      ],
    }
    const errors = validateLensSQL(spec)
    expect(errors).toHaveLength(0)
  })

  it('returns empty array for a lens with syntactically valid SQL', async () => {
    const spec: LensSpec = {
      ...baseSpec,
      rules: [
        {
          match: { name: 'span' },
          replace: null,
          sql: "DELETE FROM features WHERE name = 'span'",
        },
      ],
    }
    const errors = validateLensSQL(spec)
    expect(errors).toHaveLength(0)
  })

  it('returns empty array for invalid SQL (SQL engine removed)', async () => {
    // SQL engine removed — validation always returns empty.
    const spec: LensSpec = {
      ...baseSpec,
      rules: [
        {
          match: { name: 'span' },
          replace: null,
          sql: 'INSRT INTO features VALUES (1)',
        },
      ],
    }
    const errors = validateLensSQL(spec)
    expect(errors).toHaveLength(0)
  })

  it('returns empty array for invalid SQL ruleIndex (SQL engine removed)', async () => {
    const spec: LensSpec = {
      ...baseSpec,
      rules: [
        { match: { name: 'emphasis' }, replace: { name: 'em' } },
        { match: { name: 'span' }, replace: null, sql: "DELETE FROM features WHERE name = 'span'" },
        { match: { name: 'div' }, replace: null, sql: 'SELEKT * FROM features' },
      ],
    }
    const errors = validateLensSQL(spec)
    expect(errors).toHaveLength(0)
  })

  it('returns empty array for multiple bad SQL (SQL engine removed)', async () => {
    const spec: LensSpec = {
      ...baseSpec,
      rules: [
        { match: { name: 'a' }, replace: null, sql: 'INSRT INTO features VALUES (1)' },
        { match: { name: 'b' }, replace: { name: 'b' } },
        { match: { name: 'c' }, replace: null, sql: 'SELEKT * FROM features' },
      ],
    }
    const errors = validateLensSQL(spec)
    expect(errors).toHaveLength(0)
  })
})

// ─── join rule ──────────────────────────────────────────────────────────────────────────────────────

describe('join rule', () => {
  it('inverseLens throws LensInversionError when spec contains a join rule', async () => {
    const joinRule: LensRule = {
      join: {
        primary: { name: 'span' },
        joined: [{ name: 'a', alias: 'a_feat', required: false }],
        produce: {
          typeId: 'org.test.facet',
          name: { from: 'literal', value: 'link' },
          attrs: {
            href: { from: 'joinedAttr', alias: 'a_feat', attr: 'href' } as JoinAttrSource,
          },
        },
        deleteMatched: ['span', 'a'],
      } satisfies JoinRule,
    }
    const spec: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'test.join.lens',
      source: 'org.test.facet',
      target: 'org.test.facet',
      rules: [joinRule],
    }
    expect(() => inverseLens(spec)).toThrow(LensInversionError)
    expect(() => inverseLens(spec)).toThrow(/join rule/)
  })

  it('applyLens with a join rule merges same-range features', async () => {
    // Document: "hello" with two features at bytes 0-5: "span" and "a" (with href)
    const doc: import('../src/types.js').DocumentJSON = {
      text: 'hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.test.facet', name: 'span' } as never],
        },
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.test.facet', name: 'a', href: 'https://example.com' } as never],
        },
      ],
    }

    const spec: LensSpec = {
      $type: 'community.lexicon.lens',
      id: 'test.join.merge',
      source: 'org.test.facet',
      target: 'org.test.facet',
      rules: [
        {
          join: {
            primary: { name: 'span' },
            joined: [{ name: 'a', alias: 'a_feat', required: true }],
            produce: {
              typeId: 'org.test.facet',
              name: { from: 'literal', value: 'link' },
              attrs: {
                href: { from: 'joinedAttr', alias: 'a_feat', attr: 'href' } as JoinAttrSource,
              },
            },
            deleteMatched: ['span', 'a'],
          },
        },
      ],
    }

    const result = applyLens(doc, spec)
    const allFeatures = result.facets!.flatMap((f) => f.features)

    // Original span and a should be gone
    const names = allFeatures.map((f) => (f as Record<string, unknown>)['name'])
    expect(names).not.toContain('span')
    expect(names).not.toContain('a')

    // New link feature should be present with href
    const linkFeat = allFeatures.find((f) => (f as Record<string, unknown>)['name'] === 'link')
    expect(linkFeat).toBeDefined()
    expect((linkFeat as Record<string, unknown>)['href']).toBe('https://example.com')
  })
})
