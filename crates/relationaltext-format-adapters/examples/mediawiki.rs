//! MediaWiki markup format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.mediawiki.facet`
//! Inline: '''bold''', ''italic'', <code>inline code</code>
//! Entities: [[Page]], [[Page|Display]], [[File:...]], [url text], [url],
//!            {{Template|args}}, <ref>content</ref>, <br />
//! Block: paragraph, heading (== h2 == through ====== h6 ======),
//!        bullet-list-marker, ordered-list-marker, list-item-marker, list-item-text,
//!        blockquote-marker (from ": " indent), definition-term, definition-detail,
//!        horizontal-rule

use parse_wiki_text_2::{Configuration, Node};
use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.mediawiki.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.mediawiki/mediawiki.lexicon.json");

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
pub extern "C" fn import_mediawiki(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_mediawiki(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    prev_list_type: u8, // 0=none, 1=bullet, 2=ordered
    prev_list_level: usize,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            prev_list_type: 0,
            prev_list_level: 0,
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

#[allow(dead_code)]
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

#[allow(dead_code)]
fn push_two_marks(state: &mut ImportState, content: &str, name1: &str, name2: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    // Two separate facets at the same range (bold + italic)
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name1 }],
    }));
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name2 }],
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

/// Push an entity that uses a zero-width space (U+200B) as placeholder.
fn push_entity_zwsp(state: &mut ImportState, feature: Value) {
    // U+200B is 3 bytes in UTF-8: 0xE2 0x80 0x8B
    let s = state.text.len();
    state.text.push('\u{200B}');
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
}

// ─── Wiki parser configuration ──────────────────────────────────────────────

static WIKI_CONFIG: OnceLock<Configuration> = OnceLock::new();

fn wiki_config() -> &'static Configuration {
    WIKI_CONFIG.get_or_init(Configuration::default)
}

/// Collect plain text from AST nodes (for template names, param values, etc.)
fn collect_node_text(nodes: &[Node], _source: &str) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            Node::Text { value, .. } => out.push_str(value),
            Node::CharacterEntity { character, .. } => out.push(*character),
            _ => {}
        }
    }
    out
}

/// Extract citation data from child nodes of a <ref> tag.
/// If the ref contains a {{Cite web|...}} or {{Citation|...}} template,
/// return structured citation fields as a JSON object.
fn extract_citation(nodes: &[Node], source: &str) -> Option<Value> {
    for node in nodes {
        if let Node::Template { name, parameters, .. } = node {
            let tpl_name = collect_node_text(name, source).trim().to_lowercase();
            let is_citation = tpl_name == "cite web" || tpl_name == "citation"
                || tpl_name == "cite book" || tpl_name == "cite journal"
                || tpl_name == "cite news" || tpl_name == "cite magazine"
                || tpl_name == "cite video" || tpl_name == "cite av media";
            if !is_citation {
                continue;
            }
            let mut citation = json!({ "type": tpl_name });
            for param in parameters {
                if let Some(ref name_nodes) = param.name {
                    let key = collect_node_text(name_nodes, source).trim().to_lowercase();
                    let value = collect_node_text(&param.value, source).trim().to_owned();
                    if key.is_empty() || value.is_empty() {
                        continue;
                    }
                    citation[key.as_str()] = json!(value);
                }
            }
            return Some(citation);
        }
    }
    None
}

/// Bold/italic toggle tracking for the AST walker.
struct ToggleState {
    bold_open: bool,
    bold_start: usize,
    italic_open: bool,
    italic_start: usize,
}

impl ToggleState {
    fn new() -> Self {
        Self {
            bold_open: false,
            bold_start: 0,
            italic_open: false,
            italic_start: 0,
        }
    }
}

/// Recursive AST walker — replaces `walk_inline`.
fn walk_nodes(nodes: &[Node], state: &mut ImportState, source: &str, toggle: &mut ToggleState) {
    // Track whether we're inside <code> start/end tag pairs
    let mut in_code = false;
    let mut code_start: usize = 0;

    for node in nodes {
        match node {
            Node::Text { value, .. } => {
                state.text.push_str(value);
            }
            Node::CharacterEntity { character, .. } => {
                let mut buf = [0u8; 4];
                state.text.push_str(character.encode_utf8(&mut buf));
            }
            Node::Bold { .. } => {
                if toggle.bold_open {
                    // Close bold: emit facet from saved start to current position
                    let s = toggle.bold_start;
                    let e = state.text.len();
                    if s < e {
                        state.facets.push(json!({
                            "index": { "byteStart": s, "byteEnd": e },
                            "features": [{ "$type": TYPE_ID, "name": "bold" }],
                        }));
                    }
                    toggle.bold_open = false;
                } else {
                    toggle.bold_start = state.text.len();
                    toggle.bold_open = true;
                }
            }
            Node::Italic { .. } => {
                if toggle.italic_open {
                    let s = toggle.italic_start;
                    let e = state.text.len();
                    if s < e {
                        state.facets.push(json!({
                            "index": { "byteStart": s, "byteEnd": e },
                            "features": [{ "$type": TYPE_ID, "name": "italic" }],
                        }));
                    }
                    toggle.italic_open = false;
                } else {
                    toggle.italic_start = state.text.len();
                    toggle.italic_open = true;
                }
            }
            Node::BoldItalic { .. } => {
                // Toggle both bold and italic. Handle all four state combinations.
                let pos = state.text.len();
                if toggle.bold_open {
                    if pos > toggle.bold_start {
                        state.facets.push(json!({
                            "index": { "byteStart": toggle.bold_start, "byteEnd": pos },
                            "features": [{ "$type": TYPE_ID, "name": "bold" }],
                        }));
                    }
                    toggle.bold_open = false;
                } else {
                    toggle.bold_start = pos;
                    toggle.bold_open = true;
                }
                if toggle.italic_open {
                    if pos > toggle.italic_start {
                        state.facets.push(json!({
                            "index": { "byteStart": toggle.italic_start, "byteEnd": pos },
                            "features": [{ "$type": TYPE_ID, "name": "italic" }],
                        }));
                    }
                    toggle.italic_open = false;
                } else {
                    toggle.italic_start = pos;
                    toggle.italic_open = true;
                }
            }
            Node::Link { target, text, .. } => {
                if text.is_empty() {
                    // [[Page]] — display is the target itself
                    let feature =
                        json!({ "$type": TYPE_ID, "name": "wikilink", "page": target });
                    push_entity(state, target, feature);
                } else {
                    // [[Page|Display]] — walk display nodes
                    let s = state.text.len();
                    walk_nodes(text, state, source, toggle);
                    let e = state.text.len();
                    let display = &state.text[s..e].to_owned();
                    if s < e {
                        state.facets.push(json!({
                            "index": { "byteStart": s, "byteEnd": e },
                            "features": [{ "$type": TYPE_ID, "name": "wikilink",
                                "page": target, "display": display }],
                        }));
                    }
                }
            }
            Node::ExternalLink {
                start: ext_start,
                end: ext_end,
                ..
            } => {
                // Extract URL and display from source text
                let inner = &source[*ext_start + 1..*ext_end - 1];
                let uri_end = inner
                    .find(|c: char| c.is_ascii_whitespace())
                    .unwrap_or(inner.len());
                let uri = &inner[..uri_end];

                // Display text is everything after the first whitespace
                let display_part = inner[uri_end..].trim();
                if display_part.is_empty() {
                    // Bare [url]
                    push_entity(
                        state,
                        uri,
                        json!({ "$type": TYPE_ID, "name": "extlink", "uri": uri }),
                    );
                } else {
                    // [url display text]
                    push_entity(
                        state,
                        display_part,
                        json!({
                            "$type": TYPE_ID, "name": "extlink",
                            "uri": uri, "display": display_part
                        }),
                    );
                }
            }
            Node::Image {
                target,
                text: img_nodes,
                ..
            } => {
                // Strip namespace prefix (e.g. "File:" or "Image:") from target
                let src = target
                    .strip_prefix("File:")
                    .or_else(|| target.strip_prefix("file:"))
                    .or_else(|| target.strip_prefix("Image:"))
                    .or_else(|| target.strip_prefix("image:"))
                    .unwrap_or(target);
                // Collect all text from image nodes and split on | to get params
                let all_text = collect_node_text(img_nodes, source);
                let parts: Vec<&str> = all_text.split('|').collect();
                let known_params = [
                    "thumb",
                    "thumbnail",
                    "frame",
                    "frameless",
                    "border",
                    "left",
                    "right",
                    "center",
                    "none",
                    "baseline",
                    "sub",
                    "super",
                    "top",
                    "text-top",
                    "middle",
                    "bottom",
                    "text-bottom",
                    "upright",
                ];
                let mut caption: Option<String> = None;
                for part in &parts {
                    let trimmed = part.trim();
                    if !trimmed.is_empty()
                        && !known_params.contains(&trimmed.to_lowercase().as_str())
                        && !trimmed.ends_with("px")
                    {
                        caption = Some(trimmed.to_owned());
                    }
                }
                let feature = if let Some(cap) = caption {
                    json!({ "$type": TYPE_ID, "name": "image", "src": src, "caption": cap })
                } else {
                    json!({ "$type": TYPE_ID, "name": "image", "src": src })
                };
                push_entity_zwsp(state, feature);
            }
            Node::Template {
                name: name_nodes,
                parameters,
                start: tmpl_start,
                end: tmpl_end,
                ..
            } => {
                let template_name = collect_node_text(name_nodes, source).trim().to_owned();
                // Build args string for backward compatibility (everything after first |)
                let source_inner = &source[*tmpl_start + 2..*tmpl_end - 2];
                let args = if let Some(pipe) = source_inner.find('|') {
                    Some(&source_inner[pipe + 1..])
                } else {
                    None
                };
                // Build structured parameters array
                let mut params_json = Vec::new();
                for (i, param) in parameters.iter().enumerate() {
                    let value = collect_node_text(&param.value, source);
                    if let Some(ref name_nodes) = param.name {
                        let key = collect_node_text(name_nodes, source);
                        params_json.push(json!({ "key": key.trim(), "value": value.trim() }));
                    } else {
                        params_json.push(json!({ "index": i, "value": value.trim() }));
                    }
                }
                let mut feature = json!({
                    "$type": TYPE_ID, "name": "template",
                    "templateName": template_name
                });
                if let Some(a) = args {
                    feature["args"] = json!(a);
                }
                if !params_json.is_empty() {
                    feature["parameters"] = json!(params_json);
                }
                push_entity_zwsp(state, feature);
            }
            Node::Tag {
                name,
                nodes: tag_nodes,
                start: tag_start,
                end: tag_end,
                ..
            } => {
                let tag_name: &str = name;
                match tag_name {
                    "ref" => {
                        let content = collect_node_text(tag_nodes, source);
                        let tag_source = &source[*tag_start..*tag_end];
                        let mut feature = json!({
                            "$type": TYPE_ID, "name": "ref", "content": content
                        });
                        if let Some(name_val) = extract_attr(tag_source, "name") {
                            feature["refName"] = json!(name_val);
                        }
                        if let Some(group_val) = extract_attr(tag_source, "group") {
                            feature["refGroup"] = json!(group_val);
                        }
                        // Extract structured citation data from {{Cite web|...}} etc.
                        if let Some(citation) = extract_citation(tag_nodes, source) {
                            feature["citation"] = citation;
                        }
                        push_entity_zwsp(state, feature);
                    }
                    "nowiki" => {
                        // Emit content as plain text
                        let content = collect_node_text(tag_nodes, source);
                        state.text.push_str(&content);
                    }
                    _ => {
                        // Unknown extension tags — emit content as plain text
                        let content = collect_node_text(tag_nodes, source);
                        state.text.push_str(&content);
                    }
                }
            }
            Node::StartTag { name, .. } => {
                let tag_name: &str = name;
                match tag_name {
                    "br" => {
                        let s = state.text.len();
                        state.text.push('\n');
                        let e = state.text.len();
                        state.facets.push(json!({
                            "index": { "byteStart": s, "byteEnd": e },
                            "features": [{ "$type": TYPE_ID, "name": "line-break" }],
                        }));
                    }
                    "code" => {
                        in_code = true;
                        code_start = state.text.len();
                    }
                    _ => {
                        // Skip other start tags
                    }
                }
            }
            Node::EndTag { name, .. } => {
                let tag_name: &str = name;
                match tag_name {
                    "code" if in_code => {
                        let s = code_start;
                        let e = state.text.len();
                        if s < e {
                            state.facets.push(json!({
                                "index": { "byteStart": s, "byteEnd": e },
                                "features": [{ "$type": TYPE_ID, "name": "code" }],
                            }));
                        }
                        in_code = false;
                    }
                    _ => {
                        // Skip other end tags
                    }
                }
            }
            Node::Heading {
                level,
                nodes: h_nodes,
                ..
            } => {
                state.prev_list_type = 0;
                state.prev_list_level = 0;
                open_block_attrs(
                    state,
                    "heading",
                    &[],
                    json!({ "level": *level as usize }),
                );
                walk_nodes(h_nodes, state, source, toggle);
            }
            Node::UnorderedList { items, .. } => {
                if state.prev_list_type != 1 {
                    open_block(state, "bullet-list-marker", &[]);
                }
                for item in items {
                    let level = 1; // parse-wiki-text-2 nests lists for deeper levels
                    let (marker_parents, text_parents) =
                        list_parents("ul", "unordered-list-item", level);
                    open_block_attrs(
                        state,
                        "list-item-marker",
                        &slice_strs(&marker_parents),
                        json!({}),
                    );
                    open_block_attrs(
                        state,
                        "list-item-text",
                        &slice_strs(&text_parents),
                        json!({ "level": level }),
                    );
                    walk_nodes(&item.nodes, state, source, toggle);
                }
                state.prev_list_type = 1;
                state.prev_list_level = 1;
            }
            Node::OrderedList { items, .. } => {
                if state.prev_list_type != 2 {
                    open_block(state, "ordered-list-marker", &[]);
                }
                for item in items {
                    let level = 1;
                    let (marker_parents, text_parents) =
                        list_parents("ol", "ordered-list-item", level);
                    open_block_attrs(
                        state,
                        "list-item-marker",
                        &slice_strs(&marker_parents),
                        json!({}),
                    );
                    open_block_attrs(
                        state,
                        "list-item-text",
                        &slice_strs(&text_parents),
                        json!({ "level": level }),
                    );
                    walk_nodes(&item.nodes, state, source, toggle);
                }
                state.prev_list_type = 2;
                state.prev_list_level = 1;
            }
            Node::DefinitionList { items, .. } => {
                state.prev_list_type = 0;
                state.prev_list_level = 0;
                for item in items {
                    match item.type_ {
                        parse_wiki_text_2::DefinitionListItemType::Term => {
                            open_block(state, "definition-term", &[]);
                            walk_nodes(&item.nodes, state, source, toggle);
                        }
                        parse_wiki_text_2::DefinitionListItemType::Details => {
                            open_block(state, "blockquote-marker", &[]);
                            open_block(state, "paragraph", &["blockquote"]);
                            walk_nodes(&item.nodes, state, source, toggle);
                        }
                    }
                }
            }
            Node::HorizontalDivider { .. } => {
                state.prev_list_type = 0;
                state.prev_list_level = 0;
                open_block(state, "horizontal-rule", &[]);
            }
            Node::ParagraphBreak { .. } => {
                // Paragraph boundaries handled in do_import
            }
            Node::Preformatted {
                nodes: pre_nodes, ..
            } => {
                open_block(state, "preformatted", &[]);
                walk_nodes(pre_nodes, state, source, toggle);
            }
            Node::Table {
                captions,
                rows,
                ..
            } => {
                open_block(state, "table", &[]);
                for caption in captions {
                    open_block(state, "table-caption", &["table"]);
                    walk_nodes(&caption.content, state, source, toggle);
                }
                for row in rows {
                    open_block(state, "table-row", &["table"]);
                    for cell in &row.cells {
                        let cell_type = match cell.type_ {
                            parse_wiki_text_2::TableCellType::Heading => "table-heading",
                            parse_wiki_text_2::TableCellType::Ordinary => "table-cell",
                        };
                        open_block(state, cell_type, &["table", "table-row"]);
                        walk_nodes(&cell.content, state, source, toggle);
                    }
                }
            }
            Node::Category { target, .. } => {
                push_entity_zwsp(
                    state,
                    json!({ "$type": TYPE_ID, "name": "category", "target": target }),
                );
            }
            Node::Redirect { target, .. } => {
                state.text.push_str("#REDIRECT [[");
                state.text.push_str(target);
                state.text.push_str("]]");
            }
            Node::Parameter {
                name: param_name,
                default,
                ..
            } => {
                if let Some(def) = default {
                    walk_nodes(def, state, source, toggle);
                } else {
                    let name = collect_node_text(param_name, source);
                    state.text.push_str("{{{");
                    state.text.push_str(&name);
                    state.text.push_str("}}}");
                }
            }
            Node::Comment { .. } | Node::MagicWord { .. } => {
                // Skip
            }
        }
    }
}

/// Extract an XML attribute value from a tag string
fn extract_attr(tag_source: &str, attr_name: &str) -> Option<String> {
    // Look for attr_name="value" or attr_name='value'
    let search = format!("{}=", attr_name);
    if let Some(pos) = tag_source.find(&search) {
        let after = &tag_source[pos + search.len()..];
        let after = after.trim_start();
        if after.starts_with('"') {
            let content = &after[1..];
            if let Some(end) = content.find('"') {
                return Some(content[..end].to_owned());
            }
        } else if after.starts_with('\'') {
            let content = &after[1..];
            if let Some(end) = content.find('\'') {
                return Some(content[..end].to_owned());
            }
        }
    }
    None
}

/// Returns true if a node is a "block-level" node (heading, list, hr, etc.)
/// Also includes Comment and MagicWord to avoid wrapping them in empty paragraphs.
fn is_block_node(node: &Node) -> bool {
    matches!(
        node,
        Node::Heading { .. }
            | Node::UnorderedList { .. }
            | Node::OrderedList { .. }
            | Node::DefinitionList { .. }
            | Node::HorizontalDivider { .. }
            | Node::Preformatted { .. }
            | Node::Table { .. }
            | Node::ParagraphBreak { .. }
            | Node::Comment { .. }
            | Node::MagicWord { .. }
    )
}

/// Returns true if a node produces inline content (text, bold, etc.)
fn is_inline_node(node: &Node) -> bool {
    !is_block_node(node)
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
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

    // Parse with parse-wiki-text-2
    let output = match wiki_config().parse(&text) {
        Ok(output) => output,
        Err(_) => {
            // Timeout / parse error — return text as-is in a paragraph
            open_block(&mut state, "paragraph", &[]);
            state.text.push_str(&text);
            return json!({ "text": state.text, "facets": state.facets }).to_string();
        }
    };

    let mut toggle = ToggleState::new();

    // Walk top-level nodes, wrapping inline content in implicit paragraphs
    let nodes = &output.nodes;
    let mut i = 0;
    while i < nodes.len() {
        let node = &nodes[i];

        if is_block_node(node) {
            // Block nodes handle their own block opening
            walk_nodes(std::slice::from_ref(node), &mut state, &text, &mut toggle);
            i += 1;
        } else {
            // Collect consecutive inline nodes into a paragraph
            open_block(&mut state, "paragraph", &[]);
            let start = i;
            while i < nodes.len() && is_inline_node(&nodes[i]) {
                i += 1;
            }
            walk_nodes(&nodes[start..i], &mut state, &text, &mut toggle);
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Build (marker_parents, text_parents) for a list item at the given nesting level.
/// Level 1: marker_parents=["ul"], text_parents=["ul","unordered-list-item"]
/// Level 2: marker_parents=["ul","unordered-list-item"], text_parents=["ul","unordered-list-item","ul","unordered-list-item"]
fn list_parents(list_type: &str, item_type: &str, level: usize) -> (Vec<String>, Vec<String>) {
    let mut text_parents: Vec<String> = Vec::new();
    for _ in 0..level {
        text_parents.push(list_type.to_owned());
        text_parents.push(item_type.to_owned());
    }
    let marker_parents = if level <= 1 {
        vec![list_type.to_owned()]
    } else {
        text_parents[..text_parents.len() - 1].to_vec()
    };
    (marker_parents, text_parents)
}

fn slice_strs(v: &[String]) -> Vec<&str> {
    v.iter().map(|s| s.as_str()).collect()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "org.mediawiki.facet#bold" => format!("'''{}'''", content),
        "org.mediawiki.facet#italic" => format!("''{}''", content),
        "org.mediawiki.facet#code" => format!("<code>{}</code>", content),
        "org.mediawiki.facet#wikilink" => {
            let page = mark
                .attrs
                .get("page")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            let display = mark.attrs.get("display").and_then(|v| v.as_str());
            if let Some(d) = display {
                if d != page {
                    return format!("[[{}|{}]]", page, d);
                }
            }
            format!("[[{}]]", page)
        }
        "org.mediawiki.facet#extlink" => {
            let uri = mark.attrs.get("uri").and_then(|v| v.as_str()).unwrap_or("");
            let display = mark.attrs.get("display").and_then(|v| v.as_str());
            if let Some(d) = display {
                if d != uri {
                    return format!("[{} {}]", uri, d);
                }
            }
            format!("[{}]", uri)
        }
        "org.mediawiki.facet#template" => {
            let name = mark
                .attrs
                .get("templateName")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = mark.attrs.get("args").and_then(|v| v.as_str());
            if let Some(a) = args {
                format!("{{{{{}|{}}}}}", name, a)
            } else {
                format!("{{{{{}}}}}", name)
            }
        }
        "org.mediawiki.facet#line-break" => "<br />".to_owned(),
        "org.mediawiki.facet#image" => {
            let src = mark.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let caption = mark.attrs.get("caption").and_then(|v| v.as_str());
            if let Some(cap) = caption {
                format!("[[File:{}|thumb|{}]]", src, cap)
            } else {
                format!("[[File:{}]]", src)
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
                    out.push_str(": ");
                }
                out.push_str(&inner);
                out.push('\n');
            }
            "heading" => {
                let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(2) as usize;
                let level = level.max(2).min(6);
                let eq = "=".repeat(level);
                let inner = render_inline(children);
                out.push_str(&format!("{} {} {}\n", eq, inner, eq));
            }
            "list-item-text" => {
                let inner = render_inline(children);
                let level = attrs
                    .get("level")
                    .and_then(|v| v.as_u64())
                    .map(|l| l as usize)
                    .unwrap_or(ctx.list_level)
                    .max(1);
                let marker = if ctx.list_type == 2 {
                    "#".repeat(level)
                } else {
                    "*".repeat(level)
                };
                out.push_str(&format!("{} {}\n", marker, inner));
            }
            "horizontal-rule" => {
                out.push_str("----\n");
            }
            "definition-term" => {
                let inner = render_inline(children);
                out.push_str(&format!("; {}\n", inner));
            }
            "definition-detail" => {
                let inner = render_inline(children);
                out.push_str(&format!(": {}\n", inner));
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
                    ctx.list_type = 1;
                }
                "ol" => {
                    ctx.list_type = 2;
                }
                "blockquote" => {
                    ctx.in_blockquote = true;
                }
                "unordered-list-item" | "ordered-list-item" => {
                    ctx.list_level += 1;
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
