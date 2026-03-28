//! Org-mode format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.orgmode.facet`
//!
//! Import: parses Org-mode text (headings, paragraphs, lists, code blocks,
//! blockquotes, horizontal rules) with full inline markup support
//! (bold, italic, underline, strike-through, verbatim, code, links).
//!
//! Export: walks HIR and rebuilds Org-mode syntax.
//!
//! WASM exports: `import_org` and `export_org`

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.orgmode.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.orgmode/org.lexicon.json");

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
pub extern "C" fn import_org(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_org(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    /// List type continuity: None, "bullet", or "ordered"
    prev_list_type: Option<String>,
    /// Accumulates lines inside a BEGIN/END block: None | "src" | "quote" | "verse"
    in_block: Option<String>,
    block_lang: String,
    block_lines: Vec<String>,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            prev_list_type: None,
            in_block: None,
            block_lang: String::new(),
            block_lines: Vec::new(),
        }
    }
}

/// Emit a block marker (U+FFFC for the first block, '\n' for subsequent) and
/// register the feature. `attrs` is placed under the nested "attrs" key when non-empty.
fn open_block(state: &mut ImportState, name: &str, parents: &[&str], attrs: Value) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let s = state.text.len();
    state.text.push(marker);
    let e = state.text.len();

    let has_attrs = attrs.as_object().map(|o| !o.is_empty()).unwrap_or(false);
    let mut feature = json!({
        "$type": TYPE_ID,
        "name": name,
        "parents": parents,
    });
    if has_attrs {
        feature["attrs"] = attrs;
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
}

/// Emit an inline mark or entity. Inline attrs go FLAT on the feature object.
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

fn push_link(state: &mut ImportState, display: &str, uri: &str, description: Option<&str>) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    let feat = if let Some(desc) = description {
        json!({ "$type": TYPE_ID, "name": "link", "uri": uri, "description": desc })
    } else {
        json!({ "$type": TYPE_ID, "name": "link", "uri": uri })
    };
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

// ─── Org inline scanner ────────────────────────────────────────────────────────
//
// Org-mode inline markup rules:
//   *bold*           — asterisk, must not start/end with whitespace
//   /italic/         — slash
//   _underline_      — underscore
//   +strike-through+  — plus
//   =verbatim=       — equals
//   ~code~           — tilde
//   [[url][desc]]    — link with description
//   [[url]]          — link without description
//   plain text
//
// The border rules for character markup: the character after the opener must not
// be whitespace, and the character before the closer must not be whitespace.

fn scan_inline(line: &str, state: &mut ImportState) {
    let chars: Vec<char> = line.chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut plain_chars: Vec<char> = Vec::new();

    macro_rules! flush_plain {
        () => {
            if !plain_chars.is_empty() {
                let s: String = plain_chars.drain(..).collect();
                state.text.push_str(&s);
            }
        };
    }

    while i < n {
        let ch = chars[i];

        // [[url][desc]] or [[url]]
        if ch == '[' && i + 1 < n && chars[i + 1] == '[' {
            // Search for the closing ]]
            if let Some(inner_close) = find_two_char(&chars, i + 2, ']', ']') {
                flush_plain!();
                // Check if there is a description: ][desc]]
                // The closing ]] might be followed immediately or there's a [desc] before it.
                // Actually the Org link syntax is: [[target][desc]] or [[target]]
                // We need to find the end of the full link expression.
                // The target runs from i+2 to the first ']' or to ']['.
                // Find '][' inside the brackets
                let inner = &chars[i + 2..inner_close];
                let desc_sep = find_two_char(inner, 0, ']', '[');
                if let Some(sep) = desc_sep {
                    // target = inner[..sep], desc follows after sep+1 up to the next ']'
                    let target: String = inner[..sep].iter().collect();
                    // desc_start is inner[sep+2..] up to next ']'
                    let after_bracket = i + 2 + sep + 2; // points inside inner after ]['
                                                         // find closing ] of desc
                    if let Some(desc_close_rel) =
                        chars[after_bracket..].iter().position(|&c| c == ']')
                    {
                        let desc_close = after_bracket + desc_close_rel;
                        // now we need ]] after that
                        if desc_close + 1 < n && chars[desc_close + 1] == ']' {
                            let description: String =
                                chars[after_bracket..desc_close].iter().collect();
                            push_link(state, &description, &target, Some(&description));
                            i = desc_close + 2;
                            continue;
                        }
                    }
                }
                // No description — use target as display text
                let target: String = inner.iter().collect();
                push_link(state, &target, &target, None);
                i = inner_close + 2;
                continue;
            }
        }

        // Character markup — all require non-space border
        // Try *bold*, /italic/, _underline_, +strikethrough+, =verbatim=, ~code~
        let (mark_char, mark_name): (char, &str) = match ch {
            '*' => ('*', "bold"),
            '/' => ('/', "italic"),
            '_' => ('_', "underline"),
            '+' => ('+', "strikethrough"),
            '=' => ('=', "verbatim"),
            '~' => ('~', "code"),
            _ => ('\0', ""),
        };

        if !mark_name.is_empty() {
            // Border check: char after opener must not be space
            let next_is_space = i + 1 < n && chars[i + 1] == ' ';
            if !next_is_space && i + 2 < n {
                if let Some(close) = find_closing_mark(&chars, i + 1, mark_char) {
                    flush_plain!();
                    let content: String = chars[i + 1..close].iter().collect();
                    push_inline(state, &content, mark_name);
                    i = close + 1;
                    continue;
                }
            }
        }

        plain_chars.push(ch);
        i += 1;
    }

    flush_plain!();
}

/// Find the closing delimiter `target` starting from `start`, ensuring the char
/// immediately before the delimiter is not whitespace (Org border rule).
fn find_closing_mark(chars: &[char], start: usize, target: char) -> Option<usize> {
    let mut i = start;
    while i < chars.len() {
        if chars[i] == target {
            // The char before the closer must not be whitespace
            let prev_is_space = i > 0 && chars[i - 1] == ' ';
            if !prev_is_space && i > start {
                // Make sure we found at least one character of content
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn find_char(chars: &[char], start: usize, target: char) -> Option<usize> {
    chars[start..]
        .iter()
        .position(|&c| c == target)
        .map(|p| p + start)
}

fn find_two_char(chars: &[char], start: usize, a: char, b: char) -> Option<usize> {
    let mut i = start;
    while i + 1 < chars.len() {
        if chars[i] == a && chars[i + 1] == b {
            return Some(i);
        }
        i += 1;
    }
    None
}

// ─── Block-level line handlers ─────────────────────────────────────────────────

/// Emit blockquote lines: each line becomes blockquote-marker + paragraph inside blockquote.
fn emit_blockquote_lines(lines: &[String], state: &mut ImportState) {
    for line in lines {
        open_block(state, "blockquote-marker", &[], json!({}));
        open_block(state, "paragraph", &["blockquote"], json!({}));
        scan_inline(line, state);
    }
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Input may be wrapped in DocumentJSON { text: "..." } or raw text.
    let text = if raw.trim_start().starts_with('{') {
        let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        outer["text"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap_or_else(|| raw.to_owned())
    } else {
        raw.to_owned()
    };

    let mut state = ImportState::new();

    for line in text.split('\n') {
        // ── Inside a BEGIN/END block ──────────────────────────────────────────
        if let Some(ref block_type) = state.in_block.clone() {
            let upper = line.trim().to_uppercase();
            match block_type.as_str() {
                "src" if upper == "#+END_SRC" => {
                    state.in_block = None;
                    state.prev_list_type = None;
                    let lang = state.block_lang.clone();
                    let code_attrs = if lang.is_empty() {
                        json!({})
                    } else {
                        json!({ "language": lang })
                    };
                    open_block(&mut state, "code-block", &[], code_attrs);
                    let code_content = state.block_lines.join("\n") + "\n";
                    state.text.push_str(&code_content);
                    state.block_lines.clear();
                    state.block_lang.clear();
                }
                "quote" if upper == "#+END_QUOTE" => {
                    state.in_block = None;
                    state.prev_list_type = None;
                    let lines_clone = state.block_lines.clone();
                    emit_blockquote_lines(&lines_clone, &mut state);
                    state.block_lines.clear();
                }
                "verse" if upper == "#+END_VERSE" => {
                    state.in_block = None;
                    state.prev_list_type = None;
                    open_block(&mut state, "paragraph", &[], json!({}));
                    let content = state.block_lines.join("\n");
                    scan_inline(&content, &mut state);
                    state.block_lines.clear();
                }
                _ => {
                    state.block_lines.push(line.to_owned());
                }
            }
            continue;
        }

        // ── Block opener detection ────────────────────────────────────────────
        let upper_trimmed = line.trim().to_uppercase();

        if upper_trimmed.starts_with("#+BEGIN_SRC") {
            state.in_block = Some("src".to_owned());
            state.block_lines.clear();
            let rest = line.trim()["#+BEGIN_SRC".len()..].trim().to_owned();
            state.block_lang = rest;
            continue;
        }
        if upper_trimmed == "#+BEGIN_QUOTE" {
            state.in_block = Some("quote".to_owned());
            state.block_lines.clear();
            continue;
        }
        if upper_trimmed == "#+BEGIN_VERSE" {
            state.in_block = Some("verse".to_owned());
            state.block_lines.clear();
            continue;
        }

        // ── Comment line ──────────────────────────────────────────────────────
        if line.starts_with("# ") {
            continue;
        }

        // ── Heading: ^(\*+)\s+(.*) ───────────────────────────────────────────
        if let Some(h_content) = line.strip_prefix('*') {
            // Count leading asterisks
            let mut level = 1usize;
            let rest = h_content.trim_start_matches(|c| {
                if c == '*' {
                    level += 1;
                    true
                } else {
                    false
                }
            });
            // Must be followed by whitespace
            if rest.starts_with(' ') || rest.starts_with('\t') {
                let content = rest.trim_start();
                state.prev_list_type = None;

                let mut attrs = json!({ "level": level });
                let mut heading_content = content;

                // Detect TODO/DONE keyword
                if let Some(rest_todo) = heading_content.strip_prefix("TODO ") {
                    attrs["todo"] = Value::String("TODO".to_owned());
                    heading_content = rest_todo;
                } else if let Some(rest_done) = heading_content.strip_prefix("DONE ") {
                    attrs["todo"] = Value::String("DONE".to_owned());
                    heading_content = rest_done;
                }

                open_block(&mut state, "heading", &[], attrs);
                scan_inline(heading_content, &mut state);
                continue;
            }
        }

        // ── Bullet list: ^[-+]\s+ ────────────────────────────────────────────
        if let Some(content) = strip_bullet_prefix(line) {
            if state.prev_list_type.as_deref() != Some("bullet") {
                open_block(&mut state, "bullet-list-marker", &[], json!({}));
            }
            open_block(&mut state, "list-item-marker", &["ul"], json!({}));
            open_block(
                &mut state,
                "list-item-text",
                &["ul", "unordered-list-item"],
                json!({}),
            );
            scan_inline(content, &mut state);
            state.prev_list_type = Some("bullet".to_owned());
            continue;
        }

        // ── Ordered list: ^\d+[.)]\s+ ────────────────────────────────────────
        if let Some(content) = strip_ordered_prefix(line) {
            if state.prev_list_type.as_deref() != Some("ordered") {
                open_block(&mut state, "ordered-list-marker", &[], json!({}));
            }
            open_block(&mut state, "list-item-marker", &["ol"], json!({}));
            open_block(
                &mut state,
                "list-item-text",
                &["ol", "ordered-list-item"],
                json!({}),
            );
            scan_inline(content, &mut state);
            state.prev_list_type = Some("ordered".to_owned());
            continue;
        }

        // ── Horizontal rule: 5+ dashes alone on a line ───────────────────────
        let trimmed = line.trim();
        if trimmed.len() >= 5 && trimmed.chars().all(|c| c == '-') {
            state.prev_list_type = None;
            open_block(&mut state, "horizontal-rule", &[], json!({}));
            continue;
        }

        // ── Empty line ────────────────────────────────────────────────────────
        if trimmed.is_empty() {
            state.prev_list_type = None;
            continue;
        }

        // ── Regular paragraph ─────────────────────────────────────────────────
        state.prev_list_type = None;
        open_block(&mut state, "paragraph", &[], json!({}));
        scan_inline(line, &mut state);
    }

    // Flush any unterminated BEGIN block (treat as paragraph)
    if state.in_block.is_some() && !state.block_lines.is_empty() {
        open_block(&mut state, "paragraph", &[], json!({}));
        let content = state.block_lines.join("\n");
        scan_inline(&content, &mut state);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Strip `- ` or `+ ` bullet prefix. Returns the rest of the line or None.
fn strip_bullet_prefix(line: &str) -> Option<&str> {
    if let Some(rest) = line.strip_prefix("- ") {
        return Some(rest);
    }
    if let Some(rest) = line.strip_prefix("+ ") {
        return Some(rest);
    }
    None
}

/// Strip `N. ` or `N) ` ordered list prefix. Returns the rest or None.
fn strip_ordered_prefix(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == 0 {
        return None;
    }
    if i < bytes.len() && (bytes[i] == b'.' || bytes[i] == b')') {
        let after = i + 1;
        if after < bytes.len() && (bytes[after] == b' ' || bytes[after] == b'\t') {
            return Some(line[after + 1..].trim_start());
        }
    }
    None
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "org.orgmode.facet#bold" => format!("*{}*", content),
        "org.orgmode.facet#italic" => format!("/{}/", content),
        "org.orgmode.facet#underline" => format!("_{}_", content),
        "org.orgmode.facet#strike-through" => format!("+{}+", content),
        "org.orgmode.facet#verbatim" => format!("={}=", content),
        "org.orgmode.facet#code" => format!("~{}~", content),
        "org.orgmode.facet#link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if content == uri {
                format!("[[{}]]", uri)
            } else {
                format!("[[{}][{}]]", uri, content)
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

struct OrgCtx {
    list_type: u8, // 0=none, 1=ul, 2=ol
    ordered_idx: usize,
}

impl OrgCtx {
    fn none() -> Self {
        Self {
            list_type: 0,
            ordered_idx: 1,
        }
    }
}

fn render_node(node: &HirNode, out: &mut String, ctx: &mut OrgCtx) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            render_block(name, attrs, children, out, ctx);
        }
        HirNode::Container { name, children, .. } => {
            render_container(name, children, out, ctx);
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

fn render_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    out: &mut String,
    ctx: &mut OrgCtx,
) {
    match name {
        // Invisible separator blocks
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {
        }

        "paragraph" => {
            let inner = render_inline(children);
            if !inner.is_empty() {
                out.push_str(&inner);
                out.push('\n');
            }
        }

        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let level = level.max(1).min(20);
            let todo = attrs.get("todo").and_then(|v| v.as_str());
            let inner = render_inline(children);
            let stars = "*".repeat(level);
            let todo_prefix = todo.map(|t| format!("{} ", t)).unwrap_or_default();
            out.push_str(&format!("{} {}{}\n", stars, todo_prefix, inner));
        }

        "code-block" => {
            let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
            let code = collect_text(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            let lang_str = if lang.is_empty() {
                String::new()
            } else {
                format!(" {}", lang)
            };
            out.push_str(&format!("#+BEGIN_SRC{}\n{}\n#+END_SRC\n", lang_str, body));
        }

        "list-item-text" => {
            let inner = render_inline(children);
            if ctx.list_type == 2 {
                out.push_str(&format!("{}. {}\n", ctx.ordered_idx, inner));
                ctx.ordered_idx += 1;
            } else {
                out.push_str(&format!("- {}\n", inner));
            }
        }

        "horizontal-rule" => {
            out.push_str("-----\n");
        }

        _ => {
            // Fallback: render inline content
            let inner = render_inline(children);
            if !inner.is_empty() {
                out.push_str(&inner);
                out.push('\n');
            }
        }
    }
}

fn render_container(name: &str, children: &[HirNode], out: &mut String, _ctx: &mut OrgCtx) {
    match name {
        "ul" => {
            let mut child_ctx = OrgCtx {
                list_type: 1,
                ordered_idx: 1,
            };
            for child in children {
                render_node(child, out, &mut child_ctx);
            }
        }
        "ol" => {
            let mut child_ctx = OrgCtx {
                list_type: 2,
                ordered_idx: 1,
            };
            for child in children {
                render_node(child, out, &mut child_ctx);
            }
        }
        "blockquote" => {
            let mut inner = String::new();
            let mut child_ctx = OrgCtx::none();
            for child in children {
                render_node(child, &mut inner, &mut child_ctx);
            }
            out.push_str("#+BEGIN_QUOTE\n");
            out.push_str(&inner);
            out.push_str("#+END_QUOTE\n");
        }
        _ => {
            let mut child_ctx = OrgCtx::none();
            for child in children {
                render_node(child, out, &mut child_ctx);
            }
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
    let mut ctx = OrgCtx::none();
    for node in &nodes {
        render_node(node, &mut out, &mut ctx);
    }
    // Strip trailing newline to match TS behaviour
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
