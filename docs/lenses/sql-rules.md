# Per-Rule SQL

Individual `LensRule` entries can include a `sql` field as an alternative to the declarative `match`/`replace` pattern. SQL rules are an escape hatch for transformations that cannot be expressed as simple feature renames.

## The `sql` Field

```ts
interface LensRule {
  readonly match?: FeaturePattern       // Declarative match (mutually exclusive with sql)
  readonly replace?: null | FeatureReplacement
  readonly sql?: string                 // Raw SQL statement for this rule
}
```

`match` and `sql` are mutually exclusive. A rule has either a match pattern or a SQL statement, not both.

SQL rules are opaque to the pure-Rust declarative engine. They are executed by the SQL engine (`execute_facet_sql` / `applyFacetSQL`) against the virtual `features` table.

## When to Use SQL Rules

Use SQL rules when you need:

- **Class-based matching** — match HTML elements by CSS class (`class_contains(data, 'h-card')`)
- **Text-derived attributes** — compute attrs from the document text slice (`text_at(byte_start, byte_end)`)
- **JOIN-based collapse** — merge two colocated features into one (e.g., `<span class="h-card">` wrapping an `<a class="u-url mention">`)
- **Multi-step DELETE** — clean up intermediate features after a transformation

## Example: Mastodon Mention Detection

The most representative use case is detecting Mastodon mention microformat elements and collapsing the two-feature structure into a single `mention` feature:

```sql
-- Step 1: Insert a synthesized 'mention' feature by joining the h-card span
--         and the inner .u-url anchor that share the same byte range
INSERT INTO features (byte_start, byte_end, type_id, name, data)
SELECT
  span.byte_start,
  span.byte_end,
  'org.joinmastodon.facet',
  'mention',
  json_object(
    'href',   json_get(a.data, 'href'),
    'handle', ltrim(text_at(span.byte_start, span.byte_end), '@')
  )
FROM features AS span
JOIN features AS a
  ON  a.byte_start = span.byte_start
  AND a.byte_end   = span.byte_end
WHERE span.name = 'span'  AND class_contains(span.data, 'h-card')
  AND a.name   = 'a'      AND class_contains(a.data, 'u-url');

-- Step 2: Remove the now-redundant intermediate features
DELETE FROM features WHERE name = 'span' AND class_contains(data, 'h-card');
DELETE FROM features WHERE name = 'a'    AND class_contains(data, 'u-url');
```

In a `LensRule`, this appears as:

```json
{
  "sql": "INSERT INTO features (byte_start, byte_end, type_id, name, data) SELECT span.byte_start, span.byte_end, 'org.joinmastodon.facet', 'mention', json_object('href', json_get(a.data, 'href'), 'handle', ltrim(text_at(span.byte_start, span.byte_end), '@')) FROM features AS span JOIN features AS a ON a.byte_start = span.byte_start AND a.byte_end = span.byte_end WHERE span.name = 'span' AND class_contains(span.data, 'h-card') AND a.name = 'a' AND class_contains(a.data, 'u-url'); DELETE FROM features WHERE name = 'span' AND class_contains(data, 'h-card'); DELETE FROM features WHERE name = 'a' AND class_contains(data, 'u-url');"
}
```

## Combining Declarative and SQL Rules

A `LensSpec` can mix declarative rules and SQL rules in the same `rules` array. Declarative rules are processed first, then SQL rules are applied in order:

```json
{
  "$type": "org.relationaltext.lens",
  "source": "org.w3c.html.facet",
  "target": "org.joinmastodon.facet",
  "rules": [
    { "match": { "name": "strong" }, "replace": { "name": "strong" } },
    { "match": { "name": "em" },     "replace": { "name": "em" } },
    { "sql": "... mention detection SQL ..." }
  ]
}
```

## SQL Rule Execution

SQL rules are run via `execute_facet_sql` in the WASM core. The virtual table schema and available functions are described in [SQL Engine](../sql-engine/).

For direct use of the SQL engine without a lens, see `applyFacetSQL` in the [SQL Engine](../sql-engine/).

---

## Template Names

A `replace.name` can be a template object instead of a literal string. The template expands attribute values from the matched feature at lens application time:

```json
{
  "match": { "name": "heading" },
  "replace": { "name": { "template": "h{level}" }, "dropAttrs": ["level"] }
}
```

The `{key}` placeholder is substituted with the value of `attrs[key]` on the matched feature (falling back to the flat `data` map if the feature has no nested `attrs`). Multiple placeholders are supported in a single template string.

### Template names with composed lenses

When the first lens in a composition injects attrs via `addAttrs`, those attrs are visible to templates in the second lens. The composed result correctly propagates the injected values into the template expansion.

::: warning Template names are not invertible
`inverseLens` rejects any rule whose `replace.name` is a template. Because `h2` cannot be statically mapped back to `heading` + `attrs.level=2` without evaluating the template in reverse, this transformation is inherently one-way.

If you need a heading lens that is invertible, use explicit `matchAttrs` rules instead:

```json
{ "match": { "name": "heading", "matchAttrs": { "level": 2 } },
  "replace": { "name": "h2", "dropAttrs": ["level"] } }
```
:::

---

## JOIN DSL

The `join` field on a `LensRule` enables same-range feature merging without writing raw SQL. It is the preferred alternative to `rule.sql` for the common pattern of collapsing two colocated features into one.

### Example: Mastodon mention microformat

The Mastodon mention structure (`<span class="h-card">` wrapping `<a class="u-url mention">`) can be collapsed with a join rule:

```json
{
  "join": {
    "primary": { "name": "span", "matchAttrs": { "class": "h-card" } },
    "joined": [
      { "name": "a", "alias": "link_feat", "required": false }
    ],
    "produce": {
      "typeId": "org.joinmastodon.facet",
      "name": { "from": "literal", "value": "mention" },
      "attrs": {
        "href":   { "from": "joinedAttr", "alias": "link_feat", "attr": "href" },
        "handle": { "from": "text", "transform": { "ops": [{ "op": "ltrim", "chars": "@" }] } }
      }
    },
    "deleteMatched": ["span", "a"]
  }
}
```

### JOIN DSL schema

#### `join.primary`

Selects the anchor feature for the join. Uses the same `FeaturePattern` fields (`name`, `matchAttrs`) as a regular `match`. In the compiled SQL the primary alias is always `p`.

#### `join.joined[]`

Additional features that must share the same `[byte_start, byte_end)` range as the primary:

```ts
interface JoinedFeature {
  readonly name: string            // Feature name to match
  readonly alias: string           // Reference name used in `produce.attrs`
  readonly required?: boolean      // Default: true (INNER JOIN); false = LEFT JOIN
}
```

- `required: true` (default) — the output row is only produced when this feature is present (INNER JOIN)
- `required: false` — the output row is still produced even when this feature is absent; attrs sourced from it will be `null` (LEFT JOIN)

#### `join.produce`

Describes the output feature:

```ts
interface JoinProduce {
  readonly typeId: string                              // Output feature $type
  readonly name: JoinAttrSource                        // Output feature name
  readonly attrs?: Record<string, JoinAttrSource>      // Output attrs
}
```

#### `JoinAttrSource`

All fields in `produce.name` and each value in `produce.attrs` are a `JoinAttrSource`:

| `from` value | Required fields | Description |
|---|---|---|
| `"literal"` | `value: string` | Hard-coded string constant |
| `"attr"` | `attr: string` | Value from the primary feature's `attrs` map |
| `"primaryAttr"` | `attr: string` | Alias for `"attr"` (always refers to primary) |
| `"joinedAttr"` | `alias: string`, `attr: string` | Value from a named joined feature's `attrs` |
| `"text"` | `transform?` | The document text slice at the primary feature's range |

The `"text"` source can apply an optional chain of `JoinAttrTransform` operations:

```ts
interface JoinAttrTransform {
  ops: JoinAttrOp[]
}

type JoinAttrOp =
  | { op: 'ltrim'; chars: string }   // Strip leading occurrences of chars
  | { op: 'rtrim'; chars: string }   // Strip trailing occurrences of chars
  | { op: 'trim';  chars: string }   // Strip both leading and trailing
  | { op: 'prefix'; value: string }  // Prepend a string constant
  | { op: 'suffix'; value: string }  // Append a string constant
```

#### `join.deleteMatched`

An array of feature names to delete after the join. All features with a matching name at the same byte range as the primary are removed. Use this to clean up the source features that were merged into the output.

### Limitations

::: warning Join rules are not invertible or composable
- `inverseLens` rejects any lens containing a `join` rule — the merge cannot be statically reversed
- `composeLenses` skips join rules — they are opaque to the composition algorithm
- If you need bidirectional conversion, write separate forward and inverse lenses
:::
