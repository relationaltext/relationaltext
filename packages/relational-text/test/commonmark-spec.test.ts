import { beforeAll, describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import { normalizeHTML } from './test-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spec = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/commonmark-spec.json'), 'utf-8')
) as Array<{ markdown: string; html: string; example: number; section: string }>

beforeAll(() => {
  registerTestFormats('markdown', 'html')
})

describe('CommonMark spec compliance (0.31.2)', () => {
  for (const ex of spec) {
    it(`[${ex.example}] ${ex.section}`, async () => {
      expect(normalizeHTML(await to('html', await from('markdown', ex.markdown)))).toBe(normalizeHTML(ex.html))
    })
  }
})
