import { describe, it, expect, beforeAll } from 'vitest'
import { from } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => { registerTestFormats('mediawiki') })

function dumpHir(nodes: any[], indent = ''): string[] {
  const lines: string[] = []
  for (const n of nodes) {
    if (n.type === 'text') {
      lines.push(`${indent}TEXT: "${n.content.slice(0, 40)}" marks=[${n.marks.map((m: any) => m.kind.replace('org.relationaltext.facet#', '')).join(',')}]`)
    } else {
      lines.push(`${indent}${n.type.toUpperCase()}: name=${n.name} attrs=${JSON.stringify(n.attrs)}`)
      if (n.children) lines.push(...dumpHir(n.children, indent + '  '))
    }
  }
  return lines
}

describe('HIR debug', () => {
  it('shows heading structure', async () => {
    const doc = await from('mediawiki', '== Ingredients ==\n* 1 cup flour\n* 2 eggs\n\n== Procedure ==\nMix everything.')
    const hir = doc.toHIR()
    const lines = dumpHir(hir)
    console.log('\nHIR DUMP:\n' + lines.join('\n'))
    // Check headings exist as block nodes
    const headingLines = lines.filter(l => l.includes('name=heading'))
    expect(headingLines.length).toBeGreaterThan(0)
  })

  it('shows real recipe structure', async () => {
    const doc = await from('mediawiki', '{{recipesummary|servings=4|time=30 min}}\n== Ingredients ==\n* 1 cup flour\n* 2 eggs\n\n== Procedure ==\n# Mix dry ingredients.\n# Add eggs and stir.\n\n== Notes ==\nThis is a simple recipe.<ref name="source">Some cookbook</ref>')
    const hir = doc.toHIR()
    const lines = dumpHir(hir)
    console.log('\nRECIPE HIR DUMP:\n' + lines.join('\n'))
    expect(lines.length).toBeGreaterThan(0)
  })
})
