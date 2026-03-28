import {
  lensGraph,
  registerLens
} from "./chunk-I4PBZJPH.js";
import {
  add_block,
  add_mark,
  delete_text,
  insert_text,
  parse_document,
  register_feature_type,
  register_lexicon,
  remove_mark,
  to_hir
} from "./chunk-AVMPBRSI.js";

// ../../formats/org.relationaltext/relationaltext.lexicon.json
var relationaltext_lexicon_default = {
  $type: "org.relationaltext.format-lexicon",
  id: "org.relationaltext",
  features: [
    {
      typeId: "org.relationaltext.facet#bold",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#italic",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#strikethrough",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#underline",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#code",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#keyboard",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#superscript",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#subscript",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#highlight",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#insertion",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.facet#deletion",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#comment",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.facet#link",
      featureClass: "entity"
    },
    {
      typeId: "org.relationaltext.facet#mention",
      featureClass: "entity"
    },
    {
      typeId: "org.relationaltext.facet#hashtag",
      featureClass: "entity"
    },
    {
      typeId: "org.relationaltext.facet#line-break",
      featureClass: "entity"
    },
    {
      typeId: "org.relationaltext.facet#image",
      featureClass: "entity"
    },
    {
      typeId: "org.relationaltext.facet#paragraph",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#heading",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#code-block",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#horizontal-rule",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#blockquote-marker",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#bullet-list-marker",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#ordered-list-marker",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#list-item-marker",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#list-item-text",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#table",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#embed",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#page-break",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.facet#details",
      featureClass: "block"
    },
    {
      typeId: "org.relationaltext.richtext.mark#bold",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.richtext.mark#italic",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.richtext.mark#strikethrough",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.richtext.mark#underline",
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    },
    {
      typeId: "org.relationaltext.richtext.mark#code",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.mark#keyboard",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.mark#superscript",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.mark#subscript",
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#paragraph",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#heading",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#unordered-list-item",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#ordered-list-item",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#blockquote",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#code-block",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#horizontal-rule",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#image",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    },
    {
      typeId: "org.relationaltext.richtext.block#table",
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    }
  ]
};

// src/core.ts
var _rtLexiconRegistered = false;
function ensureRelationalTextLexicon() {
  if (_rtLexiconRegistered) return;
  _rtLexiconRegistered = true;
  register_lexicon(JSON.stringify(relationaltext_lexicon_default));
}
function registerLexicon(json) {
  register_lexicon(json);
  const parsed = JSON.parse(json);
  if (parsed.wasmLens) {
    const wasmLens = parsed.wasmLens;
    lensGraph.register(wasmLens);
    if (wasmLens.wasmModule?.exportFn) {
      lensGraph.register({
        $type: "org.relationaltext.lens",
        id: `${wasmLens.id}#reverse`,
        source: wasmLens.target,
        target: wasmLens.source,
        wasmModule: wasmLens.wasmModule
      });
    }
  }
  if (parsed.lens) {
    registerLens(parsed.lens, { autoApply: true });
  }
}
function registerFeatureType(descriptor) {
  const payload = {
    typeId: descriptor.typeId,
    featureClass: descriptor.featureClass ?? "inline",
    expandStart: descriptor.expandStart ?? false,
    expandEnd: descriptor.expandEnd ?? false,
    void: descriptor.void ?? false
  };
  if (descriptor.specUrl != null) payload.specUrl = descriptor.specUrl;
  register_feature_type(JSON.stringify(payload));
  const atIdx = descriptor.typeId.indexOf("@");
  if (atIdx !== -1) {
    const baseTypeId = descriptor.typeId.slice(0, atIdx);
    register_feature_type(JSON.stringify({ ...payload, typeId: baseTypeId }));
  }
}
var Document = class _Document {
  /** Normalized document JSON string (kept as string to avoid redundant parse/stringify). */
  #json;
  constructor(json) {
    this.#json = json;
  }
  // ─── Factory methods ──────────────────────────────────────────────────────
  /** Create a Document from a plain text string. */
  static fromText(text) {
    const raw = JSON.stringify({ text, facets: [] });
    const normalized = parse_document(raw);
    return new _Document(normalized);
  }
  /** Parse a Document from an AT Protocol JSON object. */
  static fromJSON(json) {
    const normalized = parse_document(JSON.stringify(json));
    return new _Document(normalized);
  }
  /** Parse a Document from a JSON string. */
  static parse(jsonString) {
    const normalized = parse_document(jsonString);
    return new _Document(normalized);
  }
  // ─── Accessors ────────────────────────────────────────────────────────────
  get text() {
    return JSON.parse(this.#json).text;
  }
  get facets() {
    return JSON.parse(this.#json).facets ?? [];
  }
  /**
   * All features in the document as a flat array, each with its byte range included.
   *
   * This is the ergonomic iteration surface. The wire format groups features by
   * byte range inside `facets` (so renderers can see co-located features together
   * and avoid repeating the index object); `features` flattens that for callers
   * who want to filter, map, or iterate annotations without nested loops.
   *
   * ```ts
   * // Find all links
   * doc.features.filter(f => f.$type === 'app.bsky.richtext.facet#link')
   *
   * // Collect all feature types in use
   * new Set(doc.features.map(f => f.$type))
   * ```
   */
  get features() {
    return JSON.parse(this.#json).facets?.flatMap(
      (facet) => facet.features.map((feat) => ({ index: facet.index, ...feat }))
    ) ?? [];
  }
  // ─── Text mutations ───────────────────────────────────────────────────────
  /**
   * Insert text at a byte position, adjusting all facet ranges.
   * Respects mark expand semantics (bold expands, code/link do not).
   */
  insertText(bytePos, text) {
    const updated = insert_text(this.#json, bytePos, text);
    return new _Document(updated);
  }
  /**
   * Delete the byte range [byteStart, byteEnd) from the document,
   * adjusting all facet ranges.
   */
  deleteRange(byteStart, byteEnd) {
    const updated = delete_text(this.#json, byteStart, byteEnd);
    return new _Document(updated);
  }
  // ─── Annotation mutations ─────────────────────────────────────────────────
  /** Add an inline mark over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name-only object (defaults to `org.relationaltext.facet`). */
  addMark(byteStart, byteEnd, mark) {
    const m = mark;
    const payload = m.$type != null ? mark : { $type: "org.relationaltext.facet", ...mark };
    const updated = add_mark(this.#json, byteStart, byteEnd, JSON.stringify(payload));
    return new _Document(updated);
  }
  /** Add a block element over [byteStart, byteEnd). Pass a full feature (with `$type`) or a name/parents object (defaults to `org.relationaltext.facet`). */
  addBlock(byteStart, byteEnd, block) {
    const b = block;
    const payload = b.$type != null ? block : { $type: "org.relationaltext.facet", ...block };
    const updated = add_block(this.#json, byteStart, byteEnd, JSON.stringify(payload));
    return new _Document(updated);
  }
  /**
   * Remove a mark from [byteStart, byteEnd) by compound key.
   *
   * `typeKey` is the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
   * or a plain `$type` string (e.g. `"app.bsky.richtext.facet#mention"`). Matching uses
   * exact `type_id` equality first, then split-compound-key matching against `type_id + data["name"]`.
   *
   * Facets that become empty after feature removal are deleted entirely.
   */
  removeMark(byteStart, byteEnd, typeKey) {
    const updated = remove_mark(this.#json, byteStart, byteEnd, typeKey);
    return new _Document(updated);
  }
  // ─── Output ───────────────────────────────────────────────────────────────
  /** Build the Hierarchical Intermediate Representation (HIR). */
  toHIR() {
    return JSON.parse(to_hir(this.#json));
  }
  /** Serialize to a plain JSON object. */
  toJSON() {
    return JSON.parse(this.#json);
  }
  /** Serialize to a JSON string. */
  toString() {
    return this.#json;
  }
  /** Internal: get the raw JSON string (for use by importers). */
  _raw() {
    return this.#json;
  }
};

export {
  ensureRelationalTextLexicon,
  registerLexicon,
  registerFeatureType,
  Document
};
