// src/format-wasm.ts
function compileWasm(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const mod = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(mod);
}
function callWasm(inst, fn, input) {
  const exp = inst.exports;
  const callFn = exp[fn];
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
var _nodeRequire = null;
try {
  const nodeModule = await import("module");
  _nodeRequire = nodeModule.createRequire(import.meta.url);
} catch {
}
function loadFromDisk(metaUrl, relPath) {
  const nodeRequire = (id) => {
    if (!_nodeRequire) {
      throw new Error(
        "Disk-based WASM loading requires Node.js. Use the inline form: createFormatWasm(base64String)"
      );
    }
    return _nodeRequire(id);
  };
  const { fileURLToPath } = nodeRequire("node:url");
  const { join, dirname } = nodeRequire("node:path");
  const fs = nodeRequire("node:fs");
  const absPath = join(dirname(fileURLToPath(metaUrl)), relPath);
  const b64 = fs.readFileSync(absPath, "utf8").trim();
  return compileWasm(b64);
}
function createFormatWasm(b64OrMetaUrl, relPath) {
  let inst = null;
  return {
    call(fn, input) {
      if (!inst) {
        if (relPath !== void 0) {
          inst = loadFromDisk(b64OrMetaUrl, relPath);
        } else {
          inst = compileWasm(b64OrMetaUrl.trim());
        }
      }
      return callWasm(inst, fn, input);
    }
  };
}
export {
  createFormatWasm
};
