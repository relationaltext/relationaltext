import { describe, it, expect } from 'vitest'
import { applyViewState } from './applyViewState'
import type { HIRNode, HIRBlockNode, HIRTextNode } from 'relational-text/types'

function text(content: string, marks: HIRTextNode['marks'] = []): HIRTextNode {
  return { type: 'text', content, marks }
}

function paragraph(...children: HIRNode[]): HIRBlockNode {
  return { type: 'block', name: 'paragraph', attrs: {}, children }
}

const defaultState = {
  scaleFactor: 1,
  unitSystem: 'imperial' as const,
  tempUnit: 'F' as const,
  activeAnnotationId: null as string | null,
  visibleAnnotations: new Set(['ingredient-def', 'ingredient-ref', 'step-def', 'timer-ref', 'temp-ref', 'equipment-ref', 'technique-ref']),
}

describe('applyViewState', () => {
  it('returns hir unchanged when all defaults', () => {
    const hir: HIRNode[] = [paragraph(text('hello'))]
    const result = applyViewState(hir, defaultState)
    expect(result).toEqual(hir)
  })

  it('sets active: true on marks matching activeAnnotationId', () => {
    const hir: HIRNode[] = [
      paragraph(text('flour', [
        { kind: 'org.relationaltext.facet#ingredient-def', attrs: { id: 'uuid-1', name: 'flour' } },
      ])),
    ]
    const result = applyViewState(hir, { ...defaultState, activeAnnotationId: 'uuid-1' })
    const mark = (result[0] as HIRBlockNode).children[0] as HIRTextNode
    expect(mark.marks[0]!.attrs.active).toBe(true)
  })

  it('sets active: true on ref marks matching via attrs.ref', () => {
    const hir: HIRNode[] = [
      paragraph(text('flour', [
        { kind: 'org.relationaltext.facet#ingredient-ref', attrs: { ref: 'uuid-1' } },
      ])),
    ]
    const result = applyViewState(hir, { ...defaultState, activeAnnotationId: 'uuid-1' })
    const mark = (result[0] as HIRBlockNode).children[0] as HIRTextNode
    expect(mark.marks[0]!.attrs.active).toBe(true)
  })

  it('injects scaleFactor into ingredient marks', () => {
    const hir: HIRNode[] = [
      paragraph(text('flour', [
        { kind: 'org.relationaltext.facet#ingredient-def', attrs: { id: 'uuid-1', amount: 2 } },
      ])),
    ]
    const result = applyViewState(hir, { ...defaultState, scaleFactor: 2 })
    const mark = (result[0] as HIRBlockNode).children[0] as HIRTextNode
    expect(mark.marks[0]!.attrs.scaleFactor).toBe(2)
  })

  it('injects unitSystem and tempUnit into relevant marks', () => {
    const hir: HIRNode[] = [
      paragraph(text('350F', [
        { kind: 'org.relationaltext.facet#temp-ref', attrs: { fahrenheit: 350 } },
      ])),
    ]
    const result = applyViewState(hir, { ...defaultState, unitSystem: 'metric-vol', tempUnit: 'C' })
    const mark = (result[0] as HIRBlockNode).children[0] as HIRTextNode
    expect(mark.marks[0]!.attrs.unitSystem).toBe('metric-vol')
    expect(mark.marks[0]!.attrs.tempUnit).toBe('C')
  })

  it('sets hidden: true on marks not in visibleAnnotations', () => {
    const hir: HIRNode[] = [
      paragraph(text('flour', [
        { kind: 'org.relationaltext.facet#ingredient-def', attrs: { id: 'uuid-1' } },
      ])),
    ]
    const result = applyViewState(hir, {
      ...defaultState,
      visibleAnnotations: new Set(['step-def']),
    })
    const mark = (result[0] as HIRBlockNode).children[0] as HIRTextNode
    expect(mark.marks[0]!.attrs.hidden).toBe(true)
  })

  it('does not modify marks with no matching view state', () => {
    const hir: HIRNode[] = [
      paragraph(text('bold text', [
        { kind: 'org.relationaltext.facet#bold', attrs: {} },
      ])),
    ]
    const result = applyViewState(hir, defaultState)
    expect(result).toEqual(hir)
  })
})
