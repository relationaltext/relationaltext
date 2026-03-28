/**
 * Knowledge reference resolution service.
 *
 * Resolves Layers knowledgeRef entries to external data from
 * Wikidata, chive.pub, FrameNet, and custom sources.
 *
 * The KnowledgeRef interface matches the pub.layers.defs#knowledgeRef
 * lexicon definition exactly.
 */

/**
 * A reference to an external knowledge base entry.
 * Derived from pub.layers.defs#knowledgeRef.
 */
export interface KnowledgeRef {
  /** Knowledge base source slug. Known values: chive.pub, wikidata, wordnet, framenet, propbank, verbnet, unimorph, glottolog, cldr, custom. */
  source: string
  /** AT-URI of the knowledge base type definition node. */
  sourceUri?: string
  /** The identifier within the knowledge base (e.g., Wikidata QID, chive.pub node URI, Glottolog languoid ID). */
  identifier: string
  /** Optional full URI for the knowledge base entry. */
  uri?: string
  /** Human-readable label for the referenced entity. */
  label?: string
}

/** A resolved knowledge entity with display-ready metadata. */
export interface KnowledgeEntity {
  /** The original knowledge reference. */
  ref: KnowledgeRef
  /** Human-readable label. */
  label: string
  /** Short description of the entity. */
  description?: string
  /** URL of a representative image. */
  imageUrl?: string
  /** Arbitrary resolved properties from the knowledge base. */
  properties?: Record<string, unknown>
  /** Canonical web URL for the entity. */
  url?: string
}

export class KnowledgeResolver {
  #cache = new Map<string, KnowledgeEntity>()
  #resolvers = new Map<string, (id: string) => Promise<KnowledgeEntity | null>>()

  /** Register a custom resolver for a knowledge source. */
  registerSource(name: string, resolver: (id: string) => Promise<KnowledgeEntity | null>): void {
    this.#resolvers.set(name, resolver)
  }

  /** Resolve a single knowledge reference. */
  async resolve(ref: KnowledgeRef): Promise<KnowledgeEntity | null> {
    const cacheKey = `${ref.source}:${ref.identifier}`
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey)!

    const resolver = this.#resolvers.get(ref.source)
    if (!resolver) return null

    const entity = await resolver(ref.identifier)
    if (entity) this.#cache.set(cacheKey, entity)
    return entity
  }

  /** Resolve multiple references in parallel. */
  async resolveAll(refs: KnowledgeRef[]): Promise<Map<string, KnowledgeEntity>> {
    const results = new Map<string, KnowledgeEntity>()
    const promises = refs.map(async (ref) => {
      const entity = await this.resolve(ref)
      if (entity) results.set(`${ref.source}:${ref.identifier}`, entity)
    })
    await Promise.all(promises)
    return results
  }
}

/** Create a KnowledgeResolver with built-in Wikidata support. */
export function createDefaultResolver(): KnowledgeResolver {
  const resolver = new KnowledgeResolver()

  // Wikidata resolver via REST API
  resolver.registerSource('wikidata', async (qid: string) => {
    try {
      const resp = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&format=json&props=labels|descriptions|claims&languages=en&origin=*`,
      )
      if (!resp.ok) return null
      const data = await resp.json()
      const entity = data.entities?.[qid]
      if (!entity) return null
      return {
        ref: { source: 'wikidata', identifier: qid, uri: `https://www.wikidata.org/entity/${qid}` },
        label: entity.labels?.en?.value ?? qid,
        description: entity.descriptions?.en?.value,
        url: `https://www.wikidata.org/entity/${qid}`,
      }
    } catch {
      return null
    }
  })

  return resolver
}
