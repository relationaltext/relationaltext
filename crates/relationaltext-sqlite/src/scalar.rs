//! Scalar SQL functions for the RelationalText SQLite extension.
//!
//! All `doc`-accepting functions expect a DocumentJSON blob:
//! `{"text":"...","facets":[...]}`.

use rusqlite::{functions::Context, types::Value, Error as RusqliteError};

use relationaltext_core::{
    lens as lens_core,
    lexicon::LexiconRegistry,
    normalize::remove_mark,
    position::{adjust_facets_for_delete, adjust_facets_for_insert},
};

use crate::error::{parse_doc, user_error};

// ─── rt_text ─────────────────────────────────────────────────────────────────

/// Return the plain text content of a document (`doc.text`).
pub fn rt_text(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_text: argument 0 must be TEXT"))?;
    let doc = parse_doc(doc_json)?;
    Ok(Value::Text(doc.text))
}

// ─── rt_char_length ──────────────────────────────────────────────────────────

/// Return the Unicode code-point count of `doc.text`.
pub fn rt_char_length(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_char_length: argument 0 must be TEXT"))?;
    let doc = parse_doc(doc_json)?;
    let count = doc.text.chars().count() as i64;
    Ok(Value::Integer(count))
}

// ─── rt_feature_count ────────────────────────────────────────────────────────

/// Return the total number of features across all facets.
pub fn rt_feature_count(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_feature_count: argument 0 must be TEXT"))?;
    let doc = parse_doc(doc_json)?;
    let count: usize = doc.facets.iter().map(|f| f.features.len()).sum();
    Ok(Value::Integer(count as i64))
}

// ─── rt_has_mark ─────────────────────────────────────────────────────────────

/// `rt_has_mark(doc, type_id)` — check if any feature matches `type_id` exactly.
///
/// Matching is exact against the full compound key (`$type` or `$type#name`).
pub fn rt_has_mark_2(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_has_mark: argument 0 must be TEXT"))?;
    let type_id = ctx
        .get_raw(1)
        .as_str()
        .map_err(|_| user_error("rt_has_mark: argument 1 must be TEXT"))?;

    let doc = parse_doc(doc_json)?;
    let found = has_mark_in_doc(&doc, type_id, None);
    Ok(Value::Integer(if found { 1 } else { 0 }))
}

/// `rt_has_mark(doc, type_id, name)` — check if any feature matches both `$type` and `name`.
pub fn rt_has_mark_3(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_has_mark: argument 0 must be TEXT"))?;
    let type_id = ctx
        .get_raw(1)
        .as_str()
        .map_err(|_| user_error("rt_has_mark: argument 1 must be TEXT"))?;
    let name = ctx
        .get_raw(2)
        .as_str()
        .map_err(|_| user_error("rt_has_mark: argument 2 must be TEXT"))?;

    let doc = parse_doc(doc_json)?;
    let found = has_mark_in_doc(&doc, type_id, Some(name));
    Ok(Value::Integer(if found { 1 } else { 0 }))
}

fn has_mark_in_doc(
    doc: &relationaltext_core::document::Document,
    type_id: &str,
    name: Option<&str>,
) -> bool {
    // Parse `type_id` — it may be a compound key like `$type#name`.
    let (base_type, embedded_name) = if let Some(pos) = type_id.find('#') {
        (&type_id[..pos], Some(&type_id[pos + 1..]))
    } else {
        (type_id, None)
    };

    // Effective name to check: explicit `name` argument wins, then embedded name.
    let check_name: Option<&str> = name.or(embedded_name);

    doc.facets.iter().any(|facet| {
        facet.features.iter().any(|feat| {
            // Exact compound-key match (e.g. "app.bsky.richtext.facet#mention")
            if feat.type_id == type_id && check_name.is_none() {
                return true;
            }
            // Base type + optional name match
            if feat.type_id != base_type {
                return false;
            }
            match check_name {
                None => true,
                Some(n) => feat.get_str("name") == Some(n),
            }
        })
    })
}

// ─── rt_apply_lens ───────────────────────────────────────────────────────────

/// Apply a lens (LensSpec JSON) to a document. Returns new DocumentJSON.
pub fn rt_apply_lens(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_apply_lens: argument 0 must be TEXT"))?;
    let spec_json = ctx
        .get_raw(1)
        .as_str()
        .map_err(|_| user_error("rt_apply_lens: argument 1 must be TEXT"))?;

    let doc_value: serde_json::Value = serde_json::from_str(doc_json)
        .map_err(|e| user_error(format!("rt_apply_lens: invalid doc JSON: {e}")))?;
    let spec: lens_core::LensSpec = serde_json::from_str(spec_json)
        .map_err(|e| user_error(format!("rt_apply_lens: invalid lens JSON: {e}")))?;

    let result = lens_core::apply_lens_to_doc(&doc_value, &spec);
    let out = serde_json::to_string(&result)
        .map_err(|e| user_error(format!("rt_apply_lens: serialization error: {e}")))?;
    Ok(Value::Text(out))
}

// ─── rt_insert_text ──────────────────────────────────────────────────────────

/// Insert text at a byte position, adjusting all facet ranges.
pub fn rt_insert_text(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_insert_text: argument 0 must be TEXT"))?;
    let byte_pos =
        ctx.get_raw(1)
            .as_i64()
            .map_err(|_| user_error("rt_insert_text: argument 1 must be INTEGER"))? as u32;
    let text_to_insert = ctx
        .get_raw(2)
        .as_str()
        .map_err(|_| user_error("rt_insert_text: argument 2 must be TEXT"))?;

    let mut doc = parse_doc(doc_json)?;

    // Validate the byte position is on a char boundary.
    if byte_pos as usize > doc.text.len() || !doc.text.is_char_boundary(byte_pos as usize) {
        return Err(user_error(format!(
            "rt_insert_text: byte position {byte_pos} is not on a UTF-8 boundary"
        )));
    }

    let byte_len = text_to_insert.len() as u32;
    doc.text.insert_str(byte_pos as usize, text_to_insert);

    // Use an empty registry — expand semantics are not available without registration.
    let registry = LexiconRegistry::new();
    adjust_facets_for_insert(&mut doc, byte_pos, byte_len, &registry);

    let out = serde_json::to_string(&doc)
        .map_err(|e| user_error(format!("rt_insert_text: serialization error: {e}")))?;
    Ok(Value::Text(out))
}

// ─── rt_delete_text ──────────────────────────────────────────────────────────

/// Delete a byte range from a document, adjusting all facet ranges.
pub fn rt_delete_text(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_delete_text: argument 0 must be TEXT"))?;
    let byte_start =
        ctx.get_raw(1)
            .as_i64()
            .map_err(|_| user_error("rt_delete_text: argument 1 must be INTEGER"))? as u32;
    let byte_end =
        ctx.get_raw(2)
            .as_i64()
            .map_err(|_| user_error("rt_delete_text: argument 2 must be INTEGER"))? as u32;

    let mut doc = parse_doc(doc_json)?;

    if byte_start < byte_end && (byte_end as usize) <= doc.text.len() {
        doc.text.drain(byte_start as usize..byte_end as usize);
        adjust_facets_for_delete(&mut doc, byte_start, byte_end);
    }

    let out = serde_json::to_string(&doc)
        .map_err(|e| user_error(format!("rt_delete_text: serialization error: {e}")))?;
    Ok(Value::Text(out))
}

// ─── rt_remove_mark ──────────────────────────────────────────────────────────

/// Remove a mark by type key from a specific byte range.
pub fn rt_remove_mark(ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    let doc_json = ctx
        .get_raw(0)
        .as_str()
        .map_err(|_| user_error("rt_remove_mark: argument 0 must be TEXT"))?;
    let byte_start =
        ctx.get_raw(1)
            .as_i64()
            .map_err(|_| user_error("rt_remove_mark: argument 1 must be INTEGER"))? as u32;
    let byte_end =
        ctx.get_raw(2)
            .as_i64()
            .map_err(|_| user_error("rt_remove_mark: argument 2 must be INTEGER"))? as u32;
    let type_key = ctx
        .get_raw(3)
        .as_str()
        .map_err(|_| user_error("rt_remove_mark: argument 3 must be TEXT"))?;

    let mut doc = parse_doc(doc_json)?;
    remove_mark(&mut doc, byte_start, byte_end, type_key);

    let out = serde_json::to_string(&doc)
        .map_err(|e| user_error(format!("rt_remove_mark: serialization error: {e}")))?;
    Ok(Value::Text(out))
}

// ─── rt_version ──────────────────────────────────────────────────────────────

/// Return the crate version string.
pub fn rt_version(_ctx: &Context<'_>) -> Result<Value, RusqliteError> {
    Ok(Value::Text(env!("CARGO_PKG_VERSION").to_string()))
}
