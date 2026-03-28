# SQLite Extension

The SQLite extension exposes RelationalText document operations as native SQL functions. Documents stored as JSON text blobs in any SQLite database can be queried and manipulated without leaving SQL — no application code, no external process, no round-trip to a language runtime.

Typical use cases: log analytics over stored posts, CMS content search and migration scripts, batch lens transforms across an entire table, ad-hoc inspection of document structure during development.

## Building

```bash
cargo build \
  --example relationaltext_sqlite \
  --features loadable_extension \
  -p relationaltext-sqlite
```

The shared library is written to:

| Platform | Path |
|----------|------|
| macOS | `target/debug/examples/librelationaltext_sqlite.dylib` |
| Linux | `target/debug/examples/librelationaltext_sqlite.so` |
| Windows | `target/debug/examples/relationaltext_sqlite.dll` |

For a release build, add `--release`; the output lands under `target/release/examples/`.

## Loading

In the `sqlite3` shell:

```sql
.load ./target/debug/examples/librelationaltext_sqlite
SELECT rt_version();
```

From application code via the C API:

```c
sqlite3_load_extension(db, "./librelationaltext_sqlite", NULL, &errmsg);
```

::: tip
SQLite requires `SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION` (or the `-enable-load-extension` compile flag) before `sqlite3_load_extension` will succeed. The `sqlite3` shell enables it automatically.
:::

## Scalar Functions

| Function | Arguments | Returns | Description |
|----------|-----------|---------|-------------|
| `rt_version()` | — | TEXT | Crate version string |
| `rt_text(doc)` | TEXT | TEXT | Plain text of the document |
| `rt_char_length(doc)` | TEXT | INTEGER | Unicode code-point count (not byte length) |
| `rt_feature_count(doc)` | TEXT | INTEGER | Total number of features across all facets |
| `rt_has_mark(doc, type_id)` | TEXT, TEXT | 0 or 1 | Whether the document contains any feature with the given type ID |
| `rt_has_mark(doc, type_id, name)` | TEXT, TEXT, TEXT | 0 or 1 | Whether the document contains a feature with the given type ID and name |
| `rt_apply_lens(doc, lens_json)` | TEXT, TEXT | TEXT | Apply a LensSpec (JSON) and return the transformed document |
| `rt_insert_text(doc, byte_pos, text)` | TEXT, INTEGER, TEXT | TEXT | Insert text at a byte position, adjusting all facet ranges |
| `rt_delete_text(doc, byte_start, byte_end)` | TEXT, INTEGER, INTEGER | TEXT | Delete the byte range `[byte_start, byte_end)`, adjusting facets |
| `rt_remove_mark(doc, byte_start, byte_end, type_key)` | TEXT, INTEGER, INTEGER, TEXT | TEXT | Remove a specific mark from a byte range |

All functions that return a document blob return it as a JSON TEXT value in the same wire format they received. `rt_char_length` counts Unicode code points — the same unit used by `rt_facets` byte coordinates after UTF-8 encoding, not the same as `length()` in SQLite which counts bytes or UTF-16 code units depending on the build.

## Table-Valued Functions

### `rt_facets(doc)`

Returns one row per feature in the document. Use this to query or join on the full facet structure.

| Column | Type | Description |
|--------|------|-------------|
| `byte_start` | INTEGER | Start of the byte range (inclusive) |
| `byte_end` | INTEGER | End of the byte range (exclusive) |
| `type_id` | TEXT | Feature `$type` field |
| `name` | TEXT | Feature name from `data["name"]`, or NULL |
| `data` | TEXT | Full feature data as a JSON string |

### `rt_blocks(doc)`

Returns one row per block feature in the document. Block detection uses the presence of a `"parents"` key in the feature data. Blocks are returned in document order.

| Column | Type | Description |
|--------|------|-------------|
| `block_index` | INTEGER | Zero-based position in the document |
| `name` | TEXT | Block name (e.g. `paragraph`, `heading`) |
| `attrs` | TEXT | Block attributes as a JSON object |
| `parents` | TEXT | Parent chain as a JSON array of strings |
| `text` | TEXT | Plain text content of this block |

## Examples

### Count documents that contain bold text

```sql
SELECT COUNT(*)
FROM articles
WHERE rt_has_mark(doc, 'org.relationaltext.facet', 'bold');
```

### Find all links in a corpus

```sql
SELECT
  articles.id,
  articles.title,
  json_extract(f.data, '$.url') AS url,
  substr(rt_text(articles.doc), f.byte_start + 1, f.byte_end - f.byte_start) AS link_text
FROM articles, rt_facets(articles.doc) AS f
WHERE f.name = 'link'
ORDER BY articles.id;
```

### Extract the first heading from each document

```sql
SELECT
  articles.id,
  b.text AS heading
FROM articles
JOIN rt_blocks(articles.doc) AS b
  ON  b.name = 'heading'
  AND b.block_index = (
    SELECT MIN(b2.block_index)
    FROM rt_blocks(articles.doc) AS b2
    WHERE b2.name = 'heading'
  )
ORDER BY articles.id;
```

### Apply a lens to every document in a table

```sql
UPDATE articles
SET doc = rt_apply_lens(
  doc,
  json('{
    "$type": "org.relationaltext.lens",
    "id": "migrate-to-rt",
    "source": "org.commonmark.facet",
    "target": "org.relationaltext.facet",
    "rules": [],
    "invertible": true
  }')
);
```

For non-trivial lenses, store the lens JSON in a separate table or application variable and pass it as a bound parameter rather than inlining it.

### Join documents with their block structure

```sql
SELECT
  a.id,
  a.title,
  b.block_index,
  b.name   AS block_type,
  b.text   AS block_text,
  b.attrs  AS block_attrs
FROM articles AS a, rt_blocks(a.doc) AS b
ORDER BY a.id, b.block_index;
```

This is the standard pattern for shredding a document corpus into its block structure for reporting or migration — each row is one block, and the `block_index` column lets you reconstruct document order.

## Relationship to the WASM SQL Engine

The scalar `rt_apply_lens` function runs the same lens compiler and SQL execution backend as `applyFacetSQL` in the TypeScript package. The difference is the host environment: WASM executes inside a JavaScript runtime against an in-memory virtual table; the SQLite extension executes inside SQLite's query engine against a document column. Both paths use the same Rust core.

See [SQL Engine](./index) for the virtual table schema and the full set of SQL operations supported by `applyFacetSQL`.
