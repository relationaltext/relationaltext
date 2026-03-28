# Debugging Transformations

This guide covers tools and techniques for diagnosing problems with lenses and format
conversions in RelationalText.

## Symptom Taxonomy

| Symptom | Likely cause | Quick fix |
|---------|--------------|-----------|
| Features missing from output | `passthrough: 'drop'` instead of `'keep'` | Check the lens `passthrough` field |
| Features appear with wrong type | `match.name` does not match the actual feature name in the wire format | Inspect with `doc.toJSON()` |
| All features dropped | `passthrough: 'drop'` with no matching rules | Add rules covering each feature type, or switch to `passthrough: 'keep'` |
| Attributes missing from output | `dropAttrs` removing attrs that should be preserved | Audit each rule's `dropAttrs` list |

---

## Step 1: Inspect the Wire Format

Before debugging a lens, confirm what features are actually in the document. `doc.toJSON()`
returns the raw `{ text, facets }` payload that the WASM core operates on.

```ts
import { from } from 'relational-text'

const doc = from('markdown', '**bold** and a [link](https://example.com)')
const { text, facets } = doc.toJSON()

console.log('text:', JSON.stringify(text))

// Filter to a specific namespace to reduce noise
const ns = 'org.commonmark.facet'
for (const facet of facets) {
  for (const feature of facet.features) {
    if (feature.$type?.startsWith(ns)) {
      console.log(
        `[${facet.index.byteStart}–${facet.index.byteEnd}]`,
        feature.$type,
        feature.name ?? '',
        feature.attrs ?? '',
      )
    }
  }
}
```

This is the single most useful diagnostic step. If the feature name shown here does not
match the `match.name` in your lens rule, that rule will never fire.

---

## Step 2: Trace a Lens

`applyLensDebug` runs the same transformation as `applyLens` but also returns a `trace`
array showing which rules matched and how many features each rule processed.

```ts
import { applyLensDebug } from 'relational-text/lens'

const { document, trace } = applyLensDebug(doc.toJSON(), myLensSpec)

for (const entry of trace) {
  console.log(
    `rule ${entry.ruleIndex}: action=${entry.action}, matched=${entry.matched}`,
  )
}
```

Example output for a 3-rule lens applied to a document with bold and italic marks:

```
rule 0: action=transform, matched=1   // bold rule fired once
rule 1: action=transform, matched=1   // italic rule fired once
rule 2: action=passthrough, matched=0 // wikilink rule never fired — no wikilinks in doc
```

A `matched: 0` entry means the rule's pattern did not match any feature in the document.
That is not necessarily an error (the document may simply not contain that feature type),
but when a rule you expect to fire shows `matched: 0`, the cause is almost always a
feature name mismatch. Go back to Step 1 and compare the wire format name against
`match.name` in the rule.

---

## Step 3: Validate SQL Rules

If your lens uses `sql` rules, validate them before deploying. `validateLensSQL` parses
the SQL at the lens level and returns a list of errors. An empty array means the lens is
syntactically valid.

```ts
import { validateLensSQL } from 'relational-text/lens'

const errors = validateLensSQL(myLensSpec)
if (errors.length > 0) {
  for (const err of errors) {
    console.error(`Rule ${err.ruleIndex}: ${err.message}`)
  }
  throw new Error('Lens SQL is invalid — fix before registering')
}
```

Call `validateLensSQL` at registration time (inside your `ensureXxxLexicon()` function)
so that malformed SQL is caught at startup rather than at apply time.

---

## Namespace Fast-Path

`lensGraph.autoTransform` inspects the feature namespaces actually present in a document
before applying any lens. If a document contains no features in a given source namespace,
lenses targeting that namespace are skipped entirely.

This means a lens with `passthrough: 'drop'` that targets namespace A will not silently
erase features from namespace B if the document came from namespace B and never had any
namespace A features. The fast-path is a safety mechanism, not a guarantee: if a document
genuinely mixes features from two namespaces and you apply a drop-passthrough lens, only
the features in the lens's source namespace are at risk.

---

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| `match.name` uses a normalized name (`code-block`) when the format's wire name is different (`codeBlock`) | Rule never fires; `matched: 0` in trace | Check actual name with `doc.toJSON()`; use the format's native identifier |
| `passthrough: 'drop'` without rules covering every feature type | Features silently removed from output | Add catch-all rules or switch to `passthrough: 'keep'` |
| Forgetting `ensureXxxLexicon()` before calling `from`/`to` | Features land in wrong namespace or fail WASM classification | Call `ensureXxxLexicon()` at startup or at the top of every public function |
| SQL rule with syntax error | Lens throws at apply time, not at registration | Call `validateLensSQL(spec)` inside `ensureXxxLexicon()` before registering |
