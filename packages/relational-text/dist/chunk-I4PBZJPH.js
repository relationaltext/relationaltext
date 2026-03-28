import {
  apply_lens,
  apply_lens_traced,
  compose_lenses,
  find_path_in_graph,
  inverse_lens,
  validate_lens_sql
} from "./chunk-AVMPBRSI.js";

// src/lens.ts
var RAW_PREFIX = "raw:";
var LensInversionError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "LensInversionError";
  }
};
function applyLens(doc, spec) {
  const result = JSON.parse(apply_lens(JSON.stringify(doc), JSON.stringify(spec)));
  return { ...result, facets: result.facets ?? [] };
}
function applyLensDebug(doc, spec) {
  const raw = JSON.parse(apply_lens_traced(JSON.stringify(doc), JSON.stringify(spec)));
  const document = { ...raw.document, facets: raw.document.facets ?? [] };
  return { document, trace: raw.trace };
}
function validateLensSQL(spec) {
  return JSON.parse(validate_lens_sql(JSON.stringify(spec)));
}
function inverseLens(spec) {
  if (spec.invertible === false) {
    throw new LensInversionError(
      `Lens '${spec.id ?? spec.source}\u2192${spec.target}' is marked invertible: false`
    );
  }
  if (spec.rules?.some((r) => r.join != null)) {
    throw new LensInversionError(
      `Lens "${spec.id}" cannot be automatically inverted \u2014 contains a join rule`
    );
  }
  try {
    return JSON.parse(inverse_lens(JSON.stringify(spec)));
  } catch (e) {
    throw new LensInversionError(String(e));
  }
}
function composeLenses(first, second) {
  const raw = compose_lenses(JSON.stringify(first), JSON.stringify(second));
  return raw ? JSON.parse(raw) : null;
}
function identityLens(ns) {
  return {
    $type: "org.relationaltext.lens",
    id: `${ns}.identity`,
    source: ns,
    target: ns,
    rules: [],
    passthrough: "keep"
  };
}
var LensGraph = class {
  edges = /* @__PURE__ */ new Map();
  pathCache = /* @__PURE__ */ new Map();
  /** Register a lens edge. Clears the path cache. */
  register(spec, opts = {}) {
    this.edges.set(`${spec.source}\u2192${spec.target}`, { spec, autoApply: opts.autoApply ?? false });
    this.pathCache.clear();
  }
  /**
   * BFS shortest-path from sourceNs to targetNs (via WASM).
   * Returns a composed LensSpec or null if no path exists.
   * Returns an identity lens when sourceNs === targetNs.
   */
  findPath(sourceNs, targetNs) {
    if (sourceNs === targetNs) return identityLens(sourceNs);
    const cacheKey = `${sourceNs}\u2192${targetNs}`;
    const cached = this.pathCache.get(cacheKey);
    if (cached !== void 0) return cached;
    const specsJson = JSON.stringify([...this.edges.values()].map((e) => e.spec));
    const raw = find_path_in_graph(specsJson, sourceNs, targetNs);
    const path = raw ? JSON.parse(raw) : null;
    this.pathCache.set(cacheKey, path);
    return path;
  }
  /**
   * Apply all autoApply lenses that can reach targetNs to the document JSON string.
   *
   * Only applies a lens path when the document actually contains features from that
   * path's source namespace. This prevents a lens with passthrough:'drop' (composed
   * from e.g. RT→CommonMark) from wiping out features that belong to a different
   * source namespace that hasn't been processed yet.
   *
   * @param jsonStr - Raw document JSON string
   * @param targetNs - Target lexicon namespace
   */
  autoTransform(jsonStr, targetNs) {
    let result = jsonStr;
    const sourceToPath = /* @__PURE__ */ new Map();
    for (const [, edge] of this.edges) {
      if (!edge.autoApply || edge.spec.source === targetNs) continue;
      const ns = edge.spec.source;
      if (sourceToPath.has(ns)) continue;
      const path = this.findPath(ns, targetNs);
      if (path) sourceToPath.set(ns, path);
    }
    for (const [ns, path] of sourceToPath) {
      if (!result.includes(`"${ns}"`) && !result.includes(`"${ns}#`)) continue;
      result = apply_lens(result, JSON.stringify(path));
    }
    return result;
  }
};
var lensGraph = new LensGraph();
function registerLens(spec, opts = {}) {
  lensGraph.register(spec, opts);
  try {
    lensGraph.register(inverseLens(spec), opts);
  } catch {
  }
}
function findLens(fromNs, toNs) {
  return lensGraph.findPath(fromNs, toNs);
}
function transformDocument(doc, fromNs, toNs) {
  const lens = lensGraph.findPath(fromNs, toNs);
  return lens ? applyLens(doc, lens) : null;
}
async function loadWasmModule(base64) {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(binary, {});
  return instance;
}
async function applyWasmLens(doc, spec) {
  const ref = spec.wasmModule;
  let base64;
  if (ref.data) {
    base64 = ref.data;
  } else if (ref.url) {
    const resp = await fetch(ref.url);
    const buf = await resp.arrayBuffer();
    base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  } else {
    throw new Error("WasmLensRef must have either data (base64) or url");
  }
  const instance = await loadWasmModule(base64);
  const exports = instance.exports;
  const allocFn = exports["alloc"];
  const deallocFn = exports["dealloc"];
  const resultLenFn = exports["result_len"];
  const memory = exports["memory"];
  const isRawSource = spec.source.startsWith(RAW_PREFIX);
  const isRawTarget = spec.target.startsWith(RAW_PREFIX);
  let inputStr;
  let callFnName;
  if (isRawSource && ref.importFn) {
    inputStr = doc.text;
    callFnName = ref.importFn;
  } else if (isRawTarget && ref.exportFn) {
    inputStr = JSON.stringify(doc);
    callFnName = ref.exportFn;
  } else {
    inputStr = JSON.stringify(doc);
    callFnName = "transform";
  }
  const callFn = exports[callFnName];
  if (typeof callFn !== "function") {
    throw new Error(`WASM module has no export named '${callFnName}'`);
  }
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(inputStr);
  const ptr = allocFn(inputBytes.length);
  new Uint8Array(memory.buffer).set(inputBytes, ptr);
  const resultPtr = callFn(ptr, inputBytes.length);
  const resultLen = resultLenFn();
  deallocFn(ptr, inputBytes.length);
  const resultBytes = new Uint8Array(memory.buffer, resultPtr, resultLen);
  const resultStr = new TextDecoder().decode(resultBytes);
  if (isRawTarget && ref.exportFn) {
    return { text: resultStr, facets: [] };
  }
  const parsed = JSON.parse(resultStr);
  return { ...parsed, facets: parsed.facets ?? [] };
}
async function applyLensAsync(doc, spec) {
  if (spec.wasmModule) {
    return applyWasmLens(doc, spec);
  }
  return applyLens(doc, spec);
}

export {
  RAW_PREFIX,
  LensInversionError,
  applyLens,
  applyLensDebug,
  validateLensSQL,
  inverseLens,
  composeLenses,
  LensGraph,
  lensGraph,
  registerLens,
  findLens,
  transformDocument,
  applyLensAsync
};
