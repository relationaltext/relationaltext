// src/concept-index.ts
var ConceptIndex = class {
  #index = /* @__PURE__ */ new Map();
  /** Add a document's annotations to the index. */
  addDocument(documentId, doc) {
    for (const layer of doc.layers) {
      for (const ann of layer.annotations) {
        if (!ann.knowledgeRefs) continue;
        for (const ref of ann.knowledgeRefs) {
          const key = `${ref.source}:${ref.identifier}`;
          const entry = {
            documentId,
            annotationUuid: ann.uuid.value,
            layerKind: layer.kind,
            ...ann.label !== void 0 ? { label: ann.label } : {}
          };
          const existing = this.#index.get(key);
          if (existing) {
            existing.push(entry);
          } else {
            this.#index.set(key, [entry]);
          }
        }
      }
    }
  }
  /** Remove a document from the index. */
  removeDocument(documentId) {
    for (const [key, refs] of this.#index) {
      const filtered = refs.filter((r) => r.documentId !== documentId);
      if (filtered.length === 0) {
        this.#index.delete(key);
      } else {
        this.#index.set(key, filtered);
      }
    }
  }
  /** Find all annotations referencing a given entity. */
  findByEntity(source, identifier) {
    return this.#index.get(`${source}:${identifier}`) ?? [];
  }
  /** Find all shared concepts between two documents. */
  sharedConcepts(docIdA, docIdB) {
    const result = [];
    for (const [key, refs] of this.#index) {
      const hasA = refs.some((r) => r.documentId === docIdA);
      const hasB = refs.some((r) => r.documentId === docIdB);
      if (hasA && hasB) {
        result.push({ key, refs });
      }
    }
    return result;
  }
  /** Find all concepts in the index. */
  allConcepts() {
    return Array.from(this.#index.entries()).map(([key, refs]) => ({ key, refs }));
  }
  /** Number of unique concepts indexed. */
  get size() {
    return this.#index.size;
  }
};

export {
  ConceptIndex
};
