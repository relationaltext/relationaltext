//! Annotation layer types for the Layers data model.
//!
//! Corresponds to `pub.layers.annotation.annotationLayer` and `pub.layers.annotation.defs`.

use serde::{Deserialize, Serialize};

use super::defs::{
    Anchor, AnnotationMetadata, FeatureMap, KnowledgeRef, ObjectRef, SpatialExpression,
    TemporalExpression, Uuid,
};

/// A named layer of annotations over an expression.
///
/// All annotation types use this single record type. The combination of kind,
/// subkind, and formalism determines how the appview renders the layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationLayer {
    /// The expression this annotation layer applies to.
    pub expression: String,
    /// AT-URI of the annotation kind definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_uri: Option<String>,
    /// Primary annotation kind slug.
    pub kind: String,
    /// AT-URI of the annotation subkind definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subkind_uri: Option<String>,
    /// Annotation subkind slug.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subkind: Option<String>,
    /// AT-URI of the formalism definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formalism_uri: Option<String>,
    /// Formalism slug.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formalism: Option<String>,
    /// AT-URI of the annotation source method definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_method_uri: Option<String>,
    /// How this annotation layer was produced.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_method: Option<String>,
    /// Identifier for the label set used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_set: Option<String>,
    /// Reference to a pub.layers.ontology defining the types used in this layer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ontology_ref: Option<String>,
    /// For token-aligned layers: the tokenization these annotations are aligned to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tokenization_id: Option<Uuid>,
    /// Rank among k-best alternatives (1 = best).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<u32>,
    /// Reference to the top-ranked layer in a k-best group.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alternatives_ref: Option<String>,
    /// For dependent/subordinate layers: the parent layer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_layer_ref: Option<String>,
    /// BCP-47 language tag for this layer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// The annotations in this layer.
    pub annotations: Vec<Annotation>,
    /// Annotation metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    /// When this layer was created.
    pub created_at: String,
}

/// A single abstract annotation.
///
/// The fields populated depend on the layer's kind/subkind. For token-tags:
/// tokenIndex + label. For spans: anchor + label. For trees: anchor + label +
/// parentId/childIds. For relations: anchor + arguments.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub uuid: Uuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<Anchor>,
    /// For token-level annotations: 0-based index into the tokenization.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_index: Option<u32>,
    /// The primary label (POS tag, entity type, frame name, etc.).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Secondary value (lemma form, gloss, normalized temporal value, etc.).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    /// Surface text of the annotated span.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Parent annotation in tree structures.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<Uuid>,
    /// Child annotation UUIDs in tree structures.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub child_ids: Option<Vec<Uuid>>,
    /// Head/governor token index for directed arcs (-1 for root).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_index: Option<i32>,
    /// Dependent/target token index for directed arcs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_index: Option<u32>,
    /// Role/argument fillers for predicate-argument structures.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Vec<ArgumentRef>>,
    /// Confidence score 0-1000.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u32>,
    /// Reference to a type definition in a pub.layers.ontology.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ontology_type_ref: Option<String>,
    /// Links to external knowledge bases.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    /// Structured temporal annotation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal: Option<TemporalExpression>,
    /// Structured spatial annotation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spatial: Option<SpatialExpression>,
    /// Open-ended features.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A role/argument reference in a predicate-argument structure.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ArgumentRef {
    /// The argument role label.
    pub role: String,
    /// Reference to the annotation filling this role.
    pub target: ObjectRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A cluster of annotations (e.g., coreferent entity mentions).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cluster {
    pub uuid: Uuid,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canonical_label: Option<String>,
    pub members: Vec<ObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layers::defs::Span;

    #[test]
    fn annotation_minimal_roundtrip() {
        let ann = Annotation {
            uuid: Uuid {
                value: "ann-1".into(),
            },
            anchor: None,
            token_index: Some(0),
            label: Some("NOUN".into()),
            value: None,
            text: None,
            parent_id: None,
            child_ids: None,
            head_index: None,
            target_index: None,
            arguments: None,
            confidence: None,
            ontology_type_ref: None,
            knowledge_refs: None,
            temporal: None,
            spatial: None,
            features: None,
        };
        let json = serde_json::to_string(&ann).unwrap();
        let back: Annotation = serde_json::from_str(&json).unwrap();
        assert_eq!(ann, back);
    }

    #[test]
    fn annotation_layer_roundtrip() {
        let layer = AnnotationLayer {
            expression: "at://did:plc:abc/pub.layers.expression/doc1".into(),
            kind_uri: None,
            kind: "token-tag".into(),
            subkind_uri: None,
            subkind: Some("pos".into()),
            formalism_uri: None,
            formalism: Some("universal-dependencies".into()),
            source_method_uri: None,
            source_method: None,
            label_set: Some("universal-pos".into()),
            ontology_ref: None,
            tokenization_id: Some(Uuid {
                value: "tok-1".into(),
            }),
            rank: None,
            alternatives_ref: None,
            parent_layer_ref: None,
            language: None,
            annotations: vec![Annotation {
                uuid: Uuid {
                    value: "ann-1".into(),
                },
                anchor: None,
                token_index: Some(0),
                label: Some("NOUN".into()),
                value: None,
                text: None,
                parent_id: None,
                child_ids: None,
                head_index: None,
                target_index: None,
                arguments: None,
                confidence: Some(990),
                ontology_type_ref: None,
                knowledge_refs: None,
                temporal: None,
                spatial: None,
                features: None,
            }],
            metadata: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&layer).unwrap();
        let back: AnnotationLayer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, back);
    }

    #[test]
    fn annotation_with_span_anchor_roundtrip() {
        use crate::layers::defs::Anchor;
        let ann = Annotation {
            uuid: Uuid {
                value: "ann-span".into(),
            },
            anchor: Some(Anchor {
                text_span: Some(Span {
                    byte_start: 0,
                    byte_end: 5,
                    char_start: None,
                    char_end: None,
                }),
                token_ref: None,
                token_ref_sequence: None,
                temporal_span: None,
                spatio_temporal_anchor: None,
                page_anchor: None,
                external_target: None,
            }),
            token_index: None,
            label: Some("PER".into()),
            value: None,
            text: Some("Alice".into()),
            parent_id: None,
            child_ids: None,
            head_index: None,
            target_index: None,
            arguments: None,
            confidence: None,
            ontology_type_ref: None,
            knowledge_refs: None,
            temporal: None,
            spatial: None,
            features: None,
        };
        let json = serde_json::to_string(&ann).unwrap();
        let back: Annotation = serde_json::from_str(&json).unwrap();
        assert_eq!(ann, back);
    }

    #[test]
    fn argument_ref_roundtrip() {
        let arg = ArgumentRef {
            role: "ARG0".into(),
            target: ObjectRef {
                local_id: Some(Uuid {
                    value: "ann-2".into(),
                }),
                record_ref: None,
                object_id: None,
                knowledge_ref: None,
            },
            features: None,
        };
        let json = serde_json::to_string(&arg).unwrap();
        let back: ArgumentRef = serde_json::from_str(&json).unwrap();
        assert_eq!(arg, back);
    }

    #[test]
    fn cluster_roundtrip() {
        let cluster = Cluster {
            uuid: Uuid {
                value: "cluster-1".into(),
            },
            canonical_label: Some("John Smith".into()),
            members: vec![
                ObjectRef {
                    local_id: Some(Uuid {
                        value: "ann-1".into(),
                    }),
                    record_ref: None,
                    object_id: None,
                    knowledge_ref: None,
                },
                ObjectRef {
                    local_id: Some(Uuid {
                        value: "ann-3".into(),
                    }),
                    record_ref: None,
                    object_id: None,
                    knowledge_ref: None,
                },
            ],
            knowledge_refs: None,
            features: None,
        };
        let json = serde_json::to_string(&cluster).unwrap();
        let back: Cluster = serde_json::from_str(&json).unwrap();
        assert_eq!(cluster, back);
    }
}
