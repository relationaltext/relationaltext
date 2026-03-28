/**
 * Tests for the RelationalText ↔ Layers bridge.
 *
 * Verifies bidirectional conversion between RT's facet model and
 * Layers' annotation model, including complement-tracked round-trips.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { Document, initRelationalText } from '../src/core.js'
import { toLayers, fromLayers, type Expression, type AnnotationLayer } from '../src/layers.js'
import type { DocumentJSON } from '../src/types.js'

beforeAll(async () => {
  await initRelationalText()
})

// ─── toLayers ────────────────────────────────────────────────────────────────

describe('toLayers', () => {
  it('converts plain text document', () => {
    const doc = Document.fromText('hello world')
    const result = toLayers(doc)

    expect(result.expression.text).toBe('hello world')
    expect(result.expression.kind).toBe('document')
    expect(result.annotationLayers).toHaveLength(1)
    expect(result.annotationLayers[0].annotations).toHaveLength(0)
  })

  it('converts document with inline mark', () => {
    const doc: DocumentJSON = {
      text: 'hello world',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{ $type: 'org.relationaltext.facet', name: 'bold' }] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const result = toLayers(doc)

    expect(result.annotationLayers[0].annotations).toHaveLength(1)
    const ann = result.annotationLayers[0].annotations[0]
    expect(ann.anchor.byteStart).toBe(0)
    expect(ann.anchor.byteEnd).toBe(5)
    expect(ann.label).toBe('org.relationaltext.facet#bold')
    expect(ann.value.name).toBe('bold')
  })

  it('preserves byte range identity', () => {
    const doc: DocumentJSON = {
      text: 'abcdef',
      facets: [{
        index: { byteStart: 2, byteEnd: 4 },
        features: [{ $type: 'org.relationaltext.facet', name: 'italic' }] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const result = toLayers(doc)
    const ann = result.annotationLayers[0].annotations[0]
    expect(ann.anchor.$type).toBe('pub.layers.defs#span')
    expect(ann.anchor.byteStart).toBe(2)
    expect(ann.anchor.byteEnd).toBe(4)
  })

  it('captures expand semantics in complement', () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{
          $type: 'org.relationaltext.facet',
          name: 'bold',
          expandStart: true,
          expandEnd: true,
        }] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const result = toLayers(doc)
    const key = '0:5:org.relationaltext.facet#bold'
    expect(result.complement.expandSemantics[key]).toEqual({
      expandStart: true,
      expandEnd: true,
    })
  })

  it('records facet grouping in complement when multiple features share a range', () => {
    const doc: DocumentJSON = {
      text: 'hello',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [
          { $type: 'org.relationaltext.facet', name: 'bold' },
          { $type: 'org.relationaltext.facet', name: 'link', url: 'https://example.com' },
        ] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const result = toLayers(doc)
    expect(result.annotationLayers[0].annotations).toHaveLength(2)
    expect(result.complement.facetGroups).toHaveLength(1)
    expect(result.complement.facetGroups[0].labels).toEqual([
      'org.relationaltext.facet#bold',
      'org.relationaltext.facet#link',
    ])
  })
})

// ─── fromLayers ──────────────────────────────────────────────────────────────

describe('fromLayers', () => {
  it('converts expression to document', () => {
    const expr: Expression = { text: 'hello world', kind: 'document' }
    const layers: AnnotationLayer[] = [{ annotations: [] }]
    const doc = fromLayers(expr, layers)
    expect(doc.toJSON().text).toBe('hello world')
  })

  it('converts annotations to facets', () => {
    const expr: Expression = { text: 'hello world', kind: 'document' }
    const layers: AnnotationLayer[] = [{
      annotations: [{
        anchor: { $type: 'pub.layers.defs#span', byteStart: 0, byteEnd: 5 },
        label: 'org.relationaltext.facet#bold',
        value: { name: 'bold' },
      }],
    }]
    const doc = fromLayers(expr, layers)
    const json = doc.toJSON()
    expect(json.facets).toHaveLength(1)
    expect(json.facets[0].index.byteStart).toBe(0)
    expect(json.facets[0].index.byteEnd).toBe(5)
  })
})

// ─── Round-trip ──────────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('plain text survives round-trip', () => {
    const original = Document.fromText('hello world')
    const { expression, annotationLayers, complement } = toLayers(original)
    const restored = fromLayers(expression, annotationLayers, complement)
    expect(restored.toJSON().text).toBe('hello world')
  })

  it('marked text survives round-trip with complement', () => {
    const original: DocumentJSON = {
      text: 'hello world',
      facets: [{
        index: { byteStart: 0, byteEnd: 5 },
        features: [{
          $type: 'org.relationaltext.facet',
          name: 'bold',
          expandStart: true,
          expandEnd: true,
        }] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const { expression, annotationLayers, complement } = toLayers(original)
    const restored = fromLayers(expression, annotationLayers, complement)
    const json = restored.toJSON()

    expect(json.text).toBe('hello world')
    expect(json.facets).toHaveLength(1)
    expect(json.facets[0].index.byteStart).toBe(0)
    expect(json.facets[0].index.byteEnd).toBe(5)

    const feature = json.facets[0].features[0] as Record<string, unknown>
    expect(feature['$type']).toBe('org.relationaltext.facet')
    expect(feature['name']).toBe('bold')
    expect(feature['expandStart']).toBe(true)
    expect(feature['expandEnd']).toBe(true)
  })

  it('multiple facets survive round-trip', () => {
    const original: DocumentJSON = {
      text: 'hello world test',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.relationaltext.facet', name: 'bold' }] as DocumentJSON['facets'][0]['features'],
        },
        {
          index: { byteStart: 6, byteEnd: 11 },
          features: [{ $type: 'org.relationaltext.facet', name: 'italic' }] as DocumentJSON['facets'][0]['features'],
        },
      ],
    }
    const { expression, annotationLayers, complement } = toLayers(original)
    const restored = fromLayers(expression, annotationLayers, complement)
    const json = restored.toJSON()

    expect(json.facets).toHaveLength(2)
    expect(json.facets[0].index.byteStart).toBe(0)
    expect(json.facets[1].index.byteStart).toBe(6)
  })

  it('document without complement uses defaults', () => {
    const expr: Expression = { text: 'hello', kind: 'document' }
    const layers: AnnotationLayer[] = [{
      annotations: [{
        anchor: { $type: 'pub.layers.defs#span', byteStart: 0, byteEnd: 5 },
        label: 'org.relationaltext.facet#bold',
        value: { name: 'bold' },
      }],
    }]
    // No complement — should still produce a valid document
    const doc = fromLayers(expr, layers)
    const json = doc.toJSON()
    expect(json.text).toBe('hello')
    expect(json.facets).toHaveLength(1)
  })

  it('link with url attribute survives round-trip', () => {
    const original: DocumentJSON = {
      text: 'click here',
      facets: [{
        index: { byteStart: 0, byteEnd: 10 },
        features: [{
          $type: 'org.relationaltext.facet',
          name: 'link',
          url: 'https://example.com',
        }] as DocumentJSON['facets'][0]['features'],
      }],
    }
    const { expression, annotationLayers, complement } = toLayers(original)
    const restored = fromLayers(expression, annotationLayers, complement)
    const json = restored.toJSON()

    const feature = json.facets[0].features[0] as Record<string, unknown>
    expect(feature['name']).toBe('link')
    expect(feature['url']).toBe('https://example.com')
  })
})
