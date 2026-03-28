# SQL Engine

RelationalText stores a document's formatting as a list of features — each one describing a byte range and what kind of annotation it is (bold, heading, link, etc.). The SQL engine lets you query and transform these features using familiar SQL syntax.

Every feature becomes a row in a virtual `features` table. You can `SELECT` to inspect them, `UPDATE` to change them, `INSERT` to add new ones, and `DELETE` to remove them. This is useful when a transformation is too complex for a simple lens rule — for example, collapsing two overlapping HTML elements into a single semantic feature, or splitting a generic `heading` feature into `h1`/`h2`/`h3` based on an attribute value.

## `applyFacetSQL`

```ts
import { applyFacetSQL } from 'relational-text/sql'

const transformed = applyFacetSQL(doc, sql)
```

`applyFacetSQL(doc: Document, sql: string): Document` — takes a `Document` and a SQL string, executes the statement(s) against the document's virtual feature table, and returns a new `Document` with the updated features. The original document is not modified.

Execute one or more SQL statements against the document's feature table and return a new Document. Multiple statements separated by `;` are executed in order.

```ts
import { from } from 'relational-text'
import { applyFacetSQL } from 'relational-text/sql'

const doc = from('html', '<p>Hello <code>world</code></p>')
const result = applyFacetSQL(doc, `
  UPDATE features
  SET name = 'code-span'
  WHERE name = 'code' AND type_id = 'org.w3c.html.facet';
`)
```

## Virtual Table Schema: `features`

| Column | Type | Description |
|--------|------|-------------|
| `byte_start` | INTEGER | Start of the feature's byte range (inclusive) |
| `byte_end` | INTEGER | End of the feature's byte range (exclusive) |
| `type_id` | TEXT | Feature `$type` string |
| `name` | TEXT | `data["name"]` convenience column; NULL for features without a `name` field |
| `data` | TEXT | All feature fields except `$type`, serialized as a JSON string |

The table supports `SELECT`, `INSERT`, `UPDATE`, and `DELETE` statements.

## Custom Scalar Functions

### `text_at(byte_start, byte_end)`

Return the UTF-8 substring of the document text in the given byte range.

```sql
SELECT text_at(byte_start, byte_end) FROM features WHERE name = 'mention'
```

### `json_get(data, key)`

Extract one field from a JSON object string. Returns NULL if the key does not exist.

```sql
SELECT json_get(data, 'href') FROM features WHERE name = 'a'
```

### `class_contains(data, cls)`

Token membership check on `data["class"]`. Returns 1 if the `class` value contains the given token, 0 otherwise. Works with both space-separated string values (e.g., `"u-url mention"`) and JSON array values (e.g., `["u-url", "mention"]`).

```sql
SELECT * FROM features WHERE class_contains(data, 'h-card')
```

### `json_object(k1, v1, ...)`

Build a JSON object from key/value pairs (same as SQLite's built-in `json_object`).

```sql
SELECT json_object('href', json_get(data, 'href'), 'handle', 'alice')
```

### `ltrim(s, chars)`

Strip leading occurrences of any character in `chars` from the string `s`.

```sql
SELECT ltrim(text_at(byte_start, byte_end), '@') FROM features WHERE name = 'mention'
```

### `strip_version(type_id)`

Remove the `@version` suffix from a `type_id` string. Used internally by the lens WHERE clause for version-aware matching.

```sql
SELECT * FROM features WHERE strip_version(type_id) = 'org.commonmark.facet'
```

## Supported SQL Operations

### SELECT

Read features from the virtual table:

```sql
SELECT byte_start, byte_end, type_id, name, data
FROM features
WHERE type_id = 'org.w3c.html.facet'
```

::: warning SELECT alone does not modify the document
A `SELECT` statement reads from the virtual table but does not write anything back. The result set is discarded — `applyFacetSQL` always returns the document, not a result set.

To extract and transform features into new rows, combine `SELECT` with `INSERT`:

```sql
INSERT INTO features (byte_start, byte_end, type_id, name, data)
SELECT byte_start, byte_end, 'org.commonmark.facet', 'strong', data
FROM features
WHERE type_id = 'org.w3c.html.facet' AND name = 'b';

DELETE FROM features WHERE type_id = 'org.w3c.html.facet' AND name = 'b';
```

This pattern — INSERT...SELECT followed by DELETE — is the correct way to rename or retype features.
:::

### INSERT

Add new features:

```sql
INSERT INTO features (byte_start, byte_end, type_id, name, data)
VALUES (0, 5, 'org.commonmark.facet', 'strong', '{}')
```

### UPDATE

Modify existing features:

```sql
UPDATE features
SET type_id = 'org.commonmark.facet',
    name = 'emphasis'
WHERE type_id = 'org.w3c.html.facet' AND name = 'em'
```

### DELETE

Remove features:

```sql
DELETE FROM features WHERE name = 'span' AND class_contains(data, 'h-card')
```

## Relationship to Lenses

The SQL engine is the execution backend for `LensRule.sql` entries. You can use `applyFacetSQL` directly for one-off transforms, or embed SQL statements inside a `LensSpec` for reusable, composable transforms.

```ts
// Direct SQL application
const result = applyFacetSQL(doc, 'DELETE FROM features WHERE type_id LIKE "org.w3c.html.facet%"')

// Equivalent via a lens rule
const lens: LensSpec = {
  $type: 'org.relationaltext.lens',
  id: 'example.drop-html',
  source: 'org.w3c.html.facet',
  target: 'org.commonmark.facet',
  rules: [
    { sql: 'DELETE FROM features WHERE type_id LIKE "org.w3c.html.facet%"' }
  ],
}
```

See [Per-rule SQL](../lenses/sql-rules) for how SQL rules appear inside `LensSpec` definitions.
