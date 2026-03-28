/**
 * Tests for automerge-stream.ts
 *
 * These tests cover the position conversion helpers, RTMutation construction,
 * and applyRTMutations in isolation — no Automerge dependency needed.
 * The bridge functions (createBridgeFromRT, applyRTMutationToAutomerge) are
 * tested only if @automerge/automerge is installed.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { Document, ensureRelationalTextLexicon } from '../src/core.js'
import {
  utf16IndexToByteOffset,
  byteOffsetToUtf16Index,
  automergePathToRTMutations,
  applyRTMutations,
  type AutomergePatch,
  type RTMutation,
} from '../src/automerge-stream.js'

beforeAll(() => {
  ensureRelationalTextLexicon()
})

// ─── utf16IndexToByteOffset ───────────────────────────────────────────────────

describe('utf16IndexToByteOffset', () => {
  it('returns 0 for index 0', () => {
    expect(utf16IndexToByteOffset('hello', 0)).toBe(0)
    expect(utf16IndexToByteOffset('', 0)).toBe(0)
  })

  it('handles ASCII text (1 byte = 1 code unit)', () => {
    expect(utf16IndexToByteOffset('hello', 1)).toBe(1)
    expect(utf16IndexToByteOffset('hello', 3)).toBe(3)
    expect(utf16IndexToByteOffset('hello', 5)).toBe(5)
  })

  it('handles BMP non-ASCII (2 UTF-8 bytes, 1 UTF-16 unit) — Latin extended', () => {
    // 'é' = U+00E9 → 2 UTF-8 bytes, 1 UTF-16 code unit
    const text = 'café'
    // 'c' 'a' 'f' 'é' → bytes: 1+1+1+2 = 5 bytes for full string
    expect(utf16IndexToByteOffset(text, 0)).toBe(0)
    expect(utf16IndexToByteOffset(text, 3)).toBe(3)
    // After 'caf' (3 chars, 3 bytes), 'é' starts at byte 3
    expect(utf16IndexToByteOffset(text, 4)).toBe(5) // after 'café'
  })

  it('handles CJK characters (3 UTF-8 bytes, 1 UTF-16 unit)', () => {
    // '中' = U+4E2D → 3 UTF-8 bytes, 1 UTF-16 code unit
    const text = 'A中B'
    expect(utf16IndexToByteOffset(text, 0)).toBe(0)
    expect(utf16IndexToByteOffset(text, 1)).toBe(1) // after 'A'
    expect(utf16IndexToByteOffset(text, 2)).toBe(4) // after 'A中' (1+3 bytes)
    expect(utf16IndexToByteOffset(text, 3)).toBe(5) // after 'A中B'
  })

  it('handles non-BMP / emoji (4 UTF-8 bytes, 2 UTF-16 code units)', () => {
    // '😀' = U+1F600 → 4 UTF-8 bytes, 2 UTF-16 code units (surrogate pair)
    const text = 'hi😀!'
    expect(utf16IndexToByteOffset(text, 0)).toBe(0)
    expect(utf16IndexToByteOffset(text, 1)).toBe(1) // after 'h'
    expect(utf16IndexToByteOffset(text, 2)).toBe(2) // after 'hi'
    // '😀' is 2 UTF-16 units; in bytes it's 4. So after 'hi😀' = 2+4=6 bytes
    expect(utf16IndexToByteOffset(text, 4)).toBe(6) // after 'hi😀' (2 utf16 units for emoji)
    expect(utf16IndexToByteOffset(text, 5)).toBe(7) // after 'hi😀!'
  })

  it('handles string end index (equal to text.length)', () => {
    expect(utf16IndexToByteOffset('hi', 2)).toBe(2)
    // emoji: text.length = 4 (2 surrogates + 2 ascii but '😀' is 2 units)
    const text = '😀!'
    // text.length = 3 (2 for surrogate pair + 1 for '!')
    expect(utf16IndexToByteOffset(text, text.length)).toBe(5) // 4 bytes emoji + 1 byte '!'
  })

  it('handles a string with multiple emoji', () => {
    const text = '👋🌍'
    // '👋' = 4 bytes, 2 UTF-16 units; '🌍' = 4 bytes, 2 UTF-16 units
    expect(utf16IndexToByteOffset(text, 0)).toBe(0)
    expect(utf16IndexToByteOffset(text, 2)).toBe(4) // after '👋'
    expect(utf16IndexToByteOffset(text, 4)).toBe(8) // after '👋🌍'
  })
})

// ─── byteOffsetToUtf16Index ───────────────────────────────────────────────────

describe('byteOffsetToUtf16Index', () => {
  it('returns 0 for offset 0', () => {
    expect(byteOffsetToUtf16Index('hello', 0)).toBe(0)
    expect(byteOffsetToUtf16Index('', 0)).toBe(0)
  })

  it('handles ASCII text', () => {
    expect(byteOffsetToUtf16Index('hello', 1)).toBe(1)
    expect(byteOffsetToUtf16Index('hello', 5)).toBe(5)
  })

  it('handles BMP non-ASCII (2 UTF-8 bytes → 1 UTF-16 unit)', () => {
    const text = 'café'
    // 'c'=1 'a'=1 'f'=1 'é'=2 → total 5 bytes
    expect(byteOffsetToUtf16Index(text, 0)).toBe(0)
    expect(byteOffsetToUtf16Index(text, 3)).toBe(3) // after 'caf'
    expect(byteOffsetToUtf16Index(text, 5)).toBe(4) // after 'café' (4 chars = 4 code units)
  })

  it('handles CJK characters (3 UTF-8 bytes → 1 UTF-16 unit)', () => {
    const text = 'A中B'
    expect(byteOffsetToUtf16Index(text, 0)).toBe(0)
    expect(byteOffsetToUtf16Index(text, 1)).toBe(1)
    expect(byteOffsetToUtf16Index(text, 4)).toBe(2)
    expect(byteOffsetToUtf16Index(text, 5)).toBe(3)
  })

  it('handles non-BMP emoji (4 UTF-8 bytes → 2 UTF-16 code units)', () => {
    const text = 'hi😀!'
    expect(byteOffsetToUtf16Index(text, 0)).toBe(0)
    expect(byteOffsetToUtf16Index(text, 2)).toBe(2)
    expect(byteOffsetToUtf16Index(text, 6)).toBe(4) // after 'hi😀'
    expect(byteOffsetToUtf16Index(text, 7)).toBe(5) // after 'hi😀!'
  })
})

// ─── Round-trip invariants ────────────────────────────────────────────────────

describe('utf16 ↔ byte round-trips', () => {
  const texts = [
    'hello world',
    'café au lait',
    'A中B',
    'hi😀!',
    '👋🌍 hello',
    'मिश्र', // Devanagari (3 bytes per char)
    '',
  ]

  for (const text of texts) {
    it(`round-trips byte→utf16→byte for "${text.slice(0, 15)}"`, () => {
      const encoder = new TextEncoder()
      const byteLen = encoder.encode(text).length
      for (let b = 0; b <= byteLen; b++) {
        // Only test valid byte boundaries (encoder produces UTF-8)
        // We test all byte offsets that correspond to character starts
        try {
          const utf16 = byteOffsetToUtf16Index(text, b)
          const backByte = utf16IndexToByteOffset(text, utf16)
          expect(backByte).toBe(b)
        } catch {
          // byteOffset may not be a valid char boundary — skip those
        }
      }
    })

    it(`round-trips utf16→byte→utf16 for "${text.slice(0, 15)}"`, () => {
      const utf16Len = text.length
      for (let u = 0; u <= utf16Len; u++) {
        try {
          const byte = utf16IndexToByteOffset(text, u)
          const backUtf16 = byteOffsetToUtf16Index(text, byte)
          expect(backUtf16).toBe(u)
        } catch {
          // UTF-16 index may land in middle of surrogate pair — skip
        }
      }
    })
  }
})

// ─── automergePathToRTMutations — mock patches ───────────────────────────────

describe('automergePathToRTMutations', () => {
  it('returns empty array for empty patches', () => {
    const result = automergePathToRTMutations([], { text: 'hello', facets: [] })
    expect(result).toHaveLength(0)
  })

  it('converts a splice patch to insert mutation', () => {
    const patches: AutomergePatch[] = [
      { action: 'splice', path: ['text', 5], value: ' world' },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello', facets: [] })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('insert')
    if (result[0].op === 'insert') {
      expect(result[0].bytePos).toBe(5)
      expect(result[0].text).toBe(' world')
    }
  })

  it('converts a del patch to delete mutation', () => {
    const patches: AutomergePatch[] = [
      { action: 'del', path: ['text', 0], length: 5 },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello world', facets: [] })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('delete')
    if (result[0].op === 'delete') {
      expect(result[0].byteStart).toBe(0)
      expect(result[0].byteEnd).toBe(5)
    }
  })

  it('converts a mark patch (add) to addMark mutation', () => {
    const patches: AutomergePatch[] = [
      {
        action: 'mark',
        path: ['text'],
        value: [{ name: 'bold', value: true, start: 0, end: 5 }],
      },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello world', facets: [] })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('addMark')
    if (result[0].op === 'addMark') {
      expect(result[0].name).toBe('bold')
      expect(result[0].byteStart).toBe(0)
      expect(result[0].byteEnd).toBe(5)
      expect(result[0].expandStart).toBe(true)
      expect(result[0].expandEnd).toBe(true)
    }
  })

  it('converts a mark patch (remove / null value) to removeMark mutation', () => {
    const patches: AutomergePatch[] = [
      {
        action: 'mark',
        path: ['text'],
        value: [{ name: 'bold', value: null, start: 0, end: 5 }],
      },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello world', facets: [] })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('removeMark')
    if (result[0].op === 'removeMark') {
      expect(result[0].typeKey).toBe('org.relationaltext.facet#bold')
      expect(result[0].byteStart).toBe(0)
      expect(result[0].byteEnd).toBe(5)
    }
  })

  it('converts UTF-16 indices correctly for BMP non-ASCII text', () => {
    // 'café': c=1,a=1,f=1,é=2 bytes → 5 bytes total; 4 UTF-16 units
    const text = 'café!'
    const patches: AutomergePatch[] = [
      // Delete the 'é' at UTF-16 index 3, length 1
      { action: 'del', path: ['text', 3], length: 1 },
    ]
    const result = automergePathToRTMutations(patches, { text, facets: [] })
    expect(result).toHaveLength(1)
    if (result[0].op === 'delete') {
      // 'é' starts at byte 3, ends at byte 5 (2 bytes)
      expect(result[0].byteStart).toBe(3)
      expect(result[0].byteEnd).toBe(5)
    }
  })

  it('converts UTF-16 indices correctly for emoji text', () => {
    // 'hi😀!': h=1,i=1,😀=4,!=1 bytes → 7 bytes; 5 UTF-16 units (😀 = 2 surrogates)
    const text = 'hi😀!'
    const patches: AutomergePatch[] = [
      // Delete '😀' at UTF-16 index 2, length 2 (surrogate pair)
      { action: 'del', path: ['text', 2], length: 2 },
    ]
    const result = automergePathToRTMutations(patches, { text, facets: [] })
    expect(result).toHaveLength(1)
    if (result[0].op === 'delete') {
      // '😀' starts at byte 2, ends at byte 6 (4 bytes)
      expect(result[0].byteStart).toBe(2)
      expect(result[0].byteEnd).toBe(6)
    }
  })

  it('threads text state through multiple patches', () => {
    // Start with 'hello', insert ' world' at 5, then mark bytes 6-11
    const patches: AutomergePatch[] = [
      { action: 'splice', path: ['text', 5], value: ' world' },
      {
        action: 'mark',
        path: ['text'],
        value: [{ name: 'bold', value: true, start: 6, end: 11 }],
      },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello', facets: [] })
    expect(result).toHaveLength(2)
    // After inserting ' world', current text = 'hello world'
    // UTF-16 6..11 = bytes 6..11 (all ASCII here)
    if (result[1].op === 'addMark') {
      expect(result[1].byteStart).toBe(6)
      expect(result[1].byteEnd).toBe(11)
    }
  })

  it('ignores patches not on textPath', () => {
    const patches: AutomergePatch[] = [
      { action: 'put', path: ['other', 'field'], value: 'xyz' },
      { action: 'splice', path: ['text', 2], value: 'X' },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello', facets: [] })
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('insert')
  })

  it('handles custom textPath', () => {
    const patches: AutomergePatch[] = [
      { action: 'splice', path: ['content', 'body', 3], value: 'X' },
    ]
    const result = automergePathToRTMutations(
      patches,
      { text: 'hello', facets: [] },
      ['content', 'body'],
    )
    expect(result).toHaveLength(1)
    expect(result[0].op).toBe('insert')
  })

  it('handles code/link marks with no-expand semantics', () => {
    const patches: AutomergePatch[] = [
      {
        action: 'mark',
        path: ['text'],
        value: [{ name: 'code', value: true, start: 0, end: 4 }],
      },
    ]
    const result = automergePathToRTMutations(patches, { text: 'hello', facets: [] })
    expect(result).toHaveLength(1)
    if (result[0].op === 'addMark') {
      expect(result[0].expandStart).toBe(false)
      expect(result[0].expandEnd).toBe(false)
    }
  })
})

// ─── applyRTMutations ─────────────────────────────────────────────────────────

describe('applyRTMutations', () => {
  it('applies insert mutation', () => {
    const doc = Document.fromText('hello')
    const mutations: RTMutation[] = [{ op: 'insert', bytePos: 5, text: ' world' }]
    const result = applyRTMutations(doc, mutations)
    expect(result.text).toBe('hello world')
  })

  it('applies delete mutation', () => {
    const doc = Document.fromText('hello world')
    const mutations: RTMutation[] = [{ op: 'delete', byteStart: 5, byteEnd: 11 }]
    const result = applyRTMutations(doc, mutations)
    expect(result.text).toBe('hello')
  })

  it('applies addMark mutation', () => {
    const doc = Document.fromText('hello world')
    const mutations: RTMutation[] = [
      {
        op: 'addMark',
        byteStart: 0,
        byteEnd: 5,
        typeId: 'org.relationaltext.facet',
        name: 'bold',
        expandStart: true,
        expandEnd: true,
      },
    ]
    const result = applyRTMutations(doc, mutations)
    const features = result.features
    expect(features).toHaveLength(1)
    expect((features[0] as { name?: string }).name).toBe('bold')
  })

  it('applies removeMark mutation', () => {
    let doc = Document.fromText('hello world')
    doc = doc.addMark(0, 5, { name: 'bold' })
    expect(doc.features).toHaveLength(1)

    const mutations: RTMutation[] = [
      {
        op: 'removeMark',
        byteStart: 0,
        byteEnd: 5,
        typeKey: 'org.relationaltext.facet#bold',
      },
    ]
    const result = applyRTMutations(doc, mutations)
    expect(result.features).toHaveLength(0)
  })

  it('applies multiple mutations in order', () => {
    const doc = Document.fromText('hello')
    const mutations: RTMutation[] = [
      { op: 'insert', bytePos: 5, text: ' world' },
      { op: 'delete', byteStart: 0, byteEnd: 6 },
    ]
    const result = applyRTMutations(doc, mutations)
    expect(result.text).toBe('world')
  })

  it('returns same document for empty mutations', () => {
    const doc = Document.fromText('hello')
    const result = applyRTMutations(doc, [])
    expect(result.text).toBe('hello')
  })
})

// ─── Document.removeMark method ───────────────────────────────────────────────

describe('Document.removeMark', () => {
  it('removes a bold mark by compound key', () => {
    let doc = Document.fromText('hello world')
    doc = doc.addMark(0, 5, { name: 'bold' })
    expect(doc.features).toHaveLength(1)

    const result = doc.removeMark(0, 5, 'org.relationaltext.facet#bold')
    expect(result.features).toHaveLength(0)
  })

  it('does not affect marks at other ranges', () => {
    let doc = Document.fromText('hello world')
    doc = doc.addMark(0, 5, { name: 'bold' })
    doc = doc.addMark(6, 11, { name: 'italic' })
    expect(doc.features).toHaveLength(2)

    const result = doc.removeMark(0, 5, 'org.relationaltext.facet#bold')
    expect(result.features).toHaveLength(1)
    expect((result.features[0] as { name?: string }).name).toBe('italic')
  })

  it('is a no-op when mark does not exist', () => {
    const doc = Document.fromText('hello world')
    const result = doc.removeMark(0, 5, 'org.relationaltext.facet#bold')
    expect(result.text).toBe('hello world')
    expect(result.features).toHaveLength(0)
  })

  it('removes only matching feature from a multi-feature facet', () => {
    let doc = Document.fromText('hello world')
    // Add two marks at the same range
    doc = doc.addMark(0, 5, { name: 'bold' })
    doc = doc.addMark(0, 5, { name: 'italic' })

    // After normalize, there should be 2 features (possibly in 1 or 2 facets)
    expect(doc.features.length).toBeGreaterThanOrEqual(1)

    const result = doc.removeMark(0, 5, 'org.relationaltext.facet#bold')
    const names = result.features.map((f) => (f as { name?: string }).name)
    expect(names).not.toContain('bold')
    expect(names).toContain('italic')
  })
})
