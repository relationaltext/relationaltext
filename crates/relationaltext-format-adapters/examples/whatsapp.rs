//! WhatsApp format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.whatsapp.facet`
//! Inline: *bold*, _italic_, ~strikethrough~, `code`
//! Block: paragraph, code-block (```), blockquote (>), bullet list, ordered list

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.whatsapp.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.whatsapp/whatsapp.lexicon.json");

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

/// Parse WhatsApp inline markup (*bold*, _italic_, ~strike~, `code`) and append to state.
fn scan_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    while pos < len {
        let b = bytes[pos];

        let (open, name) = match b {
            b'*' => (true, "bold"),
            b'_' => (true, "italic"),
            b'~' => (true, "strikethrough"),
            b'`' => (true, "code"),
            _ => (false, ""),
        };

        if open {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b) {
                let content = &line[pos + 1..pos + 1 + close];
                state.text.push_str(&line[plain_start..pos]);
                let s = state.text.len();
                state.text.push_str(content);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": TYPE_ID, "name": name }],
                    }));
                }
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    state.text.push_str(&line[plain_start..]);
}

fn emit_paragraph(state: &mut ImportState, parents: &[&str], line: &str) {
    open_block(state, "paragraph", parents);
    scan_inline(line, state);
}

fn emit_list_item(state: &mut ImportState, parents: &[&str], line: &str) {
    open_block(state, "list-item-text", parents);
    scan_inline(line, state);
}

fn is_ordered(line: &str) -> bool {
    let first_dot_space = line.find(". ").unwrap_or(0);
    first_dot_space > 0 && line[..first_dot_space].chars().all(|c| c.is_ascii_digit())
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
    let mut i = 0;
    // 0=none, 1=bullet, 2=ordered
    let mut prev_list: u8 = 0;

    while i < lines.len() {
        let line = lines[i];

        // Triple-backtick code block (WhatsApp uses bare ```, no lang tag)
        if line.trim() == "```" {
            let mut code_lines: Vec<&str> = Vec::new();
            i += 1;
            while i < lines.len() && lines[i].trim() != "```" {
                code_lines.push(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                i += 1;
            } // skip closing ```
            let code = code_lines.join("\n") + "\n";
            open_block(&mut state, "code-block", &[]);
            state.text.push_str(&code);
            prev_list = 0;
            continue;
        }

        // Blockquote: "> "
        if line.starts_with("> ") {
            open_block(&mut state, "blockquote-marker", &[]);
            emit_paragraph(&mut state, &["blockquote"], &line[2..]);
            prev_list = 0;
            i += 1;
            continue;
        }

        // Bullet list: "- " or "• " (U+2022, 3 bytes)
        if line.starts_with("- ") || line.starts_with('\u{2022}') {
            let pfx = if line.starts_with("- ") {
                2
            } else {
                "\u{2022} ".len()
            };
            let content = &line[pfx..];
            if prev_list != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            emit_list_item(&mut state, &["ul", "unordered-list-item"], content);
            prev_list = 1;
            i += 1;
            continue;
        }

        // Ordered list: "1. ", "2. ", etc.
        if is_ordered(line) {
            if prev_list != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ol"]);
            emit_list_item(
                &mut state,
                &["ol", "ordered-list-item"],
                ordered_content(line),
            );
            prev_list = 2;
            i += 1;
            continue;
        }

        // Regular paragraph (including empty lines)
        prev_list = 0;
        emit_paragraph(&mut state, &[], line);
        i += 1;
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.whatsapp.facet#bold" => format!("*{}*", content),
        "com.whatsapp.facet#italic" => format!("_{}_", content),
        "com.whatsapp.facet#strikethrough" => format!("~{}~", content),
        "com.whatsapp.facet#code" => format!("`{}`", content),
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
        HirNode::Block { name, children, .. } => match name.as_str() {
            "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker"
            | "blockquote-marker" => {}
            "paragraph" => {
                out.push_str(&format!("{}\n", render_inline(children)));
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
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                out.push_str(&format!("```\n{}\n```\n", body));
            }
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
            // Only reset the ordered index when entering a fresh `ol` container.
            // Inner containers (e.g. "ordered-list-item") must NOT reset it, or
            // every item would restart numbering from 1.
            if matches!(name.as_str(), "ol") {
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
    // WhatsApp tests expect trailing newline — do not strip it.
    out
}
