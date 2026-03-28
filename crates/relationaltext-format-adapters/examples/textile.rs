//! Textile markup format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.textile.facet`
//!
//! Textile inline syntax:
//!   **text**  → strong       *text*    → bold
//!   __text__  → italic       _text_    → italic (alias)
//!   +text+    → underline    -text-    → del
//!   ^text^    → superscript  ~text~    → subscript
//!   @text@    → code
//!   "display":url → link     !src!     → image  !src(alt)! → image with alt
//!   ==text==  → literal (plain text)
//!
//! Textile block syntax:
//!   h1. … h6. → heading        p.   → paragraph (explicit)
//!   bq.       → blockquote     bc.  → code block
//!   * item    → bullet list    # item → ordered list
//!   ---       → horizontal rule
//!
//! WASM exports:
//!   import_textile(ptr, len) -> ptr   — Textile string → DocumentJSON
//!   export_textile(ptr, len) -> ptr   — DocumentJSON (Textile facets) → Textile string

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.textile.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.textile/textile.lexicon.json");

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

// ─── WASM exports ─────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_textile(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_textile(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    prev_list_type: Option<String>, // "bullet" | "ordered"
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            prev_list_type: None,
        }
    }
}

// ─── Block helpers ────────────────────────────────────────────────────────────

fn open_block(state: &mut ImportState, name: &str, parents: Vec<String>, attrs: Option<Value>) {
    let marker_char = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let marker_start = state.text.len();
    state.text.push(marker_char);
    let marker_end = state.text.len();

    let mut feature = json!({
        "$type": TYPE_ID,
        "name": name,
        "parents": parents,
    });
    if let Some(a) = attrs {
        if a.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
            feature["attrs"] = a;
        }
    }
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

// ─── Inline helpers ───────────────────────────────────────────────────────────

/// Push a span of text with a single inline mark (no attrs).
fn push_inline_mark(state: &mut ImportState, content: &str, mark_name: &str) {
    if content.is_empty() {
        return;
    }
    let start = state.text.len();
    state.text.push_str(content);
    let end = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": end },
        "features": [{ "$type": TYPE_ID, "name": mark_name }],
    }));
}

/// Push a link span (entity feature — attrs go flat on the feature, not under "attrs").
fn push_link(state: &mut ImportState, display: &str, uri: &str) {
    if display.is_empty() {
        return;
    }
    let start = state.text.len();
    state.text.push_str(display);
    let end = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": end },
        "features": [{ "$type": TYPE_ID, "name": "link", "uri": uri, "display": display }],
    }));
}

/// Push an image entity feature.
fn push_image(state: &mut ImportState, src: &str, alt: Option<&str>) {
    let placeholder = alt.unwrap_or(src);
    if placeholder.is_empty() {
        return;
    }
    let start = state.text.len();
    state.text.push_str(placeholder);
    let end = state.text.len();
    let feat = if let Some(a) = alt {
        json!({ "$type": TYPE_ID, "name": "image", "src": src, "alt": a })
    } else {
        json!({ "$type": TYPE_ID, "name": "image", "src": src })
    };
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": end },
        "features": [feat],
    }));
}

// ─── Inline scanner ───────────────────────────────────────────────────────────

/// Scan `line` for Textile inline markup, appending text and facets to `state`.
///
/// Supported patterns (checked in order):
///   **text**   strong
///   *text*     bold
///   __text__   italic
///   _text_     italic
///   +text+     underline
///   -text-     del
///   ^text^     superscript
///   ~text~     subscript
///   @text@     code
///   "disp":url link
///   !src(alt)! or !src! image
///   ==text==   literal (plain)
fn walk_inline(line: &str, state: &mut ImportState) {
    let chars: Vec<char> = line.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut plain_start = 0;

    while i < len {
        let c = chars[i];

        // ** → strong (check before single *)
        if c == '*' && i + 1 < len && chars[i + 1] == '*' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_double(&chars, i + 2, '*') {
                let content: String = chars[i + 2..end].iter().collect();
                push_inline_mark(state, &content, "strong");
                i = end + 2;
                plain_start = i;
                continue;
            }
        }

        // * → bold (single, not followed by *)
        if c == '*' && (i + 1 >= len || chars[i + 1] != '*') {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '*') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "bold");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // __ → italic (check before single _)
        if c == '_' && i + 1 < len && chars[i + 1] == '_' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_double(&chars, i + 2, '_') {
                let content: String = chars[i + 2..end].iter().collect();
                push_inline_mark(state, &content, "italic");
                i = end + 2;
                plain_start = i;
                continue;
            }
        }

        // _ → italic (single)
        if c == '_' && (i + 1 >= len || chars[i + 1] != '_') {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '_') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "italic");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // + → underline
        if c == '+' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '+') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "underline");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // - → del (only if not ---+ which is HR, already consumed at block level)
        if c == '-' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '-') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "strikethrough");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // ^ → superscript
        if c == '^' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '^') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "superscript");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // ~ → subscript
        if c == '~' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '~') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "subscript");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // @ → code
        if c == '@' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '@') {
                let content: String = chars[i + 1..end].iter().collect();
                push_inline_mark(state, &content, "code");
                i = end + 1;
                plain_start = i;
                continue;
            }
        }

        // "display":url → link
        if c == '"' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(close_quote) = find_closing_single(&chars, i + 1, '"') {
                // After closing quote expect :url
                let after = close_quote + 1;
                if after < len && chars[after] == ':' {
                    let url_start = after + 1;
                    // URL ends at whitespace or end of string
                    let url_end = chars[url_start..]
                        .iter()
                        .position(|ch| ch.is_whitespace())
                        .map(|p| p + url_start)
                        .unwrap_or(len);
                    if url_end > url_start {
                        let display: String = chars[i + 1..close_quote].iter().collect();
                        let uri: String = chars[url_start..url_end].iter().collect();
                        push_link(state, &display, &uri);
                        i = url_end;
                        plain_start = i;
                        continue;
                    }
                }
            }
            // No match — restore plain scan
            plain_start = i;
        }

        // !src(alt)! or !src! → image
        if c == '!' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(close_bang) = find_closing_single(&chars, i + 1, '!') {
                let inner: String = chars[i + 1..close_bang].iter().collect();
                if !inner.is_empty() {
                    // Check for (alt) suffix inside the !...! e.g. !src.png(My Alt)!
                    if inner.ends_with(')') {
                        if let Some(paren_start) = inner.rfind('(') {
                            let src = &inner[..paren_start];
                            let alt = &inner[paren_start + 1..inner.len() - 1];
                            push_image(state, src, Some(alt));
                            i = close_bang + 1;
                            plain_start = i;
                            continue;
                        }
                    }
                    // No alt
                    push_image(state, &inner, None);
                    i = close_bang + 1;
                    plain_start = i;
                    continue;
                }
            }
            plain_start = i;
        }

        // ==text== → literal (plain text, strip == markers)
        if c == '=' && i + 1 < len && chars[i + 1] == '=' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_double(&chars, i + 2, '=') {
                let content: String = chars[i + 2..end].iter().collect();
                state.text.push_str(&content);
                i = end + 2;
                plain_start = i;
                continue;
            }
        }

        i += 1;
    }

    flush_plain(&chars[plain_start..], state);
}

fn flush_plain(chars: &[char], state: &mut ImportState) {
    if !chars.is_empty() {
        let s: String = chars.iter().collect();
        state.text.push_str(&s);
    }
}

/// Find the position of two consecutive identical chars `ch` starting from `start`.
/// Returns the index of the first of the pair.
fn find_closing_double(chars: &[char], start: usize, ch: char) -> Option<usize> {
    let mut i = start;
    while i + 1 < chars.len() {
        if chars[i] == ch && chars[i + 1] == ch {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Find the position of the next occurrence of `ch` starting from `start`.
fn find_closing_single(chars: &[char], start: usize, ch: char) -> Option<usize> {
    chars[start..]
        .iter()
        .position(|&c| c == ch)
        .map(|p| p + start)
}

// ─── Import: Textile → DocumentJSON ──────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Input may be a DocumentJSON wrapper with a "text" field, or raw Textile.
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let textile_str = outer["text"].as_str().unwrap_or(raw);

    let mut state = ImportState::new();

    for line in textile_str.split('\n') {
        // Skip blank lines
        if line.trim().is_empty() {
            state.prev_list_type = None;
            continue;
        }

        // ── h1. … h6. heading ──────────────────────────────────────────────────
        if let Some(cap) = match_heading(line) {
            state.prev_list_type = None;
            open_block(
                &mut state,
                "heading",
                vec![],
                Some(json!({ "level": cap.0 })),
            );
            walk_inline(cap.1, &mut state);
            continue;
        }

        // ── bq. blockquote ─────────────────────────────────────────────────────
        if let Some(rest) = line.strip_prefix("bq. ") {
            state.prev_list_type = None;
            open_block(&mut state, "blockquote-marker", vec![], None);
            open_block(&mut state, "paragraph", vec!["blockquote".to_owned()], None);
            walk_inline(rest, &mut state);
            continue;
        }

        // ── bc. code block (single-line variant) ───────────────────────────────
        if let Some(rest) = line.strip_prefix("bc. ") {
            state.prev_list_type = None;
            open_block(&mut state, "code-block", vec![], None);
            state.text.push_str(rest);
            state.text.push('\n');
            continue;
        }

        // ── Horizontal rule: --- (three or more dashes on a line by itself) ────
        if is_horizontal_rule(line) {
            state.prev_list_type = None;
            open_block(&mut state, "horizontal-rule", vec![], None);
            continue;
        }

        // ── Nested bullet: ** item (two or more asterisks) ────────────────────
        if let Some(rest) = match_nested_bullet(line) {
            state.prev_list_type = Some("bullet".to_owned());
            open_block(&mut state, "bullet-list-marker", vec![], None);
            open_block(&mut state, "list-item-marker", vec!["ul".to_owned()], None);
            open_block(
                &mut state,
                "list-item-text",
                vec!["ul".to_owned(), "unordered-list-item".to_owned()],
                None,
            );
            walk_inline(rest, &mut state);
            continue;
        }

        // ── Bullet list: * item (single asterisk + space) ─────────────────────
        if let Some(rest) = line.strip_prefix("* ") {
            if state.prev_list_type.as_deref() != Some("bullet") {
                open_block(&mut state, "bullet-list-marker", vec![], None);
            }
            open_block(&mut state, "list-item-marker", vec!["ul".to_owned()], None);
            open_block(
                &mut state,
                "list-item-text",
                vec!["ul".to_owned(), "unordered-list-item".to_owned()],
                None,
            );
            walk_inline(rest, &mut state);
            state.prev_list_type = Some("bullet".to_owned());
            continue;
        }

        // ── Nested ordered: ## item (two or more hashes) ──────────────────────
        if let Some(rest) = match_nested_ordered(line) {
            state.prev_list_type = Some("ordered".to_owned());
            open_block(&mut state, "ordered-list-marker", vec![], None);
            open_block(&mut state, "list-item-marker", vec!["ol".to_owned()], None);
            open_block(
                &mut state,
                "list-item-text",
                vec!["ol".to_owned(), "ordered-list-item".to_owned()],
                None,
            );
            walk_inline(rest, &mut state);
            continue;
        }

        // ── Ordered list: # item (single hash + space) ────────────────────────
        if let Some(rest) = line.strip_prefix("# ") {
            if state.prev_list_type.as_deref() != Some("ordered") {
                open_block(&mut state, "ordered-list-marker", vec![], None);
            }
            open_block(&mut state, "list-item-marker", vec!["ol".to_owned()], None);
            open_block(
                &mut state,
                "list-item-text",
                vec!["ol".to_owned(), "ordered-list-item".to_owned()],
                None,
            );
            walk_inline(rest, &mut state);
            state.prev_list_type = Some("ordered".to_owned());
            continue;
        }

        // ── Explicit paragraph: p. text ────────────────────────────────────────
        if let Some(rest) = line.strip_prefix("p. ") {
            state.prev_list_type = None;
            open_block(&mut state, "paragraph", vec![], None);
            walk_inline(rest, &mut state);
            continue;
        }

        // ── Default: paragraph ────────────────────────────────────────────────
        state.prev_list_type = None;
        open_block(&mut state, "paragraph", vec![], None);
        walk_inline(line, &mut state);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Block-detection helpers ──────────────────────────────────────────────────

/// Match `h1.` through `h6.` heading prefix. Returns (level, rest_of_line).
fn match_heading(line: &str) -> Option<(u64, &str)> {
    if !line.starts_with('h') {
        return None;
    }
    let bytes = line.as_bytes();
    if bytes.len() < 4 {
        return None;
    }
    let digit = bytes[1];
    if !(b'1'..=b'6').contains(&digit) {
        return None;
    }
    if bytes[2] != b'.' {
        return None;
    }
    if bytes[3] != b' ' {
        return None;
    }
    let level = (digit - b'0') as u64;
    Some((level, &line[4..]))
}

/// Match `---` or longer dashes-only line (horizontal rule).
fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() >= 3 && trimmed.bytes().all(|b| b == b'-')
}

/// Match nested bullet `** item`, `*** item`, etc. (two or more `*` then space).
/// Returns the content after the asterisks and space.
fn match_nested_bullet(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    if bytes.len() < 3 {
        return None;
    }
    if bytes[0] != b'*' || bytes[1] != b'*' {
        return None;
    }
    let mut star_end = 2;
    while star_end < bytes.len() && bytes[star_end] == b'*' {
        star_end += 1;
    }
    if star_end >= bytes.len() || bytes[star_end] != b' ' {
        return None;
    }
    Some(&line[star_end + 1..])
}

/// Match nested ordered `## item`, `### item`, etc. (two or more `#` then space).
fn match_nested_ordered(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    if bytes.len() < 3 {
        return None;
    }
    if bytes[0] != b'#' || bytes[1] != b'#' {
        return None;
    }
    let mut hash_end = 2;
    while hash_end < bytes.len() && bytes[hash_end] == b'#' {
        hash_end += 1;
    }
    if hash_end >= bytes.len() || bytes[hash_end] != b' ' {
        return None;
    }
    Some(&line[hash_end + 1..])
}

// ─── Export: DocumentJSON → Textile ──────────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry());

    let mut lines: Vec<String> = Vec::new();
    let ctx = TextileCtx {
        list_type: None,
        in_blockquote: false,
    };
    walk_textile_nodes(&nodes, &mut lines, &ctx);

    let result = lines.join("");
    if result.ends_with('\n') {
        result[..result.len() - 1].to_owned()
    } else {
        result
    }
}

struct TextileCtx {
    list_type: Option<String>, // "bullet" | "ordered"
    in_blockquote: bool,
}

fn walk_textile_nodes(nodes: &[HirNode], lines: &mut Vec<String>, ctx: &TextileCtx) {
    for node in nodes {
        walk_textile_node(node, lines, ctx);
    }
}

fn walk_textile_node(node: &HirNode, lines: &mut Vec<String>, ctx: &TextileCtx) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            walk_textile_block(name, attrs, children, lines, ctx);
        }
        HirNode::Container { name, children, .. } => {
            walk_textile_container(name, children, lines, ctx);
        }
        HirNode::Text { content, marks } => {
            lines.push(render_textile_inline_with_marks(content, marks));
        }
    }
}

fn walk_textile_container(
    name: &str,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &TextileCtx,
) {
    let child_ctx = match name {
        "ul" => TextileCtx {
            list_type: Some("bullet".into()),
            in_blockquote: ctx.in_blockquote,
        },
        "ol" => TextileCtx {
            list_type: Some("ordered".into()),
            in_blockquote: ctx.in_blockquote,
        },
        "blockquote" => TextileCtx {
            list_type: ctx.list_type.clone(),
            in_blockquote: true,
        },
        _ => TextileCtx {
            list_type: ctx.list_type.clone(),
            in_blockquote: ctx.in_blockquote,
        },
    };
    walk_textile_nodes(children, lines, &child_ctx);
}

fn walk_textile_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &TextileCtx,
) {
    match name {
        // Structural markers — produce no output
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {
        }

        "paragraph" => {
            let inner = render_textile_inline_children(children);
            if ctx.in_blockquote {
                lines.push(format!("bq. {}\n", inner));
            } else {
                lines.push(format!("{}\n", inner));
            }
        }

        "heading" => {
            let level = attrs
                .get("level")
                .and_then(|v| v.as_u64())
                .unwrap_or(1)
                .min(6);
            let inner = render_textile_inline_children(children);
            lines.push(format!("h{}. {}\n", level, inner));
        }

        "code-block" => {
            let code = collect_text_content(children);
            let code_body = if code.ends_with('\n') {
                &code[..code.len() - 1]
            } else {
                code.as_str()
            };
            let code_lines: Vec<&str> = code_body.split('\n').collect();
            if code_lines.len() == 1 {
                lines.push(format!("bc. {}\n", code_body));
            } else {
                lines.push(format!("bc..\n{}\n\n", code_body));
            }
        }

        "list-item-text" => {
            let inner = render_textile_inline_children(children);
            if ctx.list_type.as_deref() == Some("ordered") {
                lines.push(format!("# {}\n", inner));
            } else {
                lines.push(format!("* {}\n", inner));
            }
        }

        "horizontal-rule" => {
            lines.push("---\n".to_owned());
        }

        _ => {
            // Fallback: render inline content as plain paragraph
            let inner = render_textile_inline_children(children);
            if !inner.is_empty() {
                lines.push(format!("{}\n", inner));
            }
        }
    }
}

/// Collect plain text from all Text nodes in `children` (ignoring marks).
fn collect_text_content(children: &[HirNode]) -> String {
    let mut out = String::new();
    for node in children {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children: sub, .. } | HirNode::Container { children: sub, .. } => {
                out.push_str(&collect_text_content(sub));
            }
        }
    }
    out
}

/// Render a slice of HIR child nodes to Textile inline syntax.
fn render_textile_inline_children(children: &[HirNode]) -> String {
    let mut out = String::new();
    for node in children {
        match node {
            HirNode::Text { content, marks } => {
                out.push_str(&render_textile_inline_with_marks(content, marks));
            }
            HirNode::Block { children: sub, .. } => {
                out.push_str(&render_textile_inline_children(sub));
            }
            HirNode::Container { children: sub, .. } => {
                out.push_str(&render_textile_inline_children(sub));
            }
        }
    }
    out
}

/// Wrap `content` with the Textile syntax for each mark, outermost first.
fn render_textile_inline_with_marks(content: &str, marks: &[MarkApplication]) -> String {
    if marks.is_empty() {
        return content.to_owned();
    }
    let outer = &marks[0];
    let inner = render_textile_inline_with_marks(content, &marks[1..]);
    match outer.kind.as_str() {
        "org.textile.facet#bold" => format!("*{}*", inner),
        "org.textile.facet#strong" => format!("**{}**", inner),
        "org.textile.facet#italic" => format!("_{}_", inner),
        "org.textile.facet#underline" => format!("+{}+", inner),
        "org.textile.facet#strikethrough" => format!("-{}-", inner),
        "org.textile.facet#superscript" => format!("^{}^", inner),
        "org.textile.facet#subscript" => format!("~{}~", inner),
        "org.textile.facet#code" => format!("@{}@", inner),
        "org.textile.facet#link" => {
            let uri = outer
                .attrs
                .get("uri")
                .or_else(|| outer.attrs.get("url"))
                .or_else(|| outer.attrs.get("href"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("\"{}\":{}", inner, uri)
        }
        "org.textile.facet#image" => {
            let src = outer
                .attrs
                .get("src")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let alt = outer.attrs.get("alt").and_then(|v| v.as_str());
            if let Some(a) = alt {
                format!("!{}({})!", src, a)
            } else {
                format!("!{}!", src)
            }
        }
        // CommonMark pass-through marks (after lens transform)
        "org.commonmark.facet#strong" | "org.relationaltext.facet#bold" => format!("**{}**", inner),
        "org.commonmark.facet#emphasis" | "org.relationaltext.facet#italic" => {
            format!("_{}_", inner)
        }
        "org.commonmark.facet#strikethrough" | "org.relationaltext.facet#strikethrough" => {
            format!("-{}-", inner)
        }
        "org.commonmark.facet#code-span" | "org.relationaltext.facet#code" => {
            format!("@{}@", inner)
        }
        "org.relationaltext.facet#underline" => format!("+{}+", inner),
        "org.relationaltext.facet#superscript" => format!("^{}^", inner),
        "org.relationaltext.facet#subscript" => format!("~{}~", inner),
        "org.commonmark.facet#link" | "org.relationaltext.facet#link" => {
            let uri = outer
                .attrs
                .get("url")
                .or_else(|| outer.attrs.get("uri"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("\"{}\":{}", inner, uri)
        }
        _ => inner,
    }
}
