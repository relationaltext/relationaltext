import { beforeAll, describe, expect, it } from 'vitest'
import { detectFacets } from '../src/bluesky-utils.js'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
beforeAll(() => {
  registerTestFormats('bluesky')
})

// ─── fromBluesky ──────────────────────────────────────────────────────────────

describe('fromBluesky — parses atproto facets', () => {
  it('parses a mention facet', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: '@alice hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 6 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    }))
    expect(doc.text).toBe('@alice hello')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'app.bsky.richtext.facet#mention'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      const feat = facet.features[0]!
      expect((feat as Record<string, unknown>)['did']).toBe('did:plc:abc')
    }
  })

  it('parses a link facet', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: 'Visit https://example.com today',
      facets: [
        {
          index: { byteStart: 6, byteEnd: 25 },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }],
        },
      ],
    }))
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'app.bsky.richtext.facet#link'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      const feat = facet.features[0]!
      expect((feat as Record<string, unknown>)['uri']).toBe('https://example.com')
    }
  })

  it('parses a tag facet', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: 'Hello #atproto',
      facets: [
        {
          index: { byteStart: 6, byteEnd: 14 },
          features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'atproto' }],
        },
      ],
    }))
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'app.bsky.richtext.facet#tag'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      const feat = facet.features[0]!
      expect((feat as Record<string, unknown>)['tag']).toBe('atproto')
    }
  })

  it('accepts a JSON string', async () => {
    const doc = await from('bluesky', JSON.stringify({ text: 'hello', facets: [] }))
    expect(doc.text).toBe('hello')
  })

  it('normalizes facet order on parse', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: 'hello world',
      facets: [
        {
          index: { byteStart: 6, byteEnd: 11 },
          features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'world' }],
        },
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    }))
    expect(doc.facets[0]!.index.byteStart).toBe(0)
    expect(doc.facets[1]!.index.byteStart).toBe(6)
  })
})

// ─── toBluesky ────────────────────────────────────────────────────────────────

describe('toBluesky — renders to wire format', () => {
  it('returns the document text', async () => {
    const doc = await from('bluesky', JSON.stringify({ text: 'Hello world', facets: [] }))
    const result = JSON.parse(await to('bluesky', doc))
    expect(result.text).toBe('Hello world')
  })

  it('preserves mention facets', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: '@alice hello',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 6 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    }))
    const result = JSON.parse(await to('bluesky', doc))
    expect(result.facets).toHaveLength(1)
    expect(result.facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#mention')
  })

  it('preserves link facets', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: 'See https://example.com',
      facets: [
        {
          index: { byteStart: 4, byteEnd: 23 },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }],
        },
      ],
    }))
    const result = JSON.parse(await to('bluesky', doc))
    expect(result.facets).toHaveLength(1)
    expect(result.facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#link')
  })

  it('strips mark and block facets, keeps entity facets', async () => {
    const doc = await from('bluesky', JSON.stringify({
      text: 'Hello @alice',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'org.relationaltext.richtext.mark', name: 'bold', parents: [] }],
        },
        {
          index: { byteStart: 6, byteEnd: 12 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc' }],
        },
      ],
    }))
    const result = JSON.parse(await to('bluesky', doc))
    expect(result.facets).toHaveLength(1)
    expect(result.facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#mention')
  })

  it('accepts a DocumentJSON directly', async () => {
    const json = {
      text: '#rust',
      facets: [
        {
          index: { byteStart: 0, byteEnd: 5 },
          features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'rust' }],
        },
      ],
    }
    const result = JSON.parse(await to('bluesky', json))
    expect(result.text).toBe('#rust')
    expect(result.facets).toHaveLength(1)
  })
})

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('fromBluesky → toBluesky round-trip', () => {
  it('preserves a multi-feature post', async () => {
    const original = {
      text: 'Check out @bsky.app for updates #atproto https://bsky.app',
      facets: [
        {
          index: { byteStart: 10, byteEnd: 18 },
          features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:z72i7hdynmk6r22z27h6tvur' }],
        },
        {
          index: { byteStart: 32, byteEnd: 40 },
          features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'atproto' }],
        },
        {
          index: { byteStart: 41, byteEnd: 57 },
          features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://bsky.app' }],
        },
      ],
    }
    const result = JSON.parse(await to('bluesky', await from('bluesky', JSON.stringify(original))))
    expect(result.text).toBe(original.text)
    expect(result.facets).toHaveLength(3)
    expect(result.facets.map((f) => f.features[0]!.$type)).toEqual([
      'app.bsky.richtext.facet#mention',
      'app.bsky.richtext.facet#tag',
      'app.bsky.richtext.facet#link',
    ])
  })
})

// ─── detectFacets ─────────────────────────────────────────────────────────────

describe('detectFacets', () => {
  it('detects @mention', async () => {
    const facets = detectFacets('Hello @alice.bsky.social world')
    expect(facets).toHaveLength(1)
    expect(facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#mention')
  })

  it('detected mention has did field', async () => {
    const facets = detectFacets('Hello @alice.bsky.social world')
    const feat = facets[0]!.features[0]!
    if (feat.$type === 'app.bsky.richtext.facet#mention') {
      expect(feat.did).toBe('at://alice.bsky.social')
    }
  })

  it('detects #hashtag', async () => {
    const facets = detectFacets('Check out #rust')
    expect(facets).toHaveLength(1)
    expect(facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#tag')
  })

  it('detects https:// URL', async () => {
    const facets = detectFacets('Visit https://example.com today')
    expect(facets).toHaveLength(1)
    expect(facets[0]!.features[0]!.$type).toBe('app.bsky.richtext.facet#link')
  })

  it('strips trailing period from URL', async () => {
    const facets = detectFacets('See https://example.com.')
    expect(facets).toHaveLength(1)
    const feat = facets[0]!.features[0]!
    if (feat.$type === 'app.bsky.richtext.facet#link') {
      expect(feat.uri).not.toMatch(/\.$/)
    }
  })

  it('detects multiple features in one string', async () => {
    const facets = detectFacets('@alice #rust https://example.com')
    expect(facets).toHaveLength(3)
  })

  it('returns facets in canonical sort order', async () => {
    const facets = detectFacets('https://example.com @alice')
    expect(facets[0]!.index.byteStart).toBeLessThan(facets[1]!.index.byteStart)
  })
})
