import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import type { HIRBlockNode, HIRTextNode } from '../src/types.js'

beforeAll(() => {
  registerTestFormats('obsidian', 'html')
})

// ─── fromObsidian — inline marks ─────────────────────────────────────────────

describe('fromObsidian — inline marks', () => {
  it('parses **bold** as strong mark', async () => {
    const doc = await from('obsidian', '**bold**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'md.obsidian.facet#strong'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses *italic* as emphasis mark', async () => {
    const doc = await from('obsidian', '*italic*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'md.obsidian.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ~~strike~~ as strikethrough mark', async () => {
    const doc = await from('obsidian', '~~strike~~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'md.obsidian.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ==highlight== as highlight mark', async () => {
    const doc = await from('obsidian', '==highlight==')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'md.obsidian.facet#highlight'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses `code` as code-span mark', async () => {
    const doc = await from('obsidian', '`code`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'md.obsidian.facet#code-span'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [text](url) as link entity', async () => {
    const doc = await from('obsidian', '[click here](https://example.com)')
    const linkFacet = doc.facets.find((f) =>
      f.features.some(
        (feat) =>
          feat.$type === 'md.obsidian.facet' &&
          (feat as Record<string, unknown>)['name'] === 'link',
      ),
    )
    expect(linkFacet).toBeDefined()
    if (linkFacet) {
      const feat = linkFacet.features[0]!
      expect((feat as Record<string, unknown>)['uri']).toBe('https://example.com')
    }
  })
})

// ─── fromObsidian — WikiLinks ─────────────────────────────────────────────────

describe('fromObsidian — WikiLinks', () => {
  it('parses [[Page Name]] as wikilink entity with page attr', async () => {
    const doc = await from('obsidian', '[[Page Name]]')
    const wlFacet = doc.facets.find((f) =>
      f.features.some(
        (feat) =>
          feat.$type === 'md.obsidian.facet' &&
          (feat as Record<string, unknown>)['name'] === 'wikilink',
      ),
    )
    expect(wlFacet).toBeDefined()
    if (wlFacet) {
      const feat = wlFacet.features[0]!
      expect((feat as Record<string, unknown>)['page']).toBe('Page Name')
    }
  })

  it('parses [[Page|Display]] as wikilink with display attr', async () => {
    const doc = await from('obsidian', '[[My Page|See Here]]')
    const wlFacet = doc.facets.find((f) =>
      f.features.some(
        (feat) =>
          feat.$type === 'md.obsidian.facet' &&
          (feat as Record<string, unknown>)['name'] === 'wikilink',
      ),
    )
    expect(wlFacet).toBeDefined()
    if (wlFacet) {
      const feat = wlFacet.features[0]!
      expect((feat as Record<string, unknown>)['page']).toBe('My Page')
      expect((feat as Record<string, unknown>)['display']).toBe('See Here')
    }
    // Text should be the display text
    expect(doc.text).toContain('See Here')
  })

  it('parses [[Page#Heading]] as wikilink with anchor attr', async () => {
    const doc = await from('obsidian', '[[My Page#Introduction]]')
    const wlFacet = doc.facets.find((f) =>
      f.features.some(
        (feat) =>
          feat.$type === 'md.obsidian.facet' &&
          (feat as Record<string, unknown>)['name'] === 'wikilink',
      ),
    )
    expect(wlFacet).toBeDefined()
    if (wlFacet) {
      const feat = wlFacet.features[0]!
      expect((feat as Record<string, unknown>)['page']).toBe('My Page')
      expect((feat as Record<string, unknown>)['anchor']).toBe('Introduction')
    }
  })
})

// ─── fromObsidian — inline tags ──────────────────────────────────────────────

describe('fromObsidian — inline tags', () => {
  it('parses #tag as tag entity with tagName attr', async () => {
    const doc = await from('obsidian', '#mytag')
    const tagFacet = doc.facets.find((f) =>
      f.features.some(
        (feat) =>
          feat.$type === 'md.obsidian.facet' &&
          (feat as Record<string, unknown>)['name'] === 'tag',
      ),
    )
    expect(tagFacet).toBeDefined()
    if (tagFacet) {
      const feat = tagFacet.features[0]!
      expect((feat as Record<string, unknown>)['tagName']).toBe('mytag')
    }
  })
})

// ─── fromObsidian — block elements ───────────────────────────────────────────

describe('fromObsidian — block elements', () => {
  it('parses # Heading as heading level 1', async () => {
    const doc = await from('obsidian', '# Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ## Heading as heading level 2', async () => {
    const doc = await from('obsidian', '## Section Title')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses fenced code block with language', async () => {
    const doc = await from('obsidian', '```python\nprint("hello")\n```')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code-block')
      expect(hir[0]!.attrs['language']).toBe('python')
    }
  })

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('obsidian', '> This is a quote')
    const hir = doc.toHIR()
    // Should have a blockquote container
    const container = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(container).toBeDefined()
  })

  it('parses - list items as ul container', async () => {
    const doc = await from('obsidian', '- item one\n- item two')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer?.type === 'container') {
      const items = ulContainer.children.filter(
        (n) => n.type === 'container' && n.name === 'unordered-list-item',
      )
      expect(items.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('parses 1. 2. as ordered list', async () => {
    const doc = await from('obsidian', '1. first\n2. second')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })
})

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe('toObsidian — round-trips', () => {
  it('round-trips **bold**', async () => {
    const result = (await to('obsidian', await from('obsidian', '**bold**'))).trim()
    expect(result).toBe('**bold**')
  })

  it('round-trips *italic*', async () => {
    const result = (await to('obsidian', await from('obsidian', '*italic*'))).trim()
    expect(result).toBe('*italic*')
  })

  it('round-trips ~~strikethrough~~', async () => {
    const result = (await to('obsidian', await from('obsidian', '~~strike~~'))).trim()
    expect(result).toBe('~~strike~~')
  })

  it('round-trips ==highlight==', async () => {
    const result = (await to('obsidian', await from('obsidian', '==highlighted=='))).trim()
    expect(result).toBe('==highlighted==')
  })

  it('round-trips [[WikiLink]]', async () => {
    const result = (await to('obsidian', await from('obsidian', '[[My Page]]'))).trim()
    expect(result).toBe('[[My Page]]')
  })

  it('round-trips [[Page|Display]]', async () => {
    const result = (await to('obsidian', await from('obsidian', '[[My Page|Click Here]]'))).trim()
    expect(result).toBe('[[My Page|Click Here]]')
  })

  it('round-trips #tag', async () => {
    const result = (await to('obsidian', await from('obsidian', '#mytag'))).trim()
    expect(result).toBe('#mytag')
  })

  it('round-trips # Heading', async () => {
    const result = (await to('obsidian', await from('obsidian', '# My Heading'))).trim()
    expect(result).toBe('# My Heading')
  })

  it('round-trips bullet list', async () => {
    const input = '- alpha\n- beta'
    const result = (await to('obsidian', await from('obsidian', input))).trim()
    expect(result).toContain('- alpha')
    expect(result).toContain('- beta')
  })

  it('round-trips ordered list', async () => {
    const input = '1. first\n2. second'
    const result = (await to('obsidian', await from('obsidian', input))).trim()
    expect(result).toContain('1. first')
    expect(result).toContain('2. second')
  })
})

// ─── Cross-format tests (Obsidian → HTML) ────────────────────────────────────

describe('cross-format: fromObsidian → toHTML', () => {
  it('converts **bold** to <strong>bold</strong>', async () => {
    const doc = await from('obsidian', '**bold**')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('converts *italic* to <em>italic</em>', async () => {
    const doc = await from('obsidian', '*italic*')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('converts # Hello to <h1>Hello</h1>', async () => {
    const doc = await from('obsidian', '# Hello')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('converts ## Section to <h2>Section</h2>', async () => {
    const doc = await from('obsidian', '## Section')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('converts `code` to <code>code</code>', async () => {
    const doc = await from('obsidian', '`mycode`')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<code>mycode</code>')
  })

  it('converts ==highlight== to <mark>highlight</mark>', async () => {
    const doc = await from('obsidian', '==highlighted text==')
    const html = (await to('html', doc)).trim()
    // highlight maps to RT highlight → CommonMark mark → HTML <mark>
    expect(html).toContain('<mark>highlighted text</mark>')
  })

  it('converts ~~strike~~ to <s>strike</s>', async () => {
    const doc = await from('obsidian', '~~struck~~')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<s>struck</s>')
  })
})
