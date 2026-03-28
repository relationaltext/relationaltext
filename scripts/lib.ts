/**
 * Shared utilities for RelationalText format-lexicon generator scripts.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import * as http from 'node:http'
import * as crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const OUT_DIR = path.join(ROOT, 'packages/relational-text/src/lexicons')
export const CACHE_DIR = path.join(ROOT, 'scripts/cache')

// ─── Feature types ────────────────────────────────────────────────────────────

export type FeatureClass = 'inline' | 'block' | 'entity'

export interface FeatureEntry {
  typeId: string
  featureClass: FeatureClass
  expandStart?: boolean
  expandEnd?: boolean
  specSection?: string
}

// ─── Expand semantics override table ─────────────────────────────────────────
// [expandStart, expandEnd] keyed by feature name.
// Bold/italic/strikethrough/ins/mark expand both sides (Peritext model).
// Code, links, keyboard, etc. do not.

export const EXPAND: Record<string, [boolean, boolean]> = {
  // CommonMark
  strong:        [true,  true ],
  emphasis:      [true,  true ],
  strikethrough: [true,  true ],
  'code-span':   [false, false],
  underline:     [false, false],
  superscript:   [false, false],
  subscript:     [false, false],
  keyboard:      [false, false],
  // HTML
  em:    [true,  true ],
  s:     [true,  true ],
  u:     [false, false],
  sup:   [false, false],
  sub:   [false, false],
  kbd:   [false, false],
  code:  [false, false],
  mark:  [true,  true ],
  ins:   [true,  true ],
  abbr:  [false, false],
  q:     [false, false],
  small: [false, false],
  cite:  [false, false],
  dfn:   [false, false],
  time:  [false, false],
  var:   [false, false],
  samp:  [false, false],
  span:  [false, false],
}

// ─── HTTP fetch with local file cache ────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function cacheKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16) + '.cache'
}

export async function fetchWithCache(url: string): Promise<string> {
  ensureDir(CACHE_DIR)
  const keyFile = path.join(CACHE_DIR, cacheKey(url))
  if (fs.existsSync(keyFile)) {
    console.log(`  (cached) ${url}`)
    return fs.readFileSync(keyFile, 'utf8')
  }
  console.log(`  Fetching ${url}`)
  const body = await fetchUrl(url)
  fs.writeFileSync(keyFile, body, 'utf8')
  return body
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ─── File output ──────────────────────────────────────────────────────────────

/** Serialize to deterministic JSON with trailing newline. */
export function emit(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n'
}

/** Write file only if content changed; log the outcome. */
export function writeIfChanged(file: string, content: string): void {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) {
    console.log(`  unchanged: ${path.relative(ROOT, file)}`)
    return
  }
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, content, 'utf8')
  console.log(`  wrote: ${path.relative(ROOT, file)}`)
}

// ─── Feature builder helpers ──────────────────────────────────────────────────

export function findSection(hint: string, sections: string[]): string | undefined {
  return sections.find((s) => s.toLowerCase().includes(hint.toLowerCase()))
}

export function buildInlineFeatures(
  namespace: string,
  entries: [name: string, sectionHint: string | undefined][],
  sections: string[],
): FeatureEntry[] {
  return entries.map(([name, sectionHint]) => {
    const [expandStart, expandEnd] = EXPAND[name] ?? [false, false]
    const entry: FeatureEntry = { typeId: `${namespace}#${name}`, featureClass: 'inline', expandStart, expandEnd }
    if (sectionHint) {
      const found = findSection(sectionHint, sections)
      if (found) entry.specSection = found
    }
    return entry
  })
}

export function buildBlockFeatures(
  namespace: string,
  entries: [name: string, sectionHint: string | undefined][],
  sections: string[],
): FeatureEntry[] {
  return entries.map(([name, sectionHint]) => {
    const entry: FeatureEntry = { typeId: `${namespace}#${name}`, featureClass: 'block' }
    if (sectionHint) {
      const found = findSection(sectionHint, sections)
      if (found) entry.specSection = found
    }
    return entry
  })
}

/** Strip false/undefined/null expand fields for clean JSON output. */
export function cleanEntry(e: FeatureEntry): Record<string, unknown> {
  const out: Record<string, unknown> = { typeId: e.typeId, featureClass: e.featureClass }
  if (e.expandStart) out.expandStart = true
  if (e.expandEnd) out.expandEnd = true
  if (e.specSection) out.specSection = e.specSection
  return out
}
