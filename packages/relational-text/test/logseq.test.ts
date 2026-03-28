import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromLogseq — block parsing ───────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('logseq', 'html')
})

describe('fromLogseq — block parsing', () => {
  it('parses a simple bullet as a block feature', async () => {
    const doc = await from('logseq', '- block content')
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.name).toBe('block')
    }
  })

  it('parses block text content', async () => {
    const doc = await from('logseq', '- hello world')
    expect(doc.text).toContain('hello world')
  })
})

// ─── fromLogseq — inline marks ────────────────────────────────────────────────

describe('fromLogseq — inline marks', () => {
  it('parses **bold** as bold mark', async () => {
    const doc = await from('logseq', '- **bold**')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses *italic* as italic mark', async () => {
    const doc = await from('logseq', '- *italic*')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ~~strike~~ as strikethrough mark', async () => {
    const doc = await from('logseq', '- ~~strike~~')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses `code` as code mark', async () => {
    const doc = await from('logseq', '- `code`')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── fromLogseq — Logseq-specific entities ────────────────────────────────────

describe('fromLogseq — Logseq-specific entities', () => {
  it('parses [[Page Name]] as page-ref entity with title', async () => {
    const doc = await from('logseq', '- [[Page Name]]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#page-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.logseq.facet#page-ref')
        expect(mark?.attrs['title']).toBe('Page Name')
      }
    }
  })

  it('parses ((uuid-123)) as block-ref entity with uuid', async () => {
    const doc = await from('logseq', '- ((uuid-123))')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#block-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.logseq.facet#block-ref')
        expect(mark?.attrs['uuid']).toBe('uuid-123')
      }
    }
  })

  it('parses #tag as tag entity with name', async () => {
    const doc = await from('logseq', '- #tag')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#tag'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.logseq.facet#tag')
        expect(mark?.attrs['tagName']).toBe('tag')
      }
    }
  })

  it('parses #[[tag with spaces]] as tag entity with correct name', async () => {
    const doc = await from('logseq', '- #[[tag with spaces]]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#tag'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.logseq.facet#tag')
        expect(mark?.attrs['tagName']).toBe('tag with spaces')
      }
    }
  })

  it('parses [text](url) as link entity', async () => {
    const doc = await from('logseq', '- [click here](https://example.com)')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.logseq.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.logseq.facet#link')
        expect(mark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromLogseq — task states ─────────────────────────────────────────────────

describe('fromLogseq — task states', () => {
  it('parses TODO prefix as block with todo attr', async () => {
    const doc = await from('logseq', '- TODO task content')
    const facets = doc.facets
    const blockFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          (feat as Record<string, unknown>)['$type'] === 'com.logseq.facet' &&
          (feat as Record<string, unknown>)['name'] === 'block',
      ),
    )
    expect(blockFacet).toBeDefined()
    const feat = blockFacet?.features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'block',
    ) as Record<string, unknown> | undefined
    expect((feat?.['attrs'] as Record<string, unknown> | undefined)?.['todo']).toBe('TODO')
    // Content should not include "TODO "
    expect(doc.text).toContain('task content')
  })

  it('parses DONE prefix as block with todo=DONE', async () => {
    const doc = await from('logseq', '- DONE finished task')
    const facets = doc.facets
    const blockFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          (feat as Record<string, unknown>)['$type'] === 'com.logseq.facet' &&
          (feat as Record<string, unknown>)['name'] === 'block',
      ),
    )
    expect(blockFacet).toBeDefined()
    const feat = blockFacet?.features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'block',
    ) as Record<string, unknown> | undefined
    expect((feat?.['attrs'] as Record<string, unknown> | undefined)?.['todo']).toBe('DONE')
    expect(doc.text).toContain('finished task')
  })
})

// ─── fromLogseq — nested blocks ───────────────────────────────────────────────

describe('fromLogseq — nested blocks', () => {
  it('child block at 2-space indent has non-empty parents', async () => {
    const input = '- parent\n  - child'
    const doc = await from('logseq', input)
    const facets = doc.facets
    // Find the child block facet — it should have parents: ['block']
    const childFacet = facets.find((f) =>
      f.features.some((feat) => {
        const ft = feat as Record<string, unknown>
        return (
          ft['$type'] === 'com.logseq.facet' &&
          ft['name'] === 'block' &&
          Array.isArray(ft['parents']) &&
          (ft['parents'] as string[]).length > 0
        )
      }),
    )
    expect(childFacet).toBeDefined()
    const feat = childFacet?.features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'block',
    ) as Record<string, unknown> | undefined
    expect(feat?.['parents']).toEqual(['block'])
  })

  it('grandchild at 4-space indent has 2-element parents array', async () => {
    const input = '- top\n  - middle\n    - deep'
    const doc = await from('logseq', input)
    const facets = doc.facets
    const deepFacet = facets.find((f) =>
      f.features.some((feat) => {
        const ft = feat as Record<string, unknown>
        return (
          ft['$type'] === 'com.logseq.facet' &&
          ft['name'] === 'block' &&
          Array.isArray(ft['parents']) &&
          (ft['parents'] as string[]).length === 2
        )
      }),
    )
    expect(deepFacet).toBeDefined()
  })
})

// ─── fromLogseq — property lines ─────────────────────────────────────────────

describe('fromLogseq — property lines', () => {
  it('parses key:: value as property block with key and value attrs', async () => {
    const doc = await from('logseq', '- key:: value')
    const facets = doc.facets
    const propFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          (feat as Record<string, unknown>)['$type'] === 'com.logseq.facet' &&
          (feat as Record<string, unknown>)['name'] === 'property',
      ),
    )
    expect(propFacet).toBeDefined()
    const feat = propFacet?.features.find(
      (f) => (f as Record<string, unknown>)['name'] === 'property',
    ) as Record<string, unknown> | undefined
    const attrs = feat?.['attrs'] as Record<string, unknown> | undefined
    expect(attrs?.['key']).toBe('key')
    expect(attrs?.['value']).toBe('value')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromLogseq → toHTML (cross-format via lens)', () => {
  it('**bold** → contains <strong>bold</strong>', async () => {
    const doc = await from('logseq', '- **bold**')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('[[Page Name]] → contains page name in HTML output', async () => {
    const doc = await from('logseq', '- [[Page]]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('Page')
  })
})
