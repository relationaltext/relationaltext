import React, { type ComponentType, type ReactNode } from 'react'
import type { HIRNode, HIRBlockNode, HIRContainerNode, HIRTextNode } from 'relational-text/types'

interface DocumentRendererProps {
  hir: HIRNode[]
  components?: Record<string, ComponentType<{ name: string; attrs: Record<string, unknown>; children: ReactNode }>>
}

// ─── Default block → HTML element mapping ────────────────────────────────────

const BLOCK_ELEMENTS: Record<string, string> = {
  paragraph: 'p',
  'list-item-text': 'li',
  'code-block': 'pre',
  'horizontal-rule': 'hr',
  'thematic-break': 'hr',
}

/** Marker blocks are structural artifacts — they should not render any HTML. */
const SKIP_BLOCKS = new Set([
  'bullet-list-marker',
  'ordered-list-marker',
  'list-item-marker',
])

function headingTag(level: number): string {
  return `h${Math.min(Math.max(level, 1), 6)}`
}

const CONTAINER_ELEMENTS: Record<string, string> = {
  blockquote: 'blockquote',
  ul: 'ul',
  ol: 'ol',
}

/** Item containers group a single list item's content — render as fragment, not a nested list. */
const FRAGMENT_CONTAINERS = new Set(['unordered-list-item', 'ordered-list-item'])

// ─── Mark kind → short name mapping ──────────────────────────────────────────

/** Extract the short name from a compound HIR mark kind like "org.relationaltext.richtext.mark#ingredient-def" */
function markName(kind: string): string {
  const hashIdx = kind.lastIndexOf('#')
  return hashIdx >= 0 ? kind.slice(hashIdx + 1) : kind
}

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * Render an HIR tree as React elements.
 *
 * Pure tree-to-React bridge: takes a pre-built HIR (from `doc.toHIR()` and
 * any transforms like `wrapSections`) and walks it to produce React elements.
 *
 * The `components` prop provides custom renderers for specific node names
 * (e.g. "ingredient-def" → colored highlight, "section" → wrapper with
 * data attributes). Block and container elements use default HTML elements
 * unless overridden via components.
 */
export function DocumentRenderer({ hir, components }: DocumentRendererProps) {
  function renderNode(node: HIRNode, key: string): ReactNode {
    switch (node.type) {
      case 'text':
        return renderTextNode(node, key)
      case 'block':
        return renderBlockNode(node, key)
      case 'container':
        return renderContainerNode(node, key)
      default:
        return null
    }
  }

  function renderTextNode(node: HIRTextNode, key: string): ReactNode {
    if (node.marks.length === 0) {
      return node.content
    }

    // Wrap text in mark components, outermost first
    let result: ReactNode = node.content
    for (const mark of node.marks) {
      const name = markName(mark.kind)
      const Comp = components?.[name]
      if (Comp) {
        result = (
          <Comp key={key} name={name} attrs={mark.attrs}>
            {result}
          </Comp>
        )
      }
    }
    return result
  }

  function renderBlockNode(node: HIRBlockNode, key: string): ReactNode {
    // Skip structural marker blocks (they produce empty <p> tags that break list numbering)
    if (SKIP_BLOCKS.has(node.name)) return null

    const children = node.children.map((child, i) => renderNode(child, `${key}-${i}`))

    // Check for custom component first
    const Comp = components?.[node.name]
    if (Comp) {
      return (
        <Comp key={key} name={node.name} attrs={node.attrs}>
          {children}
        </Comp>
      )
    }

    // Heading: use level attr
    if (node.name === 'heading') {
      const level = (node.attrs.level as number) ?? 2
      return React.createElement(headingTag(level), { key }, children)
    }

    // Default block element mapping
    const tag = BLOCK_ELEMENTS[node.name] ?? 'p'

    // Skip empty blocks (e.g. block markers with no content)
    if (children.length === 0) return null

    return React.createElement(tag, { key }, children)
  }

  function renderContainerNode(node: HIRContainerNode, key: string): ReactNode {
    const children = node.children.map((child, i) => renderNode(child, `${key}-${i}`))

    // Check for custom component first
    const Comp = components?.[node.name]
    if (Comp) {
      return (
        <Comp key={key} name={node.name} attrs={node.attrs}>
          {children}
        </Comp>
      )
    }

    // Item containers (unordered-list-item, ordered-list-item) are grouping wrappers
    // for a single list item — render as fragment so the outer ul/ol owns all <li>s
    if (FRAGMENT_CONTAINERS.has(node.name)) {
      return <React.Fragment key={key}>{children}</React.Fragment>
    }

    // Default container element mapping
    const tag = CONTAINER_ELEMENTS[node.name] ?? 'div'
    return React.createElement(tag, { key }, children)
  }

  return (
    <div>
      {hir.map((node, i) => renderNode(node, `r-${i}`))}
    </div>
  )
}
