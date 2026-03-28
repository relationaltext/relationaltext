//! RelationalText SQLite extension.
//!
//! Exposes RelationalText document operations as SQL functions, allowing
//! documents stored as TEXT blobs to be queried and manipulated in SQL.
//!
//! # Scalar functions
//!
//! | Function | Args | Returns | Description |
//! |---|---|---|---|
//! | `rt_text(doc)` | TEXT | TEXT | Plain text of document |
//! | `rt_char_length(doc)` | TEXT | INTEGER | Unicode code-point count |
//! | `rt_feature_count(doc)` | TEXT | INTEGER | Total feature count |
//! | `rt_has_mark(doc, type_id)` | TEXT, TEXT | INTEGER (0/1) | Does doc contain type_id? |
//! | `rt_has_mark(doc, type_id, name)` | TEXT, TEXT, TEXT | INTEGER (0/1) | Does doc contain type_id with name? |
//! | `rt_apply_lens(doc, lens_json)` | TEXT, TEXT | TEXT | Apply a LensSpec |
//! | `rt_insert_text(doc, byte_pos, text)` | TEXT, INT, TEXT | TEXT | Insert text |
//! | `rt_delete_text(doc, byte_start, byte_end)` | TEXT, INT, INT | TEXT | Delete range |
//! | `rt_remove_mark(doc, byte_start, byte_end, type_key)` | TEXT, INT, INT, TEXT | TEXT | Remove mark |
//! | `rt_version()` | — | TEXT | Crate version |
//!
//! # Table-valued functions
//!
//! | Function | Description |
//! |---|---|
//! | `rt_facets(doc)` | One row per feature |
//! | `rt_blocks(doc)` | One row per block feature |

pub mod error;
pub mod scalar;
pub mod tvf;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{functions::FunctionFlags, vtab::eponymous_only_module, Connection};

    /// Register all RT functions on an in-memory connection.
    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        let det = FunctionFlags::SQLITE_DETERMINISTIC;
        let none = FunctionFlags::empty();

        conn.create_scalar_function("rt_text", 1, det, scalar::rt_text)
            .unwrap();
        conn.create_scalar_function("rt_char_length", 1, det, scalar::rt_char_length)
            .unwrap();
        conn.create_scalar_function("rt_feature_count", 1, det, scalar::rt_feature_count)
            .unwrap();
        conn.create_scalar_function("rt_has_mark", 2, det, scalar::rt_has_mark_2)
            .unwrap();
        conn.create_scalar_function("rt_has_mark", 3, det, scalar::rt_has_mark_3)
            .unwrap();
        conn.create_scalar_function("rt_apply_lens", 2, none, scalar::rt_apply_lens)
            .unwrap();
        conn.create_scalar_function("rt_insert_text", 3, none, scalar::rt_insert_text)
            .unwrap();
        conn.create_scalar_function("rt_delete_text", 3, none, scalar::rt_delete_text)
            .unwrap();
        conn.create_scalar_function("rt_remove_mark", 4, none, scalar::rt_remove_mark)
            .unwrap();
        conn.create_scalar_function("rt_version", 0, det, scalar::rt_version)
            .unwrap();

        conn.create_module("rt_facets", eponymous_only_module::<tvf::RtFacets>(), None)
            .unwrap();
        conn.create_module("rt_blocks", eponymous_only_module::<tvf::RtBlocks>(), None)
            .unwrap();

        conn
    }

    // ── Test documents ────────────────────────────────────────────────────────

    /// A document with one block (paragraph marker at [0,3)) and one mark (strong [3,8)).
    ///
    /// text: "\uFFFChello world"
    /// - [0,3): block feature (org.commonmark.facet, name="paragraph", parents=[])
    /// - [3,8): mark feature (org.commonmark.facet, name="strong")
    const TEST_DOC: &str = r#"{
        "text": "\uFFFChello world",
        "facets": [
            {
                "index": { "byteStart": 0, "byteEnd": 3 },
                "features": [{ "$type": "org.commonmark.facet", "name": "paragraph", "parents": [] }]
            },
            {
                "index": { "byteStart": 3, "byteEnd": 8 },
                "features": [{ "$type": "org.commonmark.facet", "name": "strong" }]
            }
        ]
    }"#;

    /// A minimal doc with no facets.
    const PLAIN_DOC: &str = r#"{"text":"hello world"}"#;

    // ── rt_text ───────────────────────────────────────────────────────────────

    #[test]
    fn test_rt_text_returns_text_field() {
        let conn = setup();
        let result: String = conn
            .query_row("SELECT rt_text(?1)", [TEST_DOC], |row| row.get(0))
            .unwrap();
        // The text starts with the FFFC block marker followed by "hello world".
        assert!(result.contains("hello world"), "got: {result:?}");
    }

    #[test]
    fn test_rt_text_plain_doc() {
        let conn = setup();
        let result: String = conn
            .query_row("SELECT rt_text(?1)", [PLAIN_DOC], |row| row.get(0))
            .unwrap();
        assert_eq!(result, "hello world");
    }

    // ── rt_char_length ────────────────────────────────────────────────────────

    #[test]
    fn test_rt_char_length() {
        let conn = setup();
        // "hello world" = 11 chars; "\uFFFC" = 1 char → total 12
        let count: i64 = conn
            .query_row("SELECT rt_char_length(?1)", [TEST_DOC], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 12, "\u{FFFC}hello world = 12 chars");
    }

    #[test]
    fn test_rt_char_length_plain() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT rt_char_length(?1)", [PLAIN_DOC], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 11);
    }

    // ── rt_feature_count ──────────────────────────────────────────────────────

    #[test]
    fn test_rt_feature_count_two_features() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT rt_feature_count(?1)", [TEST_DOC], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_rt_feature_count_no_facets() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT rt_feature_count(?1)", [PLAIN_DOC], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    // ── rt_has_mark ───────────────────────────────────────────────────────────

    #[test]
    fn test_rt_has_mark_2arg_present() {
        let conn = setup();
        // "strong" feature is present via compound key type_id=org.commonmark.facet, name=strong.
        let found: i64 = conn
            .query_row(
                "SELECT rt_has_mark(?1, ?2)",
                rusqlite::params![TEST_DOC, "org.commonmark.facet"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn test_rt_has_mark_2arg_absent() {
        let conn = setup();
        let found: i64 = conn
            .query_row(
                "SELECT rt_has_mark(?1, ?2)",
                rusqlite::params![TEST_DOC, "app.bsky.richtext.facet"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 0);
    }

    #[test]
    fn test_rt_has_mark_3arg_present() {
        let conn = setup();
        let found: i64 = conn
            .query_row(
                "SELECT rt_has_mark(?1, ?2, ?3)",
                rusqlite::params![TEST_DOC, "org.commonmark.facet", "strong"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn test_rt_has_mark_3arg_absent_name() {
        let conn = setup();
        let found: i64 = conn
            .query_row(
                "SELECT rt_has_mark(?1, ?2, ?3)",
                rusqlite::params![TEST_DOC, "org.commonmark.facet", "emphasis"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(found, 0);
    }

    // ── rt_apply_lens ─────────────────────────────────────────────────────────

    #[test]
    fn test_rt_apply_lens_renames_feature() {
        let conn = setup();
        // Lens: rename "strong" → "bold" within org.commonmark.facet.
        let lens_json = r#"{
            "$type": "community.lexicon.lens",
            "id": "test.lens",
            "source": "org.commonmark.facet",
            "target": "org.commonmark.facet",
            "rules": [
                {
                    "match": { "name": "strong" },
                    "replace": { "name": "bold" }
                }
            ],
            "invertible": true
        }"#;

        let result: String = conn
            .query_row(
                "SELECT rt_apply_lens(?1, ?2)",
                rusqlite::params![TEST_DOC, lens_json],
                |row| row.get(0),
            )
            .unwrap();

        // The result doc should contain "bold" and not "strong".
        assert!(
            result.contains("bold"),
            "expected 'bold' in result: {result}"
        );
    }

    // ── rt_insert_text ────────────────────────────────────────────────────────

    #[test]
    fn test_rt_insert_text_appends() {
        let conn = setup();
        // "hello world" is 11 bytes; insert "!" at byte 11 (end).
        let result: String = conn
            .query_row("SELECT rt_insert_text(?1, 11, '!')", [PLAIN_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        let text: String = conn
            .query_row("SELECT rt_text(?1)", [&result], |row| row.get(0))
            .unwrap();
        assert_eq!(text, "hello world!", "got: {text:?}");
    }

    // ── rt_delete_text ────────────────────────────────────────────────────────

    #[test]
    fn test_rt_delete_text_removes_range() {
        let conn = setup();
        // Delete " world" (bytes 5..11 in "hello world").
        let result: String = conn
            .query_row("SELECT rt_delete_text(?1, 5, 11)", [PLAIN_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        let text: String = conn
            .query_row("SELECT rt_text(?1)", [&result], |row| row.get(0))
            .unwrap();
        assert_eq!(text, "hello", "got: {text:?}");
    }

    // ── rt_remove_mark ────────────────────────────────────────────────────────

    #[test]
    fn test_rt_remove_mark_removes_feature() {
        let conn = setup();
        // Remove the "strong" mark at [3,8).
        let result: String = conn
            .query_row(
                "SELECT rt_remove_mark(?1, 3, 8, 'org.commonmark.facet#strong')",
                [TEST_DOC],
                |row| row.get(0),
            )
            .unwrap();
        let count: i64 = conn
            .query_row("SELECT rt_feature_count(?1)", [&result], |row| row.get(0))
            .unwrap();
        // Only the paragraph block feature remains.
        assert_eq!(count, 1, "expected only the paragraph block to remain");
    }

    // ── rt_version ────────────────────────────────────────────────────────────

    #[test]
    fn test_rt_version_nonempty() {
        let conn = setup();
        let ver: String = conn
            .query_row("SELECT rt_version()", [], |row| row.get(0))
            .unwrap();
        assert!(!ver.is_empty(), "version should be non-empty");
    }

    // ── rt_facets TVF ─────────────────────────────────────────────────────────

    #[test]
    fn test_rt_facets_returns_rows() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM rt_facets(?1)", [TEST_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        // 2 features: paragraph block + strong mark.
        assert_eq!(count, 2, "expected 2 feature rows");
    }

    #[test]
    fn test_rt_facets_columns() {
        let conn = setup();
        let mut stmt = conn
            .prepare("SELECT byte_start, byte_end, type_id, name, data FROM rt_facets(?1)")
            .unwrap();
        let rows: Vec<(i64, i64, String, Option<String>, String)> = stmt
            .query_map([TEST_DOC], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert_eq!(rows.len(), 2);
        // First row: paragraph block at [0,3).
        let (s, e, type_id, name, _data) = &rows[0];
        assert_eq!(*s, 0);
        assert_eq!(*e, 3);
        assert_eq!(type_id, "org.commonmark.facet");
        assert_eq!(name.as_deref(), Some("paragraph"));
    }

    #[test]
    fn test_rt_facets_empty_doc() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM rt_facets(?1)", [PLAIN_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    // ── rt_blocks TVF ─────────────────────────────────────────────────────────

    #[test]
    fn test_rt_blocks_returns_one_block() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM rt_blocks(?1)", [TEST_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "expected 1 block row");
    }

    #[test]
    fn test_rt_blocks_text_content() {
        let conn = setup();
        let text: String = conn
            .query_row("SELECT text FROM rt_blocks(?1)", [TEST_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        // Block content is text after the FFFC marker: "hello world".
        assert_eq!(text, "hello world", "got: {text:?}");
    }

    #[test]
    fn test_rt_blocks_no_blocks() {
        let conn = setup();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM rt_blocks(?1)", [PLAIN_DOC], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }
}
