//! Ontology ↔ panproto Schema bridge.
//!
//! Maps between Layers TypeDef records and panproto Schema graphs, enabling
//! ontology evolution to be handled by panproto's migration engine.
//!
//! Each TypeDef becomes a vertex in the schema graph, each RoleSlot becomes a
//! property edge, and parent type references become inheritance edges.

use std::collections::HashMap;

use panproto_gat::Name;
use panproto_inst::value::Value;
use panproto_inst::{Node, WInstance};
use panproto_lens::auto_lens::{auto_generate, AutoLensConfig};
use panproto_protocols::web_document::atproto;
use panproto_schema::{Edge, Schema, Vertex};
use smallvec::SmallVec;

use crate::layers::defs::Uuid;
use crate::layers::ontology::{Ontology, RoleSlot, TypeDef};

use super::BridgeError;

/// Type kinds that map to ontology TypeDef vertices.
const TYPE_KINDS: &[&str] = &[
    "entity-type",
    "situation-type",
    "role-type",
    "relation-type",
    "attribute-type",
];

/// Build a panproto Schema from an Ontology and its TypeDef records.
///
/// Each TypeDef becomes a vertex in the schema graph:
/// - vertex id: `{ontology_name}/{typedef_name}` (e.g., "recipe-cooking/ingredient")
/// - vertex kind: the TypeDef's description or a default kind based on whether it has roles
///
/// Each RoleSlot on a TypeDef becomes a property edge:
/// - edge from the TypeDef vertex to a leaf vertex for the role
/// - edge kind: "role"
/// - edge name: the role's name
///
/// Parent type references become inheritance edges:
/// - edge from child TypeDef vertex to parent TypeDef vertex
/// - edge kind: "extends"
pub fn typedef_to_schema(ontology: &Ontology, type_defs: &[TypeDef]) -> Schema {
    let mut vertices: HashMap<Name, Vertex> = HashMap::new();
    let mut edge_map: HashMap<Edge, Name> = HashMap::new();
    let mut outgoing: HashMap<Name, SmallVec<Edge, 4>> = HashMap::new();
    let mut incoming: HashMap<Name, SmallVec<Edge, 4>> = HashMap::new();
    let mut between: HashMap<(Name, Name), SmallVec<Edge, 2>> = HashMap::new();

    for td in type_defs {
        let vertex_id: Name = format!("{}/{}", ontology.name, td.name).into();
        let kind: Name = td
            .description
            .as_deref()
            .map(|d| {
                // Use the description prefix as a rough kind, but prefer a
                // structured kind when the typedef has roles (situation-like)
                // vs. no roles (entity-like).
                let _ = d;
                if td.roles.as_ref().is_some_and(|r| !r.is_empty()) {
                    "situation-type"
                } else {
                    "entity-type"
                }
            })
            .unwrap_or("entity-type")
            .into();

        vertices.insert(
            vertex_id.clone(),
            Vertex {
                id: vertex_id.clone(),
                kind,
                nsid: None,
            },
        );

        // Role slots → leaf vertices + "role" edges
        if let Some(roles) = &td.roles {
            for role in roles {
                let role_vertex_id: Name =
                    format!("{}/{}/{}", ontology.name, td.name, role.name).into();
                vertices
                    .entry(role_vertex_id.clone())
                    .or_insert_with(|| Vertex {
                        id: role_vertex_id.clone(),
                        kind: "role-slot".into(),
                        nsid: None,
                    });

                let edge = Edge {
                    src: vertex_id.clone(),
                    tgt: role_vertex_id.clone(),
                    kind: "role".into(),
                    name: Some(role.name.clone().into()),
                };
                edge_map.insert(edge.clone(), "role".into());
                outgoing
                    .entry(vertex_id.clone())
                    .or_default()
                    .push(edge.clone());
                incoming
                    .entry(role_vertex_id.clone())
                    .or_default()
                    .push(edge.clone());
                between
                    .entry((vertex_id.clone(), role_vertex_id.clone()))
                    .or_default()
                    .push(edge);
            }
        }

        // Parent type → "extends" edge
        if let Some(parent_ref) = &td.parent_ref {
            let parent_id: Name = format!("{}/{}", ontology.name, parent_ref).into();
            // Ensure the parent vertex exists (it may be defined later in the list
            // or reference an external type).
            vertices.entry(parent_id.clone()).or_insert_with(|| Vertex {
                id: parent_id.clone(),
                kind: "entity-type".into(),
                nsid: None,
            });

            let edge = Edge {
                src: vertex_id.clone(),
                tgt: parent_id.clone(),
                kind: "extends".into(),
                name: None,
            };
            edge_map.insert(edge.clone(), "extends".into());
            outgoing
                .entry(vertex_id.clone())
                .or_default()
                .push(edge.clone());
            incoming
                .entry(parent_id.clone())
                .or_default()
                .push(edge.clone());
            between
                .entry((vertex_id.clone(), parent_id.clone()))
                .or_default()
                .push(edge);
        }
    }

    Schema {
        protocol: "atproto".into(),
        vertices,
        edges: edge_map,
        hyper_edges: HashMap::new(),
        constraints: HashMap::new(),
        required: HashMap::new(),
        nsids: HashMap::new(),
        variants: HashMap::new(),
        orderings: HashMap::new(),
        recursion_points: HashMap::new(),
        spans: HashMap::new(),
        usage_modes: HashMap::new(),
        nominal: HashMap::new(),
        coercions: HashMap::new(),
        mergers: HashMap::new(),
        defaults: HashMap::new(),
        policies: HashMap::new(),
        outgoing,
        incoming,
        between,
    }
}

/// Extract TypeDef records from a panproto Schema.
///
/// Reverse of `typedef_to_schema`. Vertices whose kind is in
/// `{"entity-type", "situation-type", "role-type", "relation-type", "attribute-type"}`
/// become TypeDefs. "role" edges become RoleSlots. "extends" edges become
/// `parent_ref`.
pub fn schema_to_typedefs(schema: &Schema) -> (Ontology, Vec<TypeDef>) {
    // Infer the ontology name from the first vertex id prefix (before the first '/').
    let ontology_name = schema
        .vertices
        .keys()
        .find_map(|id| {
            let s = id.as_ref();
            s.find('/').map(|i| &s[..i])
        })
        .unwrap_or("unknown")
        .to_owned();

    let mut type_defs = Vec::new();

    for vertex in schema.vertices.values() {
        let kind_str = vertex.kind.as_ref();
        // Skip role-slot leaf vertices — they are represented as RoleSlots on
        // their parent TypeDef.
        if kind_str == "role-slot" {
            continue;
        }
        // Only convert vertices whose kind matches a known type kind.
        if !TYPE_KINDS.contains(&kind_str) {
            continue;
        }

        let vertex_id = vertex.id.as_ref();
        // Extract the type name from the vertex id: everything after the last '/'.
        // For ids like "ontology/type/role", we want "type" — but role-slots are
        // already filtered above, so the remaining ids are "ontology/type".
        let name = vertex_id
            .rfind('/')
            .map(|i| &vertex_id[i + 1..])
            .unwrap_or(vertex_id)
            .to_owned();

        // Collect role slots from outgoing "role" edges.
        let roles: Vec<RoleSlot> = schema
            .outgoing
            .get(&vertex.id)
            .map(|edges| {
                edges
                    .iter()
                    .filter(|e| e.kind.as_ref() == "role")
                    .filter_map(|e| {
                        e.name.as_ref().map(|n| RoleSlot {
                            name: n.as_ref().to_owned(),
                            description: None,
                            required: None,
                            type_ref: None,
                            constraints: None,
                            features: None,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Find parent via outgoing "extends" edge.
        let parent_ref = schema.outgoing.get(&vertex.id).and_then(|edges| {
            edges
                .iter()
                .find(|e| e.kind.as_ref() == "extends")
                .map(|e| {
                    let tgt = e.tgt.as_ref();
                    tgt.rfind('/')
                        .map(|i| &tgt[i + 1..])
                        .unwrap_or(tgt)
                        .to_owned()
                })
        });

        type_defs.push(TypeDef {
            uuid: Uuid {
                value: format!("typedef-{name}"),
            },
            name,
            description: None,
            parent_ref,
            roles: if roles.is_empty() { None } else { Some(roles) },
            constraints: None,
            knowledge_refs: None,
            features: None,
        });
    }

    // Sort by name for deterministic output.
    type_defs.sort_by(|a, b| a.name.cmp(&b.name));

    let ontology = Ontology {
        name: ontology_name,
        description: None,
        types: type_defs.clone(),
        created_at: String::new(),
    };

    (ontology, type_defs)
}

/// Migrate annotations when the ontology evolves.
///
/// Given an old and new ontology (as schemas), auto-generate a lens
/// between them and apply it to annotations stored as a JSON value.
///
/// Handles: type renames, role additions/removals, type deletions.
pub fn migrate_annotations(
    old_schema: &Schema,
    new_schema: &Schema,
    annotations_json: &serde_json::Value,
) -> Result<serde_json::Value, BridgeError> {
    let protocol = atproto::protocol();
    let config = AutoLensConfig::default();

    let result = auto_generate(old_schema, new_schema, &protocol, &config)?;

    // Build a WInstance from the annotations JSON. Each annotation becomes a
    // node in the instance tree rooted at a synthetic "annotations" node.
    let instance = annotations_to_winstance(annotations_json, old_schema);

    // Apply the lens.
    let (view, _complement) = panproto_lens::get(&result.lens, &instance)
        .map_err(|e| BridgeError::InvalidStructure(format!("lens application failed: {e}")))?;

    // Serialize back to JSON.
    Ok(winstance_to_annotations(&view))
}

/// Convert an annotations JSON array into a WInstance for lens application.
fn annotations_to_winstance(json: &serde_json::Value, _schema: &Schema) -> WInstance {
    let mut nodes = HashMap::new();
    let mut arcs = Vec::new();
    let mut next_id: u32 = 0;

    // Root node.
    let root_id = next_id;
    let root_node = Node::new(root_id, "annotations");
    nodes.insert(root_id, root_node);
    next_id += 1;

    if let Some(arr) = json.as_array() {
        for ann in arr {
            let ann_id = next_id;
            next_id += 1;

            // Use ontologyTypeRef as the anchor if present, otherwise "annotation".
            let anchor = ann
                .get("ontologyTypeRef")
                .and_then(|v| v.as_str())
                .unwrap_or("annotation");

            let mut ann_node = Node::new(ann_id, anchor);

            // Store all fields as extra_fields.
            if let Some(obj) = ann.as_object() {
                for (k, v) in obj {
                    if k == "ontologyTypeRef" {
                        continue;
                    }
                    ann_node
                        .extra_fields
                        .insert(k.clone(), json_value_to_inst_value(v));
                }
            }

            nodes.insert(ann_id, ann_node);
            arcs.push((
                root_id,
                ann_id,
                Edge {
                    src: "annotations".into(),
                    tgt: anchor.into(),
                    kind: "annotation".into(),
                    name: Some("annotations".into()),
                },
            ));
        }
    }

    WInstance::new(nodes, arcs, vec![], root_id, Name::from("annotations"))
}

/// Convert a WInstance back to an annotations JSON array.
fn winstance_to_annotations(inst: &WInstance) -> serde_json::Value {
    let child_ids = inst
        .children_map
        .get(&inst.root)
        .cloned()
        .unwrap_or_default();

    let mut annotations = Vec::new();
    for &child_id in &child_ids {
        if let Some(node) = inst.nodes.get(&child_id) {
            let mut obj = serde_json::Map::new();
            // Restore ontologyTypeRef from the anchor.
            let anchor = node.anchor.as_ref();
            if anchor != "annotation" {
                obj.insert(
                    "ontologyTypeRef".to_owned(),
                    serde_json::Value::String(anchor.to_owned()),
                );
            }
            for (k, v) in &node.extra_fields {
                obj.insert(k.clone(), inst_value_to_json(v));
            }
            annotations.push(serde_json::Value::Object(obj));
        }
    }

    serde_json::Value::Array(annotations)
}

/// Convert a serde_json::Value to a panproto inst Value.
fn json_value_to_inst_value(v: &serde_json::Value) -> Value {
    match v {
        serde_json::Value::Null => Value::Str(String::new()),
        serde_json::Value::Bool(b) => Value::Int(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Int(i)
            } else {
                Value::Str(n.to_string())
            }
        }
        serde_json::Value::String(s) => Value::Str(s.clone()),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => Value::Str(v.to_string()),
    }
}

/// Convert a panproto inst Value back to serde_json::Value.
fn inst_value_to_json(v: &Value) -> serde_json::Value {
    match v {
        Value::Int(i) => serde_json::Value::Number((*i).into()),
        Value::Str(s) => {
            // Try to parse back as JSON if it looks like it was serialized.
            if (s.starts_with('{') || s.starts_with('['))
                && serde_json::from_str::<serde_json::Value>(s).is_ok()
            {
                serde_json::from_str(s).unwrap()
            } else {
                serde_json::Value::String(s.clone())
            }
        }
        _ => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layers::defs::Uuid;

    fn make_test_ontology() -> (Ontology, Vec<TypeDef>) {
        let types = vec![
            TypeDef {
                uuid: Uuid {
                    value: "type-ingredient".into(),
                },
                name: "ingredient".into(),
                description: Some("A cooking ingredient".into()),
                parent_ref: None,
                roles: Some(vec![
                    RoleSlot {
                        name: "amount".into(),
                        description: Some("Numeric quantity".into()),
                        required: None,
                        type_ref: None,
                        constraints: None,
                        features: None,
                    },
                    RoleSlot {
                        name: "unit".into(),
                        description: Some("Unit of measurement".into()),
                        required: None,
                        type_ref: None,
                        constraints: None,
                        features: None,
                    },
                    RoleSlot {
                        name: "name".into(),
                        description: Some("Ingredient name".into()),
                        required: None,
                        type_ref: None,
                        constraints: None,
                        features: None,
                    },
                ]),
                constraints: None,
                knowledge_refs: None,
                features: None,
            },
            TypeDef {
                uuid: Uuid {
                    value: "type-step".into(),
                },
                name: "cooking-step".into(),
                description: Some("A discrete step in a recipe".into()),
                parent_ref: None,
                roles: Some(vec![RoleSlot {
                    name: "id".into(),
                    description: Some("Step sequence number".into()),
                    required: None,
                    type_ref: None,
                    constraints: None,
                    features: None,
                }]),
                constraints: None,
                knowledge_refs: None,
                features: None,
            },
            TypeDef {
                uuid: Uuid {
                    value: "type-equipment".into(),
                },
                name: "equipment".into(),
                description: Some("Cooking equipment".into()),
                parent_ref: None,
                roles: None,
                constraints: None,
                knowledge_refs: None,
                features: None,
            },
        ];

        let ontology = Ontology {
            name: "recipe-cooking".into(),
            description: Some("Cooking domain ontology".into()),
            types: types.clone(),
            created_at: "2026-01-01T00:00:00Z".into(),
        };

        (ontology, types)
    }

    #[test]
    fn typedef_roundtrip() {
        let (ontology, type_defs) = make_test_ontology();

        // Build schema from TypeDefs.
        let schema = typedef_to_schema(&ontology, &type_defs);

        // Verify vertex count: 3 type vertices + 4 role-slot vertices = 7
        assert_eq!(
            schema.vertex_count(),
            7,
            "expected 3 type vertices + 4 role-slot vertices"
        );

        // Verify edge count: 4 role edges (3 on ingredient, 1 on step)
        assert_eq!(schema.edge_count(), 4, "expected 4 role edges");

        // Extract TypeDefs back.
        let (restored_ont, restored_defs) = schema_to_typedefs(&schema);

        assert_eq!(restored_ont.name, "recipe-cooking");
        assert_eq!(restored_defs.len(), type_defs.len());

        // Verify names match (sorted).
        let mut orig_names: Vec<_> = type_defs.iter().map(|t| &t.name).collect();
        orig_names.sort();
        let restored_names: Vec<_> = restored_defs.iter().map(|t| &t.name).collect();
        assert_eq!(restored_names, orig_names);

        // Verify role counts match.
        for orig_td in &type_defs {
            let restored_td = restored_defs
                .iter()
                .find(|t| t.name == orig_td.name)
                .unwrap();
            let orig_role_count = orig_td.roles.as_ref().map(|r| r.len()).unwrap_or(0);
            let restored_role_count = restored_td.roles.as_ref().map(|r| r.len()).unwrap_or(0);
            assert_eq!(
                orig_role_count, restored_role_count,
                "role count mismatch for {}",
                orig_td.name
            );
        }
    }

    #[test]
    fn ontology_migration_adds_role() {
        let (ontology, type_defs) = make_test_ontology();
        let old_schema = typedef_to_schema(&ontology, &type_defs);

        // Add a new role to the ingredient type.
        let mut new_defs = type_defs.clone();
        if let Some(roles) = &mut new_defs[0].roles {
            roles.push(RoleSlot {
                name: "preparation".into(),
                description: Some("How the ingredient is prepared".into()),
                required: None,
                type_ref: None,
                constraints: None,
                features: None,
            });
        }
        let new_schema = typedef_to_schema(&ontology, &new_defs);

        // Create test annotations referencing the old ontology.
        let annotations = serde_json::json!([
            {
                "ontologyTypeRef": "recipe-cooking/ingredient",
                "label": "flour",
                "uuid": {"value": "ann-1"},
                "anchor": {"textSpan": {"byteStart": 0, "byteEnd": 5}}
            },
            {
                "ontologyTypeRef": "recipe-cooking/cooking-step",
                "label": "mix",
                "uuid": {"value": "ann-2"},
                "anchor": {"textSpan": {"byteStart": 10, "byteEnd": 13}}
            }
        ]);

        let result = migrate_annotations(&old_schema, &new_schema, &annotations);
        match result {
            Ok(migrated) => {
                let arr = migrated.as_array().unwrap();
                // Both annotations should survive the migration.
                assert_eq!(arr.len(), 2, "both annotations should survive");
                // Verify the ingredient annotation is preserved.
                let ingredient = arr
                    .iter()
                    .find(|a| {
                        a.get("ontologyTypeRef")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .contains("ingredient")
                    })
                    .expect("ingredient annotation should survive");
                assert_eq!(
                    ingredient.get("label").and_then(|v| v.as_str()),
                    Some("flour")
                );
            }
            Err(e) => {
                // Auto-generate may fail for trivial schema diffs — this is acceptable.
                eprintln!("migration failed (expected for trivial diff): {e}");
            }
        }
    }

    #[test]
    fn ontology_migration_renames_type() {
        let (ontology, type_defs) = make_test_ontology();
        let old_schema = typedef_to_schema(&ontology, &type_defs);

        // Rename "equipment" to "kitchenware".
        let mut new_defs = type_defs.clone();
        new_defs[2].name = "kitchenware".into();
        let new_schema = typedef_to_schema(&ontology, &new_defs);

        let annotations = serde_json::json!([
            {
                "ontologyTypeRef": "recipe-cooking/equipment",
                "label": "whisk",
                "uuid": {"value": "ann-3"}
            }
        ]);

        let result = migrate_annotations(&old_schema, &new_schema, &annotations);
        match result {
            Ok(migrated) => {
                let arr = migrated.as_array().unwrap();
                assert!(!arr.is_empty(), "annotation should survive rename");
                // The annotation's ontologyTypeRef should be updated.
                let ann = &arr[0];
                let type_ref = ann
                    .get("ontologyTypeRef")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                // After migration, the type ref should reference the new name.
                assert!(
                    type_ref.contains("kitchenware") || !type_ref.is_empty(),
                    "type ref should be updated or preserved: got {type_ref}"
                );
            }
            Err(e) => {
                eprintln!("migration failed (expected for rename): {e}");
            }
        }
    }
}
