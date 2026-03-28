//! Table-valued functions for the RelationalText SQLite extension.
//!
//! - `rt_facets(doc)` — one row per feature across all facets
//! - `rt_blocks(doc)` — one row per block feature with text content

use rusqlite::{
    ffi,
    types::Value,
    vtab::{Context, IndexInfo, VTab, VTabConnection, VTabCursor, Values},
    Result,
};
use std::marker::PhantomData;
use std::os::raw::c_int;

use crate::error::parse_doc;

// ─── rt_facets ────────────────────────────────────────────────────────────────
//
// Schema:
//   byte_start INTEGER NOT NULL,
//   byte_end   INTEGER NOT NULL,
//   type_id    TEXT NOT NULL,
//   name       TEXT,
//   data       TEXT NOT NULL,
//   doc        TEXT HIDDEN

const RT_FACETS_SCHEMA: &str = "CREATE TABLE x(
    byte_start INTEGER NOT NULL,
    byte_end   INTEGER NOT NULL,
    type_id    TEXT NOT NULL,
    name       TEXT,
    data       TEXT NOT NULL,
    doc        TEXT HIDDEN
)";

/// Column indices for rt_facets.
const FACET_COL_BYTE_START: c_int = 0;
const FACET_COL_BYTE_END: c_int = 1;
const FACET_COL_TYPE_ID: c_int = 2;
const FACET_COL_NAME: c_int = 3;
const FACET_COL_DATA: c_int = 4;
const FACET_COL_DOC: c_int = 5;

/// A flattened feature row for the `rt_facets` TVF.
#[derive(Debug)]
struct FacetRow {
    byte_start: u32,
    byte_end: u32,
    type_id: String,
    name: Option<String>,
    data: String, // JSON-serialized data map (serde_json::Map)
}

#[repr(C)]
pub struct RtFacets {
    base: ffi::sqlite3_vtab,
}

#[repr(C)]
pub struct RtFacetsCursor<'vtab> {
    base: ffi::sqlite3_vtab_cursor,
    rows: Vec<FacetRow>,
    pos: usize,
    phantom: PhantomData<&'vtab RtFacets>,
}

unsafe impl<'vtab> VTab<'vtab> for RtFacets {
    type Aux = ();
    type Cursor = RtFacetsCursor<'vtab>;

    fn connect(
        db: &mut VTabConnection,
        _aux: Option<&()>,
        _args: &[&[u8]],
    ) -> Result<(String, Self)> {
        db.config(rusqlite::vtab::VTabConfig::Innocuous)?;
        let vtab = RtFacets {
            base: ffi::sqlite3_vtab::default(),
        };
        Ok((RT_FACETS_SCHEMA.to_string(), vtab))
    }

    fn best_index(&self, info: &mut IndexInfo) -> Result<()> {
        let mut found_doc = false;
        for (constraint, mut usage) in info.constraints_and_usages() {
            if !constraint.is_usable() {
                continue;
            }
            if constraint.operator()
                != rusqlite::vtab::IndexConstraintOp::SQLITE_INDEX_CONSTRAINT_EQ
            {
                continue;
            }
            if constraint.column() == FACET_COL_DOC {
                found_doc = true;
                usage.set_argv_index(1);
                usage.set_omit(true);
            }
        }
        if found_doc {
            info.set_idx_num(1);
            info.set_estimated_cost(1.0);
            info.set_estimated_rows(10);
        } else {
            info.set_estimated_cost(2_147_483_647.0);
            info.set_estimated_rows(2_147_483_647);
            info.set_idx_num(0);
        }
        Ok(())
    }

    fn open(&'vtab mut self) -> Result<RtFacetsCursor<'vtab>> {
        Ok(RtFacetsCursor {
            base: ffi::sqlite3_vtab_cursor::default(),
            rows: Vec::new(),
            pos: 0,
            phantom: PhantomData,
        })
    }
}

unsafe impl VTabCursor for RtFacetsCursor<'_> {
    fn filter(&mut self, _idx_num: c_int, _idx_str: Option<&str>, args: &Values<'_>) -> Result<()> {
        self.rows.clear();
        self.pos = 0;

        // The first (and only) arg is the `doc` JSON.
        if args.len() == 0 {
            return Ok(());
        }
        let doc_json: String = args.get(0)?;
        let doc = parse_doc(&doc_json).map_err(|e| {
            rusqlite::Error::UserFunctionError(Box::new(StringError(e.to_string())))
        })?;

        for facet in &doc.facets {
            for feature in &facet.features {
                let name = feature
                    .data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                let data_json =
                    serde_json::to_string(&feature.data).unwrap_or_else(|_| "{}".to_string());
                self.rows.push(FacetRow {
                    byte_start: facet.index.byte_start,
                    byte_end: facet.index.byte_end,
                    type_id: feature.type_id.clone(),
                    name,
                    data: data_json,
                });
            }
        }
        Ok(())
    }

    fn next(&mut self) -> Result<()> {
        self.pos += 1;
        Ok(())
    }

    fn eof(&self) -> bool {
        self.pos >= self.rows.len()
    }

    fn column(&self, ctx: &mut Context, col: c_int) -> Result<()> {
        if self.pos >= self.rows.len() {
            return ctx.set_result(&Value::Null);
        }
        let row = &self.rows[self.pos];
        match col {
            FACET_COL_BYTE_START => ctx.set_result(&(row.byte_start as i64)),
            FACET_COL_BYTE_END => ctx.set_result(&(row.byte_end as i64)),
            FACET_COL_TYPE_ID => ctx.set_result(&row.type_id),
            FACET_COL_NAME => match &row.name {
                Some(n) => ctx.set_result(n),
                None => ctx.set_result(&Value::Null),
            },
            FACET_COL_DATA => ctx.set_result(&row.data),
            FACET_COL_DOC => ctx.set_result(&Value::Null), // HIDDEN
            _ => ctx.set_result(&Value::Null),
        }
    }

    fn rowid(&self) -> Result<i64> {
        Ok(self.pos as i64)
    }
}

// ─── rt_blocks ────────────────────────────────────────────────────────────────
//
// Schema:
//   block_index INTEGER NOT NULL,
//   name        TEXT NOT NULL,
//   attrs       TEXT NOT NULL,
//   parents     TEXT NOT NULL,
//   text        TEXT NOT NULL,
//   doc         TEXT HIDDEN

const RT_BLOCKS_SCHEMA: &str = "CREATE TABLE x(
    block_index INTEGER NOT NULL,
    name        TEXT NOT NULL,
    attrs       TEXT NOT NULL,
    parents     TEXT NOT NULL,
    text        TEXT NOT NULL,
    doc         TEXT HIDDEN
)";

/// Column indices for rt_blocks.
const BLOCK_COL_BLOCK_INDEX: c_int = 0;
const BLOCK_COL_NAME: c_int = 1;
const BLOCK_COL_ATTRS: c_int = 2;
const BLOCK_COL_PARENTS: c_int = 3;
const BLOCK_COL_TEXT: c_int = 4;
const BLOCK_COL_DOC: c_int = 5;

/// A block row for the `rt_blocks` TVF.
#[derive(Debug)]
struct BlockRow {
    block_index: usize,
    name: String,
    attrs: String,   // JSON object
    parents: String, // JSON array
    text: String,    // text content of this block (after marker, before next marker)
}

#[repr(C)]
pub struct RtBlocks {
    base: ffi::sqlite3_vtab,
}

#[repr(C)]
pub struct RtBlocksCursor<'vtab> {
    base: ffi::sqlite3_vtab_cursor,
    rows: Vec<BlockRow>,
    pos: usize,
    phantom: PhantomData<&'vtab RtBlocks>,
}

unsafe impl<'vtab> VTab<'vtab> for RtBlocks {
    type Aux = ();
    type Cursor = RtBlocksCursor<'vtab>;

    fn connect(
        db: &mut VTabConnection,
        _aux: Option<&()>,
        _args: &[&[u8]],
    ) -> Result<(String, Self)> {
        db.config(rusqlite::vtab::VTabConfig::Innocuous)?;
        let vtab = RtBlocks {
            base: ffi::sqlite3_vtab::default(),
        };
        Ok((RT_BLOCKS_SCHEMA.to_string(), vtab))
    }

    fn best_index(&self, info: &mut IndexInfo) -> Result<()> {
        let mut found_doc = false;
        for (constraint, mut usage) in info.constraints_and_usages() {
            if !constraint.is_usable() {
                continue;
            }
            if constraint.operator()
                != rusqlite::vtab::IndexConstraintOp::SQLITE_INDEX_CONSTRAINT_EQ
            {
                continue;
            }
            if constraint.column() == BLOCK_COL_DOC {
                found_doc = true;
                usage.set_argv_index(1);
                usage.set_omit(true);
            }
        }
        if found_doc {
            info.set_idx_num(1);
            info.set_estimated_cost(1.0);
            info.set_estimated_rows(10);
        } else {
            info.set_estimated_cost(2_147_483_647.0);
            info.set_estimated_rows(2_147_483_647);
            info.set_idx_num(0);
        }
        Ok(())
    }

    fn open(&'vtab mut self) -> Result<RtBlocksCursor<'vtab>> {
        Ok(RtBlocksCursor {
            base: ffi::sqlite3_vtab_cursor::default(),
            rows: Vec::new(),
            pos: 0,
            phantom: PhantomData,
        })
    }
}

unsafe impl VTabCursor for RtBlocksCursor<'_> {
    fn filter(&mut self, _idx_num: c_int, _idx_str: Option<&str>, args: &Values<'_>) -> Result<()> {
        self.rows.clear();
        self.pos = 0;

        if args.len() == 0 {
            return Ok(());
        }
        let doc_json: String = args.get(0)?;
        let doc = parse_doc(&doc_json).map_err(|e| {
            rusqlite::Error::UserFunctionError(Box::new(StringError(e.to_string())))
        })?;

        let rows = extract_block_rows(&doc);
        self.rows = rows;
        Ok(())
    }

    fn next(&mut self) -> Result<()> {
        self.pos += 1;
        Ok(())
    }

    fn eof(&self) -> bool {
        self.pos >= self.rows.len()
    }

    fn column(&self, ctx: &mut Context, col: c_int) -> Result<()> {
        if self.pos >= self.rows.len() {
            return ctx.set_result(&Value::Null);
        }
        let row = &self.rows[self.pos];
        match col {
            BLOCK_COL_BLOCK_INDEX => ctx.set_result(&(row.block_index as i64)),
            BLOCK_COL_NAME => ctx.set_result(&row.name),
            BLOCK_COL_ATTRS => ctx.set_result(&row.attrs),
            BLOCK_COL_PARENTS => ctx.set_result(&row.parents),
            BLOCK_COL_TEXT => ctx.set_result(&row.text),
            BLOCK_COL_DOC => ctx.set_result(&Value::Null), // HIDDEN
            _ => ctx.set_result(&Value::Null),
        }
    }

    fn rowid(&self) -> Result<i64> {
        Ok(self.pos as i64)
    }
}

// ─── Block extraction logic ───────────────────────────────────────────────────

/// Extract block rows from a document without a LexiconRegistry.
///
/// A feature is considered a block if it has a `"parents"` key in its `data`
/// map. This matches the community richtext format where block features carry
/// `{ "name": "paragraph", "parents": [...] }`.
///
/// For features that are block markers (i.e., their byte range covers exactly
/// `\n` or `\uFFFC`), the text content is `doc.text[marker_end..next_marker_start]`.
fn extract_block_rows(doc: &relationaltext_core::document::Document) -> Vec<BlockRow> {
    use relationaltext_core::document::Feature;

    // Collect (marker_start, marker_end, feature_ref) for each block feature.
    let mut markers: Vec<(u32, u32, &Feature)> = Vec::new();
    for facet in &doc.facets {
        for feat in &facet.features {
            // Heuristic: a feature is a block if it has `"parents"` in its data.
            if feat.data.contains_key("parents") {
                markers.push((facet.index.byte_start, facet.index.byte_end, feat));
            }
        }
    }

    if markers.is_empty() {
        return Vec::new();
    }

    markers.sort_by_key(|&(start, _, _)| start);

    let text_len = doc.text.len() as u32;
    let n = markers.len();
    let mut rows = Vec::with_capacity(n);

    for (i, &(_, marker_end, feat)) in markers.iter().enumerate() {
        let content_start = marker_end as usize;
        let content_end = if i + 1 < n {
            markers[i + 1].0 as usize
        } else {
            text_len as usize
        };
        // Clamp to valid string slice boundaries.
        let content_end = content_end.min(doc.text.len());
        let block_text = if content_start <= doc.text.len() {
            doc.text[content_start..content_end].to_string()
        } else {
            String::new()
        };

        let name = feat
            .data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let attrs_json = feat
            .data
            .get("attrs")
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
            .unwrap_or_else(|| "{}".to_string());

        let parents_json = feat
            .data
            .get("parents")
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()))
            .unwrap_or_else(|| "[]".to_string());

        rows.push(BlockRow {
            block_index: i,
            name,
            attrs: attrs_json,
            parents: parents_json,
            text: block_text,
        });
    }

    rows
}

// ─── Internal ─────────────────────────────────────────────────────────────────

#[derive(Debug)]
struct StringError(String);

impl std::fmt::Display for StringError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for StringError {}
