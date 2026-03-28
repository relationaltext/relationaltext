//! HTML WASM adapter for RelationalText.
//!
//! Exports:
//!   `import_html(ptr, len) → ptr`  — raw HTML string → DocumentJSON
//!   `export_html(ptr, len) → ptr`  — DocumentJSON → raw HTML string

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use html5ever::namespace_url;
use html5ever::tendril::TendrilSink;
use html5ever::{local_name, ns, parse_fragment, ParseOpts, QualName};
use markup5ever_rcdom::{Handle, NodeData, RcDom};
use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    lexicon::LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Map, Value};

const NS: &str = "org.w3c.html.facet";
const HTML_PREFIX: &str = "org.w3c.html.facet#";
const HTML_LEXICON: &[u8] =
    include_bytes!("../../../formats/org.w3c.html/whatwg-html.lexicon.json");

// ─── Lexicon-derived tag sets ─────────────────────────────────────────────────

struct HtmlSets {
    block_names: HashSet<String>,
    inline_tags: HashSet<String>,
    void_elements: HashSet<String>,
}

static HTML_SETS: OnceLock<HtmlSets> = OnceLock::new();
static REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();

fn sets() -> &'static HtmlSets {
    HTML_SETS.get_or_init(|| {
        let lexicon: Value = serde_json::from_slice(HTML_LEXICON).unwrap();
        let features = lexicon["features"].as_array().unwrap();
        let prefix = format!("{}#", NS);
        let mut block_names = HashSet::new();
        let mut inline_tags = HashSet::new();
        let mut void_elements = HashSet::new();
        for f in features {
            let type_id = f["typeId"].as_str().unwrap_or("");
            let tag = type_id.strip_prefix(&prefix).unwrap_or(type_id).to_string();
            match f["featureClass"].as_str().unwrap_or("") {
                "block" => {
                    block_names.insert(tag.clone());
                }
                "inline" | "entity" => {
                    inline_tags.insert(tag.clone());
                }
                _ => {}
            }
            if f["void"].as_bool().unwrap_or(false) {
                void_elements.insert(tag);
            }
        }
        HtmlSets {
            block_names,
            inline_tags,
            void_elements,
        }
    })
}

fn registry() -> &'static LexiconRegistry {
    REGISTRY.get_or_init(|| {
        let lexicon: Value = serde_json::from_slice(HTML_LEXICON).unwrap_or(Value::Null);
        let empty = Vec::new();
        let features = lexicon["features"].as_array().unwrap_or(&empty).to_vec();
        let mut r = LexiconRegistry::new();
        let _ = r.register_from_json_array(&features);
        r
    })
}

// ─── Import ───────────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    parents: Vec<String>,
    seq: u32,
}

impl ImportState {
    fn new() -> Self {
        ImportState {
            text: String::new(),
            facets: Vec::new(),
            parents: Vec::new(),
            seq: 0,
        }
    }

    /// UTF-8 byte length of accumulated text (Rust String::len() is byte count).
    fn byte_len(&self) -> usize {
        self.text.len()
    }
}

fn emit_block_marker(state: &mut ImportState, block_name: &str, attrs: Map<String, Value>) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let start = state.byte_len();
    state.text.push(marker);
    let end = state.byte_len();
    let parents: Vec<Value> = state
        .parents
        .iter()
        .map(|p| Value::String(p.clone()))
        .collect();
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": end },
        "features": [{
            "$type": NS,
            "name": block_name,
            "parents": parents,
            "attrs": attrs,
        }]
    }));
}

fn emit_comment_facet(state: &mut ImportState, data: &str) {
    let start = state.byte_len();
    state.text.push('\u{FFFC}');
    let end = state.byte_len();
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": end },
        "features": [{ "$type": NS, "name": "comment", "data": data }]
    }));
}

fn walk_nodes(children: &[Handle], state: &mut ImportState) {
    for child in children {
        walk_node(child, state);
    }
}

fn walk_node(node: &Handle, state: &mut ImportState) {
    match &node.data {
        NodeData::Text { contents } => {
            let s = contents.borrow();
            let s: &str = &s;
            if s.trim().is_empty() {
                return;
            }
            state.text.push_str(s);
        }

        NodeData::Comment { contents } => {
            emit_comment_facet(state, contents.as_ref());
        }

        NodeData::Element { name, attrs, .. } => {
            let tag = name.local.as_ref().to_ascii_lowercase();
            let children: Vec<Handle> = node.children.borrow().clone();

            // The HTML parser always wraps content in structural elements that are
            // not part of the original input.  Walk through them transparently so
            // that both fragments and full documents are handled faithfully without
            // artificially scoping to any particular subtree.
            if matches!(tag.as_str(), "html" | "head" | "body") {
                walk_nodes(&children, state);
                return;
            }

            let attrs_borrow = attrs.borrow();
            let mut attrs_map: Map<String, Value> = Map::new();
            for attr in attrs_borrow.iter() {
                let key = attr.name.local.as_ref().to_string();
                let raw = attr.value.as_ref().to_string();
                if key == "class" {
                    let classes: Vec<Value> = raw
                        .split_whitespace()
                        .map(|s| Value::String(s.to_string()))
                        .collect();
                    attrs_map.insert(key, Value::Array(classes));
                } else {
                    attrs_map.insert(key, Value::String(raw));
                }
            }
            drop(attrs_borrow);

            if sets().block_names.contains(&tag) {
                emit_block_marker(state, &tag, attrs_map);
                if !sets().void_elements.contains(&tag) {
                    state.parents.push(tag);
                    walk_nodes(&children, state);
                    state.parents.pop();
                }
            } else if sets().inline_tags.contains(&tag) {
                walk_inline_mark(&children, state, &tag, attrs_map);
            } else {
                // Unknown tag: use as container label for child block nesting.
                let label = if attrs_map.is_empty() {
                    tag
                } else {
                    let seq = state.seq;
                    state.seq += 1;
                    let attrs_str = serde_json::to_string(&attrs_map).unwrap_or_default();
                    format!("{}|{}|{}", tag, attrs_str, seq)
                };
                state.parents.push(label);
                walk_nodes(&children, state);
                state.parents.pop();
            }
        }

        // Document / ProcessingInstruction / Doctype — just recurse into children.
        _ => {
            let children: Vec<Handle> = node.children.borrow().clone();
            walk_nodes(&children, state);
        }
    }
}

fn walk_inline_mark(
    children: &[Handle],
    state: &mut ImportState,
    mark_name: &str,
    attrs_map: Map<String, Value>,
) {
    let mark_start = state.byte_len();
    let facet_idx = state.facets.len();

    // Build feature: spread HTML attrs first, then set `name` last so that an HTML
    // `name` attribute (e.g. on `<a name="anchor">`) cannot overwrite the structural
    // `name` field used as the HIR compound key.
    let mut feature: Map<String, Value> = Map::new();
    feature.insert("$type".to_string(), Value::String(NS.to_string()));
    for (k, v) in &attrs_map {
        feature.insert(k.clone(), v.clone());
    }
    feature.insert("name".to_string(), Value::String(mark_name.to_string()));

    // Pre-insert placeholder (byteEnd == byteStart) so this outer mark appears
    // before any inner marks in the facets array.  byteEnd is updated after
    // children are walked.
    state.facets.push(json!({
        "index": { "byteStart": mark_start, "byteEnd": mark_start },
        "features": [Value::Object(feature)]
    }));

    walk_nodes(children, state);

    let mut mark_end = state.byte_len();

    // Void inline elements (e.g. <br>, <img>) that produced no text get a
    // single-byte FFFC placeholder so the HIR has a segment to attach the mark to.
    if mark_start == mark_end && sets().void_elements.contains(mark_name) {
        state.text.push('\u{FFFC}');
        mark_end = state.byte_len();
    }

    if mark_start < mark_end {
        state.facets[facet_idx]["index"]["byteEnd"] = Value::from(mark_end as u64);
    } else {
        // Empty mark — drop it.
        state.facets.remove(facet_idx);
    }
}

fn do_import(html: &str) -> String {
    let dom = parse_fragment(
        RcDom::default(),
        ParseOpts::default(),
        QualName::new(None, ns!(html), local_name!("body")),
        vec![],
    )
    .one(html.to_string());

    let mut state = ImportState::new();
    let root_children: Vec<Handle> = dom.document.children.borrow().clone();
    walk_nodes(&root_children, &mut state);

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ───────────────────────────────────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc: relationaltext_core::document::Document = match serde_json::from_str(doc_json) {
        Ok(d) => d,
        Err(e) => return format!("<!-- export error: {} -->", e),
    };
    let nodes = build_hir_from_doc(&doc, registry());
    render_nodes(&nodes)
}

/// Stable key for coalescing adjacent text nodes that share the same outermost mark.
fn mark_key(mark: &MarkApplication) -> String {
    let mut pairs: Vec<(&String, &Value)> = mark.attrs.iter().collect();
    pairs.sort_by_key(|(k, _)| k.as_str());
    let sorted: Map<String, Value> = pairs
        .into_iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    format!(
        "{}:{}",
        mark.kind,
        serde_json::to_string(&sorted).unwrap_or_default()
    )
}

/// Render a list of HIR nodes to an HTML string.
///
/// Adjacent text nodes that share the same outermost mark are coalesced so we
/// emit `<em>text <strong>bold</strong> more</em>` rather than three separate
/// `<em>` elements.
fn render_nodes(nodes: &[HirNode]) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut i = 0;
    while i < nodes.len() {
        match &nodes[i] {
            HirNode::Text { content, marks } => {
                // Prefer <a> as the outermost mark (links wrap em/strong per CommonMark).
                // Fall back to any non-image mark, then to the first mark.
                let outer = marks
                    .iter()
                    .find(|m| m.kind.ends_with("#a"))
                    .or_else(|| {
                        marks
                            .iter()
                            .find(|m| !m.kind.ends_with("#img") && !m.kind.ends_with("#image"))
                    })
                    .or_else(|| marks.first());

                if let Some(outer_mark) = outer {
                    let key = mark_key(outer_mark);
                    // Find the run of adjacent text nodes that share the same outer mark.
                    let mut j = i + 1;
                    while j < nodes.len() {
                        match &nodes[j] {
                            HirNode::Text { marks: nm, .. }
                                if !nm.is_empty() && mark_key(&nm[0]) == key =>
                            {
                                j += 1
                            }
                            _ => break,
                        }
                    }
                    // Strip the first occurrence of the outer mark from each node, then
                    // render the stripped run recursively (handles nested same-kind marks).
                    let stripped: Vec<HirNode> = nodes[i..j]
                        .iter()
                        .map(|n| {
                            if let HirNode::Text { content, marks } = n {
                                let drop_idx = marks.iter().position(|m| mark_key(m) == key);
                                let new_marks: Vec<MarkApplication> = marks
                                    .iter()
                                    .enumerate()
                                    .filter(|(idx, _)| Some(*idx) != drop_idx)
                                    .map(|(_, m)| m.clone())
                                    .collect();
                                HirNode::Text {
                                    content: content.clone(),
                                    marks: new_marks,
                                }
                            } else {
                                n.clone()
                            }
                        })
                        .collect();
                    let inner = render_nodes(&stripped);
                    parts.push(apply_mark(&inner, outer_mark));
                    i = j;
                } else {
                    parts.push(escape_html(content));
                    i += 1;
                }
            }

            HirNode::Block {
                name,
                attrs,
                children,
            } => {
                // Merge a block immediately followed by a same-named container into one
                // element.  This happens when a semantic container (e.g. <figure>) has
                // both inline children (entity marks in the block) AND block children
                // (e.g. <figcaption>) collected in the container.
                // Only merge if the block has no substantive text content — a block with
                // real text is a standalone element (e.g. <li>Foo</li>), not a carrier
                // for inline attrs of the following container.
                if i + 1 < nodes.len() {
                    if let HirNode::Container {
                        name: cname,
                        children: cc,
                        ..
                    } = &nodes[i + 1]
                    {
                        // Only merge when the block carries entity-marker
                        // content (FFFC placeholders with marks), indicating it's
                        // an attribute carrier for the container (e.g. <figure>
                        // with an inline <img>). Empty blocks and blocks with
                        // plain text are standalone elements.
                        let has_entity_content = children.iter().any(|c| {
                            matches!(c, HirNode::Text { content, marks }
                                if !content.is_empty()
                                    && content.chars().all(|ch| ch == '\u{FFFC}')
                                    && !marks.is_empty())
                        });
                        if name == cname
                            && !sets().void_elements.contains(name.as_str())
                            && has_entity_content
                        {
                            let inline_inner = render_nodes(children);
                            let block_inner = render_nodes(cc);
                            let attrs_html = render_html_attrs(attrs);
                            parts.push(format!(
                                "<{}{}>{}\n{}</{}>\n",
                                name, attrs_html, inline_inner, block_inner, name
                            ));
                            i += 2;
                            continue;
                        }
                    }
                }

                parts.push(render_block(name, attrs, children));
                i += 1;
            }

            HirNode::Container {
                name,
                attrs,
                children,
            } => {
                parts.push(render_container(name, attrs, children));
                i += 1;
            }
        }
    }
    parts.join("")
}

fn render_block(name: &str, attrs: &HashMap<String, Value>, children: &[HirNode]) -> String {
    let inner = render_nodes(children);
    match name {
        "pre" => {
            let lang = attrs.get("language").and_then(|v| v.as_str());
            let cls = lang
                .map(|l| format!(" class=\"language-{}\"", escape_attr(l)))
                .unwrap_or_default();
            return format!("<pre><code{}>{}</code></pre>\n", cls, inner);
        }
        // Bare text node — render content directly without any wrapper element.
        // HTML text nodes are implicit; no element tag needed.
        "text" => {
            return inner;
        }
        // Block-level raw HTML passthrough.
        "raw" => {
            return attrs
                .get("raw")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
        _ => {}
    }
    let attrs_html = render_html_attrs(attrs);
    if sets().void_elements.contains(name) {
        format!("<{}{} />\n", name, attrs_html)
    } else if inner.is_empty() {
        format!("<{}{}></{}>\n", name, attrs_html, name)
    } else {
        format!("<{}{}>{}</{}>\n", name, attrs_html, inner, name)
    }
}

fn render_container(name: &str, attrs: &HashMap<String, Value>, children: &[HirNode]) -> String {
    // Detect tight vs loose li containers.
    if name == "li" {
        // A "text" block (bare text node) counts as inline content for tight detection.
        let first_is_text = match children.first() {
            Some(HirNode::Text { .. }) => true,
            Some(HirNode::Block { name, .. }) if name == "text" => true,
            _ => false,
        };
        if first_is_text && children.len() == 1 {
            // Tight item with only inline text
            let inner = render_nodes(children);
            return format!("<li>{}</li>\n", inner);
        } else if first_is_text {
            // Tight item with inline text followed by sub-elements (nested list, etc.)
            let inline_part = render_nodes(&children[..1]);
            let block_part = render_nodes(&children[1..]);
            return format!("<li>{}\n{}</li>\n", inline_part, block_part);
        } else {
            // Loose item — all children are blocks/containers
            let inner = render_nodes(children);
            return format!("<li>\n{}</li>\n", inner);
        }
    }

    // Legacy `ol:N` encodes the ordered-list start attribute in the name.
    if let Some(rest) = name.strip_prefix("ol:") {
        let start: u64 = rest.parse().unwrap_or(1);
        let inner = render_nodes(children);
        return format!("<ol start=\"{}\">\n{}</ol>\n", start, inner);
    }

    let inner = render_nodes(children);
    // Legacy label format: "tag|{attrs}|seq"
    let (tag, label_attrs): (String, HashMap<String, Value>) = if name.contains('|') {
        parse_container_label(name)
    } else {
        // New model: container name is the plain tag; attrs from HIR.
        let a = attrs.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        (name.to_string(), a)
    };
    let attrs_html = render_html_attrs(&label_attrs);
    format!("<{}{}>\n{}</{}>\n", tag, attrs_html, inner, tag)
}

fn render_node(node: &HirNode) -> String {
    match node {
        HirNode::Text { content, marks } => render_text(content, marks),
        HirNode::Container {
            name,
            attrs,
            children,
        } => render_container(name, attrs, children),
        HirNode::Block {
            name,
            attrs,
            children,
        } => render_block(name, attrs, children),
    }
}

fn render_text(content: &str, marks: &[MarkApplication]) -> String {
    let mut out = escape_html(content);
    for mark in marks.iter().rev() {
        out = apply_mark(&out, mark);
    }
    out
}

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    let attrs_html = render_mark_attrs(mark);
    match mark.kind.as_str() {
        "org.w3c.html.facet#comment" => {
            let data = mark
                .attrs
                .get("data")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("<!--{}-->", data)
        }
        "org.w3c.html.facet#raw-inline" => {
            // Verbatim inline token — render the `raw` attr unchanged, ignore placeholder.
            mark.attrs
                .get("raw")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
        kind if kind.starts_with(HTML_PREFIX) => {
            let tag = &kind[HTML_PREFIX.len()..];
            let is_void = sets().void_elements.contains(tag);
            if is_void {
                // Void inline (<br />, <img />): emit the tag, strip the FFFC placeholder.
                let text_part = if content == "\u{FFFC}" { "" } else { content };
                format!("<{}{} />{}", tag, attrs_html, text_part)
            } else {
                format!("<{}{}>{}</{}>", tag, attrs_html, content, tag)
            }
        }
        // Non-HTML mark — passthrough content unchanged.
        _ => content.to_string(),
    }
}

/// Render a single `Value` as an HTML attribute value string, or `None` if unsupported.
fn value_to_attr_str(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Array(arr) => {
            let joined = arr
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            Some(joined)
        }
        _ => None,
    }
}

/// Render mark attrs as ` key="value"` pairs, sorted, excluding the `name` field.
fn render_mark_attrs(mark: &MarkApplication) -> String {
    let mut pairs: Vec<(&String, &Value)> = mark
        .attrs
        .iter()
        .filter(|(k, _)| k.as_str() != "name")
        .collect();
    pairs.sort_by_key(|(k, _)| k.as_str());
    pairs
        .into_iter()
        .filter_map(|(k, v)| {
            value_to_attr_str(v).map(|s| {
                let encoded = if k == "href" || k == "src" {
                    escape_attr(&percent_encode_url(&s))
                } else {
                    escape_attr(&s)
                };
                format!(" {}=\"{}\"", k, encoded)
            })
        })
        .collect()
}

/// Render a HashMap of attrs as ` key="value"` pairs, sorted.
fn render_html_attrs(attrs: &HashMap<String, Value>) -> String {
    let mut pairs: Vec<(&String, &Value)> = attrs.iter().collect();
    pairs.sort_by_key(|(k, _)| k.as_str());
    pairs
        .into_iter()
        .filter_map(|(k, v)| {
            value_to_attr_str(v).map(|s| {
                let encoded = if k == "href" || k == "src" {
                    escape_attr(&percent_encode_url(&s))
                } else {
                    escape_attr(&s)
                };
                format!(" {}=\"{}\"", k, encoded)
            })
        })
        .collect()
}

/// Decode a container label back to (tag, attrs).
///
/// Handles:
///   `section|0`                  → ("section", {})
///   `div|{"class":"foo"}|1`      → ("div", {"class": "foo"})
///   `ul`                         → ("ul", {})  (legacy, no seq)
fn parse_container_label(label: &str) -> (String, HashMap<String, Value>) {
    let without_seq = match label.rfind('|') {
        Some(pos) => &label[..pos],
        None => label,
    };
    match without_seq.find('|') {
        Some(pos) => {
            let tag = without_seq[..pos].to_string();
            let attrs: HashMap<String, Value> =
                serde_json::from_str(&without_seq[pos + 1..]).unwrap_or_default();
            (tag, attrs)
        }
        None => (without_seq.to_string(), HashMap::new()),
    }
}

fn escape_html(s: &str) -> String {
    s.replace('\u{200B}', "") // strip ZWSP (placeholder for empty-width facets)
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

/// Percent-encode non-ASCII and special characters in a URL per RFC 3986.
/// Already-encoded sequences (%XX) are left untouched.
fn percent_encode_url(url: &str) -> String {
    let mut result = String::with_capacity(url.len());
    let bytes = url.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%'
            && i + 2 < bytes.len()
            && bytes[i + 1].is_ascii_hexdigit()
            && bytes[i + 2].is_ascii_hexdigit()
        {
            // Already encoded — pass through
            result.push('%');
            result.push(bytes[i + 1] as char);
            result.push(bytes[i + 2] as char);
            i += 3;
        } else if b > 0x7E
            || b == b' '
            || b == b'<'
            || b == b'>'
            || b == b'"'
            || b == b'`'
            || b == b'\\'
            || b == b'['
            || b == b']'
        {
            // Non-ASCII or special — encode each byte
            if b > 0x7F {
                // Multi-byte UTF-8: encode all bytes of this character
                let ch_start = i;
                i += 1;
                while i < bytes.len() && (bytes[i] & 0xC0) == 0x80 {
                    i += 1;
                }
                for &byte in &bytes[ch_start..i] {
                    result.push_str(&format!("%{:02X}", byte));
                }
            } else {
                result.push_str(&format!("%{:02X}", b));
                i += 1;
            }
        } else {
            result.push(b as char);
            i += 1;
        }
    }
    result
}

// ─── WASM entry points ────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_html(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_html(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}
