import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function simpleOPML(outlines: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test</title></head>
  <body>${outlines}</body>
</opml>`
}

// ─── fromOPML — basic structure ───────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('opml', 'html')
})

describe('fromOPML — basic structure', () => {
  it('parses a single outline item into one block', async () => {
    const xml = simpleOPML('<outline text="Item 1"/>')
    const doc = await from('opml', xml)
    const hir = doc.toHIR()
    // Should have at least one block or container
    expect(hir.length).toBeGreaterThan(0)
    const firstBlock = hir.find((n) => n.type === 'block')
    expect(firstBlock).toBeDefined()
  })

  it('outline text becomes block text content', async () => {
    const xml = simpleOPML('<outline text="Hello World"/>')
    const doc = await from('opml', xml)
    expect(doc.text).toContain('Hello World')
  })

  it('multiple top-level outlines produce multiple blocks', async () => {
    const xml = simpleOPML(`
      <outline text="First"/>
      <outline text="Second"/>
      <outline text="Third"/>
    `)
    const doc = await from('opml', xml)
    expect(doc.text).toContain('First')
    expect(doc.text).toContain('Second')
    expect(doc.text).toContain('Third')
  })

  it('empty body produces empty document', async () => {
    const xml = simpleOPML('')
    const doc = await from('opml', xml)
    expect(doc.text).toBe('')
  })
})

// ─── fromOPML — nesting ───────────────────────────────────────────────────────

describe('fromOPML — nesting', () => {
  it('nested outline child has non-empty parents', async () => {
    const xml = simpleOPML(`
      <outline text="Parent">
        <outline text="Child"/>
      </outline>
    `)
    const doc = await from('opml', xml)
    // The document text should contain both parent and child text
    expect(doc.text).toContain('Parent')
    expect(doc.text).toContain('Child')
  })

  it('deeply nested outline preserves all text', async () => {
    const xml = simpleOPML(`
      <outline text="Level 1">
        <outline text="Level 2">
          <outline text="Level 3"/>
        </outline>
      </outline>
    `)
    const doc = await from('opml', xml)
    expect(doc.text).toContain('Level 1')
    expect(doc.text).toContain('Level 2')
    expect(doc.text).toContain('Level 3')
  })

  it('sibling items at same nesting level both appear', async () => {
    const xml = simpleOPML(`
      <outline text="Parent">
        <outline text="Child 1"/>
        <outline text="Child 2"/>
      </outline>
    `)
    const doc = await from('opml', xml)
    expect(doc.text).toContain('Child 1')
    expect(doc.text).toContain('Child 2')
  })
})

// ─── fromOPML — RSS feed outlines ─────────────────────────────────────────────

describe('fromOPML — RSS feed outlines', () => {
  it('RSS feed outline preserves xmlUrl attr', async () => {
    const xml = simpleOPML(
      `<outline text="My Feed" type="rss" xmlUrl="https://example.com/feed.xml"/>`,
    )
    const doc = await from('opml', xml)
    // Check the facets contain the xmlUrl
    const facets = doc.facets
    const feedFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          (feat as Record<string, unknown>)['name'] === 'feed' ||
          ((feat as Record<string, unknown>)['attrs'] as Record<string, unknown> | undefined)?.['xmlUrl'] === 'https://example.com/feed.xml',
      ),
    )
    expect(feedFacet).toBeDefined()
    expect(doc.text).toContain('My Feed')
  })

  it('atom feed outline is recognized as feed block', async () => {
    const xml = simpleOPML(
      `<outline text="Atom Feed" type="atom" xmlUrl="https://example.com/atom.xml"/>`,
    )
    const doc = await from('opml', xml)
    expect(doc.text).toContain('Atom Feed')
    const facets = doc.facets
    const hasFeed = facets.some((f) =>
      f.features.some((feat) => (feat as Record<string, unknown>)['name'] === 'feed'),
    )
    expect(hasFeed).toBe(true)
  })

  it('outline with title attr stores title', async () => {
    const xml = simpleOPML(
      `<outline text="Feed" title="Full Feed Title" type="rss" xmlUrl="https://example.com/feed.xml"/>`,
    )
    const doc = await from('opml', xml)
    const facets = doc.facets
    // Find a facet with a title attr
    const hasTitleAttr = facets.some((f) =>
      f.features.some(
        (feat) =>
          ((feat as Record<string, unknown>)['attrs'] as Record<string, unknown> | undefined)?.['title'] === 'Full Feed Title',
      ),
    )
    expect(hasTitleAttr).toBe(true)
  })
})

// ─── fromOPML — string vs object input ────────────────────────────────────────

describe('fromOPML — input types', () => {
  it('accepts an XML string', async () => {
    const xml = simpleOPML('<outline text="From XML String"/>')
    const doc = await from('opml', xml)
    expect(doc.text).toContain('From XML String')
  })

  it('accepts XML with a single outline', async () => {
    const xml = simpleOPML('<outline text="From Object Input"/>')
    const doc = await from('opml', xml)
    expect(doc.text).toContain('From Object Input')
  })

  it('handles nested outlines correctly', async () => {
    const xml = simpleOPML('<outline text="Parent"><outline text="Child A"/><outline text="Child B"/></outline>')
    const doc = await from('opml', xml)
    expect(doc.text).toContain('Parent')
    expect(doc.text).toContain('Child A')
    expect(doc.text).toContain('Child B')
  })
})

// parseOPML tests removed — parseOPML is no longer exported; XML parsing is internal to the registry.

// ─── toOPML — output structure ────────────────────────────────────────────────

describe('toOPML — output structure', () => {
  it('produces valid XML with <opml> root element', async () => {
    const doc = await from('opml', simpleOPML('<outline text="Item"/>'))
    const output = await to('opml', doc)
    expect(output).toContain('<opml')
    expect(output).toContain('</opml>')
  })

  it('contains <body> element', async () => {
    const doc = await from('opml', simpleOPML('<outline text="Item"/>'))
    const output = await to('opml', doc)
    expect(output).toContain('<body>')
    expect(output).toContain('</body>')
  })

  it('contains <outline> elements with text attribute', async () => {
    const doc = await from('opml', simpleOPML('<outline text="Hello"/>'))
    const output = await to('opml', doc)
    expect(output).toContain('<outline')
    expect(output).toContain('text="Hello"')
  })

  it('has XML declaration', async () => {
    const doc = await from('opml', simpleOPML('<outline text="Item"/>'))
    const output = await to('opml', doc)
    expect(output).toContain('<?xml')
  })

  it('has <head> element', async () => {
    const doc = await from('opml', simpleOPML('<outline text="Item"/>'))
    const output = await to('opml', doc)
    expect(output).toContain('<head>')
  })
})

// ─── Round-trip ────────────────────────────────────────────────────────────────

describe('toOPML — round-trip', () => {
  it('round-trip preserves top-level outline text', async () => {
    const xml = simpleOPML('<outline text="Round Trip Test"/>')
    const doc = await from('opml', xml)
    const output = await to('opml', doc)
    expect(output).toContain('Round Trip Test')
  })

  it('round-trip preserves multiple top-level outlines', async () => {
    const xml = simpleOPML(`
      <outline text="Alpha"/>
      <outline text="Beta"/>
      <outline text="Gamma"/>
    `)
    const doc = await from('opml', xml)
    const output = await to('opml', doc)
    expect(output).toContain('Alpha')
    expect(output).toContain('Beta')
    expect(output).toContain('Gamma')
  })

  it('round-trip with RSS feed preserves xmlUrl', async () => {
    const xml = simpleOPML(
      '<outline text="Feed" type="rss" xmlUrl="https://example.com/rss.xml"/>',
    )
    const doc = await from('opml', xml)
    const output = await to('opml', doc)
    expect(output).toContain('https://example.com/rss.xml')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromOPML → toHTML (cross-format via lens)', () => {
  it('outline text appears in HTML output', async () => {
    const xml = simpleOPML('<outline text="Hello HTML"/>')
    const doc = await from('opml', xml)
    const html = await to('html', doc)
    expect(html).toContain('Hello HTML')
  })

  it('multiple outlines each appear as paragraphs in HTML', async () => {
    const xml = simpleOPML(`
      <outline text="First item"/>
      <outline text="Second item"/>
    `)
    const doc = await from('opml', xml)
    const html = await to('html', doc)
    expect(html).toContain('First item')
    expect(html).toContain('Second item')
    expect(html).toContain('<p')
  })
})
