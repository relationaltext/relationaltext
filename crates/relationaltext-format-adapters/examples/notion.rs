//! Notion API blocks adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.notion.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — Notion JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Notion facets) → raw Notion JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.notion.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.notion/notion.lexicon.json");

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

// ─── Import: Notion JSON → DocumentJSON ──────────────────────────────────────

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
    // Handle double-stringified input: unwrap if raw is a JSON string value
    let effective_input = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::String(s)) => s,
        _ => raw.to_string(),
    };
    let raw = effective_input.as_str();
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let notion_str = outer["text"].as_str().unwrap_or(raw);
    let blocks: Value = serde_json::from_str(notion_str).unwrap_or(Value::Null);
    let empty = Vec::new();
    let blocks_arr = blocks.as_array().unwrap_or(&empty);

    let mut state = ImportState::new();
    for block in blocks_arr {
        process_block(block, &mut state);
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
        feature["attrs"] = a;
    }
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

fn process_block(block: &Value, state: &mut ImportState) {
    let block_type = block["type"].as_str().unwrap_or("");
    // Access block data: block[block.type].rich_text
    let data = &block[block_type];
    let empty = Vec::new();
    let rich_text = data["rich_text"].as_array().unwrap_or(&empty);

    match block_type {
        "paragraph" | "callout" => {
            state.prev_list_type = None;
            open_block(state, "paragraph", vec![], None);
            walk_rich_text(rich_text, state);
        }
        "heading_1" => {
            state.prev_list_type = None;
            open_block(state, "heading_1", vec![], None);
            walk_rich_text(rich_text, state);
        }
        "heading_2" => {
            state.prev_list_type = None;
            open_block(state, "heading_2", vec![], None);
            walk_rich_text(rich_text, state);
        }
        "heading_3" => {
            state.prev_list_type = None;
            open_block(state, "heading_3", vec![], None);
            walk_rich_text(rich_text, state);
        }
        "bulleted_list_item" => {
            if state.prev_list_type.as_deref() != Some("bullet") {
                open_block(state, "bullet-list-marker", vec![], None);
            }
            open_block(state, "list-item-marker", vec!["ul".to_owned()], None);
            open_block(
                state,
                "list-item-text",
                vec!["ul".to_owned(), "unordered-list-item".to_owned()],
                None,
            );
            walk_rich_text(rich_text, state);
            state.prev_list_type = Some("bullet".to_owned());
        }
        "numbered_list_item" => {
            if state.prev_list_type.as_deref() != Some("ordered") {
                open_block(state, "ordered-list-marker", vec![], None);
            }
            open_block(state, "list-item-marker", vec!["ol".to_owned()], None);
            open_block(
                state,
                "list-item-text",
                vec!["ol".to_owned(), "ordered-list-item".to_owned()],
                None,
            );
            walk_rich_text(rich_text, state);
            state.prev_list_type = Some("ordered".to_owned());
        }
        "quote" => {
            state.prev_list_type = None;
            open_block(state, "blockquote-marker", vec![], None);
            open_block(state, "paragraph", vec!["blockquote".to_owned()], None);
            walk_rich_text(rich_text, state);
        }
        "code" => {
            state.prev_list_type = None;
            let language = data["language"].as_str();
            let attrs = language.map(|l| json!({ "language": l }));
            open_block(state, "code-block", vec![], attrs);
            // Concatenate text from rich_text elements + trailing \n
            let mut code = String::new();
            for rt in rich_text {
                let content = rt["text"]["content"]
                    .as_str()
                    .or_else(|| rt["plain_text"].as_str())
                    .unwrap_or("");
                code.push_str(content);
            }
            code.push('\n');
            state.text.push_str(&code);
        }
        "divider" => {
            state.prev_list_type = None;
            open_block(state, "divider", vec![], None);
        }
        _ => {
            // Unknown block type: skip
        }
    }
}

fn walk_rich_text(rich_text: &[Value], state: &mut ImportState) {
    for rt in rich_text {
        if rt["type"].as_str() != Some("text") {
            continue;
        }
        let content = rt["text"]["content"]
            .as_str()
            .or_else(|| rt["plain_text"].as_str())
            .unwrap_or("");
        let link_url = rt["href"]
            .as_str()
            .or_else(|| rt["text"]["link"]["url"].as_str());
        if content.is_empty() {
            continue;
        }

        let start = state.text.len();
        state.text.push_str(content);
        let end = state.text.len();

        let ann = &rt["annotations"];
        let mut features: Vec<Value> = Vec::new();

        if ann["bold"].as_bool().unwrap_or(false) {
            features.push(json!({ "$type": TYPE_ID, "name": "bold" }));
        }
        if ann["italic"].as_bool().unwrap_or(false) {
            features.push(json!({ "$type": TYPE_ID, "name": "italic" }));
        }
        if ann["underline"].as_bool().unwrap_or(false) {
            features.push(json!({ "$type": TYPE_ID, "name": "underline" }));
        }
        if ann["strikethrough"].as_bool().unwrap_or(false) {
            features.push(json!({ "$type": TYPE_ID, "name": "strikethrough" }));
        }
        if ann["code"].as_bool().unwrap_or(false) {
            features.push(json!({ "$type": TYPE_ID, "name": "code" }));
        }
        if let Some(url) = link_url {
            features.push(json!({ "$type": TYPE_ID, "name": "link", "url": url }));
        }

        if !features.is_empty() {
            state.facets.push(json!({
                "index": { "byteStart": start, "byteEnd": end },
                "features": features,
            }));
        }
    }
}

// ─── Export: DocumentJSON → Notion JSON ──────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return "[]".to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let mut blocks: Vec<Value> = Vec::new();
    for node in &nodes {
        blocks.extend(walk_hir_node(node));
    }
    serde_json::to_string(&blocks).unwrap_or_else(|_| "[]".to_string())
}

fn walk_hir_node(node: &HirNode) -> Vec<Value> {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            if let Some(b) = block_to_notion(name, attrs, children) {
                vec![b]
            } else {
                vec![]
            }
        }
        HirNode::Container { name, children, .. } => container_to_notion(name, children),
        HirNode::Text { .. } => vec![],
    }
}

fn container_to_notion(name: &str, children: &[HirNode]) -> Vec<Value> {
    let mut blocks = Vec::new();
    match name {
        "ul" => {
            for child in children {
                if let HirNode::Container {
                    name: cn,
                    children: gc,
                    ..
                } = child
                {
                    if cn == "unordered-list-item" {
                        blocks.extend(list_item_to_notion(gc, "bulleted_list_item"));
                    }
                }
            }
        }
        "ol" | _ if name.starts_with("ol:") => {
            for child in children {
                if let HirNode::Container {
                    name: cn,
                    children: gc,
                    ..
                } = child
                {
                    if cn == "ordered-list-item" {
                        blocks.extend(list_item_to_notion(gc, "numbered_list_item"));
                    }
                }
            }
        }
        "blockquote" => {
            for child in children {
                match child {
                    HirNode::Block {
                        name: bn,
                        children: bc,
                        ..
                    } if bn == "paragraph" => {
                        let rich_text = inlines_to_rich_text(bc);
                        blocks
                            .push(json!({ "type": "quote", "quote": { "rich_text": rich_text } }));
                    }
                    HirNode::Block { name: bn, .. } if is_marker(bn) => {}
                    _ => blocks.extend(walk_hir_node(child)),
                }
            }
        }
        "unordered-list-item" => blocks.extend(list_item_to_notion(children, "bulleted_list_item")),
        "ordered-list-item" => blocks.extend(list_item_to_notion(children, "numbered_list_item")),
        _ => {
            for child in children {
                blocks.extend(walk_hir_node(child));
            }
        }
    }
    blocks
}

fn list_item_to_notion(children: &[HirNode], notion_type: &str) -> Vec<Value> {
    let mut blocks = Vec::new();
    for child in children {
        match child {
            HirNode::Block {
                name, children: bc, ..
            } if is_marker(name) => {}
            HirNode::Block {
                name, children: bc, ..
            } if name == "list-item-text" || name == "paragraph" => {
                let rich_text = inlines_to_rich_text(bc);
                let block_data = json!({ "rich_text": rich_text });
                blocks.push(json!({ "type": notion_type, notion_type: block_data }));
            }
            HirNode::Container { .. } => blocks.extend(container_to_notion(
                match child {
                    HirNode::Container { name, .. } => name,
                    _ => "",
                },
                match child {
                    HirNode::Container { children, .. } => children,
                    _ => &[],
                },
            )),
            _ => {}
        }
    }
    blocks
}

fn block_to_notion(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    if is_marker(name) {
        return None;
    }
    match name {
        "paragraph" => {
            let rich_text = inlines_to_rich_text(children);
            Some(json!({ "type": "paragraph", "paragraph": { "rich_text": rich_text } }))
        }
        "heading_1" | "heading_2" | "heading_3" => {
            let rich_text = inlines_to_rich_text(children);
            Some(json!({ "type": name, name: { "rich_text": rich_text } }))
        }
        "code-block" => {
            let code_text: String = children
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
            let language = attrs
                .get("language")
                .and_then(|v| v.as_str())
                .unwrap_or("plain text");
            let rt = json!([{
                "type": "text",
                "text": { "content": code_text, "link": null },
                "annotations": { "bold": false, "italic": false, "strikethrough": false, "underline": false, "code": false, "color": "default" },
                "plain_text": code_text,
                "href": null
            }]);
            Some(json!({ "type": "code", "code": { "rich_text": rt, "language": language } }))
        }
        "divider" => Some(json!({ "type": "divider", "divider": {} })),
        _ => {
            let rich_text = inlines_to_rich_text(children);
            Some(json!({ "type": "paragraph", "paragraph": { "rich_text": rich_text } }))
        }
    }
}

fn inlines_to_rich_text(children: &[HirNode]) -> Vec<Value> {
    let mut result = Vec::new();
    for child in children {
        if let HirNode::Text { content, marks } = child {
            if content.is_empty() {
                continue;
            }
            let mut bold = false;
            let mut italic = false;
            let mut underline = false;
            let mut strikethrough = false;
            let mut code = false;
            let mut link_url: Option<String> = None;

            for mark in marks {
                match mark.kind.as_str() {
                    "com.notion.facet#bold" => bold = true,
                    "com.notion.facet#italic" => italic = true,
                    "com.notion.facet#underline" => underline = true,
                    "com.notion.facet#strikethrough" => strikethrough = true,
                    "com.notion.facet#code" => code = true,
                    "com.notion.facet#link" => {
                        link_url = mark
                            .attrs
                            .get("url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_owned());
                    }
                    _ => {}
                }
            }

            let link_val = if let Some(ref url) = link_url {
                json!({ "url": url })
            } else {
                Value::Null
            };
            result.push(json!({
                "type": "text",
                "text": { "content": content, "link": link_val },
                "annotations": {
                    "bold": bold, "italic": italic, "underline": underline,
                    "strikethrough": strikethrough, "code": code, "color": "default"
                },
                "plain_text": content,
                "href": link_url,
            }));
        }
    }
    result
}

fn is_marker(name: &str) -> bool {
    matches!(
        name,
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker"
    )
}
