/**
 * Shared test utilities for normalizing output for comparison.
 */

/**
 * Normalize Markdown whitespace for round-trip comparison.
 * Not a parser — just text-level normalization.
 */
export function normalizeMarkdown(input: string): string {
  return input
    .replace(/\r\n/g, '\n')     // normalize CRLF → LF
    .replace(/[ \t]+$/gm, '')   // strip trailing whitespace from every line
    .replace(/\n{3,}/g, '\n\n') // collapse runs of 3+ newlines to one blank line
    .replace(/^\n+/, '')        // remove leading blank lines
    .replace(/\n*$/, '\n')      // ensure exactly one trailing newline
}

/**
 * Normalize HTML whitespace for round-trip comparison.
 * Collapses insignificant whitespace between tags and sorts attributes.
 */
export function normalizeHTML(input: string): string {
  return input
    .replace(/\r\n/g, '\n')   // normalize CRLF → LF
    .replace(/[ \t]+$/gm, '') // strip trailing whitespace from every line
    .replace(/>\s+</g, '><')  // collapse inter-tag whitespace (insignificant in HTML)
    .replace(/^\s+/, '')      // remove leading whitespace/blank lines
    .replace(/\s*$/, '\n')    // ensure exactly one trailing newline
    // Sort attributes alphabetically and normalize self-closing syntax.
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\s*\/?>)/g, (_, tag, rawAttrs, close) => {
      const selfClose = (close as string).includes('/') ? ' />' : '>'
      if (!rawAttrs.includes('=')) return `<${tag}${rawAttrs}${selfClose}`
      const attrPairs: [string, string][] = []
      const re = /\s([a-zA-Z:_][a-zA-Z0-9:._-]*)="([^"]*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(rawAttrs)) !== null) attrPairs.push([m[1]!, m[2]!])
      if (attrPairs.length === 0) return `<${tag}${rawAttrs}${selfClose}`
      attrPairs.sort(([a], [b]) => a.localeCompare(b))
      return `<${tag}${attrPairs.map(([k, v]) => ` ${k}="${v}"`).join('')}${selfClose}`
    })
}
