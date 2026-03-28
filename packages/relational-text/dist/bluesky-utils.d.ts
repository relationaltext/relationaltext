import { FacetJSON } from './types.js';

/**
 * Bluesky/atproto utility functions.
 *
 * Standalone detectFacets for auto-detecting @mentions, URLs, and #tags
 * in plain text, producing atproto-compatible facets.
 */

/**
 * Auto-detect @mentions, URLs, and #hashtags in plain text.
 *
 * Returns atproto-compatible facets with byte-range indices.
 * Mentions get `did: "at://{handle}"` (caller should resolve to real DID).
 */
declare function detectFacets(text: string): FacetJSON[];

export { detectFacets };
