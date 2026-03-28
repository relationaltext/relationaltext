import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import type { HIRNode, HIRBlockNode } from '../src/types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function singlePage(title: string, children: any[] = []) {
  return [{ title, children }]
}

function singleBlock(str: string, opts: { uid?: string; order?: number; children?: any[] } = {}) {
  return { string: str, ...opts }
}

/** Recursively collect all block nodes from the HIR tree. */
function collectBlocks(nodes: HIRNode[]): HIRBlockNode[] {
  const result: HIRBlockNode[] = []
  for (const node of nodes) {
    if (node.type === 'block') {
      result.push(node)
      result.push(...collectBlocks(node.children))
    } else if (node.type === 'container') {
      result.push(...collectBlocks(node.children))
    }
  }
  return result
}

// ─── fromRoam — page ──────────────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('roam', 'html')
})

describe('fromRoam — page', () => {
  it('single page produces a page block with the title', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('My Page')))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const pageBlock = allBlocks.find((b) => b.name === 'page')
    expect(pageBlock).toBeDefined()
    if (pageBlock !== undefined) {
      expect(pageBlock.attrs['title']).toBe('My Page')
    }
  })

  it('page title text appears in the document text', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Hello World')))
    expect(doc.text).toContain('Hello World')
  })

  it('page uid is preserved in block attrs', async () => {
    const input = [{ title: 'My Page', uid: 'page-uid-123', children: [] }]
    const doc = await from('roam', JSON.stringify(input))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const pageBlock = allBlocks.find((b) => b.name === 'page')
    expect(pageBlock).toBeDefined()
    if (pageBlock !== undefined) {
      expect(pageBlock.attrs['uid']).toBe('page-uid-123')
    }
  })
})

// ─── fromRoam — blocks ────────────────────────────────────────────────────────

describe('fromRoam — blocks', () => {
  it('block content appears in the document', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('Hello block')])))
    expect(doc.text).toContain('Hello block')
  })

  it('block uid is preserved in block attrs', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('Some text', { uid: 'blk-abc' })])))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const blockNode = allBlocks.find((b) => b.name === 'block')
    expect(blockNode).toBeDefined()
    if (blockNode !== undefined) {
      expect(blockNode.attrs['uid']).toBe('blk-abc')
    }
  })

  it('blocks are sorted by order', async () => {
    const blocks = [
      { string: 'second', order: 1 },
      { string: 'first', order: 0 },
    ]
    const doc = await from('roam', JSON.stringify(singlePage('Page', blocks)))
    const firstIdx = doc.text.indexOf('first')
    const secondIdx = doc.text.indexOf('second')
    expect(firstIdx).toBeLessThan(secondIdx)
  })
})

// ─── fromRoam — inline marks ──────────────────────────────────────────────────

describe('fromRoam — inline marks', () => {
  it('bold (**text**) produces a bold mark', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('**bold text**')])))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const blockNode = allBlocks.find((b) => b.name === 'block')
    expect(blockNode).toBeDefined()
    if (blockNode !== undefined) {
      const boldSeg = blockNode.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.roamresearch.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('italic (__text__) produces an italic mark', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('__italic text__')])))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const blockNode = allBlocks.find((b) => b.name === 'block')
    expect(blockNode).toBeDefined()
    if (blockNode !== undefined) {
      const seg = blockNode.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.roamresearch.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('highlight (^^text^^) produces a highlight mark', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('^^highlighted^^')])))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const blockNode = allBlocks.find((b) => b.name === 'block')
    expect(blockNode).toBeDefined()
    if (blockNode !== undefined) {
      const seg = blockNode.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.roamresearch.facet#highlight'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('inline code (`text`) produces a code mark', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('`inline code`')])))
    const hir = doc.toHIR()
    const allBlocks = collectBlocks(hir)
    const blockNode = allBlocks.find((b) => b.name === 'block')
    expect(blockNode).toBeDefined()
    if (blockNode !== undefined) {
      const seg = blockNode.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.roamresearch.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── fromRoam — entities ──────────────────────────────────────────────────────

describe('fromRoam — entities', () => {
  it('page-ref ([[Page Name]]) produces a page-ref entity with title', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('See [[My Reference]]')])))
    const facets = doc.facets
    const pageRefFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        return rec['name'] === 'page-ref' && rec['title'] === 'My Reference'
      }),
    )
    expect(pageRefFacet).toBeDefined()
  })

  it('block-ref (((uid))) produces a block-ref entity with uid', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('Ref: ((uid123))')])))
    const facets = doc.facets
    const blockRefFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        return rec['name'] === 'block-ref' && rec['uid'] === 'uid123'
      }),
    )
    expect(blockRefFacet).toBeDefined()
  })

  it('#tag produces a tag entity with the tag name', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('#mytag')])))
    const facets = doc.facets
    const tagFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        return rec['name'] === 'tag' && rec['tag'] === 'mytag'
      }),
    )
    expect(tagFacet).toBeDefined()
  })

  it('#[[tag with spaces]] produces a tag entity with the full tag name', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('#[[my tag with spaces]]')])))
    const facets = doc.facets
    const tagFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        return rec['name'] === 'tag' && rec['tag'] === 'my tag with spaces'
      }),
    )
    expect(tagFacet).toBeDefined()
  })

  it('[text](url) produces a link entity with uri', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('[click here](https://example.com)')])))
    const facets = doc.facets
    const linkFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        return rec['name'] === 'link' && rec['uri'] === 'https://example.com'
      }),
    )
    expect(linkFacet).toBeDefined()
    expect(doc.text).toContain('click here')
  })
})

// ─── fromRoam — nesting ───────────────────────────────────────────────────────

describe('fromRoam — nesting', () => {
  it('child block has parents including "block" in the raw facets', async () => {
    const childBlock = { string: 'Child block', uid: 'child-uid' }
    const doc = await from('roam', JSON.stringify(singlePage('Page', [{ string: 'Parent block', children: [childBlock] }])))
    const facets = doc.facets
    // Find a facet whose feature has name='block' and parents includes 'block'
    const nestedBlockFacet = facets.find((f) =>
      f.features.some((feat) => {
        const rec = feat as Record<string, unknown>
        const parents = rec['parents'] as string[] | undefined
        return rec['name'] === 'block' && Array.isArray(parents) && parents.includes('block')
      }),
    )
    expect(nestedBlockFacet).toBeDefined()
  })

  it('nested blocks produce multiple block entries in the HIR', async () => {
    const childBlock = { string: 'Nested', uid: 'nested-uid' }
    const doc = await from('roam', JSON.stringify(singlePage('Page', [{ string: 'Parent', children: [childBlock] }])))
    const hir = doc.toHIR()
    // The parent block becomes a Container (named "block") in the HIR when it has child blocks.
    // Count both Block and Container nodes named "block" to verify nesting is present.
    function countBlockNodes(nodes: HIRNode[]): number {
      let count = 0
      for (const node of nodes) {
        if ((node.type === 'block' || node.type === 'container') && node.name === 'block') {
          count++
        }
        if ('children' in node) {
          count += countBlockNodes(node.children as HIRNode[])
        }
      }
      return count
    }
    expect(countBlockNodes(hir)).toBeGreaterThanOrEqual(2)
  })
})

// ─── fromRoam — multiple pages ────────────────────────────────────────────────

describe('fromRoam — multiple pages', () => {
  it('multiple pages in array each produce a page block', async () => {
    const input = [
      { title: 'Page One', children: [] },
      { title: 'Page Two', children: [] },
    ]
    const doc = await from('roam', JSON.stringify(input))
    const facets = doc.facets
    const pageFacets = facets.filter((f) =>
      f.features.some((feat) => (feat as Record<string, unknown>)['name'] === 'page'),
    )
    expect(pageFacets.length).toBe(2)
    expect(doc.text).toContain('Page One')
    expect(doc.text).toContain('Page Two')
  })
})

// ─── fromRoam — JSON string input ─────────────────────────────────────────────

describe('fromRoam — JSON string input', () => {
  it('accepts a JSON string', async () => {
    const jsonStr = JSON.stringify(singlePage('String Page', [singleBlock('block content')]))
    const doc = await from('roam', jsonStr)
    expect(doc.text).toContain('String Page')
    expect(doc.text).toContain('block content')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromRoam → toHTML (cross-format via lens)', () => {
  it('page title → to(html, doc) → heading element', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('My Title')))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<h1')
    expect(html).toContain('My Title')
  })

  it('bold in block → to(html, doc) → <strong>bold</strong>', async () => {
    const doc = await from('roam', JSON.stringify(singlePage('Page', [singleBlock('**bold**')])))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })
})
