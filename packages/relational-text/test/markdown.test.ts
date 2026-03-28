import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('markdown', 'gfm', 'html')
})

describe('fromMarkdown — headings', () => {
  it('parses # heading as heading level 1', async () => {
    const doc = await from('markdown', '# Hello')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ## heading as heading level 2', async () => {
    const doc = await from('markdown', '## Section')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses h1 through h6', async () => {
    for (let i = 1; i <= 6; i++) {
      const hashes = '#'.repeat(i)
      const doc = await from('markdown', `${hashes} Title`)
      const hir = doc.toHIR()
      const block = hir[0]!
      if (block.type === 'block') {
        expect(block.attrs['level']).toBe(i)
      }
    }
  })
})

describe('fromMarkdown — inline marks', () => {
  it('parses **bold** marks', async () => {
    const doc = await from('markdown', '**bold** text')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.commonmark.facet#strong'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses _italic_ marks', async () => {
    const doc = await from('markdown', '_italic_ text')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.commonmark.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ~~strikethrough~~ as org.gfm.facet', async () => {
    const doc = await from('markdown', '~~strike~~ text')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.gfm.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses `inline code`', async () => {
    const doc = await from('markdown', '`code` text')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.commonmark.facet#code-span'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [link](url) as link facet', async () => {
    const doc = await from('markdown', '[click here](https://example.com)')
    const linkFacet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.commonmark.facet' && (feat as Record<string, unknown>)['name'] === 'link'),
    )
    expect(linkFacet).toBeDefined()
    if (linkFacet) {
      const feat = linkFacet.features[0]!
      expect((feat as Record<string, unknown>)['uri']).toBe('https://example.com')
    }
  })
})

describe('fromMarkdown — block elements', () => {
  it('parses unordered list items with ul parent', async () => {
    const doc = await from('markdown', '- item1\n- item2')
    const hir = doc.toHIR()
    // bullet-list-marker appears as a top-level block before the ul container
    const container = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(container).toBeDefined()
    expect(container!.type).toBe('container')
    if (container?.type === 'container') {
      expect(container.name).toBe('ul')
      // Children: [list-item-marker, unordered-list-item, list-item-marker, unordered-list-item]
      const items = container.children.filter(
        (c) => c.type === 'container' && c.name === 'unordered-list-item',
      )
      expect(items).toHaveLength(2)
    }
  })

  it('parses blockquote', async () => {
    const doc = await from('markdown', '> blockquote text')
    const hir = doc.toHIR()
    // HIR has a blockquote-marker block followed by a blockquote container.
    const container = hir.find((n) => n.type === 'container')
    expect(container).toBeDefined()
    expect(container!.type).toBe('container')
    if (container?.type === 'container') {
      expect(container.name).toBe('blockquote')
    }
  })

  it('parses fenced code block with language', async () => {
    const doc = await from('markdown', '```rust\nfn main() {}\n```')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code-block')
      expect(hir[0]!.attrs['language']).toBe('rust')
    }
  })

  it('parses fenced code block without language', async () => {
    const doc = await from('markdown', '```\ncode here\n```')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code-block')
    }
  })

  it('parses horizontal rule', async () => {
    const doc = await from('markdown', '---')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('horizontal-rule')
    }
  })
})

describe('toMarkdown — renderer', () => {
  it('renders a heading', async () => {
    const doc = await from('markdown', '# Hello')
    const md = await to('markdown', doc)
    expect(md).toMatch(/^# Hello/)
  })

  it('renders bold', async () => {
    const doc = await from('markdown', '**bold** text')
    const md = await to('markdown', doc)
    expect(md).toContain('**bold**')
  })

  it('renders italic', async () => {
    const doc = await from('markdown', '*italic* text')
    const md = await to('markdown', doc)
    expect(md).toContain('*italic*')
  })

  it('renders strikethrough', async () => {
    const doc = await from('markdown', '~~strike~~')
    const md = await to('markdown', doc)
    expect(md).toContain('~~strike~~')
  })

  it('renders a link', async () => {
    const doc = await from('markdown', '[click](https://example.com)')
    const md = await to('markdown', doc)
    expect(md).toContain('[click](https://example.com)')
  })

  it('renders unordered list items', async () => {
    const doc = await from('markdown', '- a\n- b')
    const md = await to('markdown', doc)
    expect(md).toContain('- a')
    expect(md).toContain('- b')
  })

  it('renders a blockquote', async () => {
    const doc = await from('markdown', '> quote text')
    const md = await to('markdown', doc)
    expect(md).toContain('> ')
  })

  it('renders a fenced code block', async () => {
    const doc = await from('markdown', '```rust\nfn main() {}\n```')
    const md = await to('markdown', doc)
    expect(md).toContain('```rust')
    expect(md).toContain('fn main() {}')
  })
})

describe('round-trip Markdown', () => {
  it('bold survives round-trip', async () => {
    const input = '**hello** world'
    const doc = await from('markdown', input)
    const output = await to('markdown', doc)
    expect(output).toContain('**hello**')
  })

  it('heading survives round-trip', async () => {
    const input = '# Title\n\nSome paragraph.'
    const doc = await from('markdown', input)
    const output = await to('markdown', doc)
    expect(output).toMatch(/^# Title/)
    expect(output).toContain('Some paragraph.')
  })

  it('code block survives round-trip', async () => {
    const input = '```js\nconsole.log("hi")\n```'
    const doc = await from('markdown', input)
    const output = await to('markdown', doc)
    expect(output).toContain('```js')
    expect(output).toContain('console.log')
  })
})

describe('fromMarkdown — GFM namespace', () => {
  it('produces org.gfm.facet#strikethrough facet for ~~text~~', async () => {
    const doc = await from('markdown', '~~strike~~')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.gfm.facet' && (feat as Record<string, unknown>)['name'] === 'strikethrough'),
    )
    expect(facet).toBeDefined()
  })

  it('produces org.gfm.facet table block for GFM table', async () => {
    const doc = await from('markdown', '| A | B |\n| --- | --- |\n| 1 | 2 |')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.gfm.facet' && (feat as Record<string, unknown>)['name'] === 'table'),
    )
    expect(facet).toBeDefined()
  })

  it('renders GFM strikethrough via toHTML using gfm→html lens path', async () => {
    const doc = await from('markdown', '~~strike~~')
    const html = await to('html', doc)
    expect(html).toContain('<s>strike</s>')
  })
})

describe('fromMarkdown — hardbreak and softbreak', () => {
  it('softbreak becomes a newline in text content', async () => {
    const doc = await from('markdown', 'Hello\nWorld')
    const text = doc.text
    // markdown-it treats a plain newline as softbreak → \n preserved in our importer
    expect(text).toContain('\n')
  })

  it('hardbreak (two trailing spaces) produces line-break facet', async () => {
    const doc = await from('markdown', 'Hello  \nWorld')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.commonmark.facet' && (feat as Record<string, unknown>)['name'] === 'line-break'),
    )
    expect(facet).toBeDefined()
  })

  it('toHTML renders hard break as <br>', async () => {
    const doc = await from('markdown', 'Hello  \nWorld')
    const html = await to('html', doc)
    expect(html).toContain('<br />')
  })
})

describe('fromMarkdown — inline images', () => {
  it('parses ![alt](src) as inline image facet with src attr', async () => {
    const doc = await from('markdown', '![alt text](https://example.com/img.png)')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.commonmark.facet' && (feat as Record<string, unknown>)['name'] === 'image'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      const feat = facet.features[0]! as Record<string, unknown>
      expect(feat['src']).toBe('https://example.com/img.png')
    }
  })

  it('renders inline image as ![alt](src) in Markdown', async () => {
    const doc = await from('markdown', '![alt](img.png)')
    const md = await to('markdown', doc)
    expect(md).toContain('![alt](img.png)')
  })
})

describe('fromMarkdown — definition lists', () => {
  it('parses definition terms and details', async () => {
    const doc = await from('markdown', 'term\n\n: detail')
    const hir = doc.toHIR()
    const allBlocks = hir.flatMap((n) => n.type === 'container' ? n.children : [n])
    const term = allBlocks.find((n) => n.type === 'block' && n.name === 'definition-term')
    const detail = allBlocks.find((n) => n.type === 'block' && n.name === 'definition-detail')
    expect(term).toBeDefined()
    expect(detail).toBeDefined()
  })
})
