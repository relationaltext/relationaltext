import { beforeAll, describe, expect, it } from 'vitest'
import { Document, ensureRelationalTextLexicon } from '../src/core.js'

beforeAll(() => {
  ensureRelationalTextLexicon()
})

// ─── Document construction ─────────────────────────────────────────────────

describe('Document.fromText', () => {
  it('creates a document with empty facets', () => {
    const doc = Document.fromText('Hello world')
    expect(doc.text).toBe('Hello world')
    expect(doc.facets).toHaveLength(0)
  })
})

describe('Document.fromJSON', () => {
  it('parses a document with backward-compat mention facet', () => {
    const doc = Document.fromJSON({
      text: '@alice hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 6 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    })
    expect(doc.text).toBe('@alice hello')
    expect(doc.facets).toHaveLength(1)
  })

  it('normalizes facet order on parse', () => {
    const doc = Document.fromJSON({
      text: 'Hello world',
      facets: [
        {
          index: { byteStart: 6, byteEnd: 11 },
          features: [{ $type: 'org.relationaltext.facet', name: 'bold', parents: [] }],
        },
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.relationaltext.facet', name: 'italic', parents: [] }],
        },
      ],
    })
    expect(doc.facets[0]!.index.byteStart).toBe(0)
    expect(doc.facets[1]!.index.byteStart).toBe(6)
  })
})

// ─── Text mutations ────────────────────────────────────────────────────────

describe('Document#insertText', () => {
  it('inserts text and shifts facets after insertion point', () => {
    const doc = Document.fromText('hello world')
      .addMark(6, 11, { name: 'bold' })
    // Insert "big " at byte 5 (before the mark at 6)
    const updated = doc.insertText(5, 'big ')
    expect(updated.text).toBe('hellobig  world')
    expect(updated.facets[0]!.index.byteStart).toBe(10)
    expect(updated.facets[0]!.index.byteEnd).toBe(15)
  })

  it('expands bold mark when inserting at its start boundary', () => {
    const doc = Document.fromText('hello world')
      .addMark(6, 11, { name: 'bold' })
    const updated = doc.insertText(6, 'big ')
    expect(updated.text).toBe('hello big world')
    // Bold has expandStart=true, so start stays at 6, end moves to 15
    expect(updated.facets[0]!.index.byteStart).toBe(6)
    expect(updated.facets[0]!.index.byteEnd).toBe(15)
  })

  it('does not expand code mark when inserting at its boundary', () => {
    const doc = Document.fromText('hello world')
      .addMark(6, 11, { name: 'code' })
    const updated = doc.insertText(6, 'big ')
    // Code has expandStart=false, so it shifts right
    expect(updated.facets[0]!.index.byteStart).toBe(10)
    expect(updated.facets[0]!.index.byteEnd).toBe(15)
  })
})

describe('Document#deleteRange', () => {
  it('removes facets entirely within the deleted range', () => {
    const doc = Document.fromText('hello world')
      .addMark(6, 11, { name: 'bold' })
    const updated = doc.deleteRange(4, 11)
    expect(updated.facets).toHaveLength(0)
  })

  it('shifts facets after the deleted range', () => {
    const doc = Document.fromText('hello world')
      .addMark(6, 11, { name: 'bold' })
    const updated = doc.deleteRange(0, 6)
    expect(updated.text).toBe('world')
    expect(updated.facets[0]!.index.byteStart).toBe(0)
    expect(updated.facets[0]!.index.byteEnd).toBe(5)
  })
})

// ─── Annotations ──────────────────────────────────────────────────────────

describe('Document#addMark', () => {
  it('adds a bold mark and sorts facets', () => {
    const doc = Document.fromText('Hello world')
      .addMark(0, 5, { name: 'bold' })
    expect(doc.facets).toHaveLength(1)
    expect(doc.facets[0]!.features[0]!.$type).toBe('org.relationaltext.facet')
  })
})

// ─── Flat features accessor ────────────────────────────────────────────────

describe('Document#features', () => {
  it('returns empty array when there are no facets', () => {
    const doc = Document.fromText('Hello')
    expect(doc.features).toHaveLength(0)
  })

  it('flattens features from multiple facets and includes index', () => {
    const doc = Document.fromText('Hello world')
      .addMark(0, 5, { name: 'bold' })
      .addMark(6, 11, { name: 'italic' })
    expect(doc.features).toHaveLength(2)
    expect(doc.features[0]!.index).toEqual({ byteStart: 0, byteEnd: 5 })
    expect(doc.features[1]!.index).toEqual({ byteStart: 6, byteEnd: 11 })
  })

  it('flattens multiple features from a single facet', () => {
    const doc = Document.fromJSON({
      text: '@alice hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 6 },
        features: [
          { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' },
          { $type: 'org.relationaltext.facet', name: 'bold', parents: [] },
        ],
      }],
    })
    expect(doc.features).toHaveLength(2)
    expect(doc.features[0]!.index).toEqual({ byteStart: 0, byteEnd: 6 })
    expect(doc.features[1]!.index).toEqual({ byteStart: 0, byteEnd: 6 })
    expect(doc.features[0]!.$type).toBe('app.bsky.richtext.facet#mention')
    expect(doc.features[1]!.$type).toBe('org.relationaltext.facet')
  })

  it('supports flat filtering without nested loops', () => {
    const doc = Document.fromJSON({
      text: 'Hello world',
      facets: [
        { index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'org.relationaltext.facet', name: 'bold', parents: [] }] },
        { index: { byteStart: 6, byteEnd: 11 }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }] },
      ],
    })
    const marks = doc.features.filter(f => f.$type === 'org.relationaltext.facet')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.index.byteStart).toBe(0)
  })
})

describe('Document#addBlock', () => {
  it('adds a paragraph block', () => {
    const doc = Document.fromText('Hello\n')
      .addBlock(0, 6, { name: 'paragraph', parents: [] })
    expect(doc.facets[0]!.features[0]!.$type).toBe('org.relationaltext.facet')
  })
})


// ─── Serialization ────────────────────────────────────────────────────────

describe('Document#toJSON', () => {
  it('round-trips a document with facets', () => {
    const original = Document.fromJSON({
      text: '@alice hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 6 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    })
    const json = original.toJSON()
    const restored = Document.fromJSON(json)
    expect(restored.text).toBe(original.text)
    expect(restored.facets).toHaveLength(1)
  })
})

// ─── HIR ──────────────────────────────────────────────────────────────────

describe('Document#toHIR', () => {
  it('plain text produces top-level inline text nodes (no implicit block)', () => {
    const doc = Document.fromText('Hello world')
    const hir = doc.toHIR()
    expect(hir).toHaveLength(1)
    expect(hir[0]!.type).toBe('text')
    if (hir[0]!.type === 'text') {
      expect(hir[0]!.content).toBe('Hello world')
    }
  })

  it('bold mark splits text into segments', () => {
    // New wire format: \uFFFC marker at [0,3), content = "Hello world" at [3,14)
    // Bold mark at [9,14) covers "world" (relative [6,11) within content)
    const doc = Document.fromJSON({
      text: '\uFFFCHello world',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 3 },
          features: [{ $type: 'org.relationaltext.facet', name: 'paragraph', parents: [] }],
        },
        {
          index: { byteStart: 9, byteEnd: 14 },
          features: [{ $type: 'org.relationaltext.facet', name: 'bold' }],
        },
      ],
    })
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const children = hir[0]!.children
      expect(children).toHaveLength(2)
      const unbolded = children.find(
        (c) => c.type === 'text' && c.marks.length === 0,
      )
      const bolded = children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.relationaltext.facet#bold'),
      )
      expect(unbolded).toBeDefined()
      expect(bolded).toBeDefined()
    }
  })

  it('list items inside blockquote get a container node', () => {
    // New wire format: \uFFFC marker at [0,3), \n marker at [9,10)
    // text = "\uFFFCQuoted\nItem": "Quoted" at [3,9), "Item" at [10,14)
    const doc = Document.fromJSON({
      text: '\uFFFCQuoted\nItem',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 3 },
          features: [{ $type: 'org.relationaltext.facet', name: 'blockquote-marker', parents: [] }],
        },
        {
          index: { byteStart: 9, byteEnd: 10 },
          features: [
            {
              $type: 'org.relationaltext.facet',
              name: 'list-item-marker',
              parents: ['blockquote'],
            },
          ],
        },
      ],
    })
    const hir = doc.toHIR()
    expect(hir).toHaveLength(2)
    const container = hir.find((n) => n.type === 'container')
    expect(container).toBeDefined()
    if (container?.type === 'container') {
      expect(container.name).toBe('blockquote')
      expect(container.children).toHaveLength(1)
    }
  })
})


