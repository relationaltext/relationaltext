// src/knowledge.ts
var KnowledgeResolver = class {
  #cache = /* @__PURE__ */ new Map();
  #resolvers = /* @__PURE__ */ new Map();
  /** Register a custom resolver for a knowledge source. */
  registerSource(name, resolver) {
    this.#resolvers.set(name, resolver);
  }
  /** Resolve a single knowledge reference. */
  async resolve(ref) {
    const cacheKey = `${ref.source}:${ref.identifier}`;
    if (this.#cache.has(cacheKey)) return this.#cache.get(cacheKey);
    const resolver = this.#resolvers.get(ref.source);
    if (!resolver) return null;
    const entity = await resolver(ref.identifier);
    if (entity) this.#cache.set(cacheKey, entity);
    return entity;
  }
  /** Resolve multiple references in parallel. */
  async resolveAll(refs) {
    const results = /* @__PURE__ */ new Map();
    const promises = refs.map(async (ref) => {
      const entity = await this.resolve(ref);
      if (entity) results.set(`${ref.source}:${ref.identifier}`, entity);
    });
    await Promise.all(promises);
    return results;
  }
};
function createDefaultResolver() {
  const resolver = new KnowledgeResolver();
  resolver.registerSource("wikidata", async (qid) => {
    try {
      const resp = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&format=json&props=labels|descriptions|claims&languages=en&origin=*`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const entity = data.entities?.[qid];
      if (!entity) return null;
      return {
        ref: { source: "wikidata", identifier: qid, uri: `https://www.wikidata.org/entity/${qid}` },
        label: entity.labels?.en?.value ?? qid,
        description: entity.descriptions?.en?.value,
        url: `https://www.wikidata.org/entity/${qid}`
      };
    } catch {
      return null;
    }
  });
  return resolver;
}

export {
  KnowledgeResolver,
  createDefaultResolver
};
