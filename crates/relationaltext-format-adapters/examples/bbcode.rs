//! BBCode format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.bbcode.facet`
//! Block: [quote]..[/quote], [list]..[/list], [list=1]..[/list], [*], [code] (multiline)
//! Inline: [b], [i], [u], [s], [code], [color=val], [size=val], [url=href], [img]

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.bbcode.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.bbcode/bbcode.lexicon.json");

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
pub extern "C" fn import_bbcode(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_bbcode(ptr: *mut u8, len: i32) -> *mut u8 {
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

/// Emit a 1-char block marker and push its facet.
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

/// Inline mark: push a span over `content` with given feature attrs.
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

fn push_inline_color(state: &mut ImportState, content: &str, color: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "color", "color": color }],
    }));
}

fn push_inline_size(state: &mut ImportState, content: &str, size: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "size", "size": size }],
    }));
}

fn push_inline_url(state: &mut ImportState, content: &str, href: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "url", "href": href }],
    }));
}

fn push_inline_img(state: &mut ImportState, src: &str) {
    // img is an entity: placeholder space char
    let s = state.text.len();
    state.text.push(' ');
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "img", "src": src }],
    }));
}

// ─── Tag scanner ──────────────────────────────────────────────────────────────

/// Find the next `[tag]` or `[tag=val]` or `[/tag]` starting at `from`.
/// Returns `(match_start, full_match_len, tag_name, opt_attr)`.
fn next_tag(input: &str, from: usize) -> Option<(usize, usize, String, Option<String>)> {
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut i = from;
    while i < len {
        if bytes[i] != b'[' {
            i += 1;
            continue;
        }
        // scan for ]
        let mut j = i + 1;
        while j < len && bytes[j] != b']' && bytes[j] != b'\n' {
            j += 1;
        }
        if j >= len || bytes[j] == b'\n' {
            i += 1;
            continue;
        }
        let inner = &input[i + 1..j];
        let full_len = j - i + 1; // includes [ and ]
                                  // split on first '='
        let (tag_part, attr_part) = if let Some(eq) = inner.find('=') {
            (&inner[..eq], Some(inner[eq + 1..].to_owned()))
        } else {
            (inner, None)
        };
        // tag name: allow /tag, letters, digits, -, *
        let tag_name = tag_part.to_lowercase();
        let valid = !tag_name.is_empty()
            && tag_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '/' || c == '*');
        if valid {
            return Some((i, full_len, tag_name, attr_part));
        }
        i += 1;
    }
    None
}

// ─── Recursive inline parser ──────────────────────────────────────────────────

/// Parse inline BBCode from `input` starting at `pos`.
///
/// Appends decoded text and inline facets directly to `state`.
/// Stops when `[/stop_tag]` is found (if `stop_tag` is `Some`).
/// Returns the position after the closing tag (or end of input).
///
/// Block-level tags encountered inside inline context (`[quote]`, `[list]`)
/// cause an early return so the block-level parser can handle them.
fn parse_inline(
    input: &str,
    mut pos: usize,
    state: &mut ImportState,
    stop_tag: Option<&str>,
) -> usize {
    while pos < input.len() {
        match next_tag(input, pos) {
            None => {
                // No more tags — append remaining text up to end of input
                state.text.push_str(&input[pos..]);
                pos = input.len();
                break;
            }
            Some((tag_start, tag_len, ref name, ref attr)) => {
                // Append plain text before this tag (including any embedded newlines)
                if tag_start > pos {
                    state.text.push_str(&input[pos..tag_start]);
                }
                pos = tag_start + tag_len;

                // Closing tag
                if name.starts_with('/') {
                    let closing = &name[1..];
                    if stop_tag == Some(closing) {
                        break;
                    }
                    // Unmatched closing — ignore
                    continue;
                }

                // Block-level tags encountered inside inline context
                // Back up and return so the block parser can handle them
                if name == "quote" || name == "list" {
                    // restore pos to before this tag
                    pos = tag_start;
                    break;
                }

                match name.as_str() {
                    "b" | "i" | "u" | "s" => {
                        let mark_name = name.clone();
                        let span_start = state.text.len();
                        pos = parse_inline(input, pos, state, Some(name));
                        let span_end = state.text.len();
                        if span_start < span_end {
                            // Content has already been appended to state.text by the recursive call.
                            // Push a facet over the range [span_start, span_end).
                            state.facets.push(json!({
                                "index": { "byteStart": span_start, "byteEnd": span_end },
                                "features": [{ "$type": TYPE_ID, "name": mark_name }],
                            }));
                        }
                    }
                    "code" => {
                        // Determine if this is a block-level [code] or inline
                        // Block: lineText is empty AND content until [/code] has a newline
                        let close_idx = find_close_tag(input, pos, "code");
                        let code_content = match close_idx {
                            Some(ci) => &input[pos..ci],
                            None => &input[pos..],
                        };
                        // Check if current accumulated text ends at a block boundary
                        // (i.e., the last char is a block marker or text is empty)
                        let at_block_boundary = state.text.is_empty()
                            || state.text.ends_with('\u{FFFC}')
                            || state.text.ends_with('\n');
                        let is_block = at_block_boundary && code_content.contains('\n');

                        if is_block {
                            let mut block_content = code_content.to_owned();
                            if block_content.starts_with('\n') {
                                block_content = block_content[1..].to_owned();
                            }
                            if !block_content.ends_with('\n') {
                                block_content.push('\n');
                            }
                            open_block(state, "code-block", &[]);
                            state.text.push_str(&block_content);
                            pos = match close_idx {
                                Some(ci) => ci + "[/code]".len(),
                                None => input.len(),
                            };
                        } else {
                            // Inline code span
                            let rel_start = state.text.len();
                            pos = parse_inline(input, pos, state, Some("code"));
                            let rel_end = state.text.len();
                            if rel_start < rel_end {
                                state.facets.push(json!({
                                    "index": { "byteStart": rel_start, "byteEnd": rel_end },
                                    "features": [{ "$type": TYPE_ID, "name": "code" }],
                                }));
                            }
                        }
                    }
                    "color" => {
                        let color = attr.clone().unwrap_or_default();
                        let rel_start = state.text.len();
                        pos = parse_inline(input, pos, state, Some("color"));
                        let rel_end = state.text.len();
                        if rel_start < rel_end {
                            state.facets.push(json!({
                                "index": { "byteStart": rel_start, "byteEnd": rel_end },
                                "features": [{ "$type": TYPE_ID, "name": "color", "color": color }],
                            }));
                        }
                    }
                    "size" => {
                        let size = attr.clone().unwrap_or_default();
                        let rel_start = state.text.len();
                        pos = parse_inline(input, pos, state, Some("size"));
                        let rel_end = state.text.len();
                        if rel_start < rel_end {
                            state.facets.push(json!({
                                "index": { "byteStart": rel_start, "byteEnd": rel_end },
                                "features": [{ "$type": TYPE_ID, "name": "size", "size": size }],
                            }));
                        }
                    }
                    "url" => {
                        let href_opt = attr.clone();
                        let content_start = state.text.len();
                        pos = parse_inline(input, pos, state, Some("url"));
                        let content_end = state.text.len();
                        if content_start < content_end {
                            let href = href_opt.unwrap_or_else(|| {
                                state.text[content_start..content_end].trim().to_owned()
                            });
                            state.facets.push(json!({
                                "index": { "byteStart": content_start, "byteEnd": content_end },
                                "features": [{ "$type": TYPE_ID, "name": "url", "href": href }],
                            }));
                        }
                    }
                    "img" => {
                        // [img]url[/img] — capture the inner URL without adding it to text
                        let close_idx = find_close_tag(input, pos, "img");
                        let src = match close_idx {
                            Some(ci) => input[pos..ci].trim().to_owned(),
                            None => input[pos..].trim().to_owned(),
                        };
                        pos = match close_idx {
                            Some(ci) => ci + "[/img]".len(),
                            None => input.len(),
                        };
                        push_inline_img(state, &src);
                    }
                    _ => {
                        // Unknown tag — ignore
                    }
                }
            }
        }
    }
    pos
}

/// Find the byte position of `[/tag]` (case-insensitive) starting at `from`.
fn find_close_tag(input: &str, from: usize, tag: &str) -> Option<usize> {
    let needle = format!("[/{}]", tag);
    let lower = input[from..].to_lowercase();
    lower.find(&needle).map(|rel| from + rel)
}

// ─── Block context tracking ───────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum CtxType {
    Quote,
    BulletList,
    OrderedList,
}

// ─── Top-level importer ────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Accept either plain BBCode string or JSON with a "text" field
    let input: String = {
        let v: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        if let Some(t) = v["text"].as_str() {
            t.to_owned()
        } else {
            raw.to_owned()
        }
    };

    let mut state = ImportState::new();
    let mut ctx_stack: Vec<CtxType> = Vec::new();
    let mut pos = 0usize;

    fn in_quote(ctx: &[CtxType]) -> bool {
        ctx.iter().any(|c| *c == CtxType::Quote)
    }
    fn in_list(ctx: &[CtxType]) -> Option<CtxType> {
        for c in ctx.iter().rev() {
            if *c == CtxType::BulletList || *c == CtxType::OrderedList {
                return Some(*c);
            }
        }
        None
    }

    // Flush whatever is in a pending line context by emitting the appropriate block.
    // In BBCode, newlines separate content. We flush by opening a block + appending text.
    // This function is called before block-level events.
    // Since we use parse_inline which appends directly, we need a different approach:
    // process newlines as block boundaries.

    // We process the input in two interleaved passes:
    // 1. Block-level events (quote, list, code, newline) are handled at the top level.
    // 2. Between block events, inline content is parsed via parse_inline.

    let mut line_started = false; // whether we've started a block for the current line

    while pos < input.len() {
        // Look ahead: what is the next block-level event?
        let next_block = next_block_event(&input, pos);

        match next_block {
            None => {
                // No more block events; parse rest as inline
                if !line_started {
                    open_line_block(&mut state, &ctx_stack);
                    line_started = true;
                }
                pos = parse_inline(&input, pos, &mut state, None);
                break;
            }
            Some((ev_start, ev_len, ref ev_name, ref ev_attr)) => {
                // Parse inline content before this block event
                if ev_start > pos {
                    if !line_started {
                        open_line_block(&mut state, &ctx_stack);
                        line_started = true;
                    }
                    pos = parse_inline(&input, pos, &mut state, None);
                    // parse_inline may stop early (returned before ev_start) if it
                    // encountered a block tag inside inline — re-scan
                    if pos < ev_start {
                        continue;
                    }
                }

                pos = ev_start + ev_len;

                match ev_name.as_str() {
                    "\n" => {
                        // If we haven't started a block yet for this line, emit empty paragraph
                        if !line_started {
                            open_line_block(&mut state, &ctx_stack);
                        }
                        line_started = false;
                    }
                    "quote" => {
                        if line_started {
                            // flush current block (already started via parse_inline)
                            line_started = false;
                        }
                        open_block(&mut state, "blockquote-marker", &[]);
                        ctx_stack.push(CtxType::Quote);
                    }
                    "/quote" => {
                        if line_started {
                            line_started = false;
                        }
                        // pop the last quote context
                        if let Some(idx) = ctx_stack.iter().rposition(|c| *c == CtxType::Quote) {
                            ctx_stack.remove(idx);
                        }
                    }
                    "list" => {
                        if line_started {
                            line_started = false;
                        }
                        let is_ordered = ev_attr.as_deref().map_or(false, |a| !a.is_empty());
                        if is_ordered {
                            open_block(&mut state, "ordered-list-marker", &[]);
                            ctx_stack.push(CtxType::OrderedList);
                        } else {
                            open_block(&mut state, "bullet-list-marker", &[]);
                            ctx_stack.push(CtxType::BulletList);
                        }
                    }
                    "/list" => {
                        if line_started {
                            line_started = false;
                        }
                        if let Some(idx) = ctx_stack
                            .iter()
                            .rposition(|c| *c == CtxType::BulletList || *c == CtxType::OrderedList)
                        {
                            ctx_stack.remove(idx);
                        }
                    }
                    "*" => {
                        // [*] list item marker
                        if line_started {
                            line_started = false;
                        }
                        match in_list(&ctx_stack) {
                            Some(CtxType::BulletList) => {
                                open_block(&mut state, "list-item-marker", &["ul"]);
                            }
                            Some(CtxType::OrderedList) => {
                                open_block(&mut state, "list-item-marker", &["ol"]);
                            }
                            _ => {}
                        }
                    }
                    "code" => {
                        // Block-level [code] (confirmed by next_block_event)
                        if line_started {
                            line_started = false;
                        }
                        let after_tag = pos;
                        let close_idx = find_close_tag(&input, after_tag, "code");
                        let code_content = match close_idx {
                            Some(ci) => &input[after_tag..ci],
                            None => &input[after_tag..],
                        };
                        let mut block_content = code_content.to_owned();
                        if block_content.starts_with('\n') {
                            block_content = block_content[1..].to_owned();
                        }
                        if !block_content.ends_with('\n') {
                            block_content.push('\n');
                        }
                        open_block(&mut state, "code-block", &[]);
                        state.text.push_str(&block_content);
                        pos = match close_idx {
                            Some(ci) => ci + "[/code]".len(),
                            None => input.len(),
                        };
                        line_started = false;
                    }
                    _ => {
                        // Unknown block-like tag — treat as inline
                        if !line_started {
                            open_line_block(&mut state, &ctx_stack);
                            line_started = true;
                        }
                        // Already past the tag; nothing to do (unknown tag ignored)
                    }
                }
            }
        }
    }

    // If we have pending facets or text but never opened a block, emit one
    if state.facets.is_empty() {
        open_line_block(&mut state, &ctx_stack);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Open the appropriate block for the current line given the context stack.
fn open_line_block(state: &mut ImportState, ctx_stack: &[CtxType]) {
    fn in_quote(ctx: &[CtxType]) -> bool {
        ctx.iter().any(|c| *c == CtxType::Quote)
    }
    fn in_list(ctx: &[CtxType]) -> Option<CtxType> {
        for c in ctx.iter().rev() {
            if *c == CtxType::BulletList || *c == CtxType::OrderedList {
                return Some(*c);
            }
        }
        None
    }
    match in_list(ctx_stack) {
        Some(CtxType::BulletList) => {
            open_block(state, "list-item-text", &["ul", "unordered-list-item"]);
        }
        Some(CtxType::OrderedList) => {
            open_block(state, "list-item-text", &["ol", "ordered-list-item"]);
        }
        _ => {
            if in_quote(ctx_stack) {
                open_block(state, "paragraph", &["blockquote"]);
            } else {
                open_block(state, "paragraph", &[]);
            }
        }
    }
}

/// Scan `input` from `from` for the next block-level event.
/// Block-level events: newline, [quote], [/quote], [list], [list=…], [/list], [*], [code] (block).
/// Returns `(event_start, event_len, event_name, opt_attr)`.
fn next_block_event(input: &str, from: usize) -> Option<(usize, usize, String, Option<String>)> {
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut i = from;
    while i < len {
        // Newline is always a block boundary
        if bytes[i] == b'\n' {
            return Some((i, 1, "\n".to_owned(), None));
        }
        // Check for a tag
        if bytes[i] == b'[' {
            if let Some((tag_start, tag_len, name, attr)) = next_tag(input, i) {
                // Is this tag block-level?
                let is_block = matches!(name.as_str(), "quote" | "/quote" | "list" | "/list" | "*");
                // [code] is block-level only if at a line boundary and content has newline
                let is_block_code = name == "code" && {
                    let after = tag_start + tag_len;
                    // check that we're at start of line (nothing non-whitespace before on this line)
                    let before = &input[from..tag_start];
                    let at_boundary = before.trim().is_empty();
                    let close = find_close_tag(input, after, "code");
                    let content = match close {
                        Some(ci) => &input[after..ci],
                        None => &input[after..],
                    };
                    at_boundary && content.contains('\n')
                };
                if is_block || is_block_code {
                    return Some((tag_start, tag_len, name, attr));
                }
                // Not a block-level tag — skip past it
                i = tag_start + tag_len;
                continue;
            }
        }
        i += 1;
    }
    None
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "org.bbcode.facet#b" => format!("[b]{}[/b]", content),
        "org.bbcode.facet#i" => format!("[i]{}[/i]", content),
        "org.bbcode.facet#u" => format!("[u]{}[/u]", content),
        "org.bbcode.facet#s" => format!("[s]{}[/s]", content),
        "org.bbcode.facet#code" => format!("[code]{}[/code]", content),
        "org.bbcode.facet#color" => {
            let color = mark
                .attrs
                .get("color")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if color.is_empty() {
                content.to_owned()
            } else {
                format!("[color={}]{}[/color]", color, content)
            }
        }
        "org.bbcode.facet#size" => {
            let size = mark
                .attrs
                .get("size")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if size.is_empty() {
                content.to_owned()
            } else {
                format!("[size={}]{}[/size]", size, content)
            }
        }
        "org.bbcode.facet#url" => {
            let href = mark
                .attrs
                .get("href")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if href.is_empty() {
                format!("[url]{}[/url]", content)
            } else {
                format!("[url={}]{}[/url]", href, content)
            }
        }
        "org.bbcode.facet#img" => {
            let src = mark
                .attrs
                .get("src")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("[img]{}[/img]", src)
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

fn render_node(node: &HirNode, out: &mut String) {
    match node {
        HirNode::Block { name, children, .. } => match name.as_str() {
            "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker"
            | "blockquote-marker" => {
                // Marker blocks — no output (container handles wrapping)
            }
            "paragraph" => {
                out.push_str(&render_inline(children));
                out.push('\n');
            }
            "list-item-text" => {
                out.push_str("[*]");
                out.push_str(&render_inline(children));
                out.push('\n');
            }
            "code-block" => {
                let code = collect_text(children);
                let trimmed = if code.ends_with('\n') {
                    &code[..code.len() - 1]
                } else {
                    &code
                };
                out.push_str("[code]\n");
                out.push_str(trimmed);
                out.push_str("\n[/code]\n");
            }
            _ => {
                // Fallback: render as paragraph
                out.push_str(&render_inline(children));
                out.push('\n');
            }
        },
        HirNode::Container { name, children, .. } => match name.as_str() {
            "ul" => {
                out.push_str("[list]\n");
                for child in children {
                    render_node(child, out);
                }
                out.push_str("[/list]\n");
            }
            "ol" => {
                out.push_str("[list=1]\n");
                for child in children {
                    render_node(child, out);
                }
                out.push_str("[/list]\n");
            }
            "blockquote" => {
                out.push_str("[quote]\n");
                for child in children {
                    render_node(child, out);
                }
                out.push_str("[/quote]\n");
            }
            _ => {
                // Sub-containers (unordered-list-item, ordered-list-item) — pass through
                for child in children {
                    render_node(child, out);
                }
            }
        },
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
    for node in &nodes {
        render_node(node, &mut out);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
