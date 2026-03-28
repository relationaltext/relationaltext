/**
 * Bluesky/atproto utility functions.
 *
 * Standalone detectFacets for auto-detecting @mentions, URLs, and #tags
 * in plain text, producing atproto-compatible facets.
 */

import type { FacetJSON } from './types.js'
import { detect_facets } from './wasm.js'

/**
 * Auto-detect @mentions, URLs, and #hashtags in plain text.
 *
 * Returns atproto-compatible facets with byte-range indices.
 * Mentions get `did: "at://{handle}"` (caller should resolve to real DID).
 */
export function detectFacets(text: string): FacetJSON[] {
  const raw = JSON.parse(
    detect_facets(
      text,
      'app.bsky.richtext.facet#mention',
      'app.bsky.richtext.facet#link',
      'app.bsky.richtext.facet#tag',
    ),
  ) as Array<{ index: { byteStart: number; byteEnd: number }; features: Array<Record<string, unknown>> }>

  // Map handle → did (Rust stores handle; ATProto wire format uses did)
  return raw.map((facet) => ({
    ...facet,
    features: facet.features.map((feat) => {
      if (feat['$type'] === 'app.bsky.richtext.facet#mention' && typeof feat['handle'] === 'string') {
        const { handle, ...rest } = feat
        return { ...rest, did: `at://${handle as string}` }
      }
      return feat
    }),
  })) as FacetJSON[]
}
