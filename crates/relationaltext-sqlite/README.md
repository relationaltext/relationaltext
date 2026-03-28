# relationaltext-sqlite

A native loadable SQLite extension that exposes RelationalText document
operations as SQL functions. Documents stored as TEXT blobs in SQLite can be
queried and manipulated without leaving SQL — no application code required.

## Building

```bash
cargo build \
  --example relationaltext_sqlite \
  --features loadable_extension \
  -p relationaltext-sqlite
```

The resulting shared library will be at
`target/debug/examples/librelationaltext_sqlite.dylib` (macOS),
`librelationaltext_sqlite.so` (Linux), or
`relationaltext_sqlite.dll` (Windows).

## Loading in SQLite

```sql
.load ./target/debug/examples/librelationaltext_sqlite
SELECT rt_version();
```

## Scalar functions

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `rt_text(doc)` | TEXT | TEXT | Extract the plain text of a document |
| `rt_char_length(doc)` | TEXT | INTEGER | Unicode code-point count (not byte length) |
| `rt_feature_count(doc)` | TEXT | INTEGER | Total number of features across all facets |
| `rt_has_mark(doc, type_id)` | TEXT, TEXT | 0 or 1 | Whether the document contains any feature with the given type ID |
| `rt_has_mark(doc, type_id, name)` | TEXT, TEXT, TEXT | 0 or 1 | Whether the document contains a feature with the given type ID and name |
| `rt_apply_lens(doc, lens_json)` | TEXT, TEXT | TEXT | Apply a LensSpec (JSON) and return the transformed document |
| `rt_insert_text(doc, byte_pos, text)` | TEXT, INT, TEXT | TEXT | Insert text at a byte position, adjusting all facet ranges |
| `rt_delete_text(doc, byte_start, byte_end)` | TEXT, INT, INT | TEXT | Delete the byte range `[byte_start, byte_end)` |
| `rt_remove_mark(doc, byte_start, byte_end, type_key)` | TEXT, INT, INT, TEXT | TEXT | Remove a specific mark from a byte range |
| `rt_version()` | — | TEXT | Crate version string |

## Table-valued functions

### `rt_facets(doc)`

Returns one row per feature in the document.

| Column | Type | Description |
|---|---|---|
| `byte_start` | INTEGER | Start of the byte range (inclusive) |
| `byte_end` | INTEGER | End of the byte range (exclusive) |
| `type_id` | TEXT | Feature `$type` field |
| `name` | TEXT | Feature name from `data["name"]`, or NULL |
| `data` | TEXT | Full feature data as a JSON string |

### `rt_blocks(doc)`

Returns one row per block feature in the document.

| Column | Type | Description |
|---|---|---|
| `block_index` | INTEGER | Zero-based block index |
| `name` | TEXT | Block name (e.g. `paragraph`, `heading`) |
| `attrs` | TEXT | Block attributes as JSON |
| `parents` | TEXT | Parent chain as a JSON array of strings |
| `text` | TEXT | Plain text content of this block |

## Example queries

```sql
-- Find all documents that contain a "heading" block
SELECT id, rt_text(doc)
FROM articles
WHERE rt_has_mark(doc, 'org.relationaltext.facet', 'heading');

-- List all features in a document
SELECT byte_start, byte_end, type_id, name
FROM rt_facets(
  '{"text":"\uFFFCHello","facets":[{"index":{"byteStart":0,"byteEnd":3},"features":[{"$type":"org.relationaltext.facet","name":"paragraph","parents":[]}]}]}'
);

-- Apply a lens transform inline
UPDATE articles
SET doc = rt_apply_lens(doc, '{"$type":"community.lexicon.lens","id":"x","source":"org.commonmark.facet","target":"org.relationaltext.facet","rules":[],"invertible":true}')
WHERE id = 42;

-- Insert text into a document stored in a column
UPDATE notes
SET doc = rt_insert_text(doc, 0, 'Prefix: ')
WHERE id = 1;
```

## License

MIT OR Apache-2.0

Copyright 2026 Blaine Cook
