//! Fountain screenplay format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.fountain.facet`
//! Spec: https://fountain.io/syntax
//!
//! Block types: action, scene-heading, character, dialogue, parenthetical,
//!              transition, lyric, page-break, section, synopsis, title-page
//! Inline marks: bold (**), italic (*), underline (_), note ([[]])
//! Inline marks may combine: bold+italic (***)

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.fountain.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.fountain/fountain.lexicon.json");

static REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();

fn registry() -> &'static LexiconRegistry {
    REGISTRY.get_or_init(|| {
        let lexicon: Value = serde_json::from_slice(LEXICON_JSON).unwrap_or(Value::Null);
        let empty = Vec::new();
        let features = lexicon["features"].as_array().unwrap_or(&empty).to_vec();
        let mut r = LexiconRegistry::new();
        let _ = r.register_from_json_array(&features);
        r
    })
}

#[no_mangle]
pub extern "C" fn import_fountain(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_fountain(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import helpers ────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
        }
    }
}

/// Emit a 1-char block marker and push its facet (no attrs).
fn open_block(state: &mut ImportState, name: &str) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let s = state.text.len();
    state.text.push(marker);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name, "parents": [], "attrs": {} }],
    }));
}

/// Emit a 1-char block marker with attrs.
fn open_block_attrs(state: &mut ImportState, name: &str, attrs: Value) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let s = state.text.len();
    state.text.push(marker);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name, "parents": [], "attrs": attrs }],
    }));
}

// ─── Inline parser ────────────────────────────────────────────────────────────

/// Parse Fountain inline markup in `line` and append decoded content + facets to `state`.
///
/// Fountain inline: `***bold+italic***`, `**bold**`, `*italic*`, `_underline_`, `[[note]]`
fn walk_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0usize;

    while pos < len {
        // Try to match inline patterns at current position

        // [[note]]
        if pos + 1 < len && bytes[pos] == b'[' && bytes[pos + 1] == b'[' {
            if let Some(rel) = find_str(&line[pos + 2..], "]]") {
                let content = &line[pos + 2..pos + 2 + rel];
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "note" }],
                    }));
                }
                pos = pos + 2 + rel + 2;
                continue;
            }
        }

        // ***bold+italic***
        if pos + 2 < len && bytes[pos] == b'*' && bytes[pos + 1] == b'*' && bytes[pos + 2] == b'*' {
            if let Some(rel) = find_str(&line[pos + 3..], "***") {
                let content = &line[pos + 3..pos + 3 + rel];
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "bold" }],
                    }));
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "italic" }],
                    }));
                }
                pos = pos + 3 + rel + 3;
                continue;
            }
        }

        // **bold**
        if pos + 1 < len && bytes[pos] == b'*' && bytes[pos + 1] == b'*' {
            if let Some(rel) = find_str(&line[pos + 2..], "**") {
                let content = &line[pos + 2..pos + 2 + rel];
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "bold" }],
                    }));
                }
                pos = pos + 2 + rel + 2;
                continue;
            }
        }

        // *italic*
        if bytes[pos] == b'*' {
            if let Some(rel) = find_byte(&line[pos + 1..], b'*') {
                let content = &line[pos + 1..pos + 1 + rel];
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "italic" }],
                    }));
                }
                pos = pos + 1 + rel + 1;
                continue;
            }
        }

        // _underline_
        if bytes[pos] == b'_' {
            if let Some(rel) = find_byte(&line[pos + 1..], b'_') {
                let content = &line[pos + 1..pos + 1 + rel];
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": "underline" }],
                    }));
                }
                pos = pos + 1 + rel + 1;
                continue;
            }
        }

        // Plain character — advance by one UTF-8 char
        let char_len = utf8_char_len(bytes[pos]);
        let end = (pos + char_len).min(len);
        state.text.push_str(&line[pos..end]);
        pos = end;
    }
}

/// Find first occurrence of `needle` in `haystack`, returning byte offset.
fn find_str(haystack: &str, needle: &str) -> Option<usize> {
    haystack.find(needle)
}

/// Find first occurrence of byte `b` in `s`, returning byte offset.
fn find_byte(s: &str, b: u8) -> Option<usize> {
    s.as_bytes().iter().position(|&c| c == b)
}

fn utf8_char_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b < 0xE0 {
        2
    } else if b < 0xF0 {
        3
    } else {
        4
    }
}

// ─── Title page helpers ───────────────────────────────────────────────────────

/// Returns true if the key looks like a title page key (not a transition).
/// A transition key is pure ALL CAPS (e.g. "CUT TO", "FADE TO").
fn is_title_page_key(key: &str) -> bool {
    let trimmed = key.trim();
    // If entirely ASCII uppercase letters + spaces, it's a transition-style key
    if !trimmed.is_empty() && trimmed.chars().all(|c| c.is_ascii_uppercase() || c == ' ') {
        return false;
    }
    true
}

/// Parse a "Key: value" line. Returns `(key, value)` if matched.
fn parse_title_key_value(line: &str) -> Option<(&str, &str)> {
    // Key must start with a letter (not a digit)
    if !line.starts_with(|c: char| c.is_ascii_alphabetic()) {
        return None;
    }
    let colon_pos = line.find(':')?;
    let key = line[..colon_pos].trim();
    // Key must be non-empty and contain only letters, digits, spaces
    if key.is_empty() || !key.chars().all(|c| c.is_alphanumeric() || c == ' ') {
        return None;
    }
    let value = line[colon_pos + 1..].trim();
    Some((key, value))
}

// ─── Character / transition detection ────────────────────────────────────────

/// Returns true if the string is ALL CAPS (at least one ASCII letter).
fn is_all_caps(s: &str) -> bool {
    let has_letter = s.chars().any(|c| c.is_ascii_alphabetic());
    let all_upper = s.chars().all(|c| !c.is_ascii_lowercase());
    has_letter && all_upper
}

/// Matches a Fountain character name line:
/// ALL CAPS optionally followed by extension like `(O.S.)`, `(V.O.)`, `(CONT'D)`.
/// Returns `(char_name, opt_extension)` or `None`.
fn parse_character_line(line: &str) -> Option<(String, Option<String>)> {
    let trimmed = line.trim();
    // Must be ALL CAPS (allow digits, spaces, hyphens, apostrophes in name)
    // Find any parenthetical extension at the end
    let (name_part, ext_part) = if let Some(paren_start) = trimmed.rfind('(') {
        let before = trimmed[..paren_start].trim();
        let paren = trimmed[paren_start..].trim();
        if paren.ends_with(')') {
            (before, Some(paren.to_owned()))
        } else {
            (trimmed, None)
        }
    } else {
        (trimmed, None)
    };

    if name_part.is_empty() {
        return None;
    }
    // Name part must be all caps (letters, digits, spaces, hyphens, apostrophes)
    let valid = name_part.chars().all(|c| {
        c.is_ascii_uppercase()
            || c.is_ascii_digit()
            || c == ' '
            || c == '-'
            || c == '\''
            || c == '`'
    });
    if !valid || !name_part.chars().any(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some((name_part.to_owned(), ext_part))
}

// ─── Dialogue context ─────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum DialogueCtx {
    None,
    Character,
    Parenthetical,
    Dialogue,
}

// ─── Top-level importer ────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Accept either plain Fountain string or JSON with a "text" field
    let input: String = {
        let v: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        if let Some(t) = v["text"].as_str() {
            t.to_owned()
        } else {
            raw.to_owned()
        }
    };

    let mut state = ImportState::new();
    let lines: Vec<&str> = input.split('\n').collect();
    let mut line_idx = 0usize;

    // ── Title page detection ──────────────────────────────────────────────────
    // Title page = consecutive "Key: value" lines at the start, before first blank.
    if !lines.is_empty() {
        if let Some((key, _)) = parse_title_key_value(lines[0]) {
            if is_title_page_key(key) {
                // Consume title page lines
                while line_idx < lines.len() {
                    let line = lines[line_idx];
                    if line.trim().is_empty() {
                        line_idx += 1; // consume the blank separator
                        break;
                    }
                    if let Some((k, v)) = parse_title_key_value(line) {
                        if is_title_page_key(k) {
                            open_block_attrs(
                                &mut state,
                                "title-page",
                                json!({ "key": k.trim(), "value": v.trim() }),
                            );
                            line_idx += 1;
                            continue;
                        }
                    }
                    // Not a title page line — stop
                    break;
                }
            }
        }
    }

    // ── Main body ─────────────────────────────────────────────────────────────
    let mut dialogue_ctx = DialogueCtx::None;
    let mut prev_blank = true; // start of doc counts as blank-preceded

    while line_idx < lines.len() {
        let line = lines[line_idx];
        line_idx += 1;

        // Blank line
        if line.trim().is_empty() {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = true;
            continue;
        }

        // ── Page break: === ──────────────────────────────────────────────────
        if line.trim() == "===" {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            open_block(&mut state, "page-break");
            continue;
        }

        // ── Section: # text / ## text / ... ─────────────────────────────────
        if line.starts_with('#') {
            let level = line.chars().take_while(|&c| c == '#').count();
            let rest = line[level..].trim();
            if !rest.is_empty() || level > 0 {
                dialogue_ctx = DialogueCtx::None;
                prev_blank = false;
                open_block_attrs(&mut state, "section", json!({ "level": level }));
                walk_inline(rest, &mut state);
                continue;
            }
        }

        // ── Synopsis: = text ─────────────────────────────────────────────────
        if line.starts_with("= ") || line == "=" {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            let content = if line.starts_with("= ") {
                &line[2..]
            } else {
                ""
            };
            open_block(&mut state, "synopsis");
            state.text.push_str(content);
            continue;
        }

        // ── Lyric: ~text ─────────────────────────────────────────────────────
        if line.starts_with('~') {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            open_block(&mut state, "lyric");
            walk_inline(&line[1..], &mut state);
            continue;
        }

        // ── Forced transition: >text ─────────────────────────────────────────
        if line.starts_with('>') {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            let content = line[1..].trim().to_uppercase();
            open_block(&mut state, "transition");
            state.text.push_str(&content);
            continue;
        }

        // ── Transition: ALL CAPS ending with "TO:" ────────────────────────────
        if line.trim().ends_with("TO:") && is_all_caps(line.trim()) {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            open_block(&mut state, "transition");
            state.text.push_str(line.trim());
            continue;
        }

        // ── Scene heading ─────────────────────────────────────────────────────
        // Forced with "." prefix, or natural INT./EXT./INT-EXT./I/E
        let is_forced_scene = line.starts_with('.');
        let is_natural_scene = {
            let upper = line.to_uppercase();
            upper.starts_with("INT.")
                || upper.starts_with("EXT.")
                || upper.starts_with("INT-")
                || upper.starts_with("INT/")
                || upper.starts_with("EXT-")
                || upper.starts_with("I/E ")
        };
        if is_forced_scene || is_natural_scene {
            dialogue_ctx = DialogueCtx::None;
            prev_blank = false;
            let content = if is_forced_scene {
                line[1..].trim()
            } else {
                line.trim()
            };
            open_block(&mut state, "scene-heading");
            walk_inline(content, &mut state);
            continue;
        }

        // ── Parenthetical (inside dialogue context) ───────────────────────────
        if matches!(
            dialogue_ctx,
            DialogueCtx::Character | DialogueCtx::Dialogue | DialogueCtx::Parenthetical
        ) {
            let trimmed = line.trim();
            if trimmed.starts_with('(') && trimmed.ends_with(')') {
                prev_blank = false;
                let inner = &trimmed[1..trimmed.len() - 1];
                open_block(&mut state, "parenthetical");
                state.text.push_str(inner);
                dialogue_ctx = DialogueCtx::Parenthetical;
                continue;
            }
        }

        // ── Character name ────────────────────────────────────────────────────
        // ALL CAPS line preceded by a blank line; not a transition (not ending in "TO:")
        if prev_blank && !line.trim().ends_with("TO:") {
            if let Some((char_name, extension)) = parse_character_line(line) {
                prev_blank = false;
                let attrs = match extension {
                    Some(ext) => json!({ "extension": ext }),
                    None => json!({}),
                };
                open_block_attrs(&mut state, "character", attrs);
                state.text.push_str(&char_name);
                dialogue_ctx = DialogueCtx::Character;
                continue;
            }
        }

        // ── Dialogue (after character or parenthetical) ────────────────────────
        if matches!(
            dialogue_ctx,
            DialogueCtx::Character | DialogueCtx::Parenthetical
        ) {
            prev_blank = false;
            open_block(&mut state, "dialogue");
            walk_inline(line, &mut state);
            dialogue_ctx = DialogueCtx::Dialogue;
            continue;
        }

        // ── Continued dialogue ────────────────────────────────────────────────
        if dialogue_ctx == DialogueCtx::Dialogue {
            prev_blank = false;
            open_block(&mut state, "dialogue");
            walk_inline(line, &mut state);
            continue;
        }

        // ── Action (default) ──────────────────────────────────────────────────
        prev_blank = false;
        open_block(&mut state, "action");
        // Forced action uses "!" prefix — strip it
        let action_text = if line.starts_with('!') {
            &line[1..]
        } else {
            line
        };
        walk_inline(action_text, &mut state);
    }

    // Ensure at least one block exists
    if state.facets.is_empty() {
        open_block(&mut state, "action");
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.fountain.facet#bold" => format!("**{}**", content),
        "com.fountain.facet#italic" => format!("*{}*", content),
        "com.fountain.facet#underline" => format!("_{}_", content),
        "com.fountain.facet#note" => format!("[[{}]]", content),
        _ => content.to_owned(),
    }
}

fn render_inline(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, marks } => {
                let mut s = content.clone();
                for mark in marks.iter().rev() {
                    s = apply_mark(&s, mark);
                }
                out.push_str(&s);
            }
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                out.push_str(&render_inline(children));
            }
        }
    }
    out
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry());

    let mut title_lines: Vec<String> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();
    let mut prev_block_name: Option<String> = None;

    for node in &nodes {
        match node {
            HirNode::Block {
                name,
                attrs,
                children,
            } => {
                render_fountain_block(
                    name,
                    attrs,
                    children,
                    &mut title_lines,
                    &mut body_lines,
                    prev_block_name.as_deref(),
                );
                prev_block_name = Some(name.clone());
            }
            HirNode::Container { children, .. } => {
                // Fountain has no container types — recurse into children
                for child in children {
                    if let HirNode::Block {
                        name,
                        attrs,
                        children,
                    } = child
                    {
                        render_fountain_block(
                            name,
                            attrs,
                            children,
                            &mut title_lines,
                            &mut body_lines,
                            prev_block_name.as_deref(),
                        );
                        prev_block_name = Some(name.clone());
                    }
                }
            }
            HirNode::Text { content, marks } => {
                // Bare text nodes — render as action
                let mut s = content.clone();
                for mark in marks.iter().rev() {
                    s = apply_mark(&s, mark);
                }
                if !s.trim().is_empty() {
                    body_lines.push(format!("{}\n", s));
                }
            }
        }
    }

    let mut result = String::new();
    if !title_lines.is_empty() {
        result.push_str(&title_lines.join(""));
        result.push('\n');
    }
    result.push_str(&body_lines.join(""));
    if result.ends_with('\n') {
        result.pop();
    }
    result
}

fn render_fountain_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    title_lines: &mut Vec<String>,
    body_lines: &mut Vec<String>,
    prev_name: Option<&str>,
) {
    // Blank line between different block types (except title-page blocks)
    let needs_blank = prev_name.map_or(false, |p| {
        p != "title-page" && name != "title-page" && p != name
    });

    match name {
        "title-page" => {
            let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("Title");
            let value = attrs.get("value").and_then(|v| v.as_str()).unwrap_or("");
            title_lines.push(format!("{}: {}\n", key, value));
        }

        "scene-heading" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("{}\n", inner.to_uppercase()));
        }

        "character" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            let ext = attrs.get("extension").and_then(|v| v.as_str());
            match ext {
                Some(e) => body_lines.push(format!("{} {}\n", inner.to_uppercase(), e)),
                None => body_lines.push(format!("{}\n", inner.to_uppercase())),
            }
        }

        "parenthetical" => {
            let inner = render_inline(children);
            body_lines.push(format!("({})\n", inner));
        }

        "dialogue" => {
            let inner = render_inline(children);
            body_lines.push(format!("{}\n", inner));
        }

        "transition" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("{}\n", inner.to_uppercase()));
        }

        "action" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("{}\n", inner));
        }

        "lyric" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("~{}\n", inner));
        }

        "page-break" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            body_lines.push("===\n".to_owned());
        }

        "section" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let level = level.clamp(1, 6);
            let inner = render_inline(children);
            body_lines.push(format!("{} {}\n", "#".repeat(level), inner));
        }

        "synopsis" => {
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("= {}\n", inner));
        }

        _ => {
            // Fallback: render as action
            if needs_blank {
                body_lines.push("\n".to_owned());
            }
            let inner = render_inline(children);
            body_lines.push(format!("{}\n", inner));
        }
    }
}
