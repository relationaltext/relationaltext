//! Hierarchical Intermediate Representation (HIR).
//!
//! Converts a flat `Document` (text + sorted facets) into a render-ready tree.
//!
//! This is the atjson HIR equivalent: it handles the mechanical work of
//! splitting overlapping mark ranges into non-overlapping segments before
//! constructing block/text nodes.
//!
//! Algorithm (from research doc §4.2):
//!  1. Extract block markers (default to single paragraph if none present)
//!  2. Derive content range for each block: text[markerEnd..nextMarkerStart]
//!  3. Collect marks/inline features overlapping each block; clip to content range
//!  4. Split on mark boundaries within the block
//!  5. Assign active marks to each text segment
//!  6. Build container nodes from consecutive blocks sharing a parents prefix

use crate::document::{Document, Facet, Feature};
use crate::lexicon::{FeatureClass, LexiconRegistry};
use std::collections::HashMap;

/// A node in the Hierarchical Intermediate Representation.
#[derive(Debug, Clone, PartialEq)]
pub enum HirNode {
    /// A block-level element (paragraph, heading, list item, etc.)
    Block {
        /// Block name from `feature.data["name"]`, or the `$type` if absent.
        name: String,
        attrs: HashMap<String, serde_json::Value>,
        children: Vec<HirNode>,
    },
    /// A container element inferred from consecutive blocks sharing a `parents` prefix.
    /// e.g., `<ul>`, `<ol>`, `<blockquote>`.
    Container {
        name: String,
        attrs: HashMap<String, serde_json::Value>,
        children: Vec<HirNode>,
    },
    /// A text segment with zero or more active marks.
    Text {
        content: String,
        marks: Vec<MarkApplication>,
    },
}

/// A mark applied to a text segment in the HIR.
///
/// `kind` is the full `$type` compound key, e.g.:
/// - `"org.relationaltext.richtext.mark#bold"` for a bold mark
/// - `"app.bsky.richtext.facet#mention"` for a mention entity
/// - `"com.example.custom"` for an unregistered extension
#[derive(Debug, Clone, PartialEq)]
pub struct MarkApplication {
    pub kind: String,
    pub attrs: serde_json::Map<String, serde_json::Value>,
}

/// Build a HIR from a document.
///
/// Returns a flat list of top-level nodes. Container nodes are synthesized
/// from consecutive blocks sharing a `parents` prefix.
pub fn build_hir(doc: &Document, registry: &LexiconRegistry) -> Vec<HirNode> {
    let text = &doc.text;
    let facets = &doc.facets;

    // Step 1: collect blocks
    let block_ranges = collect_blocks(text, facets, registry);

    // Steps 2-5: build block nodes
    let block_nodes: Vec<(Vec<String>, HirNode)> = block_ranges
        .into_iter()
        .map(|(range, block_feat)| {
            let parents = block_feat
                .data
                .get("parents")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let node = build_block_node(text, &range, block_feat, facets, registry);
            (parents, node)
        })
        .collect();

    // Step 6: synthesize container nodes
    synthesize_containers(block_nodes)
}

/// A resolved block range: the content bounds (marker excluded).
///
/// For a block marker at `[marker_start, marker_end)`, the content is
/// `text[content_start..content_end]` where `content_start == marker_end`
/// and `content_end == next_marker_start` (or `text.len()` for the last block).
struct BlockRange {
    content_start: u32,
    content_end: u32,
}

fn collect_blocks<'a>(
    text: &str,
    facets: &'a [Facet],
    registry: &LexiconRegistry,
) -> Vec<(BlockRange, &'a Feature)> {
    // Collect (marker_start, marker_end, block_feature) tuples
    let mut markers: Vec<(u32, u32, &Feature)> = facets
        .iter()
        .filter_map(|f| {
            f.features
                .iter()
                .find(|feat| registry.feature_class(feat) == FeatureClass::Block)
                .map(|feat| (f.index.byte_start, f.index.byte_end, feat))
        })
        .collect();

    if markers.is_empty() {
        return vec![];
    }

    markers.sort_by_key(|&(start, _, _)| start);

    let text_len = text.len() as u32;
    let n = markers.len();
    let mut result = Vec::with_capacity(n);

    for i in 0..n {
        let (_, marker_end, feat) = markers[i];
        let content_start = marker_end;
        let content_end = if i + 1 < n {
            markers[i + 1].0
        } else {
            text_len
        };
        result.push((
            BlockRange {
                content_start,
                content_end,
            },
            feat,
        ));
    }

    result
}

fn build_block_node(
    text: &str,
    range: &BlockRange,
    block_feat: &Feature,
    all_facets: &[Facet],
    registry: &LexiconRegistry,
) -> HirNode {
    let start = range.content_start as usize;
    let end = range.content_end as usize;

    // Slice block content — range [content_start, content_end) excludes the marker
    let block_text = if end <= text.len() {
        &text[start..end]
    } else {
        &text[start..]
    };

    let content_start = range.content_start;
    let content_end = range.content_end;

    let inline_facets: Vec<ClippedMark> = all_facets
        .iter()
        .filter(|f| {
            !f.features
                .iter()
                .any(|feat| registry.feature_class(feat) == FeatureClass::Block)
        })
        .filter(|f| f.index.byte_start < content_end && f.index.byte_end > content_start)
        .map(|f| {
            let clipped_start = f.index.byte_start.max(content_start);
            let clipped_end = f.index.byte_end.min(content_end);
            ClippedMark {
                byte_start: clipped_start - content_start,
                byte_end: clipped_end - content_start,
                features: &f.features,
            }
        })
        .collect();

    let children = build_text_segments(block_text, &inline_facets, registry);

    // Block attrs come from the nested "attrs" field in the feature data.
    // The wire format stores per-block attributes (e.g. level, language, headers)
    // under a dedicated "attrs" key so the top-level namespace stays clean.
    let attrs: HashMap<String, serde_json::Value> = block_feat
        .data
        .get("attrs")
        .and_then(|v| v.as_object())
        .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();

    // Block name from data["name"] or fall back to type_id
    let name = block_feat
        .get_str("name")
        .unwrap_or(&block_feat.type_id)
        .to_string();

    HirNode::Block {
        name,
        attrs,
        children,
    }
}

struct ClippedMark<'a> {
    byte_start: u32,
    byte_end: u32,
    features: &'a [Feature],
}

/// Split block text at all mark boundaries, producing annotated text segments.
fn build_text_segments(
    text: &str,
    marks: &[ClippedMark<'_>],
    registry: &LexiconRegistry,
) -> Vec<HirNode> {
    // Collect all boundary positions within the block's byte range
    let mut positions: Vec<u32> = vec![0, text.len() as u32];
    for mark in marks {
        positions.push(mark.byte_start);
        positions.push(mark.byte_end);
    }
    positions.sort_unstable();
    positions.dedup();
    positions.retain(|&p| p as usize <= text.len());

    let mut segments = Vec::new();
    for window in positions.windows(2) {
        let (seg_start, seg_end) = (window[0], window[1]);
        if seg_start >= seg_end {
            continue;
        }
        // Guard against invalid UTF-8 boundaries
        let s = seg_start as usize;
        let e = seg_end as usize;
        if !text.is_char_boundary(s) || !text.is_char_boundary(e) {
            continue;
        }
        let content = text[s..e].to_string();

        // Collect all marks active over [seg_start, seg_end)
        let active_marks: Vec<MarkApplication> = marks
            .iter()
            .filter(|m| m.byte_start <= seg_start && m.byte_end >= seg_end)
            .flat_map(|m| features_to_mark_applications(m.features, registry))
            .collect();

        segments.push(HirNode::Text {
            content,
            marks: active_marks,
        });
    }

    if segments.is_empty() {
        segments.push(HirNode::Text {
            content: text.to_string(),
            marks: vec![],
        });
    }
    segments
}

fn features_to_mark_applications(
    features: &[Feature],
    registry: &LexiconRegistry,
) -> Vec<MarkApplication> {
    features
        .iter()
        .filter(|f| registry.feature_class(f) != FeatureClass::Block)
        .map(|f| {
            // Compound key: "$type#name" when name is present, else "$type"
            let kind = if let Some(name) = f.get_str("name") {
                format!("{}#{}", f.type_id, name)
            } else {
                f.type_id.clone()
            };
            let attrs = f.data.clone();
            MarkApplication { kind, attrs }
        })
        .collect()
}

/// Synthesize container nodes from consecutive blocks sharing a `parents` prefix.
///
/// Per Kleppmann's rendering model: `<ul>`, `<ol>`, `<blockquote>` containers
/// are inferred, never stored. Consecutive blocks with the same `parents` prefix
/// share a container.
///
/// When a new container is about to be opened, if the last node in the current
/// scope is a Block with the same name, that Block is popped and its attrs are
/// promoted to the new Container node. If the block had inline content (children),
/// those children become the initial children of the container — this supports
/// HTML elements like `<li>` that can contain both text and nested blocks
/// (e.g. `<li>text<ul>…</ul></li>`).
fn synthesize_containers(block_nodes: Vec<(Vec<String>, HirNode)>) -> Vec<HirNode> {
    if block_nodes.is_empty() {
        return vec![];
    }

    let mut result: Vec<HirNode> = Vec::new();
    // Stack of (container_name, container_attrs, children) for open containers
    let mut container_stack: Vec<(String, HashMap<String, serde_json::Value>, Vec<HirNode>)> =
        Vec::new();

    for (parents, node) in block_nodes {
        // Find common prefix depth with current stack
        let common_depth = container_stack
            .iter()
            .zip(parents.iter())
            .take_while(|((stack_name, _, _), parent_name)| stack_name == *parent_name)
            .count();

        // Close containers that are no longer in scope
        while container_stack.len() > common_depth {
            let (name, attrs, children) = container_stack.pop().unwrap();
            let container = HirNode::Container {
                name,
                attrs,
                children,
            };
            if let Some(parent) = container_stack.last_mut() {
                parent.2.push(container);
            } else {
                result.push(container);
            }
        }

        // Open new containers for each new parent level
        for parent_name in &parents[common_depth..] {
            // Check if the last node in the current scope is a Block with the
            // same name (explicit block marker for a structural container).
            // If so, pop it and use its attrs for the new container. If the
            // block had content (children), those become the container's initial
            // children — this handles mixed-content elements like <li> that hold
            // both inline text and nested sub-containers.
            let (pending_attrs, initial_children): (
                HashMap<String, serde_json::Value>,
                Vec<HirNode>,
            ) = {
                let scope: &mut Vec<HirNode> = if container_stack.is_empty() {
                    &mut result
                } else {
                    &mut container_stack.last_mut().unwrap().2
                };
                if let Some(HirNode::Block { name, .. }) = scope.last() {
                    if name == parent_name {
                        if let Some(HirNode::Block {
                            attrs, children, ..
                        }) = scope.pop()
                        {
                            // Only promote children as initial container content if
                            // the block had real content — skip the single empty Text
                            // node that every empty block marker produces.
                            let is_empty = children.len() == 1
                                && matches!(
                                    &children[0],
                                    HirNode::Text { content, marks }
                                        if content.is_empty() && marks.is_empty()
                                );
                            if is_empty {
                                (attrs, Vec::new())
                            } else {
                                (attrs, children)
                            }
                        } else {
                            unreachable!()
                        }
                    } else {
                        (HashMap::new(), Vec::new())
                    }
                } else {
                    (HashMap::new(), Vec::new())
                }
            };
            container_stack.push((parent_name.clone(), pending_attrs, initial_children));
        }

        // Add the block node to the innermost container (or directly to result)
        if let Some(top) = container_stack.last_mut() {
            top.2.push(node);
        } else {
            result.push(node);
        }
    }

    // Close remaining open containers
    while let Some((name, attrs, children)) = container_stack.pop() {
        let container = HirNode::Container {
            name,
            attrs,
            children,
        };
        if let Some(parent) = container_stack.last_mut() {
            parent.2.push(container);
        } else {
            result.push(container);
        }
    }

    result
}

/// Build HIR for a plain-text document with no block facets.
/// Public entry point: build HIR from a document.
///
/// When the document has block facets, delegates to `build_hir` which produces a
/// block/container tree. When there are no blocks (e.g. pure atproto text+marks),
/// the inline content is returned as top-level `Text` nodes — no implicit block is
/// synthesised. Renderers are responsible for wrapping bare inline content if needed.
pub fn build_hir_from_doc(doc: &Document, registry: &LexiconRegistry) -> Vec<HirNode> {
    let has_blocks = doc.facets.iter().any(|f| {
        f.features
            .iter()
            .any(|feat| registry.feature_class(feat) == FeatureClass::Block)
    });
    if has_blocks {
        return build_hir(doc, registry);
    }

    // No blocks — return bare inline text segments so the renderer can decide
    // whether (and how) to wrap them.
    let content_end = doc.text.len() as u32;
    let inline_facets: Vec<ClippedMark> = doc
        .facets
        .iter()
        .filter(|f| {
            !f.features
                .iter()
                .any(|feat| registry.feature_class(feat) == FeatureClass::Block)
        })
        .filter(|f| f.index.byte_start < content_end && f.index.byte_end > 0)
        .map(|f| ClippedMark {
            byte_start: f.index.byte_start,
            byte_end: f.index.byte_end.min(content_end),
            features: &f.features,
        })
        .collect();
    build_text_segments(&doc.text, &inline_facets, registry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Document, Facet, Feature};
    use crate::lexicon::{FeatureClass, LexiconBehavior, LexiconRegistry};

    fn test_registry() -> LexiconRegistry {
        let mut r = LexiconRegistry::new();
        r.register(
            "org.relationaltext.richtext.block#paragraph",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.block#blockquote",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.block#unordered-list-item",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.mark#bold",
            LexiconBehavior {
                feature_class: FeatureClass::InlineMark,
                expand_start: true,
                expand_end: true,
                void: false,
            },
        );
        r
    }

    fn paragraph_feat() -> Feature {
        Feature::new("org.relationaltext.richtext.block")
            .with_data("name", serde_json::Value::String("paragraph".into()))
            .with_data("parents", serde_json::Value::Array(vec![]))
    }

    fn bold_feat() -> Feature {
        Feature::new("org.relationaltext.richtext.mark")
            .with_data("name", serde_json::Value::String("bold".into()))
    }

    #[test]
    fn plain_text_produces_inline_nodes() {
        let registry = test_registry();
        let doc = Document::new("Hello world");
        let hir = build_hir_from_doc(&doc, &registry);
        // No blocks → top-level Text nodes; renderer decides wrapping
        assert_eq!(hir.len(), 1);
        match &hir[0] {
            HirNode::Text { content, marks } => {
                assert_eq!(content, "Hello world");
                assert!(marks.is_empty());
            }
            _ => panic!("expected top-level text node"),
        }
    }

    #[test]
    fn two_paragraphs() {
        let registry = test_registry();
        // text = "\u{FFFC}First\nSecond"
        //         [0,3)=marker1  [8,9)=marker2
        let doc = Document {
            text: "\u{FFFC}First\nSecond".into(),
            facets: vec![
                Facet::new(0, 3, vec![paragraph_feat()]),
                Facet::new(8, 9, vec![paragraph_feat()]),
            ],
        };
        let hir = build_hir_from_doc(&doc, &registry);
        assert_eq!(hir.len(), 2);
        match &hir[0] {
            HirNode::Block { name, children, .. } => {
                assert_eq!(name, "paragraph");
                match &children[0] {
                    HirNode::Text { content, .. } => assert_eq!(content, "First"),
                    _ => panic!(),
                }
            }
            _ => panic!(),
        }
    }

    #[test]
    fn bold_within_paragraph() {
        let registry = test_registry();
        // New wire format: \uFFFC marker at [0,3), content = text[3..14] = "Hello world"
        // Bold mark at [9,14) = "world"
        let doc = Document {
            text: "\u{FFFC}Hello world".into(),
            facets: vec![
                Facet::new(0, 3, vec![paragraph_feat()]),
                Facet::new(9, 14, vec![bold_feat()]),
            ],
        };
        let hir = build_hir_from_doc(&doc, &registry);
        let block = &hir[0];
        match block {
            HirNode::Block { children, .. } => {
                assert_eq!(children.len(), 2);
                match &children[0] {
                    HirNode::Text { content, marks } => {
                        assert_eq!(content, "Hello ");
                        assert!(marks.is_empty());
                    }
                    _ => panic!(),
                }
                match &children[1] {
                    HirNode::Text { content, marks } => {
                        assert_eq!(content, "world");
                        assert_eq!(marks.len(), 1);
                        assert_eq!(marks[0].kind, "org.relationaltext.richtext.mark#bold");
                    }
                    _ => panic!(),
                }
            }
            _ => panic!(),
        }
    }

    #[test]
    fn list_item_inside_blockquote_gets_container() {
        let registry = test_registry();
        let doc = Document {
            text: "\u{FFFC}Quoted\nItem".into(),
            facets: vec![
                Facet::new(
                    0,
                    3,
                    vec![Feature::new("org.relationaltext.richtext.block")
                        .with_data("name", serde_json::Value::String("blockquote".into()))
                        .with_data("parents", serde_json::Value::Array(vec![]))],
                ),
                Facet::new(
                    9,
                    10,
                    vec![Feature::new("org.relationaltext.richtext.block")
                        .with_data(
                            "name",
                            serde_json::Value::String("unordered-list-item".into()),
                        )
                        .with_data(
                            "parents",
                            serde_json::Value::Array(vec![serde_json::Value::String(
                                "blockquote".into(),
                            )]),
                        )],
                ),
            ],
        };
        let hir = build_hir_from_doc(&doc, &registry);
        // The blockquote block with content "Quoted" is consumed as the container
        // header — its text becomes the container's first child, followed by the
        // unordered-list-item block.
        assert_eq!(hir.len(), 1);
        match &hir[0] {
            HirNode::Container {
                name,
                attrs: _,
                children,
            } => {
                assert_eq!(name, "blockquote");
                assert_eq!(children.len(), 2);
                // First child: the text "Quoted" promoted from the consumed block
                match &children[0] {
                    HirNode::Text { content, .. } => assert_eq!(content, "Quoted"),
                    _ => panic!("expected text node, got {:?}", children[0]),
                }
                // Second child: the list item block
                match &children[1] {
                    HirNode::Block { name, .. } => assert_eq!(name, "unordered-list-item"),
                    _ => panic!("expected block node"),
                }
            }
            _ => panic!("expected container node, got {:?}", hir[0]),
        }
    }

    #[test]
    fn hir_unknown_feature_surfaces_as_mark() {
        let registry = test_registry();
        let doc = Document {
            text: "\u{FFFC}hello".into(),
            facets: vec![
                Facet::new(0, 3, vec![paragraph_feat()]),
                Facet::new(
                    3,
                    8,
                    vec![Feature::new("com.example.custom")
                        .with_data("foo", serde_json::Value::String("bar".into()))],
                ),
            ],
        };
        let hir = build_hir_from_doc(&doc, &registry);
        match &hir[0] {
            HirNode::Block { children, .. } => {
                let text_node = children.iter().find(|c| {
                    if let HirNode::Text { marks, .. } = c {
                        !marks.is_empty()
                    } else {
                        false
                    }
                });
                let text_node = text_node.expect("expected a text node with marks");
                if let HirNode::Text { marks, .. } = text_node {
                    assert_eq!(marks[0].kind, "com.example.custom");
                }
            }
            _ => panic!(),
        }
    }

    #[test]
    fn empty_block_marker_attrs_promoted_to_container() {
        // Structural container elements (e.g. <ul>, <blockquote>) may emit an
        // explicit block marker whose content range is empty. When the next
        // block lists that container as a parent, synthesize_containers should
        // pop the empty block and use its attrs for the Container node.
        let mut r = LexiconRegistry::new();
        r.register(
            "org.relationaltext.richtext.block#ul",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.block#li",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );

        // text: "\u{FFFC}\nItem"
        //  [0,3) = ul block marker (empty content — next marker at byte 3)
        //  [3,4) = li block marker, parents=["ul"]
        let doc = Document {
            text: "\u{FFFC}\nItem".into(),
            facets: vec![
                Facet::new(
                    0,
                    3,
                    vec![Feature::new("org.relationaltext.richtext.block")
                        .with_data("name", serde_json::Value::String("ul".into()))
                        .with_data("parents", serde_json::Value::Array(vec![]))
                        .with_data("attrs", serde_json::json!({ "class": "my-list" }))],
                ),
                Facet::new(
                    3,
                    4,
                    vec![Feature::new("org.relationaltext.richtext.block")
                        .with_data("name", serde_json::Value::String("li".into()))
                        .with_data(
                            "parents",
                            serde_json::Value::Array(vec![serde_json::Value::String("ul".into())]),
                        )],
                ),
            ],
        };

        let hir = build_hir_from_doc(&doc, &r);
        // The empty `ul` Block should be consumed; result should be a single
        // Container with name "ul" carrying the attrs from the block marker.
        assert_eq!(hir.len(), 1, "expected one top-level container");
        match &hir[0] {
            HirNode::Container {
                name,
                attrs,
                children,
            } => {
                assert_eq!(name, "ul");
                assert_eq!(
                    attrs.get("class").and_then(|v| v.as_str()),
                    Some("my-list"),
                    "container should carry attrs from the popped empty block"
                );
                assert_eq!(children.len(), 1);
                match &children[0] {
                    HirNode::Block { name, .. } => assert_eq!(name, "li"),
                    _ => panic!("expected li block inside container"),
                }
            }
            _ => panic!("expected Container node, got {:?}", hir[0]),
        }
    }
}
