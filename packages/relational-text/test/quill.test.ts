import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromQuillDelta — inline marks ────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('quill', 'html')
})

describe('fromQuillDelta — inline marks', () => {
  it('parses bold attribute', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { bold: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses italic attribute', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { italic: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses underline attribute', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { underline: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#underline'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strike attribute', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { strike: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#strike'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code attribute', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { code: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses script:super as superscript', async () => {
    const delta = {
      ops: [
        { insert: '2', attributes: { script: 'super' } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#superscript'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses script:sub as subscript', async () => {
    const delta = {
      ops: [
        { insert: '2', attributes: { script: 'sub' } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#subscript'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link string attribute', async () => {
    const delta = {
      ops: [
        { insert: 'click', attributes: { link: 'https://example.com' } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.quilljs.delta.facet#link')
        expect(mark?.attrs['url']).toBe('https://example.com')
      }
    }
  })

  it('parses link object attribute with href', async () => {
    const delta = {
      ops: [
        { insert: 'click', attributes: { link: { href: 'https://example.com' } } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.quilljs.delta.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.quilljs.delta.facet#link')
        expect(mark?.attrs['url']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromQuillDelta — block types ─────────────────────────────────────────────

describe('fromQuillDelta — block types', () => {
  it('parses header:1 as header block level 1', async () => {
    const delta = {
      ops: [
        { insert: 'Title' },
        { insert: '\n', attributes: { header: 1 } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('header')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses header:1 through header:6', async () => {
    for (let i = 1; i <= 6; i++) {
      const delta = {
        ops: [{ insert: 'H' }, { insert: '\n', attributes: { header: i } }],
      }
      const doc = await from('quill', JSON.stringify(delta))
      const hir = doc.toHIR()
      if (hir[0]!.type === 'block') {
        expect(hir[0]!.name).toBe('header')
        expect(hir[0]!.attrs['level']).toBe(i)
      }
    }
  })

  it('parses list:bullet as ul container with list-item-text children', async () => {
    const delta = {
      ops: [
        { insert: 'item one' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'item two' },
        { insert: '\n', attributes: { list: 'bullet' } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
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

  it('parses list:ordered as ol container with list-item-text children', async () => {
    const delta = {
      ops: [
        { insert: 'first' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'second' },
        { insert: '\n', attributes: { list: 'ordered' } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses code-block:true as code-block block', async () => {
    const delta = {
      ops: [
        { insert: 'const x = 1' },
        { insert: '\n', attributes: { 'code-block': true } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
  })

  it('parses code-block:python as code-block with language attr', async () => {
    const delta = {
      ops: [
        { insert: 'print("hello")' },
        { insert: '\n', attributes: { 'code-block': 'python' } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
    }
  })

  it('parses multi-line code-block', async () => {
    const delta = {
      ops: [
        { insert: 'line one' },
        { insert: '\n', attributes: { 'code-block': true } },
        { insert: 'line two' },
        { insert: '\n', attributes: { 'code-block': true } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      const text = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(text).toContain('line one')
      expect(text).toContain('line two')
    }
  })

  it('parses blockquote:true as blockquote container', async () => {
    const delta = {
      ops: [
        { insert: 'quoted text' },
        { insert: '\n', attributes: { blockquote: true } },
      ],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses plain paragraph (no block attributes)', async () => {
    const delta = {
      ops: [{ insert: 'hello world\n' }],
    }
    const doc = await from('quill', JSON.stringify(delta))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })
})

// ─── toQuillDelta — round-trip ─────────────────────────────────────────────────

describe('toQuillDelta — round-trip', () => {
  it('bold text round-trips', async () => {
    const input = {
      ops: [
        { insert: 'hello', attributes: { bold: true } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(input))
    const output = JSON.parse(await to('quill', doc))
    const boldOp = output.ops.find(
      (op) =>
        typeof op.insert === 'string' &&
        op.insert !== '\n' &&
        op.attributes?.['bold'] === true,
    )
    expect(boldOp).toBeDefined()
  })

  it('heading level round-trips', async () => {
    const input = {
      ops: [{ insert: 'Title' }, { insert: '\n', attributes: { header: 2 } }],
    }
    const doc = await from('quill', JSON.stringify(input))
    const output = JSON.parse(await to('quill', doc))
    const newlineOp = output.ops.find(
      (op) => typeof op.insert === 'string' && op.insert === '\n',
    )
    expect(newlineOp?.attributes?.['header']).toBe(2)
  })

  it('bullet list round-trips', async () => {
    const input = {
      ops: [
        { insert: 'item one' },
        { insert: '\n', attributes: { list: 'bullet' } },
        { insert: 'item two' },
        { insert: '\n', attributes: { list: 'bullet' } },
      ],
    }
    const doc = await from('quill', JSON.stringify(input))
    const output = JSON.parse(await to('quill', doc))
    const listOps = output.ops.filter(
      (op) => typeof op.insert === 'string' && op.insert === '\n' && op.attributes?.['list'] === 'bullet',
    )
    expect(listOps.length).toBe(2)
  })

  it('ordered list round-trips', async () => {
    const input = {
      ops: [
        { insert: 'first' },
        { insert: '\n', attributes: { list: 'ordered' } },
        { insert: 'second' },
        { insert: '\n', attributes: { list: 'ordered' } },
      ],
    }
    const doc = await from('quill', JSON.stringify(input))
    const output = JSON.parse(await to('quill', doc))
    const listOps = output.ops.filter(
      (op) => typeof op.insert === 'string' && op.insert === '\n' && op.attributes?.['list'] === 'ordered',
    )
    expect(listOps.length).toBe(2)
  })

  it('link round-trips with url attr', async () => {
    const input = {
      ops: [
        { insert: 'click here', attributes: { link: 'https://example.com' } },
        { insert: '\n' },
      ],
    }
    const doc = await from('quill', JSON.stringify(input))
    const output = JSON.parse(await to('quill', doc))
    const linkOp = output.ops.find(
      (op) =>
        typeof op.insert === 'string' &&
        op.insert !== '\n' &&
        op.attributes?.['link'] !== undefined,
    )
    expect(linkOp).toBeDefined()
    expect(linkOp?.attributes?.['link']).toBe('https://example.com')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromQuillDelta → toHTML (cross-format via lens)', () => {
  it('bold → <strong>', async () => {
    const delta = {
      ops: [
        { insert: 'hello', attributes: { bold: true } },
        { insert: '\n' },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<strong>hello</strong>')
  })

  it('italic → <em>', async () => {
    const delta = {
      ops: [
        { insert: 'world', attributes: { italic: true } },
        { insert: '\n' },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<em>world</em>')
  })

  it('strike → <s>', async () => {
    const delta = {
      ops: [
        { insert: 'old', attributes: { strike: true } },
        { insert: '\n' },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<s>old</s>')
  })

  it('code → <code>', async () => {
    const delta = {
      ops: [
        { insert: 'x', attributes: { code: true } },
        { insert: '\n' },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<code>x</code>')
  })

  it('heading:1 → <h1>', async () => {
    const delta = {
      ops: [
        { insert: 'My Title' },
        { insert: '\n', attributes: { header: 1 } },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<h1>My Title</h1>')
  })

  it('heading:3 → <h3>', async () => {
    const delta = {
      ops: [
        { insert: 'Section' },
        { insert: '\n', attributes: { header: 3 } },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<h3>Section</h3>')
  })

  it('link → <a href>', async () => {
    const delta = {
      ops: [
        { insert: 'click here', attributes: { link: 'https://example.com' } },
        { insert: '\n' },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<a href="https://example.com">click here</a>')
  })

  it('paragraph → <p>', async () => {
    const delta = {
      ops: [{ insert: 'plain text\n' }],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<p>plain text</p>')
  })

  it('code-block → <pre><code>', async () => {
    const delta = {
      ops: [
        { insert: 'let x = 1;' },
        { insert: '\n', attributes: { 'code-block': true } },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<pre><code>')
    expect(html).toContain('let x = 1;')
  })

  it('bullet list → <ul><li>', async () => {
    const delta = {
      ops: [
        { insert: 'item' },
        { insert: '\n', attributes: { list: 'bullet' } },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const delta = {
      ops: [
        { insert: 'first' },
        { insert: '\n', attributes: { list: 'ordered' } },
      ],
    }
    const html = await to('html', await from('quill', JSON.stringify(delta)))
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })
})

// ─── fromQuillDelta — JSON string input ───────────────────────────────────────

describe('fromQuillDelta — JSON string input', () => {
  it('accepts a JSON string', async () => {
    const deltaStr = JSON.stringify({
      ops: [{ insert: 'hello\n' }],
    })
    const doc = await from('quill', JSON.stringify(deltaStr))
    expect(doc.text).toContain('hello')
  })
})
