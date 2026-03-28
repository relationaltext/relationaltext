import type { HIRNode, HIRBlockNode, HIRContainerNode, HIRTextNode } from 'relational-text/types'

/**
 * Extract the text content from a heading block's children.
 */
function headingText(node: HIRBlockNode): string {
  return node.children
    .filter((c): c is HIRTextNode => c.type === 'text')
    .map(c => c.content)
    .join('')
    .trim()
}

/**
 * If the node is a heading block, return its level; otherwise null.
 */
function headingLevel(node: HIRNode): number | null {
  if (node.type === 'block' && node.name === 'heading') {
    return (node.attrs.level as number) ?? 2
  }
  return null
}

/**
 * Wrap top-level HIR nodes into section containers grouped by heading.
 *
 * Each heading and all siblings following it (until the next heading of the
 * same or higher level) are wrapped in a container node with:
 *   type: 'container', name: 'section', attrs: { name, level }
 *
 * Nodes before the first heading pass through unwrapped.
 */
export function wrapSections(hir: HIRNode[]): HIRNode[] {
  const result: HIRNode[] = []
  let currentSection: { name: string; level: number; children: HIRNode[] } | null = null

  function flushSection() {
    if (currentSection) {
      result.push({
        type: 'container',
        name: 'section',
        attrs: { name: currentSection.name, level: currentSection.level },
        children: currentSection.children,
      } satisfies HIRContainerNode)
      currentSection = null
    }
  }

  for (const node of hir) {
    const level = headingLevel(node)

    if (level !== null) {
      // This is a heading — does it start a new section?
      if (currentSection === null || level <= currentSection.level) {
        // Start new section (same/higher level closes previous)
        flushSection()
        currentSection = {
          name: headingText(node as HIRBlockNode),
          level,
          children: [node],
        }
      } else {
        // Sub-heading — stays inside current section
        currentSection.children.push(node)
      }
    } else if (currentSection) {
      // Non-heading content inside a section
      currentSection.children.push(node)
    } else {
      // Preamble — no section yet
      result.push(node)
    }
  }

  flushSection()
  return result
}
