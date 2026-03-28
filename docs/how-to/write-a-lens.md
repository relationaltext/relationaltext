# Write a Lens

## When to Write a Lens

Write a lens when you have documents whose features live in your own namespace — or a third-party format's namespace — and you need to convert them to another namespace without writing a full parser or renderer. Lenses express the mapping as data: a JSON object that can be applied, inverted, composed, and registered globally so that format converters pick it up automatically.

## Step 1: Inspect the Source Namespace

Parse a representative document and look at its raw JSON to understand what feature names and attributes you are working with:

```ts
import { initRelationalText } from 'relational-text'
import { from } from 'relational-text/registry'

await initRelationalText()

const doc = from('markdown', 'Read the ==highlighted== terms carefully.')
const json = doc.toJSON()

// Filter to features from a specific namespace
const myFeatures = json.facets
  .flatMap((f: any) => f.features)
  .filter((feat: any) => feat.$type === 'myapp.facet')

console.log(JSON.stringify(myFeatures, null, 2))
```

Suppose your application stores highlights as `myapp.facet#highlight` features with no extra attributes. The raw facets look like:

```json
[
  {
    "$type": "myapp.facet",
    "name": "highlight"
  }
]
```

The RelationalText hub (`org.relationaltext.facet`) has a `highlight` feature as well. The lens will map one to the other.

## Step 2: Write a Minimal LensSpec

```ts
import type { LensSpec } from 'relational-text'

const myappToRelationaltext: LensSpec = {
  $type: 'org.relationaltext.lens',
  id: 'myapp.to.relationaltext.v1',
  source: 'myapp.facet',
  target: 'org.relationaltext.facet',
  passthrough: 'keep',
  rules: [
    {
      match: { name: 'highlight' },
      replace: { name: 'highlight' },
    },
    {
      // Map myapp links to RT links, preserving the url attribute
      match: { name: 'link' },
      replace: { name: 'link' },
    },
    {
      // Drop internal annotation features that have no RT equivalent
      match: { name: 'internal-ref' },
      replace: null,
    },
  ],
}
```

Key points:

- `source` and `target` are NSID namespace strings. Every feature in the document whose `$type` matches `source` is eligible for the rules.
- `passthrough: 'keep'` (the default) leaves unmatched features untouched. Use `passthrough: 'drop'` to strip all unmatched source-namespace features.
- `replace: null` drops the matched feature without replacement — this makes the lens non-invertible.

## Step 3: Apply It

```ts
import { applyLens } from 'relational-text/lens'

// Before: doc contains myapp.facet features
const beforeJson = doc.toJSON()

// After: myapp.facet#highlight → org.relationaltext.facet#highlight
const afterJson = applyLens(beforeJson, myappToRelationaltext)

console.log(afterJson)
```

`applyLens` is synchronous and returns a `DocumentJSON` object. Pass it directly to `Document.fromJSON()` to get a `Document`, or use it with `to()`:

```ts
import { Document } from 'relational-text'

const convertedDoc = Document.fromJSON(afterJson)
const html = to('html', convertedDoc)
```

## Step 4: Verify with the Debug Trace

`applyLensDebug` runs the same transform and returns a per-rule trace so you can see exactly which rules matched and how many features they affected:

```ts
import { applyLensDebug } from 'relational-text'

const { document: resultJson, trace } = applyLensDebug(beforeJson, myappToRelationaltext)

console.log(JSON.stringify(trace, null, 2))
```

A typical trace for the lens above might look like:

```json
[
  { "ruleIndex": 0, "matched": 3, "action": "highlight → highlight", "isSql": false },
  { "ruleIndex": 1, "matched": 1, "action": "link → link",           "isSql": false },
  { "ruleIndex": 2, "matched": 0, "action": "drop internal-ref",     "isSql": false }
]
```

- `matched: 0` means no features in this document triggered that rule — useful for spotting a misspelled name in `match`.
- `action` describes what the rule did in human-readable form: `"sourceName → targetName"` for renames, `"drop name"` for `replace: null` rules, and `"SQL escape-hatch"` for SQL rules.

If a rule you expected to match has `matched: 0`, double-check the feature name spelling in your source documents against what appears in Step 1.

## Step 5: Register Globally

Once the lens is working, register it with the global lens graph so that every downstream converter picks it up automatically:

```ts
import { registerLens } from 'relational-text/lens'

registerLens(myappToRelationaltext, { autoApply: true })
```

With `autoApply: true`, the lens runs automatically whenever a renderer (like `to('html', doc)` or `to('markdown', doc)`) calls `lensGraph.autoTransform()`. This means you do not have to call `applyLens` manually — converting a document to HTML will now automatically translate `myapp.facet` features to `org.relationaltext.facet` features on the way through:

```ts
// After registerLens, this "just works":
const html = to('html', myAppDoc)
// myapp.facet#highlight → org.relationaltext.facet#highlight → org.w3c.html.facet#mark → <mark>
```

If your lens is invertible (no `replace: null` rules, no SQL rules), `registerLens` also registers the inverse automatically, adding the reverse edge to the lens graph:

```ts
// If myappToRelationaltext has no drop or SQL rules, the inverse is registered too:
// org.relationaltext.facet → myapp.facet
```

### Placement in your application

Call `registerLens` once at startup, before any document operations:

```ts
// app.ts
import { initRelationalText } from 'relational-text'
import { registerLens } from 'relational-text/lens'
import { myappToRelationaltext } from './lenses/myapp-to-relationaltext.js'

await initRelationalText()
registerLens(myappToRelationaltext, { autoApply: true })
```

## See Also

- [Lens Specification](../lenses/) — full `LensSpec` and `LensRule` reference
- [Lens Composition](../lenses/composition) — combining lenses and automatic inverse registration
- [Lens Graph](../lenses/graph) — how `autoApply` and `autoTransform` work
