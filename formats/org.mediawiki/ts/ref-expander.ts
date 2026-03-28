/**
 * MediaWiki <ref> element expander for RelationalText documents.
 *
 * Processes <ref> elements in text, replacing them with footnote markers
 * and extracting structured reference data. Adjusts facet byte offsets
 * to account for the text changes.
 */

export interface FacetJSON {
  index: { byteStart: number; byteEnd: number };
  features: Array<Record<string, unknown>>;
}

export interface ExtractedReference {
  name: string | null;
  group: string | null;
  footnoteNumber: number;
  title: string | null;
  url: string | null;
  website: string | null;
  date: string | null;
  accessDate: string | null;
  authors: string | null;
  rawContent: string;
}

export interface RefExpansionResult {
  text: string;
  facets: FacetJSON[];
  references: ExtractedReference[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Get byte length of a JS string in UTF-8. */
function utf8Len(s: string): number {
  return encoder.encode(s).length;
}

// ── Regex for <ref> elements ──────────────────────────────────────────

// Matches both content refs and self-closing refs.
// Group 1: attributes string, Group 2: content (undefined for self-closing)
const REF_RE =
  /<ref(\s[^>]*?)?\s*\/\s*>|<ref(\s[^>]*?)?>([\s\S]*?)<\/ref\s*>/gi;

// Attribute extraction
const NAME_RE = /name\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const GROUP_RE = /group\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

// ── Citation template parsing ─────────────────────────────────────────

function parseCiteTemplate(content: string): Partial<ExtractedReference> {
  // Match {{Cite web ...}} or {{Citation ...}}
  const tmplMatch = content.match(
    /\{\{(?:Cite\s+web|Citation)\s*\|([^}]*(?:\}\}[^}]*)*)\}\}/is
  );
  if (!tmplMatch) return {};

  let body = tmplMatch[1]!;
  // Handle {{!}} → |
  body = body.replace(/\{\{!\}\}/g, "|");

  const params = new Map<string, string>();
  // Split on top-level pipes (not inside nested templates)
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "|" && depth === 0) {
      const eqIdx = current.indexOf("=");
      if (eqIdx !== -1) {
        params.set(
          current.slice(0, eqIdx).trim().toLowerCase(),
          current.slice(eqIdx + 1).trim()
        );
      }
      current = "";
      continue;
    }
    current += ch;
  }
  // Last param
  if (current.trim()) {
    const eqIdx = current.indexOf("=");
    if (eqIdx !== -1) {
      params.set(
        current.slice(0, eqIdx).trim().toLowerCase(),
        current.slice(eqIdx + 1).trim()
      );
    }
  }

  const last = params.get("last") ?? params.get("last1") ?? null;
  const first = params.get("first") ?? params.get("first1") ?? null;
  let authors: string | null = null;
  if (first && last) authors = `${first} ${last}`;
  else if (last) authors = last;
  else if (first) authors = first;

  return {
    title: params.get("title") ?? null,
    url: params.get("url") ?? null,
    website: params.get("website") ?? null,
    date: params.get("date") ?? null,
    accessDate: params.get("access-date") ?? null,
    authors,
  };
}

/**
 * Fallback parser for partially-expanded templates.
 *
 * When the WASM MediaWiki parser expands `{{Cite web |title=...}}` to `\u200b`
 * with a template facet, the ref content becomes something like:
 *   `\u200b Good Food |url=https://... |access-date=2024-12-07 ...}}`
 *
 * This function extracts |key=value pairs from such content.
 */
function parsePartialTemplate(content: string): Partial<ExtractedReference> {
  const kvRe = /\|\s*(\S+)\s*=\s*([^|}]+)/g;
  const params: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = kvRe.exec(content)) !== null) {
    params[m[1]!.toLowerCase().trim()] = m[2]!.trim();
  }
  if (Object.keys(params).length === 0) return {};

  const last = params.last ?? params.last1 ?? null;
  const first = params.first ?? params.first1 ?? null;
  let authors: string | null = null;
  if (first && last) authors = `${first} ${last}`;
  else if (last) authors = last;
  else if (first) authors = first;

  return {
    title: params.title ?? null,
    url: params.url ?? null,
    website: params.website ?? null,
    date: params.date ?? null,
    accessDate: params['access-date'] ?? null,
    authors,
  };
}

function extractBareUrl(content: string): string | null {
  const m = content.match(/https?:\/\/[^\s<>"{}|]+/);
  return m ? m[0] : null;
}

// ── Main function ─────────────────────────────────────────────────────

export function expandRefs(text: string, facets: FacetJSON[]): RefExpansionResult {
  const references: ExtractedReference[] = [];

  // Track footnote numbers per group. Key "" = default group.
  const groupCounters = new Map<string, number>();
  // Track named refs → footnote number per group
  const namedRefNumbers = new Map<string, number>(); // key: `${group}\0${name}`

  // Collect all ref matches with their byte positions
  interface RefMatch {
    /** Byte offset of the start of the match in the original text */
    byteStart: number;
    /** Byte offset past the end of the match in the original text */
    byteEnd: number;
    /** The full matched string */
    fullMatch: string;
    /** Ref name attribute, or null */
    name: string | null;
    /** Ref group attribute, or null */
    group: string | null;
    /** Content between <ref> and </ref>, or null for self-closing */
    content: string | null;
  }

  const matches: RefMatch[] = [];
  // We need byte offsets, so work with the UTF-8 bytes
  // But we can use JS string indices + utf8Len for the substring up to that point
  // More efficient: iterate matches in JS string, compute byte offsets per match
  let jsOffset = 0;
  let byteOffset = 0;

  // Reset regex
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    // Compute byte offset for text from jsOffset to m.index
    const skipped = text.slice(jsOffset, m.index);
    byteOffset += utf8Len(skipped);

    const matchByteStart = byteOffset;
    const matchByteLen = utf8Len(m[0]);
    const matchByteEnd = matchByteStart + matchByteLen;

    // Attributes string is in group 1 (self-closing) or group 2 (content ref)
    const attrs = m[1] ?? m[2] ?? "";
    const content = m[3] ?? null; // null for self-closing

    const nameMatch = attrs.match(NAME_RE);
    const groupMatch = attrs.match(GROUP_RE);

    matches.push({
      byteStart: matchByteStart,
      byteEnd: matchByteEnd,
      fullMatch: m[0],
      name: nameMatch ? (nameMatch[1] ?? nameMatch[2] ?? null) : null,
      group: groupMatch ? (groupMatch[1] ?? groupMatch[2] ?? null) : null,
      content,
    });

    jsOffset = m.index + m[0].length;
    byteOffset = matchByteEnd;
  }

  if (matches.length === 0) {
    return { text, facets: [...facets], references: [] };
  }

  // Assign footnote numbers and build replacements
  interface Replacement {
    byteStart: number;
    byteEnd: number;
    replacement: string;
  }

  const replacements: Replacement[] = [];

  for (const ref of matches) {
    const groupKey = ref.group ?? "";
    const nameKey = ref.name !== null ? `${groupKey}\0${ref.name}` : null;

    let footnoteNumber: number;
    let isBackref = false;

    if (nameKey !== null && namedRefNumbers.has(nameKey)) {
      // Back-reference: reuse existing number
      footnoteNumber = namedRefNumbers.get(nameKey)!;
      isBackref = true;
    } else {
      // New reference: assign next number in this group
      const current = groupCounters.get(groupKey) ?? 0;
      footnoteNumber = current + 1;
      groupCounters.set(groupKey, footnoteNumber);
      if (nameKey !== null) {
        namedRefNumbers.set(nameKey, footnoteNumber);
      }
    }

    // Build footnote marker using Unicode superscript digits
    const superscriptDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const toSuperscript = (n: number): string =>
      String(n).split('').map(d => superscriptDigits[parseInt(d)]!).join('');
    const marker =
      groupKey !== ""
        ? `${toSuperscript(footnoteNumber)}` // note refs get same style
        : `${toSuperscript(footnoteNumber)}`;

    replacements.push({
      byteStart: ref.byteStart,
      byteEnd: ref.byteEnd,
      replacement: marker,
    });

    // Extract reference data (only for first occurrence or anonymous refs)
    if (!isBackref) {
      const rawContent = ref.content ?? "";

      // Try standard {{Cite web |key=value}} first
      let cited = parseCiteTemplate(rawContent);
      const hasTemplate = cited.title != null || cited.url != null;

      // Fallback: partially-expanded templates (WASM replaced {{Cite web}} with \u200b
      // but left |key=value pairs in the text)
      if (!hasTemplate && rawContent) {
        const partial = parsePartialTemplate(rawContent);
        if (partial.url || partial.title) {
          cited = partial;
        }
      }

      const hasCited = cited.title != null || cited.url != null;
      const bareUrl =
        !hasCited && rawContent ? extractBareUrl(rawContent) : null;

      references.push({
        name: ref.name,
        group: ref.group,
        footnoteNumber,
        title: cited.title ?? null,
        url: cited.url ?? bareUrl,
        website: cited.website ?? null,
        date: cited.date ?? null,
        accessDate: cited.accessDate ?? null,
        authors: cited.authors ?? null,
        rawContent,
      });
    }
  }

  // Apply replacements to UTF-8 bytes (process last-to-first for stable offsets)
  const utf8 = encoder.encode(text);
  const sortedReplacements = [...replacements].sort(
    (a, b) => b.byteStart - a.byteStart
  );

  let resultBytes = new Uint8Array(utf8);
  for (const rep of sortedReplacements) {
    const repBytes = encoder.encode(rep.replacement);
    const before = resultBytes.slice(0, rep.byteStart);
    const after = resultBytes.slice(rep.byteEnd);
    const newArr = new Uint8Array(
      before.length + repBytes.length + after.length
    );
    newArr.set(before, 0);
    newArr.set(repBytes, before.length);
    newArr.set(after, before.length + repBytes.length);
    resultBytes = newArr;
  }

  const resultText = decoder.decode(resultBytes);

  // Build cumulative shift table for facet adjustment
  // Sort replacements by byteStart ascending
  const ascReplacements = [...replacements].sort(
    (a, b) => a.byteStart - b.byteStart
  );

  function adjustOffset(pos: number): number {
    let shift = 0;
    for (const rep of ascReplacements) {
      if (rep.byteStart >= pos) break;
      const originalLen = rep.byteEnd - rep.byteStart;
      const repLen = utf8Len(rep.replacement);
      if (pos >= rep.byteEnd) {
        // Position is after this replacement
        shift += originalLen - repLen;
      } else {
        // Position is inside this replacement — collapse to replacement start
        shift += pos - rep.byteStart;
        break;
      }
    }
    return pos - shift;
  }

  // Adjust facets
  const adjustedFacets: FacetJSON[] = [];
  for (const facet of facets) {
    // Check if facet falls entirely within any replacement span
    let insideRef = false;
    for (const rep of ascReplacements) {
      if (
        facet.index.byteStart >= rep.byteStart &&
        facet.index.byteEnd <= rep.byteEnd
      ) {
        insideRef = true;
        break;
      }
    }
    if (insideRef) continue;

    const newStart = adjustOffset(facet.index.byteStart);
    const newEnd = adjustOffset(facet.index.byteEnd);
    if (newEnd <= newStart) continue;

    adjustedFacets.push({
      index: { byteStart: newStart, byteEnd: newEnd },
      features: facet.features,
    });
  }

  // ── Task 7: Clean stray \u200b characters (template placeholders) ──────────
  // These come from WASM template expansion inside <ref> elements.
  // We do a second replacement pass over the result text.
  const zwspRe = /\u200b\s*/g;
  const zwspMatches: Array<{ index: number; length: number }> = [];
  let zwspM: RegExpExecArray | null;
  while ((zwspM = zwspRe.exec(resultText)) !== null) {
    zwspMatches.push({ index: zwspM.index, length: zwspM[0].length });
  }

  if (zwspMatches.length > 0) {
    // Build cleaned text and byte-offset shift map
    const resultBytes2 = encoder.encode(resultText);
    // Compute byte positions for each zwsp match
    const zwspByteMatches: Array<{ byteStart: number; byteEnd: number }> = [];
    let jsOff = 0;
    let byteOff = 0;
    for (const zm of zwspMatches) {
      const skippedChunk = resultText.slice(jsOff, zm.index);
      byteOff += utf8Len(skippedChunk);
      const matchByteLen = utf8Len(resultText.slice(zm.index, zm.index + zm.length));
      zwspByteMatches.push({ byteStart: byteOff, byteEnd: byteOff + matchByteLen });
      jsOff = zm.index + zm.length;
      byteOff += matchByteLen;
    }

    // Remove zwsp spans from bytes (last to first)
    let cleanedBytes = new Uint8Array(resultBytes2);
    for (let i = zwspByteMatches.length - 1; i >= 0; i--) {
      const { byteStart, byteEnd } = zwspByteMatches[i]!;
      const before = cleanedBytes.slice(0, byteStart);
      const after = cleanedBytes.slice(byteEnd);
      const newArr = new Uint8Array(before.length + after.length);
      newArr.set(before, 0);
      newArr.set(after, before.length);
      cleanedBytes = newArr;
    }

    const cleanedText = decoder.decode(cleanedBytes);

    // Adjust facets for zwsp removal
    function adjustForZwsp(pos: number): number {
      let shift = 0;
      for (const zm of zwspByteMatches) {
        if (zm.byteStart >= pos) break;
        if (pos >= zm.byteEnd) {
          shift += zm.byteEnd - zm.byteStart;
        } else {
          shift += pos - zm.byteStart;
          break;
        }
      }
      return pos - shift;
    }

    const cleanedFacets: FacetJSON[] = [];
    for (const facet of adjustedFacets) {
      const newStart = adjustForZwsp(facet.index.byteStart);
      const newEnd = adjustForZwsp(facet.index.byteEnd);
      if (newEnd <= newStart) continue;
      cleanedFacets.push({
        index: { byteStart: newStart, byteEnd: newEnd },
        features: facet.features,
      });
    }

    return {
      text: cleanedText,
      facets: cleanedFacets,
      references,
    };
  }

  return {
    text: resultText,
    facets: adjustedFacets,
    references,
  };
}
