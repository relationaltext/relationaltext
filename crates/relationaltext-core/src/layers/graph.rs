//! Graph types for the Layers data model.
//!
//! Graph nodes and edge sets represent entity graphs, dependency graphs,
//! knowledge graphs, and other graph structures over expressions.

use serde::{Deserialize, Serialize};

use super::defs::{Anchor, AnnotationMetadata, FeatureMap, KnowledgeRef, ObjectRef, Uuid};

/// A node in a graph structure over an expression.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub uuid: Uuid,
    /// The expression this node belongs to.
    pub expression: String,
    /// How this node anchors to the expression.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<Anchor>,
    /// A label for this node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Node type (e.g., "entity", "event", "concept").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_type: Option<String>,
    /// Reference to an ontology type definition.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ontology_type_ref: Option<String>,
    /// Links to external knowledge bases.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

/// A single directed edge entry within a GraphEdgeSet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeEntry {
    /// Source node reference.
    pub source: ObjectRef,
    /// Target node reference.
    pub target: ObjectRef,
    /// Edge label (relation type).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Confidence score 0-1000.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A set of edges in a graph structure.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeSet {
    /// The expression this edge set belongs to.
    pub expression: String,
    /// Edge type (e.g., "dependency", "coreference", "causal").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edge_type: Option<String>,
    /// The edges in this set.
    pub edges: Vec<GraphEdgeEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graph_node_roundtrip() {
        let node = GraphNode {
            uuid: Uuid {
                value: "node-1".into(),
            },
            expression: "at://did:plc:abc/pub.layers.expression/doc1".into(),
            anchor: None,
            label: Some("Entity A".into()),
            node_type: Some("entity".into()),
            ontology_type_ref: None,
            knowledge_refs: None,
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&node).unwrap();
        let back: GraphNode = serde_json::from_str(&json).unwrap();
        assert_eq!(node, back);
    }

    #[test]
    fn graph_edge_entry_roundtrip() {
        let edge = GraphEdgeEntry {
            source: ObjectRef {
                local_id: Some(Uuid {
                    value: "node-1".into(),
                }),
                record_ref: None,
                object_id: None,
                knowledge_ref: None,
            },
            target: ObjectRef {
                local_id: Some(Uuid {
                    value: "node-2".into(),
                }),
                record_ref: None,
                object_id: None,
                knowledge_ref: None,
            },
            label: Some("causes".into()),
            confidence: Some(800),
            knowledge_refs: None,
            features: None,
        };
        let json = serde_json::to_string(&edge).unwrap();
        let back: GraphEdgeEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(edge, back);
    }

    #[test]
    fn graph_edge_set_roundtrip() {
        let eset = GraphEdgeSet {
            expression: "at://did:plc:abc/pub.layers.expression/doc1".into(),
            edge_type: Some("causal".into()),
            edges: vec![GraphEdgeEntry {
                source: ObjectRef {
                    local_id: Some(Uuid { value: "n1".into() }),
                    record_ref: None,
                    object_id: None,
                    knowledge_ref: None,
                },
                target: ObjectRef {
                    local_id: Some(Uuid { value: "n2".into() }),
                    record_ref: None,
                    object_id: None,
                    knowledge_ref: None,
                },
                label: Some("causes".into()),
                confidence: None,
                knowledge_refs: None,
                features: None,
            }],
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&eset).unwrap();
        let back: GraphEdgeSet = serde_json::from_str(&json).unwrap();
        assert_eq!(eset, back);
    }
}
