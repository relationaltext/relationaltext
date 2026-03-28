//! Document ↔ WInstance bidirectional conversion.

use std::collections::HashMap;

use panproto_gat::Name;
use panproto_inst::value::{FieldPresence, Value};
use panproto_inst::{Node, WInstance};
use panproto_schema::Edge;

use crate::document::{ByteSlice, Document, Facet, Feature};

use super::value_convert::{extract_int_field, json_to_value, value_to_json};
use super::BridgeError;

/// Convert a Document to a WInstance tree.
///
/// Tree structure:
/// ```text
/// document (root, value = text)
/// ├── facet (extra_fields: byteStart, byteEnd)
/// │   ├── feature (anchor = feature_name, extra_fields: data)
/// │   └── feature ...
/// └── facet ...
/// ```
pub fn document_to_winstance(doc: &Document) -> WInstance {
    let mut nodes = HashMap::new();
    let mut arcs = Vec::new();
    let mut next_id: u32 = 0;

    let root_id = next_id;
    let mut root_node = Node::new(root_id, "document");
    root_node.value = Some(FieldPresence::Present(Value::Str(doc.text.clone())));
    nodes.insert(root_id, root_node);
    next_id += 1;

    for facet in &doc.facets {
        let facet_id = next_id;
        next_id += 1;

        let mut facet_node = Node::new(facet_id, "facet");
        facet_node.extra_fields.insert(
            "byteStart".into(),
            Value::Int(i64::from(facet.index.byte_start)),
        );
        facet_node.extra_fields.insert(
            "byteEnd".into(),
            Value::Int(i64::from(facet.index.byte_end)),
        );
        nodes.insert(facet_id, facet_node);

        arcs.push((
            root_id,
            facet_id,
            Edge {
                src: "document".into(),
                tgt: "facet".into(),
                kind: "facet".into(),
                name: Some("facets".into()),
            },
        ));

        for feature in &facet.features {
            let feature_id = next_id;
            next_id += 1;

            let anchor = feature_anchor(feature);
            let mut feature_node = Node::new(feature_id, anchor.as_str());

            for (k, v) in &feature.data {
                feature_node
                    .extra_fields
                    .insert(k.clone(), json_to_value(v));
            }

            nodes.insert(feature_id, feature_node);

            arcs.push((
                facet_id,
                feature_id,
                Edge {
                    src: "facet".into(),
                    tgt: anchor.as_str().into(),
                    kind: "feature".into(),
                    name: Some(anchor.as_str().into()),
                },
            ));
        }
    }

    WInstance::new(nodes, arcs, vec![], root_id, Name::from("document"))
}

/// Convert a WInstance back to a Document.
pub fn winstance_to_document(inst: &WInstance) -> Result<Document, BridgeError> {
    let root = inst.nodes.get(&inst.root).ok_or(BridgeError::MissingRoot)?;

    let text = match &root.value {
        Some(FieldPresence::Present(Value::Str(s))) => s.clone(),
        _ => String::new(),
    };

    let facet_ids = inst
        .children_map
        .get(&inst.root)
        .cloned()
        .unwrap_or_default();

    let mut facets = Vec::new();
    for &facet_id in &facet_ids {
        let facet_node = inst.nodes.get(&facet_id).ok_or_else(|| {
            BridgeError::InvalidStructure(format!("missing facet node {facet_id}"))
        })?;

        let byte_start =
            extract_int_field(&facet_node.extra_fields, "byteStart").unwrap_or(0) as u32;
        let byte_end = extract_int_field(&facet_node.extra_fields, "byteEnd").unwrap_or(0) as u32;

        let feature_ids = inst
            .children_map
            .get(&facet_id)
            .cloned()
            .unwrap_or_default();

        let mut features = Vec::new();
        for &feat_id in &feature_ids {
            let feat_node = inst.nodes.get(&feat_id).ok_or_else(|| {
                BridgeError::InvalidStructure(format!("missing feature node {feat_id}"))
            })?;

            let (anchor_type_id, anchor_name) = parse_anchor(&feat_node.anchor);
            let mut data = serde_json::Map::new();
            // Restore the name field from the anchor if present
            if let Some(name) = anchor_name {
                data.insert("name".to_owned(), serde_json::Value::String(name));
            }
            // Check if a Case/ComputeField transform overrode $type or name
            let has_type_override = feat_node.extra_fields.contains_key("$type");

            for (k, v) in &feat_node.extra_fields {
                // For "name": use anchor-derived name UNLESS a $type override
                // indicates Case/ComputeField ran (which may have also set name)
                if k == "name" && data.contains_key("name") && !has_type_override {
                    continue; // keep anchor-derived name
                }
                if k == "$type" {
                    // Skip — handled below as type_id override
                    continue;
                }
                data.insert(k.clone(), value_to_json(v));
            }
            // Check for $type override from ComputeField/Case transforms
            let type_id = feat_node
                .extra_fields
                .get("$type")
                .and_then(|v| match v {
                    panproto_inst::value::Value::Str(s) => Some(s.clone()),
                    _ => None,
                })
                .unwrap_or(anchor_type_id);
            features.push(Feature { type_id, data });
        }

        // Skip facets with no surviving features (all were dropped by the migration)
        if !features.is_empty() {
            facets.push(Facet {
                index: ByteSlice {
                    byte_start,
                    byte_end,
                },
                features,
            });
        }
    }

    Ok(Document { text, facets })
}

/// Build the compound anchor key for a feature: `$type#name` if name exists,
/// otherwise just `$type`. This is the vertex ID in the schema graph.
///
/// Version suffixes (`@version`) are stripped from both type_id and name so that
/// versioned features match unversioned protolens steps.
fn feature_anchor(feature: &Feature) -> String {
    let type_id = crate::lens::strip_version(&feature.type_id);
    if let Some(name) = feature.get_str("name") {
        let name = crate::lens::strip_version(name);
        format!("{type_id}#{name}")
    } else {
        type_id.to_owned()
    }
}

/// Parse a compound anchor back to ($type, Option<name>).
fn parse_anchor(anchor: &str) -> (String, Option<String>) {
    if let Some(hash_pos) = anchor.rfind('#') {
        let type_id = anchor[..hash_pos].to_owned();
        let name = anchor[hash_pos + 1..].to_owned();
        (type_id, Some(name))
    } else {
        (anchor.to_owned(), None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_roundtrip() {
        let doc = Document {
            text: "hello world".into(),
            facets: vec![Facet {
                index: ByteSlice {
                    byte_start: 0,
                    byte_end: 5,
                },
                features: vec![Feature::new("org.relationaltext.facet#bold")
                    .with_data("name", serde_json::Value::String("bold".into()))],
            }],
        };

        let inst = document_to_winstance(&doc);
        assert!(inst.node_count() >= 3);

        let restored = winstance_to_document(&inst).unwrap();
        assert_eq!(restored.text, "hello world");
        assert_eq!(restored.facets.len(), 1);
    }

    #[test]
    fn empty_document_roundtrip() {
        let doc = Document::new("no facets");
        let inst = document_to_winstance(&doc);
        let restored = winstance_to_document(&inst).unwrap();
        assert_eq!(restored.text, "no facets");
        assert!(restored.facets.is_empty());
    }
}

#[cfg(test)]
mod array_tests {
    use super::*;

    #[test]
    fn class_array_survives_roundtrip() {
        let mut data = serde_json::Map::new();
        data.insert("name".into(), serde_json::json!("a"));
        data.insert("class".into(), serde_json::json!(["u-url", "mention"]));
        data.insert("href".into(), serde_json::json!("https://example.com"));

        let doc = Document {
            text: "test".into(),
            facets: vec![Facet {
                index: ByteSlice {
                    byte_start: 0,
                    byte_end: 4,
                },
                features: vec![Feature {
                    type_id: "org.w3c.html.facet".into(),
                    data,
                }],
            }],
        };

        let inst = document_to_winstance(&doc);
        // Check the WInstance has class in extra_fields
        for (_, node) in &inst.nodes {
            if node.anchor.as_ref().contains("a")
                && !node.anchor.as_ref().contains("document")
                && !node.anchor.as_ref().contains("facet")
            {
                eprintln!(
                    "Node anchor={}, extra_fields keys={:?}",
                    node.anchor,
                    node.extra_fields.keys().collect::<Vec<_>>()
                );
                let class_val = node.extra_fields.get("class");
                eprintln!("class value: {:?}", class_val);
                assert!(class_val.is_some(), "class should be in extra_fields");
            }
        }

        let restored = winstance_to_document(&inst).unwrap();
        let feat = &restored.facets[0].features[0];
        eprintln!("Restored feature data: {:?}", feat.data);
        let class = feat.data.get("class");
        assert!(
            class.is_some(),
            "class should survive roundtrip, got: {:?}",
            feat.data
        );
        assert_eq!(class.unwrap(), &serde_json::json!(["u-url", "mention"]));
    }
}
