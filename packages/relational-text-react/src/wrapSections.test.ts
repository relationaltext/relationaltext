import { describe, it, expect } from 'vitest'
import { wrapSections } from './wrapSections'
import type { HIRNode, HIRBlockNode, HIRContainerNode } from 'relational-text/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function heading(level: number, text: string): HIRBlockNode {
  return {
    type: 'block',
    name: 'heading',
    attrs: { level },
    children: [{ type: 'text', content: text, marks: [] }],
  }
}

function paragraph(text: string): HIRBlockNode {
  return {
    type: 'block',
    name: 'paragraph',
    attrs: {},
    children: [{ type: 'text', content: text, marks: [] }],
  }
}

function ul(...items: string[]): HIRContainerNode {
  return {
    type: 'container',
    name: 'unordered-list-item',
    attrs: {},
    children: items.map(t => ({
      type: 'block' as const,
      name: 'list-item-text' as const,
      attrs: {},
      children: [{ type: 'text' as const, content: t, marks: [] }],
    })),
  }
}

function sectionNode(name: string, level: number, children: HIRNode[]): HIRContainerNode {
  return {
    type: 'container',
    name: 'section',
    attrs: { name, level },
    children,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('wrapSections', () => {
  it('returns empty array for empty input', () => {
    expect(wrapSections([])).toEqual([])
  })

  it('passes through nodes before the first heading unwrapped', () => {
    const nodes: HIRNode[] = [paragraph('intro')]
    const result = wrapSections(nodes)
    expect(result).toEqual([paragraph('intro')])
  })

  it('wraps a heading and its content siblings into a section', () => {
    const nodes: HIRNode[] = [
      heading(2, 'Ingredients'),
      ul('flour', 'sugar'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      sectionNode('Ingredients', 2, [
        heading(2, 'Ingredients'),
        ul('flour', 'sugar'),
      ]),
    ])
  })

  it('splits at next heading of same level', () => {
    const nodes: HIRNode[] = [
      heading(2, 'Ingredients'),
      ul('flour'),
      heading(2, 'Method'),
      paragraph('Mix well.'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      sectionNode('Ingredients', 2, [
        heading(2, 'Ingredients'),
        ul('flour'),
      ]),
      sectionNode('Method', 2, [
        heading(2, 'Method'),
        paragraph('Mix well.'),
      ]),
    ])
  })

  it('nests sub-headings inside parent section', () => {
    const nodes: HIRNode[] = [
      heading(2, 'Ingredients'),
      heading(3, 'For the cake'),
      ul('flour'),
      heading(3, 'For the frosting'),
      ul('butter'),
      heading(2, 'Method'),
      paragraph('Bake.'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      sectionNode('Ingredients', 2, [
        heading(2, 'Ingredients'),
        heading(3, 'For the cake'),
        ul('flour'),
        heading(3, 'For the frosting'),
        ul('butter'),
      ]),
      sectionNode('Method', 2, [
        heading(2, 'Method'),
        paragraph('Bake.'),
      ]),
    ])
  })

  it('handles higher-level heading ending a section', () => {
    const nodes: HIRNode[] = [
      heading(3, 'Sub-section'),
      paragraph('detail'),
      heading(2, 'Top-level'),
      paragraph('broad'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      sectionNode('Sub-section', 3, [
        heading(3, 'Sub-section'),
        paragraph('detail'),
      ]),
      sectionNode('Top-level', 2, [
        heading(2, 'Top-level'),
        paragraph('broad'),
      ]),
    ])
  })

  it('handles preamble text before first heading', () => {
    const nodes: HIRNode[] = [
      paragraph('intro text'),
      heading(2, 'Section A'),
      paragraph('content'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      paragraph('intro text'),
      sectionNode('Section A', 2, [
        heading(2, 'Section A'),
        paragraph('content'),
      ]),
    ])
  })

  it('handles heading with no content after it', () => {
    const nodes: HIRNode[] = [
      heading(2, 'Empty Section'),
    ]
    const result = wrapSections(nodes)
    expect(result).toEqual([
      sectionNode('Empty Section', 2, [
        heading(2, 'Empty Section'),
      ]),
    ])
  })
})
