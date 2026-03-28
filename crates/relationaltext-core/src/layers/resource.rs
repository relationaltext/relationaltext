//! Resource types for the Layers data model.
//!
//! Templates define reusable annotation structures with slots and constraints.
//! Collections group related resources.

use serde::{Deserialize, Serialize};

use super::defs::{Constraint, FeatureMap, KnowledgeRef};

/// A slot definition within a template.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    /// Slot name.
    pub name: String,
    /// Human-readable description.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this slot is required.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    /// Default value for this slot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    /// Constraints on slot fillers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<Constraint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A filling of a single slot in a template.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotFilling {
    /// Name of the slot being filled.
    pub slot_name: String,
    /// The value filling this slot.
    pub value: String,
}

/// A concrete filling of a template (all or some of its slots).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filling {
    /// Reference to the template being filled.
    pub template_ref: String,
    /// The slot fillings.
    pub slots: Vec<SlotFilling>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A reusable annotation template with typed slots and constraints.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    /// Human-readable name.
    pub name: String,
    /// Description of this template.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The slots in this template.
    pub slots: Vec<Slot>,
    /// Cross-slot constraints.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<Constraint>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

/// An entry within a collection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Reference to the resource (expression, template, etc.).
    pub ref_uri: String,
    /// Optional ordering key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_key: Option<String>,
    /// Optional label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// A collection of related resources.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    /// Human-readable name.
    pub name: String,
    /// Description of this collection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The entries in this collection.
    pub entries: Vec<Entry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slot_roundtrip() {
        let slot = Slot {
            name: "subject".into(),
            description: Some("The subject NP".into()),
            required: Some(true),
            default_value: None,
            constraints: None,
            features: None,
        };
        let json = serde_json::to_string(&slot).unwrap();
        let back: Slot = serde_json::from_str(&json).unwrap();
        assert_eq!(slot, back);
    }

    #[test]
    fn template_roundtrip() {
        let template = Template {
            name: "Transitive Clause".into(),
            description: Some("A clause with subject, verb, and object".into()),
            slots: vec![
                Slot {
                    name: "subject".into(),
                    description: None,
                    required: Some(true),
                    default_value: None,
                    constraints: None,
                    features: None,
                },
                Slot {
                    name: "verb".into(),
                    description: None,
                    required: Some(true),
                    default_value: None,
                    constraints: None,
                    features: None,
                },
                Slot {
                    name: "object".into(),
                    description: None,
                    required: Some(false),
                    default_value: None,
                    constraints: None,
                    features: None,
                },
            ],
            constraints: None,
            knowledge_refs: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&template).unwrap();
        let back: Template = serde_json::from_str(&json).unwrap();
        assert_eq!(template, back);
    }

    #[test]
    fn filling_roundtrip() {
        let filling = Filling {
            template_ref: "at://did:plc:abc/pub.layers.resource.template/trans-clause".into(),
            slots: vec![
                SlotFilling {
                    slot_name: "subject".into(),
                    value: "The cat".into(),
                },
                SlotFilling {
                    slot_name: "verb".into(),
                    value: "sat".into(),
                },
            ],
            features: None,
        };
        let json = serde_json::to_string(&filling).unwrap();
        let back: Filling = serde_json::from_str(&json).unwrap();
        assert_eq!(filling, back);
    }

    #[test]
    fn collection_roundtrip() {
        let coll = Collection {
            name: "Test Suite".into(),
            description: None,
            entries: vec![Entry {
                ref_uri: "at://did:plc:abc/pub.layers.expression/sent1".into(),
                sort_key: Some("001".into()),
                label: Some("Basic transitive".into()),
            }],
            knowledge_refs: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&coll).unwrap();
        let back: Collection = serde_json::from_str(&json).unwrap();
        assert_eq!(coll, back);
    }
}
