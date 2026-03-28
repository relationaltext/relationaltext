import { beforeAll, describe, expect, it } from 'vitest'
import { from, to, Document } from '../src/registry.js'
import { lensGraph } from '../src/lens.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(async () => {
  registerTestFormats('mastodon', 'html')
})

/**
 * Import HTML as Mastodon: parse as HTML, then lens-transform to mastodon namespace.
 * This mirrors what the old `fromMastodon()` did internally.
 */
async function fromMastodon(html: string): Promise<Document> {
  const htmlDoc = await from('html', html)
  const mastodonJson = lensGraph.autoTransform(htmlDoc._raw(), 'org.joinmastodon.facet')
  return Document.parse(mastodonJson)
}

/**
 * Export mastodon document to HTML: lens-transform to HTML namespace, then export.
 */
async function toMastodon(doc: Document): Promise<string> {
  return to('html', doc)
}

// ─── fromMastodon — basic parsing ─────────────────────────────────────────────

describe('fromMastodon — basic parsing', () => {
  it('parses a simple paragraph', async () => {
    const doc = await fromMastodon('<p>hello</p>')
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
    const block = hir.find((n) => n.type === 'block' && n.name === 'p')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const textNode = block.children.find((c) => c.type === 'text')
      expect(textNode?.type === 'text' && textNode.content).toBe('hello')
    }
  })

  it('parses <strong> as strong mark', async () => {
    const doc = await fromMastodon('<p><strong>bold</strong></p>')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'p')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.joinmastodon.facet#strong'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses <em> as em mark', async () => {
    const doc = await fromMastodon('<p><em>italic</em></p>')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'p')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const emSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.joinmastodon.facet#em'),
      )
      expect(emSeg).toBeDefined()
    }
  })

  it('parses <a href> as link entity', async () => {
    const doc = await fromMastodon('<p><a href="https://example.com">link</a></p>')
    const facets = doc.facets
    const linkFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'a'),
    )
    expect(linkFacet).toBeDefined()
    const linkFeature = linkFacet?.features[0] as any
    expect(linkFeature?.href).toBe('https://example.com')
  })

  it('parses <br /> as br entity', async () => {
    const doc = await fromMastodon('<p>text<br />more</p>')
    const facets = doc.facets
    const brFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'br'),
    )
    expect(brFacet).toBeDefined()
  })

  it('parses h-card mention', async () => {
    const html = '<p><span class="h-card" translate="no"><a href="https://mastodon.social/@user" class="u-url mention">@<span>user</span></a></span></p>'
    const doc = await fromMastodon(html)
    const facets = doc.facets
    const mentionFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'mention'),
    )
    expect(mentionFacet).toBeDefined()
    const mentionFeature = mentionFacet?.features[0] as any
    expect(mentionFeature?.href).toBe('https://mastodon.social/@user')
    expect(doc.text).toContain('@user')
  })

  it('parses hashtag link', async () => {
    const html = '<p><a href="/tags/foo" class="mention hashtag" rel="tag">#<span>foo</span></a></p>'
    const doc = await fromMastodon(html)
    const facets = doc.facets
    const hashtagFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'hashtag'),
    )
    expect(hashtagFacet).toBeDefined()
    const hashtagFeature = hashtagFacet?.features[0] as any
    expect(hashtagFeature?.href).toBe('/tags/foo')
    expect(doc.text).toContain('#foo')
  })

  it('parses <pre> as pre block', async () => {
    const doc = await fromMastodon('<pre>code here</pre>')
    const hir = doc.toHIR()
    const preBlock = hir.find((n) => n.type === 'block' && n.name === 'pre')
    expect(preBlock).toBeDefined()
    if (preBlock?.type === 'block') {
      const textContent = preBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(textContent).toContain('code here')
    }
  })

  it('parses multiple paragraphs', async () => {
    const doc = await fromMastodon('<p>first</p><p>second</p>')
    const hir = doc.toHIR()
    const paragraphs = hir.filter((n) => n.type === 'block' && n.name === 'p')
    expect(paragraphs.length).toBe(2)
  })

  it('parses mixed inline content', async () => {
    const doc = await fromMastodon('<p>hello <strong>bold</strong> and <em>italic</em></p>')
    const facets = doc.facets
    const strongFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'strong'),
    )
    const emFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.joinmastodon.facet' && (feat as any).name === 'em'),
    )
    expect(strongFacet).toBeDefined()
    expect(emFacet).toBeDefined()
  })

  it('parses empty paragraph gracefully', async () => {
    const doc = await fromMastodon('<p></p>')
    expect(doc).toBeDefined()
    expect(doc.text).toBeDefined()
  })
})

// ─── Round-trip: fromMastodon → toMastodon ────────────────────────────────────

describe('round-trip: fromMastodon → toMastodon', () => {
  it('round-trips bold text', async () => {
    const html = '<p><strong>bold</strong></p>'
    const doc = await fromMastodon(html)
    const out = await toMastodon(doc)
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<p>')
  })

  it('round-trips a link', async () => {
    const html = '<p><a href="https://example.com">click here</a></p>'
    const doc = await fromMastodon(html)
    const out = await toMastodon(doc)
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('click here')
  })

  it('round-trips a paragraph', async () => {
    const html = '<p>hello world</p>'
    const doc = await fromMastodon(html)
    const out = await toMastodon(doc)
    expect(out).toContain('<p>hello world</p>')
  })
})

// ─── Cross-format: fromMastodon → toHTML ──────────────────────────────────────

describe('cross-format: fromMastodon → toHTML', () => {
  it('bold becomes <strong> in HTML output', async () => {
    const doc = await fromMastodon('<p><strong>bold</strong></p>')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('em becomes <em> in HTML output', async () => {
    const doc = await fromMastodon('<p><em>italic</em></p>')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('link becomes <a href="..."> in HTML output', async () => {
    const doc = await fromMastodon('<p><a href="https://example.com">link text</a></p>')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('link text')
  })

  it('mention becomes a link to profile in HTML output', async () => {
    const html = '<p><span class="h-card"><a href="https://mastodon.social/@alice" class="u-url mention">@<span>alice</span></a></span></p>'
    const doc = await fromMastodon(html)
    const out = (await to('html', doc)).trim()
    // Mention maps to a link via the lens
    expect(out).toContain('href="https://mastodon.social/@alice"')
  })

  it('hashtag becomes a link in HTML output', async () => {
    const html = '<p><a href="/tags/rust" class="mention hashtag" rel="tag">#<span>rust</span></a></p>'
    const doc = await fromMastodon(html)
    const out = (await to('html', doc)).trim()
    expect(out).toContain('href="/tags/rust"')
  })
})
