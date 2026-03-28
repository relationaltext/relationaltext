import type { HIRNode, HIRTextNode, HIRMark } from 'relational-text/types'

export interface ViewState {
  scaleFactor: number
  unitSystem: 'original' | 'imperial-vol' | 'imperial-wt' | 'metric-vol' | 'metric-wt'
  tempUnit: 'F' | 'C'
  activeAnnotationId: string | null
  visibleAnnotations: Set<string>
}

/** Extract short mark name from compound kind like "org.relationaltext.facet#ingredient-def" */
function markName(kind: string): string {
  const idx = kind.lastIndexOf('#')
  return idx >= 0 ? kind.slice(idx + 1) : kind
}

/** Mark names that receive scale/unit view state */
const RECIPE_MARKS = new Set([
  'ingredient-def', 'ingredient-ref', 'temp-def', 'temp-ref',
  'timer-def', 'timer-ref', 'step-def', 'equipment-def', 'equipment-ref',
  'technique-def', 'technique-ref',
])

/**
 * Walk an HIR tree and inject view state into mark attrs.
 *
 * - Sets `active: true` on marks matching activeAnnotationId
 * - Sets `hidden: true` on marks not in visibleAnnotations
 * - Injects `scaleFactor`, `unitSystem`, `tempUnit` into recipe marks
 *
 * Returns the original tree if no modifications are needed (identity optimization).
 */
export function applyViewState(hir: HIRNode[], state: ViewState): HIRNode[] {
  const isDefault = state.scaleFactor === 1
    && state.unitSystem === 'original'
    && state.tempUnit === 'F'
    && state.activeAnnotationId === null
    && needsNoVisibilityChanges(state.visibleAnnotations)

  if (isDefault) return hir

  return hir.map(node => transformNode(node, state))
}

function needsNoVisibilityChanges(visible: Set<string>): boolean {
  for (const name of RECIPE_MARKS) {
    if (!visible.has(name)) return false
  }
  return true
}

function transformNode(node: HIRNode, state: ViewState): HIRNode {
  switch (node.type) {
    case 'text':
      return transformTextNode(node, state)
    case 'block':
    case 'container':
      return {
        ...node,
        children: node.children.map(child => transformNode(child, state)),
      }
    default:
      return node
  }
}

function transformTextNode(node: HIRTextNode, state: ViewState): HIRTextNode {
  let changed = false
  const newMarks = node.marks.map(mark => {
    const newMark = transformMark(mark, state)
    if (newMark !== mark) changed = true
    return newMark
  })
  return changed ? { ...node, marks: newMarks } : node
}

function transformMark(mark: HIRMark, state: ViewState): HIRMark {
  const name = markName(mark.kind)
  const additions: Record<string, unknown> = {}

  // Active annotation highlighting
  if (state.activeAnnotationId) {
    if (mark.attrs.id === state.activeAnnotationId || mark.attrs.ref === state.activeAnnotationId) {
      additions.active = true
    }
  }

  // Visibility
  if (RECIPE_MARKS.has(name) && !state.visibleAnnotations.has(name)) {
    additions.hidden = true
  }

  // Scale and units for recipe marks
  if (RECIPE_MARKS.has(name)) {
    if (state.scaleFactor !== 1) additions.scaleFactor = state.scaleFactor
    if (state.unitSystem !== 'original') additions.unitSystem = state.unitSystem
    if (state.tempUnit !== 'F') additions.tempUnit = state.tempUnit
  }

  if (Object.keys(additions).length === 0) return mark
  return { ...mark, attrs: { ...mark.attrs, ...additions } }
}
