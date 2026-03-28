import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromSanity — inline marks ────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('sanity', 'html')
})

describe('fromSanity — inline marks', () => {
  it('parses strong mark as strong facet', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'hello', marks: ['strong'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#strong'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses em mark as em facet', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'world', marks: ['em'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#em'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses underline mark', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'text', marks: ['underline'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#underline'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code mark', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'x = 1', marks: ['code'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strike-through mark as strike-through facet', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'old', marks: ['strike-through'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#strike-through'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link via markDef', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'click here', marks: ['abc123'] }],
        markDefs: [{ _key: 'abc123', _type: 'link', href: 'https://example.com' }],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.sanity.portabletext.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'io.sanity.portabletext.facet#link')
        expect(mark?.attrs['href']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromSanity — block styles ────────────────────────────────────────────────

describe('fromSanity — block styles', () => {
  it('parses style:h1 as h1 block', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'h1',
        children: [{ _type: 'span', text: 'Title', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('h1')
    }
  })

  it('parses style:h2 through style:h6', async () => {
    for (let i = 2; i <= 6; i++) {
      const blocks = [
        {
          _type: 'block',
          style: `h${i}`,
          children: [{ _type: 'span', text: `Heading ${i}`, marks: [] }],
          markDefs: [],
        },
      ]
      const doc = await from('sanity', JSON.stringify(blocks))
      const hir = doc.toHIR()
      if (hir[0]!.type === 'block') {
        expect(hir[0]!.name).toBe(`h${i}`)
      }
    }
  })

  it('parses style:normal as normal block', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'plain text', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('normal')
    }
  })

  it('parses style:blockquote as blockquote container', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'blockquote',
        children: [{ _type: 'span', text: 'quoted', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses bullet list items as ul container', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', text: 'item one', marks: [] }],
        markDefs: [],
      },
      {
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', text: 'item two', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer?.type === 'container') {
      const hasListItemText = (nodes: typeof ulContainer.children): boolean =>
        nodes.some(
          (n) =>
            (n.type === 'block' && n.name === 'list-item-text') ||
            (n.type === 'container' && hasListItemText(n.children)),
        )
      expect(hasListItemText(ulContainer.children)).toBe(true)
    }
  })

  it('parses ordered list items as ol container', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        listItem: 'number',
        level: 1,
        children: [{ _type: 'span', text: 'first', marks: [] }],
        markDefs: [],
      },
      {
        _type: 'block',
        style: 'normal',
        listItem: 'number',
        level: 1,
        children: [{ _type: 'span', text: 'second', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })
})

// ─── toSanity — round-trip ────────────────────────────────────────────────────

describe('toSanity — round-trip', () => {
  it('bold text round-trips', async () => {
    const input = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'hello', marks: ['strong'] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(input))
    const output = JSON.parse(await to('sanity', doc))
    expect(output.length).toBeGreaterThan(0)
    const block = output[0]!
    const boldSpan = block.children.find((s) => s.marks.includes('strong'))
    expect(boldSpan).toBeDefined()
    expect(boldSpan?.text).toBe('hello')
  })

  it('heading round-trips', async () => {
    const input = [
      {
        _type: 'block',
        style: 'h2',
        children: [{ _type: 'span', text: 'My Heading', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(input))
    const output = JSON.parse(await to('sanity', doc))
    expect(output.length).toBeGreaterThan(0)
    const headingBlock = output.find((b) => b.style === 'h2')
    expect(headingBlock).toBeDefined()
    expect(headingBlock?.children[0]?.text).toBe('My Heading')
  })

  it('bullet list round-trips', async () => {
    const input = [
      {
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', text: 'item one', marks: [] }],
        markDefs: [],
      },
      {
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', text: 'item two', marks: [] }],
        markDefs: [],
      },
    ]
    const doc = await from('sanity', JSON.stringify(input))
    const output = JSON.parse(await to('sanity', doc))
    const listBlocks = output.filter((b) => b.listItem === 'bullet')
    expect(listBlocks.length).toBe(2)
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromSanity → toHTML (cross-format via lens)', () => {
  it('bold → <strong>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'hello', marks: ['strong'] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<strong>hello</strong>')
  })

  it('heading → <h1>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'h1',
        children: [{ _type: 'span', text: 'My Title', marks: [] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<h1>My Title</h1>')
  })

  it('bullet list → <ul> and <li>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', text: 'item', marks: [] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('em → <em>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'world', marks: ['em'] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<em>world</em>')
  })

  it('paragraph → <p>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'plain text', marks: [] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('link markDef → <a href>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'click here', marks: ['ref1'] }],
        markDefs: [{ _key: 'ref1', _type: 'link', href: 'https://example.com' }],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<a href="https://example.com">click here</a>')
  })

  it('ordered list → <ol><li>', async () => {
    const blocks = [
      {
        _type: 'block',
        style: 'normal',
        listItem: 'number',
        level: 1,
        children: [{ _type: 'span', text: 'first', marks: [] }],
        markDefs: [],
      },
    ]
    const html = (await to('html', await from('sanity', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })
})

// ─── fromSanity — JSON string input ──────────────────────────────────────────

describe('fromSanity — JSON string input', () => {
  it('accepts a JSON string', async () => {
    const blocksStr = JSON.stringify([
      {
        _type: 'block',
        style: 'normal',
        children: [{ _type: 'span', text: 'hello', marks: [] }],
        markDefs: [],
      },
    ])
    const doc = await from('sanity', JSON.stringify(blocksStr))
    expect(doc.text).toContain('hello')
  })
})
