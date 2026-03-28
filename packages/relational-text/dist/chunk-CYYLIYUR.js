import {
  Document,
  ensureRelationalTextLexicon,
  registerLexicon
} from "./chunk-W3MVQAE5.js";
import {
  lensGraph,
  registerLens
} from "./chunk-I4PBZJPH.js";
import {
  initRelationalText
} from "./chunk-AVMPBRSI.js";

// src/registry.ts
var formats = /* @__PURE__ */ new Map();
var defaultBlobResolver;
var initialized = false;
var wasmCache = /* @__PURE__ */ new Map();
async function init(config) {
  if (initialized) return;
  await initRelationalText();
  ensureRelationalTextLexicon();
  if (config?.blobResolver) {
    defaultBlobResolver = config.blobResolver;
  }
  initialized = true;
}
function registerFormat(name, lexicon, opts) {
  const namespace = lexicon.id;
  if (!namespace) {
    throw new Error(`Lexicon must have an 'id' field (the namespace)`);
  }
  const lex = JSON.parse(JSON.stringify(lexicon));
  let wasmLens;
  if (lex.wasmLens && opts?.wasmData) {
    const wl = lex.wasmLens;
    if (wl.wasmModule) {
      wl.wasmModule.data = opts.wasmData;
    }
    wasmLens = lex.wasmLens;
  } else if (lex.wasmLens) {
    const wl = lex.wasmLens;
    if (wl.wasmModule?.data) {
      wasmLens = lex.wasmLens;
    }
  }
  registerLexicon(JSON.stringify(lex));
  if (opts?.lenses) {
    for (const lens of opts.lenses) {
      registerLens(lens, { autoApply: true });
    }
  }
  const entry = { namespace, wasmLens };
  formats.set(name, entry);
  if (opts?.aliases) {
    for (const alias of opts.aliases) {
      formats.set(alias, entry);
    }
  }
}
async function getWasmInstance(entry) {
  const cached = wasmCache.get(entry.namespace);
  if (cached) return cached;
  const ref = entry.wasmLens?.wasmModule;
  if (!ref) {
    throw new Error(`No WASM module registered for namespace '${entry.namespace}'`);
  }
  let instance;
  if (ref.data) {
    const binary = Uint8Array.from(atob(ref.data), (c) => c.charCodeAt(0));
    ({ instance } = await WebAssembly.instantiate(binary, {}));
  } else if (defaultBlobResolver) {
    const base64 = await defaultBlobResolver(ref);
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    ({ instance } = await WebAssembly.instantiate(binary, {}));
  } else if (ref.url) {
    const resp = await fetch(ref.url);
    const buf = await resp.arrayBuffer();
    ({ instance } = await WebAssembly.instantiate(buf, {}));
  } else {
    throw new Error(
      `No WASM data for namespace '${entry.namespace}'. Provide wasmData in registerFormat opts, set a blobResolver in init(), or set wasmModule.url.`
    );
  }
  wasmCache.set(entry.namespace, instance);
  return instance;
}
function callWasm(instance, fn, input) {
  const exp = instance.exports;
  const callFn = exp[fn];
  if (typeof callFn !== "function") {
    throw new Error(`WASM module has no export named '${fn}'`);
  }
  const inputBytes = new TextEncoder().encode(input);
  const ptr = exp.alloc(inputBytes.length);
  new Uint8Array(exp.memory.buffer).set(inputBytes, ptr);
  const resultPtr = callFn(ptr, inputBytes.length);
  const len = exp.result_len();
  const result = new TextDecoder().decode(
    new Uint8Array(exp.memory.buffer, resultPtr, len)
  );
  exp.dealloc(ptr, inputBytes.length);
  return result;
}
async function from(name, input) {
  const entry = formats.get(name);
  if (!entry) {
    throw new Error(
      `Unknown format: '${name}'. Registered formats: ${listFormats().join(", ") || "(none)"}`
    );
  }
  if (!entry.wasmLens?.wasmModule?.importFn) {
    throw new Error(
      `Format '${name}' has no WASM import function. Ensure the lexicon has a wasmLens with an importFn.`
    );
  }
  const instance = await getWasmInstance(entry);
  const importFn = entry.wasmLens.wasmModule.importFn;
  const rawJson = callWasm(instance, importFn, input);
  return Document.parse(rawJson);
}
async function to(name, doc) {
  const entry = formats.get(name);
  if (!entry) {
    throw new Error(
      `Unknown format: '${name}'. Registered formats: ${listFormats().join(", ") || "(none)"}`
    );
  }
  if (!entry.wasmLens?.wasmModule?.exportFn) {
    throw new Error(
      `Format '${name}' has no WASM export function. Ensure the lexicon has a wasmLens with an exportFn.`
    );
  }
  const document = doc instanceof Document ? doc : Document.fromJSON(doc);
  const transformed = lensGraph.autoTransform(document._raw(), entry.namespace);
  const instance = await getWasmInstance(entry);
  const exportFn = entry.wasmLens.wasmModule.exportFn;
  return callWasm(instance, exportFn, transformed);
}
function hasFormat(name) {
  return formats.has(name);
}
function listFormats() {
  return [...formats.keys()];
}

export {
  init,
  registerFormat,
  from,
  to,
  hasFormat,
  listFormats
};
