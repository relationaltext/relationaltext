//! Ontology types for the Layers data model.
//!
//! An ontology defines the type system (frame definitions, entity types, relation types)
//! used by annotation layers. Corresponds to `pub.layers.ontology.typeDef` and related defs.

use serde::{Deserialize, Serialize};

use super::defs::{Constraint, FeatureMap, KnowledgeRef, Uuid};

/// A type definition record within an ontology (entity type, frame definition,
/// relation type, etc.).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeDef {
    pub uuid: Uuid,
    /// Short identifier for this type (e.g., "Person", "Agent", "Cause").
    pub name: String,
    /// Human-readable description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Parent type for inheritance hierarchies.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_ref: Option<String>,
    /// Role slots defined by this type (for frame-like types).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roles: Option<Vec<RoleSlot>>,
    /// Constraints on instances of this type.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<Constraint>>,
    /// Links to external knowledge bases.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A role/slot within a type definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleSlot {
    /// Role name (e.g., "Agent", "ARG0", "Theme").
    pub name: String,
    /// Human-readable description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this role is required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Type constraint on fillers (AT-URI of a TypeDef).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_ref: Option<String>,
    /// Constraints on fillers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<Constraint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// An ontology: a collection of type definitions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ontology {
    /// Human-readable name.
    pub name: String,
    /// Description of this ontology.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The type definitions in this ontology.
    pub types: Vec<TypeDef>,
    /// When this ontology was created.
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type_def_roundtrip() {
        let td = TypeDef {
            uuid: Uuid {
                value: "type-1".into(),
            },
            name: "Person".into(),
            description: Some("A person entity".into()),
            parent_ref: None,
            roles: None,
            constraints: None,
            knowledge_refs: None,
            features: None,
        };
        let json = serde_json::to_string(&td).unwrap();
        let back: TypeDef = serde_json::from_str(&json).unwrap();
        assert_eq!(td, back);
    }

    #[test]
    fn role_slot_roundtrip() {
        let slot = RoleSlot {
            name: "Agent".into(),
            description: Some("The agent performing the action".into()),
            required: Some(true),
            type_ref: Some("at://did:plc:abc/pub.layers.ontology/Person".into()),
            constraints: None,
            features: None,
        };
        let json = serde_json::to_string(&slot).unwrap();
        let back: RoleSlot = serde_json::from_str(&json).unwrap();
        assert_eq!(slot, back);
    }

    #[test]
    fn ontology_roundtrip() {
        let ont = Ontology {
            name: "NER Types".into(),
            description: Some("Named entity types for OntoNotes".into()),
            types: vec![TypeDef {
                uuid: Uuid {
                    value: "type-per".into(),
                },
                name: "Person".into(),
                description: None,
                parent_ref: None,
                roles: None,
                constraints: None,
                knowledge_refs: None,
                features: None,
            }],
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&ont).unwrap();
        let back: Ontology = serde_json::from_str(&json).unwrap();
        assert_eq!(ont, back);
    }
}
