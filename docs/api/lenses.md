# Lens System API

## Functions

```ts
function applyLens(doc: DocumentJSON, spec: LensSpec): DocumentJSON
function applyLensAsync(doc: DocumentJSON, spec: LensSpec): Promise<DocumentJSON>
function applyLensDebug(doc: DocumentJSON, spec: LensSpec): LensDebugResult
function validateLensSQL(spec: LensSpec): LensSqlValidationError[]
function inverseLens(spec: LensSpec): LensSpec  // throws LensInversionError if not invertible
function composeLenses(first: LensSpec, second: LensSpec): LensSpec | null
function registerLens(spec: LensSpec, opts?: { autoApply?: boolean }): void
function findLens(sourceNs: string, targetNs: string): LensSpec | null
function transformDocument(doc: DocumentJSON, sourceNs: string, targetNs: string): DocumentJSON | null
```

### `applyLens`

Apply a lens synchronously using the SQL-backed facet engine.

```ts
import { applyLens } from 'relational-text'

const result = applyLens(doc.toJSON(), myLensSpec)
```

### `applyLensAsync`

Apply a lens asynchronously. Use when the lens spec includes a `wasmModule` (custom WASM transform blob).

```ts
const result = await applyLensAsync(doc.toJSON(), lensWithWasm)
```

### `applyLensDebug`

Apply a lens and return both the result and a per-rule trace. Useful for authoring and debugging lenses.

```ts
const { result, trace } = applyLensDebug(doc.toJSON(), spec)
trace.forEach(entry => {
  console.log(`rule ${entry.ruleIndex}: ${entry.action} (${entry.matched} features)`)
})
```

### `validateLensSQL`

Validate the SQL rules in a lens spec without running them. Returns an empty array if all rules are valid.

```ts
const errors = validateLensSQL(spec)
if (errors.length > 0) {
  errors.forEach(e => console.error(`rule ${e.ruleIndex}: ${e.message}`))
}
```

### `inverseLens`

Compute the inverse of a lens. Throws `LensInversionError` if the lens was declared `invertible: false` or contains SQL rules.

```ts
const forward = myLens
const backward = inverseLens(forward)  // throws if not invertible
```

### `composeLenses`

Compose two lenses into one. Returns `null` if no rules survive composition (e.g., all rules resolve to contradictions).

```ts
const composed = composeLenses(aToB, bToC)  // LensSpec from A → C, or null
```

### `registerLens`

Register a lens in the global `lensGraph`. When `autoApply` is true, the lens is applied automatically by `autoTransform` calls targeting its namespace.

```ts
registerLens(myLensSpec, { autoApply: true })
```

### `findLens`

Search the lens graph for a path between two namespaces. Returns a composed `LensSpec` if a path exists, `null` otherwise.

```ts
const spec = findLens('org.quilljs.delta.facet', 'org.w3c.html.facet')
```

### `transformDocument`

Apply the lens graph path from `sourceNs` to `targetNs`. Returns `null` if no path exists.

```ts
const transformed = transformDocument(doc.toJSON(), 'com.slack.mrkdwn.facet', 'org.relationaltext.facet')
```

---

## `lensGraph`

```ts
const lensGraph: LensGraph
```

Global singleton. All `registerLens` calls update this instance.

---

## `LensGraph` class

```ts
class LensGraph {
  register(spec: LensSpec, opts?: { autoApply?: boolean }): void
  findPath(sourceNs: string, targetNs: string): LensSpec | null
  autoTransform(jsonStr: string, targetNs: string): string
}
```

`autoTransform` accepts a serialized `DocumentJSON` string, inspects the namespaces present in its facets, finds the shortest lens path to `targetNs`, and returns a transformed JSON string. Returns the input unchanged if no path is found or the document already uses `targetNs`.

```ts
const htmlJson = lensGraph.autoTransform(JSON.stringify(quillDoc), 'org.w3c.html.facet')
```

---

## Type Definitions

```ts
interface LensSpec {
  $type: 'org.relationaltext.lens'
  id: string
  source: string
  target: string
  passthrough?: 'keep' | 'drop'
  invertible?: boolean
  rules: LensRule[]
  wasmModule?: WasmLensRef
}

interface LensRule {
  match?: FeaturePattern
  replace?: FeatureReplacement | null  // null = drop matched features
  sql?: string                          // mutually exclusive with match/replace
  join?: JoinRule                       // mutually exclusive with match/replace
}

interface FeaturePattern {
  name?: string
  matchAttrs?: Record<string, unknown>
}

interface FeatureReplacement {
  name?: string
  typeId?: string
  renameAttrs?: Record<string, string>
  addAttrs?: Record<string, unknown>
  dropAttrs?: string[]
  mapAttrValue?: { attr: string; ops: AttrValueOp[] }
}

type AttrValueOp =
  | { op: 'plus'; value: number | string }
  | { op: 'ltrim'; chars: string }
  | { op: 'rtrim'; chars: string }

interface LensDebugResult {
  result: DocumentJSON
  trace: TraceEntry[]
}

interface TraceEntry {
  ruleIndex: number
  matched: number
  action: 'transform' | 'drop' | 'passthrough'
}

interface LensSqlValidationError {
  ruleIndex: number
  message: string
}

class LensInversionError extends Error {}

interface WasmLensRef {
  data: string  // base64-encoded WASM module
}
```

---

## Lens authoring example

```ts
import { registerLens, applyLens } from 'relational-text'

const myLens: LensSpec = {
  $type: 'org.relationaltext.lens',
  id: 'com.myapp.lens/v1',
  source: 'com.myapp.facet',
  target: 'org.relationaltext.facet',
  passthrough: 'drop',
  invertible: true,
  rules: [
    {
      match: { name: 'emphasis' },
      replace: { name: 'italic' },
    },
    {
      match: { name: 'weight', matchAttrs: { value: 'bold' } },
      replace: { name: 'bold', dropAttrs: ['value'] },
    },
  ],
}

registerLens(myLens, { autoApply: true })

const rtDoc = applyLens(sourceDoc.toJSON(), myLens)
```
