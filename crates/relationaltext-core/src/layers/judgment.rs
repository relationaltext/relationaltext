//! Judgment types for the Layers data model.
//!
//! Experiments, judgment sets, and inter-annotator agreement reports
//! for annotation quality assessment and experimental linguistics.

use serde::{Deserialize, Serialize};

use super::defs::{AgentRef, AnnotationMetadata, FeatureMap, KnowledgeRef};

/// An experiment definition for collecting judgments.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentDef {
    /// Human-readable name.
    pub name: String,
    /// Description of the experiment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The type of judgment (e.g., "acceptability", "similarity", "naturalness").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub judgment_type: Option<String>,
    /// Scale definition (e.g., "1-7", "binary", "continuous").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<String>,
    /// Instructions for annotators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

/// A single judgment within a JudgmentSet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Judgment {
    /// Reference to the expression being judged.
    pub expression_ref: String,
    /// The judgment value (numeric as string, or categorical label).
    pub value: String,
    /// The agent who made this judgment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentRef>,
    /// Response time in milliseconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_time_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A set of judgments collected under an experiment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgmentSet {
    /// Reference to the experiment definition.
    pub experiment_ref: String,
    /// The judgments in this set.
    pub judgments: Vec<Judgment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

/// An inter-annotator agreement report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgreementReport {
    /// The layer or experiment this report covers.
    pub subject_ref: String,
    /// Agreement metric (e.g., "cohens-kappa", "fleiss-kappa", "krippendorffs-alpha").
    pub metric: String,
    /// Agreement score (scaled 0-1000).
    pub score: u32,
    /// Number of annotators.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotator_count: Option<u32>,
    /// Number of items evaluated.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_count: Option<u32>,
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
    fn experiment_def_roundtrip() {
        let exp = ExperimentDef {
            name: "Acceptability Judgments".into(),
            description: Some("Rate sentence acceptability 1-7".into()),
            judgment_type: Some("acceptability".into()),
            scale: Some("1-7".into()),
            instructions: Some("Rate each sentence on a scale of 1-7.".into()),
            knowledge_refs: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&exp).unwrap();
        let back: ExperimentDef = serde_json::from_str(&json).unwrap();
        assert_eq!(exp, back);
    }

    #[test]
    fn judgment_set_roundtrip() {
        let js = JudgmentSet {
            experiment_ref: "at://did:plc:abc/pub.layers.judgment.experimentDef/exp1".into(),
            judgments: vec![Judgment {
                expression_ref: "at://did:plc:abc/pub.layers.expression/sent1".into(),
                value: "5".into(),
                agent: Some(AgentRef {
                    did: None,
                    id: Some("worker-42".into()),
                    name: None,
                    knowledge_ref: None,
                }),
                response_time_ms: Some(1500),
                features: None,
            }],
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&js).unwrap();
        let back: JudgmentSet = serde_json::from_str(&json).unwrap();
        assert_eq!(js, back);
    }

    #[test]
    fn agreement_report_roundtrip() {
        let report = AgreementReport {
            subject_ref: "at://did:plc:abc/pub.layers.annotation/layer1".into(),
            metric: "cohens-kappa".into(),
            score: 780,
            annotator_count: Some(3),
            item_count: Some(500),
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&report).unwrap();
        let back: AgreementReport = serde_json::from_str(&json).unwrap();
        assert_eq!(report, back);
    }
}
