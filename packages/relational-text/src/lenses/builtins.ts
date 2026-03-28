/**
 * Built-in lens definitions for RelationalText.
 *
 * This module auto-registers the following lenses at import time:
 *   org.relationaltext.facet ←→  org.w3c.html.facet          (autoApply: true)
 *   org.gfm.facet            →   org.relationaltext.facet     (autoApply: true)
 *   org.relationaltext.facet →   org.commonmark.facet         (autoApply: true)
 *   org.quilljs.delta.facet  →   org.relationaltext.facet     (autoApply: true)
 *   org.prosemirror.facet    →   org.relationaltext.facet     (autoApply: true)
 *
 * The hub format is org.relationaltext.facet. All format lenses target RT.
 * The RT→HTML lens enables direct rendering to HTML; the RT→CommonMark lens
 * bridges to the Markdown renderer.
 *
 * Import this module to activate cross-format rendering. The renderers
 * (html.ts, markdown.ts) import it as a side effect to ensure these lenses
 * are registered before any to('html') / to('markdown') calls.
 */

import { registerLens, type LensSpec } from '../lens.js'

import relationalTextToHtmlData from '../../../../formats/org.w3c.html/relationaltext-to-html.lens.json' with { type: 'json' }
import htmlToRelationalTextData from '../../../../formats/org.w3c.html/html-to-relationaltext.lens.json' with { type: 'json' }
import gfmToRelationaltextData from '../../../../formats/org.commonmark/gfm-to-relationaltext.lens.json' with { type: 'json' }
import relationalTextToCommonmarkData from '../../../../formats/org.commonmark/relationaltext-to-commonmark.lens.json' with { type: 'json' }
import commonmarkToRelationalTextData from '../../../../formats/org.commonmark/commonmark-to-relationaltext.lens.json' with { type: 'json' }
import quillToRelationaltextData from '../../../../formats/org.quilljs.delta/quill-to-relationaltext.lens.json' with { type: 'json' }
import prosemirrorToRelationaltextData from '../../../../formats/org.prosemirror/prosemirror-to-relationaltext.lens.json' with { type: 'json' }

/** Type-narrow a JSON import into a LensSpec. Validates required fields at runtime. */
function asLensSpec(data: Record<string, unknown>): LensSpec {
  const d = data as { source?: unknown; target?: unknown; $type?: unknown; id?: unknown }
  if (typeof d.source !== 'string' || typeof d.target !== 'string') {
    throw new Error(`Invalid LensSpec: missing source/target in ${JSON.stringify(data).slice(0, 100)}`)
  }
  // After validation, we know the required string fields exist.
  // The remaining fields (rules, passthrough, etc.) are optional in LensSpec.
  return {
    $type: typeof d.$type === 'string' ? d.$type : 'org.relationaltext.lens',
    id: typeof d.id === 'string' ? d.id : `${d.source}.to.${d.target}`,
    source: d.source,
    target: d.target,
    ...data,
  } as LensSpec
}

/**
 * Transforms org.relationaltext.facet features to org.w3c.html.facet equivalents.
 *
 * Notable mappings:
 *   bold → strong         italic → em
 *   code → code           strikethrough → s
 *   link (url) → a (href) (attr rename)
 *   line-break → br       (hard line break)
 *   unordered-list-item → li (parents: ["ul"])
 *   ordered-list-item → li (parents: ["ol"])
 *
 * Uses SQL rules for list items to set the parents array.
 * The inverse (HTML→RT) is registered separately as HTML_TO_RELATIONALTEXT.
 */
export const RELATIONALTEXT_TO_HTML = asLensSpec(relationalTextToHtmlData)

/**
 * Transforms org.w3c.html.facet features to org.relationaltext.facet equivalents.
 *
 * Notable mappings:
 *   strong/b → bold       em/i → italic
 *   s/strike → strikethrough   code → code
 *   a (href) → link (url) (attr rename)
 *   li (parents:["ul"]) → unordered-list-item
 *   li (parents:["ol"]) → ordered-list-item
 *   h1-h6 → heading (addAttrs: {level: N})
 *   pre → code-block      hr → horizontal-rule
 *
 * Uses passthrough: drop — HTML-specific structural elements without RT
 * equivalents (div, nav, section, etc.) are discarded.
 */
export const HTML_TO_RELATIONALTEXT = asLensSpec(htmlToRelationalTextData)

/**
 * Transforms org.gfm.facet features (GFM extensions) directly to
 * org.relationaltext.facet equivalents, bypassing the CommonMark intermediate.
 *
 * GFM-specific elements not in CommonMark 0.31:
 *   strikethrough — GFM ~~text~~ syntax
 *   table — GFM pipe table syntax
 *
 * CommonMark elements produced by the Markdown importer remain as
 * org.commonmark.facet and are converted to RT by the separate
 * COMMONMARK_TO_RELATIONALTEXT lens.
 */
export const GFM_TO_RELATIONALTEXT = asLensSpec(gfmToRelationaltextData)

/**
 * Transforms org.relationaltext.facet features to org.commonmark.facet equivalents.
 *
 * This is the hub→CommonMark bridge that enables RT documents to be rendered
 * by the Markdown renderer.
 *
 * Notable mappings:
 *   bold → strong         italic → emphasis
 *   code → code-span      link (url) → link (uri)
 *
 * The inverse (CommonMark→RT) is also registered automatically.
 */
export const RELATIONALTEXT_TO_COMMONMARK = asLensSpec(relationalTextToCommonmarkData)

/**
 * Transforms org.commonmark.facet features to org.relationaltext.facet equivalents.
 *
 * This is the CommonMark→hub bridge that enables cross-format paths from Markdown
 * documents to HTML and other formats. Registered as invertible:false to prevent
 * overwriting RELATIONALTEXT_TO_COMMONMARK as the RT→CM edge.
 *
 * Notable mappings:
 *   strong → bold         emphasis → italic
 *   code-span → code      link (uri) → link (url)
 *   mark → highlight      ins → insertion    del → deletion
 */
export const COMMONMARK_TO_RELATIONALTEXT = asLensSpec(commonmarkToRelationalTextData)

/**
 * Transforms org.quilljs.delta.facet features to org.relationaltext.facet equivalents.
 *
 * Notable mappings:
 *   bold → bold           italic → italic
 *   strike → strikethrough   code → code
 *   link (url) → link (url)  (no rename needed; RT uses url)
 *
 * Presentational attributes (color, background, font, size) and media embeds
 * (video, formula) have no RT equivalent and are left as unmatched
 * Quill features (ignored by RT/CommonMark/HTML renderers).
 */
export const QUILL_TO_RELATIONALTEXT = asLensSpec(quillToRelationaltextData)

/**
 * Transforms org.prosemirror.facet features to org.relationaltext.facet equivalents.
 *
 * Notable mappings:
 *   bold → bold           italic → italic
 *   strike → strikethrough   code → code
 *   hard-break → line-break  (entity rename)
 *   link (href) → link (url) (attr rename)
 */
export const PROSEMIRROR_TO_RELATIONALTEXT = asLensSpec(prosemirrorToRelationaltextData)

// Auto-register RT→HTML with autoApply: true.
// The inverse (HTML→RT) is registered separately since it uses SQL rules
// and cannot be auto-derived.
registerLens(RELATIONALTEXT_TO_HTML, { autoApply: true })
// Explicitly register the HTML→RT inverse.
registerLens(HTML_TO_RELATIONALTEXT, { autoApply: true })

// Auto-register GFM→RT. GFM-specific features (strikethrough, table) go
// directly to the RT hub; CommonMark features in the same document are
// handled by the separate COMMONMARK_TO_RELATIONALTEXT lens.
registerLens(GFM_TO_RELATIONALTEXT, { autoApply: true })

// Auto-register RT→CommonMark. This is the hub→Markdown renderer bridge.
// Note: RELATIONALTEXT_TO_COMMONMARK has embed→null (drop rule) so its inverse
// cannot be auto-derived. COMMONMARK_TO_RELATIONALTEXT is registered separately below.
registerLens(RELATIONALTEXT_TO_COMMONMARK, { autoApply: true })

// Explicitly register CommonMark→RT. This is the CM→hub bridge needed for
// cross-format paths like from('markdown')→to('html'). Marked invertible:false to
// prevent overwriting the RELATIONALTEXT_TO_COMMONMARK edge on the RT→CM slot.
registerLens(COMMONMARK_TO_RELATIONALTEXT, { autoApply: true })

// Auto-register Quill→RT. The inverse path enables toQuillDelta() to
// accept documents in any registered namespace.
registerLens(QUILL_TO_RELATIONALTEXT, { autoApply: true })

// Auto-register ProseMirror→RT. The inverse path enables toProseMirror() to
// accept documents in any registered namespace.
registerLens(PROSEMIRROR_TO_RELATIONALTEXT, { autoApply: true })
