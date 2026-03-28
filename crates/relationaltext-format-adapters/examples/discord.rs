//! Discord markdown format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.discord.facet`
//! Inline: **bold**, *italic*, _italic_, __underline__, ~~strikethrough~~,
//!         `code`, ||spoiler||, [text](url)
//! Block: paragraph, heading (1-3), code-block, blockquote, bullet/ordered lists,
//!        horizontal-rule

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.discord.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.discord/discord.lexicon.json");

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
pub extern "C" fn import(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

fn push_inline(state: &mut ImportState, content: &str, name: &str) {
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

fn push_entity(state: &mut ImportState, display: &str, name: &str, extra: Value) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": name });
    if let Value::Object(map) = extra {
        for (k, v) in map {
            feat[k] = v;
        }
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

/// Try to parse `[text](url)` at the start of `s`.
/// Returns (display, url, bytes_consumed) or None.
fn try_md_link(s: &str) -> Option<(&str, &str, usize)> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'[') {
        return None;
    }
    let close_bracket = s[1..].find(']')?;
    let display = &s[1..1 + close_bracket];
    let after = &s[1 + close_bracket + 1..]; // after ']'
    if after.as_bytes().first() != Some(&b'(') {
        return None;
    }
    let close_paren = after[1..].find(')')?;
    let url = &after[1..1 + close_paren];
    let consumed = 1 + close_bracket + 1 + 1 + close_paren + 1; // [display](url)
    Some((display, url, consumed))
}

/// Find the first occurrence of a two-byte delimiter (`**`, `__`, `~~`, `||`) in `text`.
fn find_two(text: &str, a: u8, b: u8) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == a && bytes[i + 1] == b {
            return Some(i);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Find the first occurrence of a single ASCII byte that is NOT followed by an
/// identical byte (so `*` doesn't match inside `**`).
fn find_single(text: &str, delim: u8) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == delim && bytes.get(i + 1) != Some(&delim) {
            return Some(i);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Scan one line of Discord markdown for inline markup.
fn scan_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    macro_rules! flush {
        () => {
            state.text.push_str(&line[plain_start..pos]);
        };
    }

    while pos < len {
        let b = bytes[pos];

        // [text](url)
        if b == b'[' {
            if let Some((display, url, consumed)) = try_md_link(&line[pos..]) {
                flush!();
                push_entity(state, display, "link", json!({ "href": url }));
                pos += consumed;
                plain_start = pos;
                continue;
            }
        }

        // **bold**
        if b == b'*' && bytes.get(pos + 1) == Some(&b'*') {
            if let Some(close) = find_two(&line[pos + 2..], b'*', b'*') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "bold");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // *italic* (single)
        if b == b'*' {
            if let Some(close) = find_single(&line[pos + 1..], b'*') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // __underline__
        if b == b'_' && bytes.get(pos + 1) == Some(&b'_') {
            if let Some(close) = find_two(&line[pos + 2..], b'_', b'_') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "underline");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // _italic_ (single)
        if b == b'_' {
            if let Some(close) = find_single(&line[pos + 1..], b'_') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // ~~strikethrough~~
        if b == b'~' && bytes.get(pos + 1) == Some(&b'~') {
            if let Some(close) = find_two(&line[pos + 2..], b'~', b'~') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "strikethrough");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // `code`
        if b == b'`' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'`') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "code");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // ||spoiler||
        if b == b'|' && bytes.get(pos + 1) == Some(&b'|') {
            if let Some(close) = find_two(&line[pos + 2..], b'|', b'|') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "spoiler");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    state.text.push_str(&line[plain_start..]);
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn is_bullet(line: &str) -> bool {
    line.starts_with("- ") || line.starts_with("* ")
}

fn is_ordered(line: &str) -> bool {
    line.as_bytes()
        .first()
        .map_or(false, |b| b.is_ascii_digit())
        && line.contains(". ")
        && line
            .find(". ")
            .map_or(false, |i| line[..i].chars().all(|c| c.is_ascii_digit()))
}

fn ordered_content(line: &str) -> &str {
    if let Some(i) = line.find(". ") {
        &line[i + 2..]
    } else {
        line
    }
}

fn do_import(raw: &str) -> String {
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let text = outer["text"].as_str().unwrap_or(raw);

    let mut state = ImportState::new();
    let lines: Vec<&str> = text.split('\n').collect();
    // 0=none, 1=bullet, 2=ordered
    let mut prev_list: u8 = 0;
    let mut in_code = false;
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;

    for line in &lines {
        if line.starts_with("```") {
            if !in_code {
                in_code = true;
                code_lines.clear();
                let info = line[3..].trim();
                code_lang = if info.is_empty() { None } else { Some(info) };
                continue;
            } else if *line == "```" {
                in_code = false;
                let code = code_lines.join("\n") + "\n";
                let attrs = match code_lang {
                    Some(l) => json!({ "language": l }),
                    None => json!({}),
                };
                prev_list = 0;
                open_block_attrs(&mut state, "code-block", &[], attrs);
                state.text.push_str(&code);
                code_lines.clear();
                code_lang = None;
                continue;
            }
        }
        if in_code {
            code_lines.push(line);
            continue;
        }

        if line.starts_with("### ") {
            prev_list = 0;
            open_block_attrs(&mut state, "heading", &[], json!({ "level": 3 }));
            scan_inline(&line[4..], &mut state);
        } else if line.starts_with("## ") {
            prev_list = 0;
            open_block_attrs(&mut state, "heading", &[], json!({ "level": 2 }));
            scan_inline(&line[3..], &mut state);
        } else if line.starts_with("# ") {
            prev_list = 0;
            open_block_attrs(&mut state, "heading", &[], json!({ "level": 1 }));
            scan_inline(&line[2..], &mut state);
        } else if line.starts_with("-# ") {
            prev_list = 0;
            open_block(&mut state, "paragraph", &[]);
            scan_inline(&line[3..], &mut state);
        } else if line.starts_with("> ") {
            prev_list = 0;
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            scan_inline(&line[2..], &mut state);
        } else if is_bullet(line) {
            if prev_list != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            open_block(&mut state, "list-item-text", &["ul", "unordered-list-item"]);
            scan_inline(&line[2..], &mut state);
            prev_list = 1;
        } else if is_ordered(line) {
            if prev_list != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ol"]);
            open_block(&mut state, "list-item-text", &["ol", "ordered-list-item"]);
            scan_inline(ordered_content(line), &mut state);
            prev_list = 2;
        } else if *line == "---" || *line == "***" {
            prev_list = 0;
            open_block(&mut state, "horizontal-rule", &[]);
        } else if line.trim().is_empty() {
            prev_list = 0;
        } else {
            prev_list = 0;
            open_block(&mut state, "paragraph", &[]);
            scan_inline(line, &mut state);
        }
    }

    if in_code && !code_lines.is_empty() {
        let code = code_lines.join("\n") + "\n";
        let attrs = match code_lang {
            Some(l) => json!({ "language": l }),
            None => json!({}),
        };
        open_block_attrs(&mut state, "code-block", &[], attrs);
        state.text.push_str(&code);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.discord.facet#bold" => format!("**{}**", content),
        "com.discord.facet#italic" => format!("*{}*", content),
        "com.discord.facet#underline" => format!("__{}__", content),
        "com.discord.facet#strikethrough" => format!("~~{}~~", content),
        "com.discord.facet#code" => format!("`{}`", content),
        "com.discord.facet#spoiler" => format!("||{}||", content),
        "com.discord.facet#link" => {
            let href = mark
                .attrs
                .get("href")
                .or_else(|| mark.attrs.get("uri"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{}]({})", content, href)
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

fn render_node(node: &HirNode, out: &mut String, list_type: u8, ordered_idx: &mut usize) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => match name.as_str() {
            "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker"
            | "blockquote-marker" => {}
            "paragraph" => {
                out.push_str(&format!("{}\n", render_inline(children)));
            }
            "heading" => {
                let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
                let level = level.min(3);
                let inner = render_inline(children);
                out.push_str(&format!("{} {}\n", "#".repeat(level), inner));
            }
            "list-item-text" => {
                let inner = render_inline(children);
                if list_type == 2 {
                    out.push_str(&format!("{}. {}\n", ordered_idx, inner));
                    *ordered_idx += 1;
                } else {
                    out.push_str(&format!("- {}\n", inner));
                }
            }
            "code-block" => {
                let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                if lang.is_empty() {
                    out.push_str(&format!("```\n{}\n```\n", body));
                } else {
                    out.push_str(&format!("```{}\n{}\n```\n", lang, body));
                }
            }
            "horizontal-rule" => out.push_str("---\n"),
            _ => {
                out.push_str(&render_inline(children));
                out.push('\n');
            }
        },
        HirNode::Container { name, children, .. } => {
            let lt = match name.as_str() {
                "ul" => 1,
                "ol" => 2,
                _ => list_type,
            };
            // Only reset the ordered index when entering a fresh list container.
            // Inner containers (e.g. "ordered-list-item") must NOT reset it, or
            // every item would restart numbering from 1.
            let reset_idx = matches!(name.as_str(), "ol");
            if reset_idx {
                let mut idx = 1usize;
                for child in children {
                    render_node(child, out, lt, &mut idx);
                }
            } else {
                for child in children {
                    render_node(child, out, lt, ordered_idx);
                }
            }
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
    let mut idx = 1usize;
    for node in &nodes {
        render_node(node, &mut out, 0, &mut idx);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
