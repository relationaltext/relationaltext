import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('jupyter', 'html')
})

// ─── fromJupyter — block types ────────────────────────────────────────────────

describe('fromJupyter — block types', () => {
  it('markdown cell produces a markdown-cell block', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: ['# Hello\n', 'World'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.name).toBe('markdown')
    }
  })

  it('code cell produces a code block with language attr', async () => {
    const nb = {
      metadata: { kernelspec: { language: 'python' } },
      cells: [{ cell_type: 'code', source: ["print('hello')"] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.name).toBe('code')
      expect(block.attrs['language']).toBe('python')
    }
  })

  it('multiple cells produce correct block count', async () => {
    const nb = {
      cells: [
        { cell_type: 'markdown', source: ['# Title'] },
        { cell_type: 'code', source: ['x = 1'] },
        { cell_type: 'markdown', source: ['some text'] },
      ],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const blocks = hir.filter((n) => n.type === 'block')
    expect(blocks.length).toBe(3)
  })

  it('handles string source (not array)', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: 'Hello World' }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    expect(doc.text).toContain('Hello World')
  })

  it('handles array source joined correctly', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: ['line one\n', 'line two'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    expect(doc.text).toContain('line one\nline two')
  })

  it('code cell language comes from kernelspec', async () => {
    const nb = {
      metadata: { kernelspec: { language: 'julia' } },
      cells: [{ cell_type: 'code', source: ['1 + 1'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'code')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['language']).toBe('julia')
    }
  })

  it('cell id is preserved in attrs', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', id: 'cell-abc123', source: ['Hello'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'markdown')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['id']).toBe('cell-abc123')
    }
  })

  it('raw cell is treated as markdown-cell', async () => {
    const nb = {
      cells: [{ cell_type: 'raw', source: ['raw content'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.name).toBe('markdown')
    }
  })
})

// ─── Round-trip ────────────────────────────────────────────────────────────────

describe('fromJupyter / toJupyter — round-trip', () => {
  it('markdown cell source is preserved', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: ['# Hello\nWorld'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    const mdCell = out.cells.find((c) => c.cell_type === 'markdown')
    expect(mdCell).toBeDefined()
    const src = Array.isArray(mdCell!.source) ? mdCell!.source.join('') : mdCell!.source
    expect(src).toContain('# Hello\nWorld')
  })

  it('code cell source is preserved', async () => {
    const nb = {
      cells: [{ cell_type: 'code', source: ["print('hello')"] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    const codeCell = out.cells.find((c) => c.cell_type === 'code')
    expect(codeCell).toBeDefined()
    const src = Array.isArray(codeCell!.source) ? codeCell!.source.join('') : codeCell!.source
    expect(src).toContain("print('hello')")
  })

  it('cell count is preserved', async () => {
    const nb = {
      cells: [
        { cell_type: 'markdown', source: ['text'] },
        { cell_type: 'code', source: ['x = 1'] },
        { cell_type: 'markdown', source: ['more text'] },
      ],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    expect(out.cells.length).toBe(nb.cells.length)
  })

  it('cell types are preserved in round-trip', async () => {
    const nb = {
      cells: [
        { cell_type: 'markdown', source: ['text'] },
        { cell_type: 'code', source: ['x = 1'] },
      ],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    expect(out.cells[0]!.cell_type).toBe('markdown')
    expect(out.cells[1]!.cell_type).toBe('code')
  })

  it('code cell outputs are reset to empty array', async () => {
    const nb = {
      cells: [
        {
          cell_type: 'code',
          source: ["print('hello')"],
          outputs: [{ output_type: 'stream', text: ['hello\n'] }],
        },
      ],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    const codeCell = out.cells.find((c) => c.cell_type === 'code')
    expect(codeCell?.outputs).toEqual([])
  })
})

// ─── toJupyter — structure ────────────────────────────────────────────────────

describe('toJupyter — output structure', () => {
  it('returns valid nbformat 4 structure', async () => {
    const nb = {
      cells: [{ cell_type: 'code', source: ['x = 1'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    expect(out.nbformat).toBe(4)
    expect(out.nbformat_minor).toBe(5)
    expect(Array.isArray(out.cells)).toBe(true)
  })

  it('metadata has kernelspec', async () => {
    const nb = {
      metadata: { kernelspec: { language: 'python' } },
      cells: [{ cell_type: 'code', source: ['x = 1'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const out = JSON.parse(await to('jupyter', doc))
    expect(out.metadata).toBeDefined()
    expect(out.metadata?.kernelspec).toBeDefined()
    expect(out.metadata?.kernelspec?.language).toBeDefined()
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromJupyter → toHTML (cross-format via lens)', () => {
  it('markdown cell converts to a paragraph-like HTML element', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: ['Hello World'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('Hello World')
    expect(html.length).toBeGreaterThan(0)
  })

  it('code cell converts to <pre><code> in HTML', async () => {
    const nb = {
      cells: [{ cell_type: 'code', source: ["print('hello')"] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
  })
})

// ─── JSON string input ────────────────────────────────────────────────────────

describe('fromJupyter — JSON string input', () => {
  it('accepts a JSON string', async () => {
    const nb = {
      cells: [{ cell_type: 'markdown', source: ['Hello from JSON'] }],
    }
    const doc = await from('jupyter', JSON.stringify(nb))
    expect(doc.text).toContain('Hello from JSON')
  })
})
