import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromSlack — inline marks ─────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('slack', 'html')
})

describe('fromSlack — inline marks', () => {
  it('parses bold mark', async () => {
    const doc = await from('slack', '*bold text*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses italic mark', async () => {
    const doc = await from('slack', '_italic text_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough mark', async () => {
    const doc = await from('slack', '~struck text~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code mark', async () => {
    const doc = await from('slack', '`code text`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link with display text', async () => {
    const doc = await from('slack', '<https://example.com|click here>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'com.slack.mrkdwn.facet#link')
        expect(linkMark?.attrs['url']).toBe('https://example.com')
      }
    }
  })

  it('parses bare link', async () => {
    const doc = await from('slack', '<https://example.com>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.slack.mrkdwn.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        expect(seg.content).toBe('https://example.com')
      }
    }
  })
})

// ─── fromSlack — blocks ───────────────────────────────────────────────────────

describe('fromSlack — block types', () => {
  it('parses blockquote line', async () => {
    const doc = await from('slack', '> quoted text')
    const hir = doc.toHIR()
    // Should contain a blockquote container
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses bullet list with two items and emits boundary markers', async () => {
    const doc = await from('slack', '- Item one\n- Item two')
    const raw = JSON.parse(doc._raw()) as { text: string; facets?: Array<{ features: Array<{ name?: string }> }> }
    const facets = raw.facets ?? []

    // Should have a bullet-list-marker block (emitted once at the start)
    const bulletMarker = facets.find((f) =>
      f.features.some((feat) => feat.name === 'bullet-list-marker'),
    )
    expect(bulletMarker).toBeDefined()

    // Should have two list-item-text blocks
    const listItemTexts = facets.filter((f) =>
      f.features.some((feat) => feat.name === 'list-item-text'),
    )
    expect(listItemTexts.length).toBe(2)

    // HIR should render a ul container with two list items
    const hir = doc.toHIR()
    const ul = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ul).toBeDefined()
  })

  it('parses triple-backtick code block', async () => {
    const doc = await from('slack', '```python\nprint("hello")\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock && codeBlock.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('print("hello")')
    }
  })
})

// ─── toSlack — round-trips ────────────────────────────────────────────────────

describe('toSlack — round-trip', () => {
  it('round-trips bold text', async () => {
    const doc = await from('slack', '*bold text*')
    const output = await to('slack', doc)
    expect(output).toContain('*bold text*')
  })

  it('round-trips bullet list', async () => {
    const doc = await from('slack', '- Item one\n- Item two')
    const output = await to('slack', doc)
    expect(output).toContain('- Item one')
    expect(output).toContain('- Item two')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(slack, ...))', () => {
  it('renders bold as <strong>', async () => {
    const html = (await to('html', await from('slack', '*bold*'))).trim()
    expect(html).toContain('<strong>')
    expect(html).toContain('bold')
  })

  it('renders italic as <em>', async () => {
    const html = (await to('html', await from('slack', '_italic_'))).trim()
    expect(html).toContain('<em>')
    expect(html).toContain('italic')
  })

  it('renders bullet list as <ul><li>', async () => {
    const html = (await to('html', await from('slack', '- Item one\n- Item two'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })
})
