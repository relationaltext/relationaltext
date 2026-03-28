//! Pandoc Markdown format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.pandoc.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate (from wasm-format-adapter)
//!   import(ptr, len) -> ptr     — Pandoc Markdown string (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Pandoc facets) → raw Pandoc Markdown string

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.pandoc.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.pandoc/pandoc.lexicon.json");

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

// ─── Import: Pandoc Markdown → DocumentJSON ───────────────────────────────────

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

fn do_import(raw: &str) -> String {
    // Input is DocumentJSON where text = Pandoc Markdown string
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let md_str = outer["text"].as_str().unwrap_or(raw);

    let mut state = ImportState::new();
    let mut lines: Vec<&str> = md_str.split('\n').collect();
    // ── YAML front matter ──────────────────────────────────────────────────────
    let has_closing_yaml =
        lines.first() == Some(&"---") && lines[1..].iter().any(|l| *l == "---" || *l == "...");

    if has_closing_yaml {
        let mut front_idx = 1;
        let mut meta_lines: Vec<&str> = Vec::new();
        while front_idx < lines.len() {
            let line = lines[front_idx];
            if line == "---" || line == "..." {
                front_idx += 1;
                break;
            }
            meta_lines.push(line);
            front_idx += 1;
        }
        for meta_line in &meta_lines {
            if let Some(colon_idx) = meta_line.find(':') {
                let key = meta_line[..colon_idx].trim();
                let value = parse_yaml_value(meta_line[colon_idx + 1..].trim());
                if !key.is_empty() {
                    open_block(
                        &mut state,
                        "Meta",
                        vec![],
                        Some(json!({ "key": key, "value": value })),
                    );
                }
            }
        }
        lines = lines[front_idx..].to_vec();
    } else {
        lines = lines.to_vec();
    }

    let mut in_code_block = false;
    let mut code_block_lines: Vec<String> = Vec::new();
    let mut code_block_lang: Option<String> = None;
    let mut in_fenced_div = false;
    let mut _fenced_div_class: Option<String> = None;

    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // ── Code block fence detection ─────────────────────────────────────────
        if line.starts_with("```") {
            if !in_code_block {
                in_code_block = true;
                code_block_lines.clear();
                let info = line[3..].trim();
                code_block_lang = if info.is_empty() {
                    None
                } else {
                    Some(info.to_owned())
                };
                i += 1;
                continue;
            } else if line.trim() == "```" {
                in_code_block = false;
                let code_content = code_block_lines.join("\n") + "\n";
                let mut code_attrs = json!({});
                if let Some(ref lang) = code_block_lang {
                    code_attrs["language"] = Value::String(lang.clone());
                }
                state.prev_list_type = None;
                open_block(&mut state, "CodeBlock", vec![], Some(code_attrs));
                state.text.push_str(&code_content);
                code_block_lines.clear();
                code_block_lang = None;
                i += 1;
                continue;
            }
        }

        if in_code_block {
            code_block_lines.push(line.to_owned());
            i += 1;
            continue;
        }

        // ── Fenced div detection ───────────────────────────────────────────────
        if line.starts_with(":::") {
            if !in_fenced_div {
                in_fenced_div = true;
                let rest = line[3..].trim();
                let fenced_class = if rest.is_empty() {
                    None
                } else {
                    Some(rest.to_owned())
                };
                let div_attrs = if let Some(ref cls) = fenced_class {
                    json!({ "class": cls })
                } else {
                    json!({})
                };
                _fenced_div_class = fenced_class;
                open_block(&mut state, "Div", vec![], Some(div_attrs));
                state.prev_list_type = None;
                i += 1;
                continue;
            } else if line.trim() == ":::" {
                in_fenced_div = false;
                _fenced_div_class = None;
                i += 1;
                continue;
            }
        }

        // ── Footnote definition: [^key]: text ─────────────────────────────────
        if let Some(cap) = match_footnote_def(line) {
            state.prev_list_type = None;
            open_block(
                &mut state,
                "footnote-def",
                vec![],
                Some(json!({ "key": cap.0 })),
            );
            if !cap.1.is_empty() {
                walk_inline(cap.1, &mut state);
            }
            i += 1;
            continue;
        }

        // ── Headings (ATX style) ───────────────────────────────────────────────
        if let Some(cap) = match_heading(line) {
            state.prev_list_type = None;
            let level = cap.0;
            let heading_text = cap.1;
            let heading_id = cap.2;
            let mut heading_attrs = json!({ "level": level });
            if let Some(id) = heading_id {
                heading_attrs["id"] = Value::String(id.to_owned());
            }
            open_block(&mut state, "Header", vec![], Some(heading_attrs));
            walk_inline(heading_text, &mut state);
            i += 1;
            continue;
        }

        // ── Blockquote ─────────────────────────────────────────────────────────
        if let Some(rest) = line.strip_prefix("> ") {
            state.prev_list_type = None;
            open_block(&mut state, "BlockQuote", vec![], None);
            open_block(&mut state, "Para", vec!["blockquote".to_owned()], None);
            walk_inline(rest, &mut state);
            i += 1;
            continue;
        }

        // ── Bullet list item ───────────────────────────────────────────────────
        if line.len() >= 2 {
            let b = line.as_bytes();
            if (b[0] == b'-' || b[0] == b'*' || b[0] == b'+') && b[1] == b' ' {
                let content = &line[2..];
                if state.prev_list_type.as_deref() != Some("bullet") {
                    open_block(&mut state, "BulletList", vec![], None);
                }
                open_block(&mut state, "list-item-marker", vec!["ul".to_owned()], None);
                open_block(
                    &mut state,
                    "list-item-text",
                    vec!["ul".to_owned(), "unordered-list-item".to_owned()],
                    None,
                );
                walk_inline(content, &mut state);
                state.prev_list_type = Some("bullet".to_owned());
                i += 1;
                continue;
            }
        }

        // ── Ordered list item ──────────────────────────────────────────────────
        if let Some(content) = match_ordered_list(line) {
            if state.prev_list_type.as_deref() != Some("ordered") {
                open_block(&mut state, "OrderedList", vec![], None);
            }
            open_block(&mut state, "list-item-marker", vec!["ol".to_owned()], None);
            open_block(
                &mut state,
                "list-item-text",
                vec!["ol".to_owned(), "ordered-list-item".to_owned()],
                None,
            );
            walk_inline(content, &mut state);
            state.prev_list_type = Some("ordered".to_owned());
            i += 1;
            continue;
        }

        // ── Horizontal rule ────────────────────────────────────────────────────
        if is_horizontal_rule(line) {
            state.prev_list_type = None;
            open_block(&mut state, "HorizontalRule", vec![], None);
            i += 1;
            continue;
        }

        // ── Empty line ─────────────────────────────────────────────────────────
        if line.trim().is_empty() {
            state.prev_list_type = None;
            i += 1;
            continue;
        }

        // ── Regular paragraph ──────────────────────────────────────────────────
        state.prev_list_type = None;
        open_block(&mut state, "Para", vec![], None);
        walk_inline(line, &mut state);
        i += 1;
    }

    // Flush any unclosed code block at EOF
    if in_code_block && !code_block_lines.is_empty() {
        let code_content = code_block_lines.join("\n") + "\n";
        let mut code_attrs = json!({});
        if let Some(ref lang) = code_block_lang {
            code_attrs["language"] = Value::String(lang.clone());
        }
        open_block(&mut state, "CodeBlock", vec![], Some(code_attrs));
        state.text.push_str(&code_content);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

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

fn parse_yaml_value(s: &str) -> &str {
    let trimmed = s.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    }
}

fn match_footnote_def(line: &str) -> Option<(&str, &str)> {
    // [^key]: text
    if !line.starts_with("[^") {
        return None;
    }
    let end_bracket = line.find(']')?;
    let key = &line[2..end_bracket];
    let rest = &line[end_bracket + 1..];
    if !rest.starts_with(": ") {
        return None;
    }
    let text = &rest[2..];
    Some((key, text))
}

fn match_heading(line: &str) -> Option<(u64, &str, Option<&str>)> {
    if !line.starts_with('#') {
        return None;
    }
    let hashes = line.bytes().take_while(|&b| b == b'#').count();
    if hashes > 6 || hashes >= line.len() {
        return None;
    }
    if line.as_bytes().get(hashes) != Some(&b' ') {
        return None;
    }
    let rest = &line[hashes + 1..];
    // Check for optional {#id} suffix
    if let Some(brace_start) = rest.rfind(" {#") {
        let brace_end = rest.rfind('}')?;
        if brace_end > brace_start + 3 {
            let heading_text = rest[..brace_start].trim();
            let id = &rest[brace_start + 3..brace_end];
            return Some((hashes as u64, heading_text, Some(id)));
        }
    }
    Some((hashes as u64, rest.trim_end(), None))
}

fn match_ordered_list(line: &str) -> Option<&str> {
    // Matches "1. " or "1) " etc.
    let mut end = 0;
    let bytes = line.as_bytes();
    while end < bytes.len() && bytes[end].is_ascii_digit() {
        end += 1;
    }
    if end == 0 {
        return None;
    }
    if end >= bytes.len() {
        return None;
    }
    if bytes[end] != b'.' && bytes[end] != b')' {
        return None;
    }
    if end + 1 >= bytes.len() {
        return None;
    }
    if bytes[end + 1] != b' ' {
        return None;
    }
    Some(&line[end + 2..])
}

fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.len() < 3 {
        return false;
    }
    let b = trimmed.as_bytes();
    if b.iter().all(|&c| c == b'-') {
        return true;
    }
    if b.iter().all(|&c| c == b'=') {
        return true;
    }
    if b.iter().all(|&c| c == b'*') {
        return true;
    }
    false
}

/// Walk inline Pandoc markup and emit text + facets into state.
fn walk_inline(line: &str, state: &mut ImportState) {
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    let mut plain_start = 0;

    while i < chars.len() {
        // Bold: **text**
        if chars[i] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing(&chars, i + 2, "**") {
                let content: String = chars[i + 2..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Strong" }],
                    }));
                }
                i = end + 2;
                plain_start = i;
                continue;
            }
        }
        // Strikethrough: ~~text~~
        if chars[i] == '~' && i + 1 < chars.len() && chars[i + 1] == '~' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing(&chars, i + 2, "~~") {
                let content: String = chars[i + 2..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Strikeout" }],
                    }));
                }
                i = end + 2;
                plain_start = i;
                continue;
            }
        }
        // Italic: *text* (single star, not double)
        if chars[i] == '*' && (i + 1 >= chars.len() || chars[i + 1] != '*') {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '*') {
                let content: String = chars[i + 1..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Emph" }],
                    }));
                }
                i = end + 1;
                plain_start = i;
                continue;
            }
        }
        // Italic: _text_
        if chars[i] == '_' && (i + 1 >= chars.len() || chars[i + 1] != '_') {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '_') {
                let content: String = chars[i + 1..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Emph" }],
                    }));
                }
                i = end + 1;
                plain_start = i;
                continue;
            }
        }
        // Superscript: ^text^
        if chars[i] == '^' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '^') {
                let content: String = chars[i + 1..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Superscript" }],
                    }));
                }
                i = end + 1;
                plain_start = i;
                continue;
            }
        }
        // Subscript: ~text~ (single)
        if chars[i] == '~' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '~') {
                let content: String = chars[i + 1..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Subscript" }],
                    }));
                }
                i = end + 1;
                plain_start = i;
                continue;
            }
        }
        // Code: `text`
        if chars[i] == '`' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some(end) = find_closing_single(&chars, i + 1, '`') {
                let content: String = chars[i + 1..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&content);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Code" }],
                    }));
                }
                i = end + 1;
                plain_start = i;
                continue;
            }
        }
        // Image: ![alt](url) — must check before link
        if chars[i] == '!' && i + 1 < chars.len() && chars[i + 1] == '[' {
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some((alt, url, end_pos)) = parse_link_or_image(&chars, i + 1) {
                let display = if alt.is_empty() {
                    " ".to_owned()
                } else {
                    alt.clone()
                };
                let start = state.text.len();
                state.text.push_str(&display);
                let finish = state.text.len();
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": finish },
                    "features": [{ "$type": TYPE_ID, "name": "Image", "src": url, "alt": alt }],
                }));
                i = end_pos;
                plain_start = i;
                continue;
            }
        }
        // Link: [text](url)
        if chars[i] == '[' {
            // Check for footnote ref [^key]
            if i + 1 < chars.len() && chars[i + 1] == '^' {
                if let Some(close) = find_closing_single(&chars, i + 1, ']') {
                    let key: String = chars[i + 2..close].iter().collect();
                    let ref_text = format!("[^{}]", key);
                    flush_plain(&chars[plain_start..i], state);
                    let start = state.text.len();
                    state.text.push_str(&ref_text);
                    let finish = state.text.len();
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "Note", "key": key }],
                    }));
                    i = close + 1;
                    plain_start = i;
                    continue;
                }
            }
            // Check for bracketed span [text]{attrs}
            flush_plain(&chars[plain_start..i], state);
            plain_start = i;
            if let Some((text, close_bracket)) = parse_bracket_text(&chars, i) {
                let after_bracket = close_bracket;
                if after_bracket < chars.len() && chars[after_bracket] == '{' {
                    if let Some(close_brace) = find_closing_single(&chars, after_bracket + 1, '}') {
                        let attrs_str: String =
                            chars[after_bracket + 1..close_brace].iter().collect();
                        // Check it's a span attrs (starts with . or #), not a link
                        if chars[after_bracket + 1] == '.' || chars[after_bracket + 1] == '#' {
                            let start = state.text.len();
                            state.text.push_str(&text);
                            let finish = state.text.len();
                            let class = parse_class_from_attrs(&attrs_str);
                            let id = parse_id_from_attrs(&attrs_str);
                            let mut feat = json!({ "$type": TYPE_ID, "name": "Span" });
                            if let Some(c) = class {
                                feat["class"] = Value::String(c);
                            }
                            if let Some(d) = id {
                                feat["id"] = Value::String(d);
                            }
                            state.facets.push(json!({
                                "index": { "byteStart": start, "byteEnd": finish },
                                "features": [feat],
                            }));
                            i = close_brace + 1;
                            plain_start = i;
                            continue;
                        }
                    }
                }
                // Regular link: [text](url)
                if after_bracket < chars.len() && chars[after_bracket] == '(' {
                    if let Some(close_paren) = find_closing_single(&chars, after_bracket + 1, ')') {
                        let uri: String = chars[after_bracket + 1..close_paren].iter().collect();
                        let start = state.text.len();
                        state.text.push_str(&text);
                        let finish = state.text.len();
                        state.facets.push(json!({
                            "index": { "byteStart": start, "byteEnd": finish },
                            "features": [{ "$type": TYPE_ID, "name": "Link", "uri": uri }],
                        }));
                        // Skip optional trailing {.class} after link
                        let mut end_pos = close_paren + 1;
                        if end_pos < chars.len() && chars[end_pos] == '{' {
                            if let Some(brace_close) = find_closing_single(&chars, end_pos + 1, '}')
                            {
                                end_pos = brace_close + 1;
                            }
                        }
                        i = end_pos;
                        plain_start = i;
                        continue;
                    }
                }
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

fn find_closing(chars: &[char], start: usize, closing: &str) -> Option<usize> {
    let cch: Vec<char> = closing.chars().collect();
    let clen = cch.len();
    let mut i = start;
    while i + clen <= chars.len() {
        if chars[i..i + clen] == cch[..] {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn find_closing_single(chars: &[char], start: usize, closing: char) -> Option<usize> {
    chars[start..]
        .iter()
        .position(|&c| c == closing)
        .map(|p| p + start)
}

fn parse_link_or_image(chars: &[char], open_bracket: usize) -> Option<(String, String, usize)> {
    // chars[open_bracket] == '['
    if open_bracket >= chars.len() || chars[open_bracket] != '[' {
        return None;
    }
    let close_bracket = find_closing_single(chars, open_bracket + 1, ']')?;
    let alt: String = chars[open_bracket + 1..close_bracket].iter().collect();
    let after = close_bracket + 1;
    if after >= chars.len() || chars[after] != '(' {
        return None;
    }
    let close_paren = find_closing_single(chars, after + 1, ')')?;
    let url: String = chars[after + 1..close_paren].iter().collect();
    Some((alt, url, close_paren + 1))
}

fn parse_bracket_text(chars: &[char], open: usize) -> Option<(String, usize)> {
    // chars[open] == '['
    if chars[open] != '[' {
        return None;
    }
    let close = find_closing_single(chars, open + 1, ']')?;
    let text: String = chars[open + 1..close].iter().collect();
    Some((text, close + 1))
}

fn parse_class_from_attrs(attrs: &str) -> Option<String> {
    // Find ".word" in attrs string
    if let Some(pos) = attrs.find('.') {
        let rest = &attrs[pos + 1..];
        let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
        let class = &rest[..end];
        if !class.is_empty() {
            return Some(class.to_owned());
        }
    }
    None
}

fn parse_id_from_attrs(attrs: &str) -> Option<String> {
    // Find "#word" in attrs string
    if let Some(pos) = attrs.find('#') {
        let rest = &attrs[pos + 1..];
        let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
        let id = &rest[..end];
        if !id.is_empty() {
            return Some(id.to_owned());
        }
    }
    None
}

// ─── Export: DocumentJSON → Pandoc Markdown ───────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };

    let nodes = build_hir_from_doc(&doc, registry());

    // Collect metadata blocks for YAML front matter
    let mut metadata_blocks: Vec<(String, String)> = Vec::new();
    for node in &nodes {
        if let HirNode::Block { name, attrs, .. } = node {
            if name == "Meta" {
                let key = attrs
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_owned();
                let value = attrs
                    .get("value")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_owned();
                if !key.is_empty() {
                    metadata_blocks.push((key, value));
                }
            }
        }
    }

    let mut lines: Vec<String> = Vec::new();

    // Emit YAML front matter if any metadata
    if !metadata_blocks.is_empty() {
        lines.push("---\n".to_owned());
        for (k, v) in &metadata_blocks {
            lines.push(format!("{}: {}\n", k, v));
        }
        lines.push("---\n\n".to_owned());
    }

    let ctx = PandocCtx {
        list_type: None,
        ordered_index: 1,
        in_blockquote: false,
    };
    walk_pandoc_nodes(&nodes, &mut lines, &ctx);

    let result = lines.join("");
    if result.ends_with('\n') {
        result[..result.len() - 1].to_owned()
    } else {
        result
    }
}

struct PandocCtx {
    list_type: Option<String>,
    ordered_index: u64,
    in_blockquote: bool,
}

fn walk_pandoc_nodes(nodes: &[HirNode], lines: &mut Vec<String>, ctx: &PandocCtx) {
    let mut ordered_idx = ctx.ordered_index;
    for node in nodes {
        match node {
            HirNode::Block {
                name,
                attrs,
                children,
            } => {
                walk_pandoc_block(name, attrs, children, lines, ctx, &mut ordered_idx);
            }
            HirNode::Container { name, children, .. } => {
                walk_pandoc_container(name, children, lines, ctx, &mut ordered_idx);
            }
            HirNode::Text { content, marks } => {
                lines.push(render_pandoc_inline_with_marks(content, marks));
            }
        }
    }
}

fn walk_pandoc_container(
    name: &str,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &PandocCtx,
    ordered_idx: &mut u64,
) {
    let child_ctx = match name {
        "ul" => PandocCtx {
            list_type: Some("bullet".into()),
            ordered_index: 1,
            in_blockquote: ctx.in_blockquote,
        },
        "ol" => PandocCtx {
            list_type: Some("ordered".into()),
            ordered_index: 1,
            in_blockquote: ctx.in_blockquote,
        },
        "blockquote" => PandocCtx {
            list_type: ctx.list_type.clone(),
            ordered_index: ctx.ordered_index,
            in_blockquote: true,
        },
        "ordered-list-item" => PandocCtx {
            list_type: ctx.list_type.clone(),
            ordered_index: *ordered_idx,
            in_blockquote: ctx.in_blockquote,
        },
        _ => PandocCtx {
            list_type: ctx.list_type.clone(),
            ordered_index: ctx.ordered_index,
            in_blockquote: ctx.in_blockquote,
        },
    };
    walk_pandoc_nodes(children, lines, &child_ctx);
    if name == "ordered-list-item" {
        *ordered_idx += 1;
    }
}

fn walk_pandoc_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &PandocCtx,
    ordered_idx: &mut u64,
) {
    match name {
        "Meta" => {
            // Rendered as YAML front matter — skip here
        }
        "BlockQuote" | "BulletList" | "OrderedList" | "list-item-marker" => {
            // Structural markers — no output
        }
        "Para" => {
            let inner = render_pandoc_inline_children(children);
            if ctx.in_blockquote {
                lines.push(format!("> {}\n", inner));
            } else {
                lines.push(format!("{}\n\n", inner));
            }
        }
        "Header" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            let id = attrs.get("id").and_then(|v| v.as_str());
            let inner = render_pandoc_inline_children(children);
            let prefix = "#".repeat(level.min(6) as usize) + " ";
            let suffix = if let Some(id_val) = id {
                format!(" {{#{}}}", id_val)
            } else {
                String::new()
            };
            lines.push(format!("{}{}{}\n\n", prefix, inner, suffix));
        }
        "CodeBlock" => {
            let lang = attrs.get("language").and_then(|v| v.as_str());
            let id = attrs.get("id").and_then(|v| v.as_str());
            let code: String = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Text { content, .. } = c {
                        Some(content.as_str())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("");
            let mut fence = "```".to_owned();
            if let Some(l) = lang {
                if !l.is_empty() {
                    fence.push_str(l);
                }
            }
            if let Some(id_val) = id {
                if !id_val.is_empty() {
                    fence.push_str(&format!(" {{#{}}}", id_val));
                }
            }
            let code_body = if code.ends_with('\n') {
                &code[..code.len() - 1]
            } else {
                code.as_str()
            };
            lines.push(format!("{}\n{}\n```\n\n", fence, code_body));
        }
        "list-item-text" => {
            let inner = render_pandoc_inline_children(children);
            if ctx.list_type.as_deref() == Some("ordered") {
                lines.push(format!("{}. {}\n", ordered_idx, inner));
                *ordered_idx += 1;
            } else {
                lines.push(format!("- {}\n", inner));
            }
        }
        "HorizontalRule" => {
            lines.push("---\n\n".to_owned());
        }
        "Div" => {
            let cls = attrs.get("class").and_then(|v| v.as_str());
            let header = if let Some(c) = cls {
                format!("::: {}", c)
            } else {
                ":::".to_owned()
            };
            lines.push(format!("{}\n", header));
            walk_pandoc_nodes(children, lines, ctx);
            lines.push(":::\n\n".to_owned());
        }
        "footnote-def" => {
            let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let inner = render_pandoc_inline_children(children);
            if !key.is_empty() {
                lines.push(format!("\n[^{}]: {}\n", key, inner));
            }
        }
        _ => {
            // Fallback
            let inner = render_pandoc_inline_children(children);
            lines.push(format!("{}\n\n", inner));
        }
    }
}

fn render_pandoc_inline_children(children: &[HirNode]) -> String {
    let mut out = String::new();
    for child in children {
        match child {
            HirNode::Text { content, marks } => {
                out.push_str(&render_pandoc_inline_with_marks(content, marks));
            }
            HirNode::Block {
                children: sub_children,
                ..
            } => {
                out.push_str(&render_pandoc_inline_children(sub_children));
            }
            _ => {}
        }
    }
    out
}

fn render_pandoc_inline_with_marks(content: &str, marks: &[MarkApplication]) -> String {
    if marks.is_empty() {
        return content.to_owned();
    }
    let outer = &marks[0];
    let inner = render_pandoc_inline_with_marks(content, &marks[1..]);
    match outer.kind.as_str() {
        "org.pandoc.facet#Strong" | "org.commonmark.facet#strong" => format!("**{}**", inner),
        "org.pandoc.facet#Emph" | "org.commonmark.facet#emphasis" => format!("*{}*", inner),
        "org.pandoc.facet#Strikeout" | "org.commonmark.facet#strikethrough" => {
            format!("~~{}~~", inner)
        }
        "org.pandoc.facet#Superscript" | "org.commonmark.facet#superscript" => {
            format!("^{}^", inner)
        }
        "org.pandoc.facet#Subscript" | "org.commonmark.facet#subscript" => format!("~{}~", inner),
        "org.pandoc.facet#Code" | "org.commonmark.facet#code-span" => format!("`{}`", inner),
        "org.pandoc.facet#Span" => {
            let cls = outer.attrs.get("class").and_then(|v| v.as_str());
            let id = outer.attrs.get("id").and_then(|v| v.as_str());
            let mut parts: Vec<String> = Vec::new();
            if let Some(c) = cls {
                parts.push(format!(".{}", c));
            }
            if let Some(d) = id {
                parts.push(format!("#{}", d));
            }
            if !parts.is_empty() {
                format!("[{}]{{{}}}", inner, parts.join(" "))
            } else {
                inner
            }
        }
        "org.pandoc.facet#Link" | "org.commonmark.facet#link" => {
            let uri = outer
                .attrs
                .get("uri")
                .and_then(|v| v.as_str())
                .or_else(|| outer.attrs.get("url").and_then(|v| v.as_str()))
                .unwrap_or("");
            format!("[{}]({})", inner, uri)
        }
        "org.pandoc.facet#Image" | "org.commonmark.facet#image" => {
            let src = outer
                .attrs
                .get("src")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let alt = outer
                .attrs
                .get("alt")
                .and_then(|v| v.as_str())
                .unwrap_or(inner.as_str());
            format!("![{}]({})", alt, src)
        }
        "org.pandoc.facet#Note" => {
            let key = outer
                .attrs
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[^{}]", key)
        }
        "org.pandoc.facet#LineBreak" | "org.commonmark.facet#line-break" => "  \n".to_owned(),
        _ => inner,
    }
}
