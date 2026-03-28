//! Corpus types for the Layers data model.
//!
//! A corpus groups expressions and defines the annotation design
//! (which layers, formalisms, and ontologies are expected).

use serde::{Deserialize, Serialize};

use super::defs::{AnnotationMetadata, FeatureMap, KnowledgeRef};

/// A description of an expected annotation layer within a corpus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationDesign {
    /// Annotation kind (e.g., "token-tag", "span", "relation").
    pub kind: String,
    /// Annotation subkind (e.g., "pos", "ner", "dependency").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subkind: Option<String>,
    /// Formalism slug.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formalism: Option<String>,
    /// Reference to the ontology used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ontology_ref: Option<String>,
    /// Label set identifier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_set: Option<String>,
    /// Whether this layer is required for all expressions in the corpus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
}

/// A corpus record grouping expressions under a shared annotation design.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Corpus {
    /// Human-readable name.
    pub name: String,
    /// Description of this corpus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// BCP-47 language tags for the corpus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
    /// The annotation design (expected layers).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotation_design: Option<Vec<AnnotationDesign>>,
    /// References to expressions in this corpus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression_refs: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
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
    fn annotation_design_roundtrip() {
        let design = AnnotationDesign {
            kind: "token-tag".into(),
            subkind: Some("pos".into()),
            formalism: Some("universal-dependencies".into()),
            ontology_ref: None,
            label_set: Some("universal-pos".into()),
            required: Some(true),
        };
        let json = serde_json::to_string(&design).unwrap();
        let back: AnnotationDesign = serde_json::from_str(&json).unwrap();
        assert_eq!(design, back);
    }

    #[test]
    fn corpus_roundtrip() {
        let corpus = Corpus {
            name: "English Web Treebank".into(),
            description: Some("UD English EWT".into()),
            languages: Some(vec!["en".into()]),
            annotation_design: Some(vec![AnnotationDesign {
                kind: "token-tag".into(),
                subkind: Some("pos".into()),
                formalism: Some("universal-dependencies".into()),
                ontology_ref: None,
                label_set: None,
                required: Some(true),
            }]),
            expression_refs: None,
            knowledge_refs: None,
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&corpus).unwrap();
        let back: Corpus = serde_json::from_str(&json).unwrap();
        assert_eq!(corpus, back);
    }
}
