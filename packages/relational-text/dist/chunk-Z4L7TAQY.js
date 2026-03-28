import {
  Document
} from "./chunk-W3MVQAE5.js";
import {
  add_annotation_layer,
  annotations_at_offset,
  annotations_in_byte_range,
  create_layered_document,
  layered_doc_delete_text,
  layered_doc_insert_text,
  layered_doc_to_document,
  query_annotations
} from "./chunk-AVMPBRSI.js";

// src/layered-document.ts
var LayeredDocument = class _LayeredDocument {
  /** The raw JSON state passed to/from the WASM engine. */
  #json;
  constructor(json) {
    this.#json = json;
  }
  // ─── Factory methods ───────────────────────────────────────────────────────
  /** Create from a Document or DocumentJSON via the WASM engine. */
  static fromDocument(doc) {
    const docJson = doc instanceof Document ? doc._raw() : JSON.stringify(doc);
    try {
      const result = create_layered_document(docJson);
      return new _LayeredDocument(result);
    } catch {
      const text = doc instanceof Document ? doc.text : doc.text;
      return new _LayeredDocument(JSON.stringify({
        expression: { text, kind: "document" },
        segmentations: [],
        annotation_layers: [],
        ontologies: [],
        graph_nodes: [],
        graph_edge_sets: [],
        alignments: []
      }));
    }
  }
  /** Create from raw LayeredDocument JSON (string or object). */
  static fromJSON(json) {
    const str = typeof json === "string" ? json : JSON.stringify(json);
    return new _LayeredDocument(str);
  }
  // ─── Projections ───────────────────────────────────────────────────────────
  /** Project back to a Document via the WASM engine. */
  toDocument() {
    try {
      const docJson = layered_doc_to_document(this.#json);
      return Document.parse(docJson);
    } catch {
      const state = JSON.parse(this.#json);
      return Document.fromJSON({ text: state.expression?.text ?? "", facets: [] });
    }
  }
  /** Get the raw JSON representation. */
  toJSON() {
    return JSON.parse(this.#json);
  }
  /** Get the raw JSON string (for WASM interop). */
  _raw() {
    return this.#json;
  }
  // ─── Accessors ─────────────────────────────────────────────────────────────
  /** Get the expression text. */
  get text() {
    const state = JSON.parse(this.#json);
    return state.expression?.text ?? "";
  }
  /** Get all annotation layers. */
  get layers() {
    const state = JSON.parse(this.#json);
    return state.annotation_layers ?? state.layers ?? [];
  }
  // ─── Layer mutations (via WASM) ────────────────────────────────────────────
  /** Add an annotation layer. Returns a new LayeredDocument. */
  addLayer(layer) {
    try {
      const result = add_annotation_layer(this.#json, JSON.stringify(layer));
      return new _LayeredDocument(result);
    } catch {
      const state = JSON.parse(this.#json);
      const layers = state.annotation_layers ?? state.layers ?? [];
      return new _LayeredDocument(JSON.stringify({
        ...state,
        annotation_layers: [...layers, layer],
        layers: [...layers, layer]
      }));
    }
  }
  // ─── Queries (via WASM) ────────────────────────────────────────────────────
  /** Get annotations at a byte offset via the WASM engine. */
  annotationsAt(byteOffset) {
    try {
      const result = annotations_at_offset(this.#json, byteOffset);
      return JSON.parse(result);
    } catch {
      return this.layers.flatMap(
        (l) => l.annotations.filter((a) => {
          const span = a.anchor?.textSpan;
          if (!span) return false;
          return span.byteStart <= byteOffset && byteOffset < span.byteEnd;
        })
      );
    }
  }
  /** Get annotations overlapping a byte range via the WASM engine. */
  annotationsInRange(start, end) {
    try {
      const result = annotations_in_byte_range(this.#json, start, end);
      return JSON.parse(result);
    } catch {
      return this.layers.flatMap(
        (l) => l.annotations.filter((a) => {
          const span = a.anchor?.textSpan;
          if (!span) return false;
          return span.byteStart < end && span.byteEnd > start;
        })
      );
    }
  }
  /** Query by kind, subkind, and/or label via the WASM engine. */
  query(opts) {
    const { kind, subkind, label } = opts ?? {};
    try {
      const result = query_annotations(
        this.#json,
        kind ?? "",
        subkind ?? "",
        label ?? ""
      );
      return JSON.parse(result);
    } catch {
      const layers = this.layers.filter((l) => {
        if (kind !== void 0 && l.kind !== kind) return false;
        if (subkind !== void 0 && l.subkind !== subkind) return false;
        return true;
      });
      const annotations = layers.flatMap((l) => l.annotations);
      if (label === void 0) return annotations;
      return annotations.filter((a) => a.label === label);
    }
  }
  // ─── Text mutations (via WASM) ─────────────────────────────────────────────
  /** Insert text and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
  insertText(bytePos, text) {
    try {
      const result = layered_doc_insert_text(this.#json, bytePos, text);
      return new _LayeredDocument(result);
    } catch {
      const state = JSON.parse(this.#json);
      const expr = state.expression;
      if (!expr) return this;
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const textInsert = enc.encode(text);
      const insertLen = textInsert.byteLength;
      const existingBytes = enc.encode(expr.text);
      const newBytes = new Uint8Array(existingBytes.length + insertLen);
      newBytes.set(existingBytes.slice(0, bytePos), 0);
      newBytes.set(textInsert, bytePos);
      newBytes.set(existingBytes.slice(bytePos), bytePos + insertLen);
      state.expression = { ...expr, text: dec.decode(newBytes) };
      return new _LayeredDocument(JSON.stringify(state));
    }
  }
  /** Delete text range and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
  deleteText(byteStart, byteEnd) {
    try {
      const result = layered_doc_delete_text(this.#json, byteStart, byteEnd);
      return new _LayeredDocument(result);
    } catch {
      const state = JSON.parse(this.#json);
      const expr = state.expression;
      if (!expr) return this;
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const bytes = enc.encode(expr.text);
      const newBytes = new Uint8Array(bytes.length - (byteEnd - byteStart));
      newBytes.set(bytes.slice(0, byteStart), 0);
      newBytes.set(bytes.slice(byteEnd), byteStart);
      state.expression = { ...expr, text: dec.decode(newBytes) };
      return new _LayeredDocument(JSON.stringify(state));
    }
  }
};

export {
  LayeredDocument
};
