//! OPML (Outline Processor Markup Language) format adapter.
//!
//! Format namespace: `org.opml.facet`
//!
//! OPML is an XML-based outline format used for feed subscription lists and
//! hierarchical note-taking tools (Workflowy, OmniOutliner, etc.).
//!
//! Each `<outline>` element becomes a block in the document model.
//! Nesting is represented via the `parents` array on each block feature.
//!
//! Recognised block types:
//!   `outline` — generic outline item
//!   `feed`    — RSS/Atom feed entry (type="rss" or type="atom")
//!
//! Block attrs stored:
//!   text, title, type, xmlUrl, htmlUrl, note (_note in XML)
//!
//! WASM exports:
//!   import_opml(ptr, len) -> ptr   — OPML XML string → DocumentJSON
//!   export_opml(ptr, len) -> ptr   — DocumentJSON (OPML facets) → OPML XML string

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.opml.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.opml/opml.lexicon.json");

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
pub extern "C" fn import_opml(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_opml(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── OPML outline data model ─────────────────────────────────────────────────

/// A parsed OPML `<outline>` element.
#[derive(Debug)]
struct OPMLOutline {
    text: String,
    title: Option<String>,
    outline_type: Option<String>, // the `type` XML attribute
    xml_url: Option<String>,
    html_url: Option<String>,
    note: Option<String>, // from _note attribute
    children: Vec<OPMLOutline>,
}

// ─── XML attribute parser ─────────────────────────────────────────────────────

/// Extract all `key="value"` or `key='value'` pairs from an XML attribute string.
fn parse_attrs(attr_str: &str) -> Vec<(String, String)> {
    let mut attrs = Vec::new();
    let bytes = attr_str.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        // Skip whitespace
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Read attribute name: word chars including `:`, `.`, `-`, `_`
        let name_start = i;
        while i < len
            && (bytes[i].is_ascii_alphanumeric() || matches!(bytes[i], b':' | b'.' | b'-' | b'_'))
        {
            i += 1;
        }
        if i == name_start {
            i += 1;
            continue;
        } // skip unexpected char
        let name: String = attr_str[name_start..i].to_owned();

        // Skip whitespace
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Expect `=`
        if bytes[i] != b'=' {
            continue;
        }
        i += 1;

        // Skip whitespace
        while i < len && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= len {
            break;
        }

        // Read quoted value
        let quote = bytes[i];
        if quote != b'"' && quote != b'\'' {
            i += 1;
            continue;
        }
        i += 1;
        let val_start = i;
        while i < len && bytes[i] != quote {
            i += 1;
        }
        let value = xml_unescape(&attr_str[val_start..i]);
        if i < len {
            i += 1;
        } // consume closing quote

        attrs.push((name, value));
    }

    attrs
}

/// Get a specific attribute value from a parsed attribute list.
fn get_attr<'a>(attrs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
}

/// Unescape XML entities: `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`.
fn xml_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp + 1..];
        if rest.starts_with("amp;") {
            out.push('&');
            rest = &rest[4..];
        } else if rest.starts_with("lt;") {
            out.push('<');
            rest = &rest[3..];
        } else if rest.starts_with("gt;") {
            out.push('>');
            rest = &rest[3..];
        } else if rest.starts_with("quot;") {
            out.push('"');
            rest = &rest[5..];
        } else if rest.starts_with("apos;") {
            out.push('\'');
            rest = &rest[5..];
        } else {
            out.push('&');
        }
    }
    out.push_str(rest);
    out
}

/// Escape special XML characters for use in attribute values.
fn xml_escape_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

// ─── Recursive OPML XML parser ────────────────────────────────────────────────

/// Token produced by the tokenizer.
#[derive(Debug)]
enum Token {
    SelfClose { attrs: Vec<(String, String)> },
    Open { attrs: Vec<(String, String)> },
    Close,
}

/// Tokenize `<outline .../>`, `<outline ...>`, and `</outline>` from `xml`.
fn tokenize_outlines(xml: &str) -> Vec<(usize, Token)> {
    let mut tokens: Vec<(usize, Token)> = Vec::new();
    let bytes = xml.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if bytes[i] != b'<' {
            i += 1;
            continue;
        }

        // Check for close tag </outline
        if i + 9 <= len && &xml[i..i + 10].to_lowercase() == "</outline>" {
            tokens.push((i, Token::Close));
            i += 10;
            continue;
        }
        if i + 8 <= len && xml[i..i + 8].to_lowercase().starts_with("<outline") {
            // Find the end of this tag
            let tag_start = i;
            let mut j = i + 8;
            let mut in_quote: Option<u8> = None;
            while j < len {
                let b = bytes[j];
                if let Some(q) = in_quote {
                    if b == q {
                        in_quote = None;
                    }
                } else if b == b'"' {
                    in_quote = Some(b'"');
                } else if b == b'\'' {
                    in_quote = Some(b'\'');
                } else if b == b'>' {
                    break;
                }
                j += 1;
            }
            // j now points at '>'
            let tag_inner = &xml[tag_start + 8..j]; // between "<outline" and ">"
            let is_self_close = tag_inner.trim_end().ends_with('/');
            let attr_str = if is_self_close {
                let trimmed = tag_inner.trim_end();
                &trimmed[..trimmed.len() - 1]
            } else {
                tag_inner
            };
            let attrs = parse_attrs(attr_str);
            if is_self_close {
                tokens.push((tag_start, Token::SelfClose { attrs }));
            } else {
                tokens.push((tag_start, Token::Open { attrs }));
            }
            i = j + 1;
            continue;
        }

        i += 1;
    }

    tokens
}

/// Build an `OPMLOutline` from attrs.
fn outline_from_attrs(attrs: &[(String, String)]) -> OPMLOutline {
    OPMLOutline {
        text: get_attr(attrs, "text").unwrap_or("").to_owned(),
        title: get_attr(attrs, "title").map(str::to_owned),
        outline_type: get_attr(attrs, "type").map(str::to_owned),
        xml_url: get_attr(attrs, "xmlUrl").map(str::to_owned),
        html_url: get_attr(attrs, "htmlUrl").map(str::to_owned),
        note: get_attr(attrs, "_note").map(str::to_owned),
        children: Vec::new(),
    }
}

/// Recursively parse a sequence of tokens starting at `pos` into outline elements.
/// Stops when it runs out of tokens or encounters a depth-decreasing Close.
/// Returns (outlines, next_token_index).
fn parse_outline_tokens(
    tokens: &[(usize, Token)],
    pos: usize,
    depth: usize,
) -> (Vec<OPMLOutline>, usize) {
    let mut outlines: Vec<OPMLOutline> = Vec::new();
    let mut i = pos;

    while i < tokens.len() {
        match &tokens[i].1 {
            Token::SelfClose { attrs } => {
                outlines.push(outline_from_attrs(attrs));
                i += 1;
            }
            Token::Open { attrs } => {
                let mut outline = outline_from_attrs(attrs);
                i += 1;
                let (children, next_i) = parse_outline_tokens(tokens, i, depth + 1);
                outline.children = children;
                outlines.push(outline);
                i = next_i;
                // Consume the matching Close token if present
                if i < tokens.len() {
                    if let Token::Close = &tokens[i].1 {
                        i += 1;
                    }
                }
            }
            Token::Close => {
                // End of this level — caller will consume this token
                break;
            }
        }
    }

    (outlines, i)
}

/// Parse a full OPML XML string. Returns (title, outlines).
fn parse_opml_xml(xml: &str) -> (Option<String>, Vec<OPMLOutline>) {
    // Extract <title> from <head>
    let title = {
        let lower = xml.to_lowercase();
        let title_start = lower
            .find("<title")
            .and_then(|pos| xml[pos..].find('>').map(|off| pos + off + 1));
        let title_end = lower.find("</title>");
        match (title_start, title_end) {
            (Some(s), Some(e)) if s <= e => {
                let raw = xml[s..e].trim();
                if raw.is_empty() {
                    None
                } else {
                    Some(xml_unescape(raw))
                }
            }
            _ => None,
        }
    };

    // Find <body> content
    let lower_xml = xml.to_lowercase();
    let body_content: &str = {
        let body_open = lower_xml
            .find("<body")
            .and_then(|pos| xml[pos..].find('>').map(|off| pos + off + 1));
        let body_close = lower_xml.find("</body>");
        match (body_open, body_close) {
            (Some(s), Some(e)) if s <= e => &xml[s..e],
            _ => xml,
        }
    };

    let tokens = tokenize_outlines(body_content);
    let (outlines, _) = parse_outline_tokens(&tokens, 0, 0);

    (title, outlines)
}

// ─── Import: OPML XML → DocumentJSON ─────────────────────────────────────────

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

fn open_block(state: &mut ImportState, name: &str, parents: &[String], attrs: Value) {
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
    if attrs.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        feature["attrs"] = attrs;
    }
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

/// Recursively walk parsed outlines, emitting blocks into `state`.
fn walk_outlines(
    outlines: &[OPMLOutline],
    state: &mut ImportState,
    depth: usize,
    parents: &[String],
) {
    for outline in outlines {
        // Build block attrs
        let mut block_attrs = json!({});
        if !outline.text.is_empty() {
            block_attrs["text"] = Value::String(outline.text.clone());
        }
        if let Some(ref t) = outline.title {
            block_attrs["title"] = Value::String(t.clone());
        }
        if let Some(ref t) = outline.outline_type {
            block_attrs["type"] = Value::String(t.clone());
        }
        if let Some(ref u) = outline.xml_url {
            block_attrs["xmlUrl"] = Value::String(u.clone());
        }
        if let Some(ref u) = outline.html_url {
            block_attrs["htmlUrl"] = Value::String(u.clone());
        }
        if let Some(ref n) = outline.note {
            block_attrs["note"] = Value::String(n.clone());
        }

        // Determine block type: feed for RSS/Atom, outline otherwise
        let block_name = match outline.outline_type.as_deref() {
            Some("rss") | Some("atom") => "feed",
            _ => "outline",
        };

        open_block(state, block_name, parents, block_attrs);

        // The outline text IS the block content
        state.text.push_str(&outline.text);

        // Recurse into children
        if !outline.children.is_empty() {
            let mut child_parents = parents.to_vec();
            child_parents.push(format!("outline-{}", depth));
            walk_outlines(&outline.children, state, depth + 1, &child_parents);
        }
    }
}

fn do_import(raw: &str) -> String {
    // Handle double-stringified input: unwrap if raw is a JSON string value
    let effective_input = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::String(s)) => s,
        _ => raw.to_string(),
    };
    let raw = effective_input.as_str();
    // Input may be a DocumentJSON wrapper with "text" containing OPML, or raw OPML XML.
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let xml_str = outer["text"].as_str().unwrap_or(raw);

    let (_title, outlines) = parse_opml_xml(xml_str);

    if outlines.is_empty() {
        // Return empty document
        return json!({ "text": "", "facets": [] }).to_string();
    }

    let mut state = ImportState::new();
    walk_outlines(&outlines, &mut state, 0, &[]);

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export: DocumentJSON → OPML XML ─────────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return empty_opml(),
    };

    let nodes = build_hir_from_doc(&doc, registry());

    let body_lines = render_hir_nodes(&nodes, 0);
    let body_content = body_lines.join("\n");

    [
        r#"<?xml version="1.0" encoding="UTF-8"?>"#,
        r#"<opml version="2.0">"#,
        "  <head>",
        "    <title>Document</title>",
        "  </head>",
        "  <body>",
        &body_content,
        "  </body>",
        "</opml>",
    ]
    .join("\n")
}

fn empty_opml() -> String {
    [
        r#"<?xml version="1.0" encoding="UTF-8"?>"#,
        r#"<opml version="2.0">"#,
        "  <head>",
        "    <title>Document</title>",
        "  </head>",
        "  <body>",
        "  </body>",
        "</opml>",
    ]
    .join("\n")
}

/// Render a slice of HIR nodes at the given indentation depth.
/// Returns a list of `<outline ... />` lines.
fn render_hir_nodes(nodes: &[HirNode], depth: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for node in nodes {
        match node {
            HirNode::Block {
                name,
                attrs,
                children,
            } => {
                lines.extend(render_hir_block(name, attrs, children, depth));
            }
            HirNode::Container { children, .. } => {
                // Container nodes pass through — render children at same depth
                lines.extend(render_hir_nodes(children, depth));
            }
            HirNode::Text { .. } => {
                // Top-level text nodes: ignore (outline text is stored in block attrs)
            }
        }
    }
    lines
}

/// Render a single HIR block as an OPML `<outline>` element.
///
/// The indentation is `depth + 2` levels (2 extra for `<opml>` > `<body>`).
fn render_hir_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    depth: usize,
) -> Vec<String> {
    // Skip structural marker blocks that carry no OPML content
    match name {
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker" => {
            return vec![];
        }
        _ => {}
    }

    let indent = "  ".repeat(depth + 2);

    // Collect inline text content for fallback display text
    let text_content = collect_inline_text(children);

    // Prefer the stored `text` attr (which is authoritative for OPML);
    // fall back to the inline text content.
    let display_text = attrs
        .get("text")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&text_content);

    // Build attribute parts
    let mut attr_parts: Vec<String> = Vec::new();
    attr_parts.push(format!("text=\"{}\"", xml_escape_attr(display_text)));

    if let Some(t) = attrs.get("type").and_then(|v| v.as_str()) {
        attr_parts.push(format!("type=\"{}\"", xml_escape_attr(t)));
    } else if name == "feed" {
        // Synthesize type="rss" for feed blocks that lost their type attr
        attr_parts.push("type=\"rss\"".to_owned());
    }

    if let Some(title) = attrs.get("title").and_then(|v| v.as_str()) {
        if title != display_text {
            attr_parts.push(format!("title=\"{}\"", xml_escape_attr(title)));
        }
    }

    if let Some(xml_url) = attrs.get("xmlUrl").and_then(|v| v.as_str()) {
        attr_parts.push(format!("xmlUrl=\"{}\"", xml_escape_attr(xml_url)));
    }

    if let Some(html_url) = attrs.get("htmlUrl").and_then(|v| v.as_str()) {
        attr_parts.push(format!("htmlUrl=\"{}\"", xml_escape_attr(html_url)));
    }

    if let Some(note) = attrs.get("note").and_then(|v| v.as_str()) {
        attr_parts.push(format!("_note=\"{}\"", xml_escape_attr(note)));
    }

    let outline_tag = format!("{}<outline {}/>", indent, attr_parts.join(" "));

    // Collect child outline lines (child blocks become child <outline> elements)
    let child_lines = render_hir_nodes(children, depth + 1);
    if child_lines.is_empty() {
        vec![outline_tag]
    } else {
        // Emit as open+close pair to contain children
        let open_tag = format!("{}<outline {}>", indent, attr_parts.join(" "));
        let close_tag = format!("{}</outline>", indent);
        let mut result = vec![open_tag];
        result.extend(child_lines);
        result.push(close_tag);
        result
    }
}

/// Recursively collect all plain text content from HIR children.
fn collect_inline_text(children: &[HirNode]) -> String {
    let mut out = String::new();
    for node in children {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children: sub, .. } | HirNode::Container { children: sub, .. } => {
                out.push_str(&collect_inline_text(sub));
            }
        }
    }
    out
}
