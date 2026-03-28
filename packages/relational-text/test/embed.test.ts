import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import { Document } from '../src/core.js'
import type { DocumentJSON } from '../src/types.js'

// ─── HTML embed import ─────────────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('html', 'markdown')
})

describe('fromHTML — embed (iframe)', () => {
  it('parses a bare iframe as an iframe block with raw attrs', async () => {
    const doc = await from('html', '<iframe src="https://www.youtube.com/embed/abc123"></iframe>')
    const hir = doc.toHIR()
    expect(hir).toHaveLength(1)
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('iframe')
      expect(hir[0]!.attrs['src']).toBe('https://www.youtube.com/embed/abc123')
    }
  })

  it('preserves other iframe attributes', async () => {
    const doc = await from('html', '<iframe src="https://example.com/embed" title="My embed"></iframe>')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.attrs['src']).toBe('https://example.com/embed')
      expect(hir[0]!.attrs['title']).toBe('My embed')
    }
  })

  it('parses a figure with iframe and figcaption', async () => {
    const doc = await from('html', '<figure data-embed-type="youtube"><iframe src="https://www.youtube.com/embed/xyz"></iframe><figcaption>My Video</figcaption></figure>')
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
    function findIframe(n: (typeof hir)[0]): typeof hir[0] | null {
      if (n && n.type === 'block' && n.name === 'iframe') return n
      if (n && n.type === 'container' && 'children' in n) {
        for (const c of n.children as (typeof hir)[]) {
          const found = findIframe(c)
          if (found) return found
        }
      }
      return null
    }
    const iframeBlock = findIframe(hir[0]!)
    expect(iframeBlock).toBeDefined()
    if (iframeBlock && iframeBlock.type === 'block') {
      expect(iframeBlock.attrs['src']).toBe('https://www.youtube.com/embed/xyz')
    }
  })
})

// ─── HTML embed export ─────────────────────────────────────────────────────────

describe('toHTML — iframe block', () => {
  it('renders an iframe block as <iframe src="...">', async () => {
    const doc: DocumentJSON = {
      text: '\uFFFC',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.w3c.html.facet', name: 'iframe', attrs: { src: 'https://www.youtube.com/embed/abc' } }],
      }],
    }
    const html = await to('html', doc)
    expect(html).toContain('<iframe src="https://www.youtube.com/embed/abc"')
  })

  it('renders iframe with title as title attribute', async () => {
    const doc: DocumentJSON = {
      text: '\uFFFC',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.w3c.html.facet', name: 'iframe', attrs: { src: 'https://www.youtube.com/embed/abc', title: 'My Video' } }],
      }],
    }
    const html = await to('html', doc)
    expect(html).toContain('title="My Video"')
  })

  it('round-trips iframe through HTML', async () => {
    const original = '<iframe src="https://www.youtube.com/embed/abc"></iframe>'
    const doc = await from('html', original)
    const output = await to('html', doc)
    expect(output).toContain('https://www.youtube.com/embed/abc')
  })
})

// ─── Markdown embed import ─────────────────────────────────────────────────────

describe('fromMarkdown — embed', () => {
  it('parses ![embed:youtube](url) as embed block', async () => {
    const doc = await from('markdown', '![embed:youtube](https://www.youtube.com/embed/abc)\n')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('embed')
      expect(hir[0]!.attrs['embedType']).toBe('youtube')
      expect(hir[0]!.attrs['url']).toBe('https://www.youtube.com/embed/abc')
    }
  })

  it('parses embed with title from alt text', async () => {
    const doc = await from('markdown', '![embed:youtube My Video](https://www.youtube.com/embed/abc)\n')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.attrs['title']).toBe('My Video')
    }
  })

  it('does not treat normal images as embeds', async () => {
    const doc = await from('markdown', '![alt text](https://example.com/img.png)\n')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).not.toBe('embed')
    }
  })
})

// ─── Markdown embed export ─────────────────────────────────────────────────────

describe('toMarkdown — embed block', () => {
  it('renders embed block as ![embed:type](url)', async () => {
    const doc: DocumentJSON = {
      text: '\uFFFC',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.commonmark.facet', name: 'embed', attrs: { url: 'https://www.youtube.com/embed/abc', embedType: 'youtube' } }],
      }],
    }
    const md = await to('markdown', doc)
    expect(md).toContain('![embed:youtube](https://www.youtube.com/embed/abc)')
  })

  it('renders embed with title in alt text', async () => {
    const doc: DocumentJSON = {
      text: '\uFFFC',
      facets: [{
        index: { byteStart: 0, byteEnd: 3 },
        features: [{ $type: 'org.commonmark.facet', name: 'embed', attrs: { url: 'https://www.youtube.com/embed/abc', embedType: 'youtube', title: 'My Video' } }],
      }],
    }
    const md = await to('markdown', doc)
    expect(md).toContain('![embed:youtube My Video](https://www.youtube.com/embed/abc)')
  })
})
