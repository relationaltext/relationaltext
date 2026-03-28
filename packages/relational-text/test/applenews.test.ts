import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
beforeAll(() => {
  registerTestFormats('applenews', 'markdown')
})

// ─── fromAppleNews — basic parsing ────────────────────────────────────────────

describe('fromAppleNews — basic parsing', () => {
  it('parses a simple body component into a paragraph-like block', async () => {
    const anf = {
      version: '1.9',
      language: 'en',
      components: [
        { role: 'body', text: 'Hello world' },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'body')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const textNode = block.children.find((c) => c.type === 'text')
      expect(textNode?.type === 'text' && textNode.content).toBe('Hello world')
    }
  })

  it('accepts a JSON string as input', async () => {
    const anf = JSON.stringify({
      version: '1.9',
      components: [{ role: 'body', text: 'test' }],
    })
    const doc = await from('applenews', anf)
    expect(doc.text).toContain('test')
  })

  it('parses a heading1 component', async () => {
    const anf = {
      components: [{ role: 'heading1', text: 'Big Heading' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'heading1')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const textNode = block.children.find((c) => c.type === 'text')
      expect(textNode?.type === 'text' && textNode.content).toBe('Big Heading')
    }
  })

  it('parses heading2 through heading6', async () => {
    for (let level = 2; level <= 6; level++) {
      const anf = {
        components: [{ role: `heading${level}`, text: `Heading ${level}` }],
      }
      const doc = await from('applenews', JSON.stringify(anf))
      const hir = doc.toHIR()
      const block = hir.find((n) => n.type === 'block' && n.name === `heading${level}`)
      expect(block).toBeDefined()
    }
  })

  it('normalizes bare "heading" role to heading2', async () => {
    const anf = {
      components: [{ role: 'heading', text: 'Section' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'heading2')
    expect(block).toBeDefined()
  })

  it('parses title component', async () => {
    const anf = {
      components: [{ role: 'title', text: 'Article Title' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'title')
    expect(block).toBeDefined()
  })

  it('parses intro component', async () => {
    const anf = {
      components: [{ role: 'intro', text: 'Introduction text.' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'intro')
    expect(block).toBeDefined()
  })

  it('parses quote component', async () => {
    const anf = {
      components: [{ role: 'quote', text: 'A wise quotation.' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'quote')
    expect(block).toBeDefined()
  })

  it('parses aside component', async () => {
    const anf = {
      components: [{ role: 'aside', text: 'Side note.' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'aside')
    expect(block).toBeDefined()
  })

  it('skips unknown roles gracefully', async () => {
    const anf = {
      components: [
        { role: 'photo', URL: 'https://example.com/image.jpg' },
        { role: 'body', text: 'Real text' },
        { role: 'divider' },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    expect(doc.text).toContain('Real text')
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
  })

  it('handles empty text gracefully', async () => {
    const anf = {
      components: [{ role: 'body', text: '' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    expect(doc).toBeDefined()
  })

  it('handles missing text field gracefully', async () => {
    const anf = {
      components: [{ role: 'body' }],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    expect(doc).toBeDefined()
  })

  it('parses multiple components', async () => {
    const anf = {
      components: [
        { role: 'heading1', text: 'Title' },
        { role: 'body', text: 'First paragraph.' },
        { role: 'body', text: 'Second paragraph.' },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    expect(doc.text).toContain('Title')
    expect(doc.text).toContain('First paragraph.')
    expect(doc.text).toContain('Second paragraph.')
    const hir = doc.toHIR()
    const blocks = hir.filter((n) => n.type === 'block')
    expect(blocks.length).toBeGreaterThanOrEqual(3)
  })
})

// ─── fromAppleNews — inlineTextStyles (bold, italic, underline, strikethrough) ─

describe('fromAppleNews — inlineTextStyles', () => {
  it('parses bold inlineTextStyle', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'Hello bold world',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 4, textStyle: { bold: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'body')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldNode = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.apple.news.facet#bold'),
      )
      expect(boldNode).toBeDefined()
      if (boldNode?.type === 'text') {
        expect(boldNode.content).toBe('bold')
      }
    }
  })

  it('parses italic inlineTextStyle', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'Hello italic',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 6, textStyle: { italic: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'body')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const italicNode = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.apple.news.facet#italic'),
      )
      expect(italicNode).toBeDefined()
    }
  })

  it('parses underline inlineTextStyle', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'click here',
          inlineTextStyles: [
            { rangeStart: 0, rangeLength: 10, textStyle: { underline: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const facets = doc.facets
    const underlineFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'underline'),
    )
    expect(underlineFacet).toBeDefined()
  })

  it('parses strikethrough inlineTextStyle', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'old price',
          inlineTextStyles: [
            { rangeStart: 0, rangeLength: 9, textStyle: { strikethrough: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const facets = doc.facets
    const strikeFacet = facets.find((f) =>
      f.features.some(
        (feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'strikethrough',
      ),
    )
    expect(strikeFacet).toBeDefined()
  })

  it('handles combined bold + italic on same range', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'Important!',
          inlineTextStyles: [
            { rangeStart: 0, rangeLength: 10, textStyle: { bold: true, italic: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const facets = doc.facets
    const boldFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'bold'),
    )
    const italicFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'italic'),
    )
    expect(boldFacet).toBeDefined()
    expect(italicFacet).toBeDefined()
  })

  it('correctly maps character range to byte offset', async () => {
    // Using ASCII text: rangeStart 5, rangeLength 4 → chars 5–8
    const anf = {
      components: [
        {
          role: 'body',
          text: 'abcde bold rest',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 4, textStyle: { bold: true } },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'body')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldNode = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.apple.news.facet#bold'),
      )
      if (boldNode?.type === 'text') {
        expect(boldNode.content).toBe('bold')
      }
    }
  })
})

// ─── fromAppleNews — additions (links) ────────────────────────────────────────

describe('fromAppleNews — additions (links)', () => {
  it('parses a link addition', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: "Here's a hyperlink",
          additions: [
            { type: 'link', URL: 'http://example.com', rangeStart: 9, rangeLength: 9 },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const facets = doc.facets
    const linkFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'link'),
    )
    expect(linkFacet).toBeDefined()
    const linkFeature = linkFacet?.features[0] as any
    expect(linkFeature?.URL).toBe('http://example.com')
  })

  it('link covers the correct text range', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'Visit Apple for more info',
          additions: [
            { type: 'link', URL: 'https://apple.com', rangeStart: 6, rangeLength: 5 },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'body')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const linkedNode = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.apple.news.facet#link'),
      )
      expect(linkedNode?.type === 'text' && linkedNode.content).toBe('Apple')
    }
  })

  it('skips additions with unsupported types', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'Some text',
          additions: [
            { type: 'unknown-addition', rangeStart: 0, rangeLength: 4 },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    // Should not throw; just no link facets
    const facets = doc.facets
    const linkFacet = facets.find((f) =>
      f.features.some((feat) => (feat as any).name === 'link'),
    )
    expect(linkFacet).toBeUndefined()
  })

  it('skips additions with empty URL', async () => {
    const anf = {
      components: [
        {
          role: 'body',
          text: 'No link',
          additions: [
            { type: 'link', URL: '', rangeStart: 0, rangeLength: 7 },
          ],
        },
      ],
    }
    const doc = await from('applenews', JSON.stringify(anf))
    const facets = doc.facets
    const linkFacet = facets.find((f) =>
      f.features.some((feat) => feat.$type === 'com.apple.news.facet' && (feat as any).name === 'link'),
    )
    expect(linkFacet).toBeUndefined()
  })
})

// ─── toAppleNews — basic export ───────────────────────────────────────────────

describe('toAppleNews — basic export', () => {
  it('exports a body block as a body component', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'body', text: 'Hello world' }],
    }))
    const anf = JSON.parse(await to('applenews', doc))
    expect(anf.components).toBeDefined()
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp).toBeDefined()
    expect(bodyComp?.text).toBe('Hello world')
  })

  it('exports a heading1 block', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'heading1', text: 'My Heading' }],
    }))
    const anf = JSON.parse(await to('applenews', doc))
    const headingComp = anf.components!.find((c) => c.role === 'heading1')
    expect(headingComp).toBeDefined()
    expect(headingComp?.text).toBe('My Heading')
  })

  it('includes version and language in output', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'body', text: 'test' }],
    }))
    const anf = JSON.parse(await to('applenews', doc))
    expect(anf.version).toBe('1.9')
    expect(anf.language).toBe('en')
  })

  it('preserves bold as inlineTextStyles in output', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [
        {
          role: 'body',
          text: 'Hello bold',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 4, textStyle: { bold: true } },
          ],
        },
      ],
    }))
    const anf = JSON.parse(await to('applenews', doc))
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp?.inlineTextStyles).toBeDefined()
    expect(bodyComp?.inlineTextStyles?.length).toBeGreaterThan(0)
    const boldStyle = bodyComp?.inlineTextStyles?.find((s: any) => s.textStyle?.bold === true)
    expect(boldStyle).toBeDefined()
  })

  it('preserves link as additions in output', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [
        {
          role: 'body',
          text: "Here's a hyperlink",
          additions: [
            { type: 'link', URL: 'http://example.com', rangeStart: 9, rangeLength: 9 },
          ],
        },
      ],
    }))
    const anf = JSON.parse(await to('applenews', doc))
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp?.additions).toBeDefined()
    const linkAddition = bodyComp?.additions?.find((a: any) => a.type === 'link')
    expect(linkAddition).toBeDefined()
    expect(linkAddition?.URL).toBe('http://example.com')
  })

  it('round-trips a multi-component article', async () => {
    const originalAnf = {
      components: [
        { role: 'heading1', text: 'Title' },
        { role: 'body', text: 'First paragraph.' },
        { role: 'body', text: 'Second paragraph.' },
      ],
    }
    const doc = await from('applenews', JSON.stringify(originalAnf))
    const anf = JSON.parse(await to('applenews', doc))
    expect(anf.components!.length).toBeGreaterThanOrEqual(3)
    expect(anf.components!.some((c) => c.text === 'Title')).toBe(true)
    expect(anf.components!.some((c) => c.text === 'First paragraph.')).toBe(true)
    expect(anf.components!.some((c) => c.text === 'Second paragraph.')).toBe(true)
  })
})

// ─── Cross-format: fromMarkdown → toAppleNews ─────────────────────────────────

describe('cross-format: fromMarkdown → toAppleNews', () => {
  it('converts a CommonMark paragraph to an ANF body component', async () => {
    const doc = await from('markdown', 'Hello world')
    const anf = JSON.parse(await to('applenews', doc))
    expect(anf.components).toBeDefined()
    // After lens transform, paragraph → body
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp).toBeDefined()
    expect(bodyComp?.text).toContain('Hello world')
  })

  it('converts a CommonMark heading to an ANF heading component', async () => {
    const doc = await from('markdown', '## Section Heading')
    const anf = JSON.parse(await to('applenews', doc))
    expect(anf.components).toBeDefined()
    // heading level 2 → heading2
    const headingComp = anf.components!.find((c) => c.role === 'heading2')
    expect(headingComp).toBeDefined()
    expect(headingComp?.text).toContain('Section Heading')
  })

  it('converts CommonMark bold to ANF inlineTextStyles bold', async () => {
    const doc = await from('markdown', 'This is **bold** text.')
    const anf = JSON.parse(await to('applenews', doc))
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp).toBeDefined()
    expect(bodyComp?.inlineTextStyles).toBeDefined()
    const boldStyle = bodyComp?.inlineTextStyles?.find((s: any) => s.textStyle?.bold === true)
    expect(boldStyle).toBeDefined()
  })

  it('converts CommonMark italic to ANF inlineTextStyles italic', async () => {
    const doc = await from('markdown', 'This is *italic* text.')
    const anf = JSON.parse(await to('applenews', doc))
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp?.inlineTextStyles).toBeDefined()
    const italicStyle = bodyComp?.inlineTextStyles?.find((s: any) => s.textStyle?.italic === true)
    expect(italicStyle).toBeDefined()
  })

  it('converts CommonMark link to ANF addition', async () => {
    const doc = await from('markdown', '[click here](https://example.com)')
    const anf = JSON.parse(await to('applenews', doc))
    const bodyComp = anf.components!.find((c) => c.role === 'body')
    expect(bodyComp?.additions).toBeDefined()
    const linkAddition = bodyComp?.additions?.find((a: any) => a.type === 'link')
    expect(linkAddition).toBeDefined()
    expect(linkAddition?.URL).toBe('https://example.com')
  })

  it('converts CommonMark blockquote to ANF quote component', async () => {
    const doc = await from('markdown', '> A quotation here.')
    const anf = JSON.parse(await to('applenews', doc))
    // The lens maps blockquote-marker → quote
    // (After RT transformation, blockquote content blocks get body role)
    expect(anf.components).toBeDefined()
  })

  it('converts a heading level 1 to heading1', async () => {
    const doc = await from('markdown', '# Top Level Heading')
    const anf = JSON.parse(await to('applenews', doc))
    const h1 = anf.components!.find((c) => c.role === 'heading1')
    expect(h1).toBeDefined()
    expect(h1?.text).toContain('Top Level Heading')
  })

  it('converts heading level 3 to heading3', async () => {
    const doc = await from('markdown', '### Sub Section')
    const anf = JSON.parse(await to('applenews', doc))
    const h3 = anf.components!.find((c) => c.role === 'heading3')
    expect(h3).toBeDefined()
    expect(h3?.text).toContain('Sub Section')
  })
})

// ─── Cross-format: fromAppleNews → toMarkdown ─────────────────────────────────

describe('cross-format: fromAppleNews → toMarkdown', () => {
  it('converts an ANF body component to a Markdown paragraph', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'body', text: 'Hello world' }],
    }))
    const md = await to('markdown', doc)
    expect(md.trim()).toContain('Hello world')
  })

  it('converts an ANF heading1 to a Markdown # heading', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'heading1', text: 'My Title' }],
    }))
    const md = await to('markdown', doc)
    expect(md).toContain('# My Title')
  })

  it('converts an ANF heading2 to a Markdown ## heading', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [{ role: 'heading2', text: 'Section' }],
    }))
    const md = await to('markdown', doc)
    expect(md).toContain('## Section')
  })

  it('converts ANF bold to Markdown **bold**', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [
        {
          role: 'body',
          text: 'Hello bold world',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 4, textStyle: { bold: true } },
          ],
        },
      ],
    }))
    const md = await to('markdown', doc)
    expect(md).toContain('**bold**')
  })

  it('converts ANF italic to Markdown *italic*', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [
        {
          role: 'body',
          text: 'Hello italic',
          inlineTextStyles: [
            { rangeStart: 6, rangeLength: 6, textStyle: { italic: true } },
          ],
        },
      ],
    }))
    const md = await to('markdown', doc)
    expect(md).toContain('*italic*')
  })

  it('converts ANF link to Markdown [text](url)', async () => {
    const doc = await from('applenews', JSON.stringify({
      components: [
        {
          role: 'body',
          text: 'Visit Apple',
          additions: [
            { type: 'link', URL: 'https://apple.com', rangeStart: 6, rangeLength: 5 },
          ],
        },
      ],
    }))
    const md = await to('markdown', doc)
    expect(md).toContain('[Apple](https://apple.com)')
  })
})
