//! Confluence / JIRA wiki markup format adapter: import and export for
//! RelationalText documents.
//!
//! Both formats share the `com.atlassian.wiki.facet` namespace and nearly
//! identical syntax. JIRA-specific differences (e.g. `bq.` blockquote prefix)
//! are handled in the importer.
//!
//! Inline marks: *bold*, _italic_, +underline+, -strikethrough-, ^superscript^,
//!               ~subscript~, {{monospace}}
//! Entities: [display|url], [url]
//! Block: paragraph, heading (h1.–h6.), code-block ({code}...{code}),
//!        blockquote-marker ({quote}...{quote} or > or bq.),
//!        admonition ({note}/{warning}/{tip}/{info}),
//!        bullet-list-marker (* / **), ordered-list-marker (# / ##),
//!        list-item-marker, list-item-text, horizontal-rule

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.atlassian.wiki.facet";
const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/com.atlassian.wiki/confluence.lexicon.json");

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
pub extern "C" fn import_confluence(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_confluence(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    prev_list_type: u8, // 0=none, 1=bullet, 2=ordered
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            prev_list_type: 0,
        }
    }
}

fn open_block(state: &mut ImportState, name: &str, parents: &[&str]) {
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
        "features": [{ "$type": TYPE_ID, "name": name, "parents": parents, "attrs": {} }],
    }));
}

fn open_block_attrs(state: &mut ImportState, name: &str, parents: &[&str], attrs: Value) {
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
        "features": [{ "$type": TYPE_ID, "name": name, "parents": parents, "attrs": attrs }],
    }));
}

fn push_mark(state: &mut ImportState, content: &str, name: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name }],
    }));
}

fn push_entity(state: &mut ImportState, display: &str, feature: Value) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
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

// ─── Confluence/JIRA inline scanner ───────────────────────────────────────────
//
// Inline pattern priority (left to right, first match wins):
//   *bold*  _italic_  +underline+  -strikethrough-  ^superscript^  ~subscript~
//   {{monospace}}
//   [display|url]  [url]
//   plain text

fn walk_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    macro_rules! flush_plain {
        ($end:expr) => {
            if plain_start < $end {
                state.text.push_str(&line[plain_start..$end]);
            }
        };
    }

    while pos < len {
        let b = bytes[pos];

        // *bold* — single asterisk, not blank content
        if b == b'*' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'*') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "bold");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // _italic_
        if b == b'_' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'_') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "italic");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // +underline+
        if b == b'+' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'+') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "underline");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // -strikethrough-
        if b == b'-' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'-') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "strikethrough");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // ^superscript^
        if b == b'^' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'^') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "superscript");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // ~subscript~
        if b == b'~' {
            if let Some(close) = find_closing_single(&line[pos + 1..], b'~') {
                let content = &line[pos + 1..pos + 1 + close];
                if !content.is_empty() {
                    flush_plain!(pos);
                    push_mark(state, content, "subscript");
                    pos = pos + 1 + close + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }

        // {{monospace}}
        if b == b'{' && pos + 1 < len && bytes[pos + 1] == b'{' {
            if let Some(close_rel) = line[pos + 2..].find("}}") {
                flush_plain!(pos);
                let content = &line[pos + 2..pos + 2 + close_rel];
                push_mark(state, content, "monospace");
                pos = pos + 2 + close_rel + 2;
                plain_start = pos;
                continue;
            }
        }

        // [display|url] or [url]  (Confluence link — single brackets)
        if b == b'[' {
            if let Some(close_rel) = line[pos + 1..].find(']') {
                flush_plain!(pos);
                let inner = &line[pos + 1..pos + 1 + close_rel];
                if let Some(pipe) = inner.find('|') {
                    let display = &inner[..pipe];
                    let uri = &inner[pipe + 1..];
                    push_entity(
                        state,
                        display,
                        json!({
                            "$type": TYPE_ID, "name": "link", "uri": uri, "display": display
                        }),
                    );
                } else {
                    // Bare link: display text = uri
                    let uri = inner;
                    push_entity(
                        state,
                        uri,
                        json!({
                            "$type": TYPE_ID, "name": "link", "uri": uri
                        }),
                    );
                }
                pos = pos + 1 + close_rel + 1;
                plain_start = pos;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    if plain_start < len {
        state.text.push_str(&line[plain_start..]);
    }
}

/// Find closing byte `delim` in `s`, returning byte offset of the delimiter.
/// Returns None if not found or if content would be empty (offset == 0).
fn find_closing_single(s: &str, delim: u8) -> Option<usize> {
    s.as_bytes().iter().position(|&b| b == delim)
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    let text = if raw.trim_start().starts_with('{') {
        // Try to parse as JSON first; if it has a "text" field use that.
        // But be careful: {code} and {quote} lines also start with '{'.
        // We only treat it as JSON if it looks like a JSON object (has a colon).
        if raw.trim_start().starts_with("{\"") {
            let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
            outer["text"]
                .as_str()
                .map(|s| s.to_owned())
                .unwrap_or_else(|| raw.to_owned())
        } else {
            raw.to_owned()
        }
    } else {
        raw.to_owned()
    };

    let mut state = ImportState::new();
    let lines: Vec<&str> = text.split('\n').collect();

    let mut in_code_block = false;
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;

    let mut in_quote_block = false;
    let mut quote_lines: Vec<&str> = Vec::new();

    let mut in_admonition = false;
    let mut admonition_type = "note";
    let mut admonition_lines: Vec<&str> = Vec::new();

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // ── {code:lang} / {code} block detection ─────────────────────────────
        if !in_code_block && !in_quote_block && !in_admonition {
            if let Some(lang) = parse_code_open(line) {
                in_code_block = true;
                code_lines = Vec::new();
                code_lang = lang;
                i += 1;
                continue;
            }
        }

        if in_code_block {
            if line == "{code}" {
                in_code_block = false;
                let code_content = code_lines.join("\n");
                let attrs = code_lang_attrs(code_lang);
                state.prev_list_type = 0;
                open_block_attrs(&mut state, "code-block", &[], attrs);
                state.text.push_str(&code_content);
                state.text.push('\n');
                code_lines = Vec::new();
                code_lang = None;
            } else {
                code_lines.push(line);
            }
            i += 1;
            continue;
        }

        // ── {quote} block detection ───────────────────────────────────────────
        if !in_quote_block && !in_admonition && line == "{quote}" {
            in_quote_block = true;
            quote_lines = Vec::new();
            i += 1;
            continue;
        }

        if in_quote_block {
            if line == "{quote}" {
                in_quote_block = false;
                let content = quote_lines.join("\n");
                state.prev_list_type = 0;
                open_block(&mut state, "blockquote-marker", &[]);
                open_block(&mut state, "paragraph", &["blockquote"]);
                walk_inline(&content, &mut state);
                quote_lines = Vec::new();
            } else {
                quote_lines.push(line);
            }
            i += 1;
            continue;
        }

        // ── Admonition block detection ─────────────────────────────────────────
        if !in_admonition {
            if let Some(admon_type) = parse_admonition_open(line) {
                in_admonition = true;
                admonition_type = admon_type;
                admonition_lines = Vec::new();
                i += 1;
                continue;
            }
        }

        if in_admonition {
            if parse_admonition_open(line).is_some() {
                // Closing tag (same pattern as opening)
                in_admonition = false;
                let content = admonition_lines.join("\n");
                state.prev_list_type = 0;
                open_block_attrs(
                    &mut state,
                    "admonition",
                    &[],
                    json!({ "type": admonition_type }),
                );
                walk_inline(&content, &mut state);
                admonition_lines = Vec::new();
            } else {
                admonition_lines.push(line);
            }
            i += 1;
            continue;
        }

        // ── h1. Heading ───────────────────────────────────────────────────────
        if let Some((level, content)) = parse_heading(line) {
            state.prev_list_type = 0;
            open_block_attrs(&mut state, "heading", &[], json!({ "level": level }));
            walk_inline(content, &mut state);
            i += 1;
            continue;
        }

        // ── Bullet list: * item, ** nested ───────────────────────────────────
        if let Some((level, content)) = parse_bullet(line) {
            if state.prev_list_type != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            let parents = build_list_parents("ul", level);
            let marker_parents: Vec<&str> = parents[..parents.len() - 1]
                .iter()
                .map(|s| s.as_str())
                .collect();
            let text_parents: Vec<&str> = parents.iter().map(|s| s.as_str()).collect();
            let text_attrs = if level > 1 {
                json!({ "level": level })
            } else {
                json!({})
            };
            open_block(&mut state, "list-item-marker", &marker_parents);
            open_block_attrs(&mut state, "list-item-text", &text_parents, text_attrs);
            walk_inline(content, &mut state);
            state.prev_list_type = 1;
            i += 1;
            continue;
        }

        // ── Ordered list: # item, ## nested ──────────────────────────────────
        if let Some((level, content)) = parse_ordered(line) {
            if state.prev_list_type != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            let parents = build_list_parents("ol", level);
            let marker_parents: Vec<&str> = parents[..parents.len() - 1]
                .iter()
                .map(|s| s.as_str())
                .collect();
            let text_parents: Vec<&str> = parents.iter().map(|s| s.as_str()).collect();
            let text_attrs = if level > 1 {
                json!({ "level": level })
            } else {
                json!({})
            };
            open_block(&mut state, "list-item-marker", &marker_parents);
            open_block_attrs(&mut state, "list-item-text", &text_parents, text_attrs);
            walk_inline(content, &mut state);
            state.prev_list_type = 2;
            i += 1;
            continue;
        }

        // ── Blockquote: > text (Confluence/Discord style) ─────────────────────
        if let Some(content) = line.strip_prefix("> ") {
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            walk_inline(content, &mut state);
            i += 1;
            continue;
        }

        // ── Blockquote: bq. text (JIRA style) ─────────────────────────────────
        if let Some(content) = line.strip_prefix("bq. ") {
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            walk_inline(content, &mut state);
            i += 1;
            continue;
        }

        // ── Horizontal rule: ---- ─────────────────────────────────────────────
        if is_horizontal_rule(line) {
            state.prev_list_type = 0;
            open_block(&mut state, "horizontal-rule", &[]);
            i += 1;
            continue;
        }

        // ── Empty line — skip ─────────────────────────────────────────────────
        if line.trim().is_empty() {
            state.prev_list_type = 0;
            i += 1;
            continue;
        }

        // ── Regular paragraph ─────────────────────────────────────────────────
        state.prev_list_type = 0;
        open_block(&mut state, "paragraph", &[]);
        walk_inline(line, &mut state);
        i += 1;
    }

    // Flush unclosed code block at EOF
    if in_code_block && !code_lines.is_empty() {
        let code_content = code_lines.join("\n");
        let attrs = code_lang_attrs(code_lang);
        open_block_attrs(&mut state, "code-block", &[], attrs);
        state.text.push_str(&code_content);
        state.text.push('\n');
    }

    // Flush unclosed quote block at EOF
    if in_quote_block && !quote_lines.is_empty() {
        let content = quote_lines.join("\n");
        open_block(&mut state, "blockquote-marker", &[]);
        open_block(&mut state, "paragraph", &["blockquote"]);
        walk_inline(&content, &mut state);
    }

    // Flush unclosed admonition at EOF
    if in_admonition && !admonition_lines.is_empty() {
        let content = admonition_lines.join("\n");
        open_block_attrs(
            &mut state,
            "admonition",
            &[],
            json!({ "type": admonition_type }),
        );
        walk_inline(&content, &mut state);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Parse `{code}` or `{code:lang}` line. Returns `Some(lang)` on match.
/// The `lang` is `Some(&str)` when a language is present, `Some(None)` otherwise —
/// we encode as `Option<Option<&str>>` via the return of `Some(lang_opt)`.
/// Simplified: return `Some(lang_or_none)` where outer Some = matched.
fn parse_code_open(line: &str) -> Option<Option<&str>> {
    if line == "{code}" {
        return Some(None);
    }
    if let Some(rest) = line.strip_prefix("{code:") {
        if let Some(inner) = rest.strip_suffix('}') {
            let lang = inner.trim();
            return Some(if lang.is_empty() { None } else { Some(lang) });
        }
    }
    None
}

fn code_lang_attrs(lang: Option<&str>) -> Value {
    match lang {
        Some(l) if !l.is_empty() => json!({ "language": l }),
        _ => json!({}),
    }
}

/// Parse `{note}`, `{warning}`, `{tip}`, `{info}` — returns the admonition type name.
fn parse_admonition_open(line: &str) -> Option<&'static str> {
    match line {
        "{note}" => Some("note"),
        "{warning}" => Some("warning"),
        "{tip}" => Some("tip"),
        "{info}" => Some("info"),
        _ => None,
    }
}

/// Parse `h1. Content` through `h6. Content`. Returns (level, content).
fn parse_heading(line: &str) -> Option<(usize, &str)> {
    if line.len() < 4 {
        return None;
    }
    let b = line.as_bytes();
    if b[0] != b'h' {
        return None;
    }
    if b[1] < b'1' || b[1] > b'6' {
        return None;
    }
    if b[2] != b'.' {
        return None;
    }
    // Accept "h1. text" or "h1.text"
    let rest = if b.get(3) == Some(&b' ') {
        &line[4..]
    } else {
        &line[3..]
    };
    let level = (b[1] - b'0') as usize;
    Some((level, rest))
}

fn is_horizontal_rule(line: &str) -> bool {
    let t = line.trim_end();
    t.len() >= 4 && t.bytes().all(|b| b == b'-')
}

/// Parse Confluence bullet: `*` prefix. Returns (level, content).
fn parse_bullet(line: &str) -> Option<(usize, &str)> {
    if !line.starts_with('*') {
        return None;
    }
    let level = line.bytes().take_while(|&b| b == b'*').count();
    let rest = &line[level..];
    if rest.starts_with(' ') {
        Some((level, rest[1..].trim_start()))
    } else {
        None
    }
}

/// Parse Confluence ordered: `#` prefix. Returns (level, content).
fn parse_ordered(line: &str) -> Option<(usize, &str)> {
    if !line.starts_with('#') {
        return None;
    }
    let level = line.bytes().take_while(|&b| b == b'#').count();
    let rest = &line[level..];
    if rest.starts_with(' ') {
        Some((level, rest[1..].trim_start()))
    } else {
        None
    }
}

/// Build the parents array for a list item at the given depth.
/// Level 1: ["ul", "unordered-list-item"]
/// Level 2: ["ul", "unordered-list-item", "ul", "unordered-list-item"]
fn build_list_parents(list_type: &str, level: usize) -> Vec<String> {
    let item_type = if list_type == "ul" {
        "unordered-list-item"
    } else {
        "ordered-list-item"
    };
    let mut parents: Vec<String> = Vec::new();
    for _ in 0..level {
        parents.push(list_type.to_owned());
        parents.push(item_type.to_owned());
    }
    parents
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.atlassian.wiki.facet#bold" => format!("*{}*", content),
        "com.atlassian.wiki.facet#italic" => format!("_{}_", content),
        "com.atlassian.wiki.facet#underline" => format!("+{}+", content),
        "com.atlassian.wiki.facet#strikethrough" => format!("-{}-", content),
        "com.atlassian.wiki.facet#superscript" => format!("^{}^", content),
        "com.atlassian.wiki.facet#subscript" => format!("~{}~", content),
        "com.atlassian.wiki.facet#monospace" => format!("{{{{{}}}}}", content),
        "com.atlassian.wiki.facet#link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("href"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let display = mark.attrs.get("display").and_then(|v| v.as_str());
            // If content matches uri exactly → bare form [uri]
            if content == uri {
                format!("[{}]", uri)
            } else if let Some(d) = display {
                if d != content {
                    format!("[{}|{}]", content, uri)
                } else {
                    format!("[{}|{}]", content, uri)
                }
            } else {
                format!("[{}|{}]", content, uri)
            }
        }
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

fn collect_text(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                out.push_str(&collect_text(children));
            }
        }
    }
    out
}

struct RenderCtx {
    list_type: u8, // 0=none, 1=bullet, 2=ordered
    list_level: usize,
    in_blockquote: bool,
}

fn render_node(node: &HirNode, out: &mut String, ctx: &mut RenderCtx) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => match name.as_str() {
            "blockquote-marker"
            | "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker" => {
                // Invisible separator — no output
            }
            "paragraph" => {
                let inner = render_inline(children);
                if ctx.in_blockquote {
                    out.push_str("> ");
                }
                out.push_str(&inner);
                out.push('\n');
            }
            "heading" => {
                let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
                let inner = render_inline(children);
                out.push_str(&format!("h{}. {}\n", level, inner));
            }
            "list-item-text" => {
                let inner = render_inline(children);
                let level = ctx.list_level.max(1);
                if ctx.list_type == 2 {
                    out.push_str(&format!("{} {}\n", "#".repeat(level), inner));
                } else {
                    out.push_str(&format!("{} {}\n", "*".repeat(level), inner));
                }
            }
            "code-block" => {
                let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                let header = if !lang.is_empty() {
                    format!("{{code:{}}}", lang)
                } else {
                    "{code}".to_owned()
                };
                out.push_str(&format!("{}\n{}\n{{code}}\n", header, body));
            }
            "admonition" => {
                let admon_type = attrs.get("type").and_then(|v| v.as_str()).unwrap_or("note");
                let inner = render_inline(children);
                out.push_str(&format!(
                    "{{{}}}\n{}\n{{{}}}\n",
                    admon_type, inner, admon_type
                ));
            }
            "horizontal-rule" => {
                out.push_str("----\n");
            }
            _ => {
                let inner = render_inline(children);
                if !inner.is_empty() {
                    out.push_str(&inner);
                    out.push('\n');
                }
            }
        },
        HirNode::Container { name, children, .. } => {
            let saved_type = ctx.list_type;
            let saved_level = ctx.list_level;
            let saved_bq = ctx.in_blockquote;

            match name.as_str() {
                "ul" => {
                    // When we enter a ul container, increment only if already in a list
                    if ctx.list_type == 1 {
                        ctx.list_level += 1;
                    } else {
                        ctx.list_type = 1;
                    }
                }
                "ol" => {
                    if ctx.list_type == 2 {
                        ctx.list_level += 1;
                    } else {
                        ctx.list_type = 2;
                    }
                }
                "blockquote" => {
                    ctx.in_blockquote = true;
                }
                _ => {}
            }

            for child in children {
                render_node(child, out, ctx);
            }

            ctx.list_type = saved_type;
            ctx.list_level = saved_level;
            ctx.in_blockquote = saved_bq;
        }
        HirNode::Text { content, marks } => {
            let mut s = content.clone();
            for mark in marks.iter().rev() {
                s = apply_mark(&s, mark);
            }
            out.push_str(&s);
        }
    }
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry());
    let mut out = String::new();
    let mut ctx = RenderCtx {
        list_type: 0,
        list_level: 1,
        in_blockquote: false,
    };
    for node in &nodes {
        render_node(node, &mut out, &mut ctx);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
