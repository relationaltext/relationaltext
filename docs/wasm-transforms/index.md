# WASM Transform Modules

When a transformation cannot be expressed as declarative lens rules or SQL statements, you can provide a custom WASM binary module. The WASM module receives the full document JSON, applies arbitrary procedural logic, and returns the transformed document JSON.

## `applyLensAsync`

```ts
import { applyLensAsync } from 'relational-text/lens'

const result = await applyLensAsync(doc.toJSON(), lensWithWasmModule)
```

`applyLensAsync` checks for `spec.wasmModule` and, if present, invokes the WASM module instead of the declarative engine. For lenses without `wasmModule`, it delegates to the synchronous `applyLens`.

```ts
export async function applyLensAsync(
  doc: DocumentJSON,
  spec: LensSpec,
): Promise<DocumentJSON>
```

## `WasmLensRef`

```ts
interface WasmLensRef {
  cid?: string    // Content-addressed CID (for ATProto storage)
  url?: string    // HTTP URL to fetch the WASM binary
  data?: string   // Inline base64-encoded WASM binary
}
```

You must provide either `data` (base64 inline) or `url` (fetched at runtime). `cid` is for ATProto record storage and is not used for loading.

### Inline base64

```ts
const lens: LensSpec = {
  $type: 'org.relationaltext.lens',
  id: 'com.example.custom-transform',
  source: 'com.example.source.facet',
  target: 'com.example.target.facet',
  wasmModule: {
    data: 'AGFzbQEAAAA...',  // base64-encoded WASM binary
  },
}

const result = await applyLensAsync(doc.toJSON(), lens)
```

### URL-loaded

```ts
const lens: LensSpec = {
  $type: 'org.relationaltext.lens',
  id: 'com.example.custom-transform',
  source: 'com.example.source.facet',
  target: 'com.example.target.facet',
  wasmModule: {
    url: 'https://cdn.example.com/transforms/my-transform.wasm',
  },
}
```

## Required WASM Module Interface

The WASM module must export the following functions. The calling convention uses linear memory: the host allocates a buffer, writes the input JSON, calls `transform`, reads the result from another buffer.

```
memory: WebAssembly.Memory
alloc(size: i32) -> i32
dealloc(ptr: i32, size: i32)
transform(ptr: i32, len: i32) -> i32
result_len() -> i32
```

| Export | Description |
|--------|-------------|
| `memory` | The module's linear memory |
| `alloc(size)` | Allocate `size` bytes and return a pointer |
| `dealloc(ptr, size)` | Free a previously allocated buffer |
| `transform(ptr, len)` | Apply the transformation; input is a UTF-8 JSON string at `[ptr, ptr+len)`. Returns a pointer to the output JSON. |
| `result_len()` | Return the byte length of the most recent `transform` output |

### Input / Output

- **Input**: UTF-8 JSON string encoding a `DocumentJSON` object, written into memory at the pointer returned by `alloc`
- **Output**: UTF-8 JSON string encoding the transformed `DocumentJSON`, written to an internal buffer; pointer returned by `transform`, length returned by `result_len`

### Memory Lifecycle

1. Host calls `alloc(inputBytes.length)` → `ptr`
2. Host writes `inputBytes` into `memory` at `ptr`
3. Host calls `transform(ptr, inputBytes.length)` → `resultPtr`
4. Host calls `result_len()` → `resultLen`
5. Host calls `dealloc(ptr, inputBytes.length)` to free the input buffer
6. Host reads `memory[resultPtr..resultPtr+resultLen]` for the output
7. Module is responsible for managing the result buffer's lifetime

::: warning Result buffer ownership
The host must read the result buffer **before** calling `transform()` again. The module owns the result buffer — the recommended Rust pattern is a `static mut Vec<u8>` that is replaced (and the old allocation dropped) on each `transform()` call.

```rust
#[no_mangle]
pub extern "C" fn transform(ptr: *const u8, len: usize) -> *const u8 {
    // ...apply transformation...
    unsafe {
        RESULT_BUF = output;   // Drops the previous buffer here
        RESULT_BUF.as_ptr()    // Pointer is valid until next transform() call
    }
}
```

If you call `transform()` a second time before copying the first result, the first result is overwritten and lost. The host JavaScript code produced by `applyLensAsync` always copies the result bytes into a JavaScript `Uint8Array` immediately after reading `resultPtr`/`resultLen`.
:::

## Implementing a WASM Transform (Rust)

A minimal Rust implementation:

```rust
use std::ffi::CString;
use std::os::raw::c_char;

static mut RESULT_BUF: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe { Vec::from_raw_parts(ptr, 0, size) };
}

#[no_mangle]
pub extern "C" fn transform(ptr: *const u8, len: usize) -> *const u8 {
    let input = unsafe { std::slice::from_raw_parts(ptr, len) };
    let json: serde_json::Value = serde_json::from_slice(input).unwrap();

    // ... apply your transformation to json ...
    let output = serde_json::to_vec(&json).unwrap();

    unsafe {
        RESULT_BUF = output;
        RESULT_BUF.as_ptr()
    }
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    unsafe { RESULT_BUF.len() }
}
```

Build with:

```bash
cargo build --target wasm32-unknown-unknown --release
```

The output `.wasm` file can be base64-encoded for inline use:

```bash
base64 -i target/wasm32-unknown-unknown/release/my_transform.wasm
```

## Use Cases

WASM transforms are appropriate when:

- The transformation requires Turing-complete logic not expressible in SQL
- You need to call external parsing libraries (e.g., a custom syntax parser)
- Performance-critical batch processing requiring zero-overhead FFI
- Transforms that must run in a sandboxed environment with no network access

For most format conversions, declarative lens rules or SQL rules are sufficient.
