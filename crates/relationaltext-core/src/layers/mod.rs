//! Layers: the native annotation substrate for relationaltext.
//!
//! This module provides Rust types that mirror the ATProto Layers lexicons
//! (`pub.layers.*`), enabling rich linguistic annotation, segmentation,
//! ontology, graph, alignment, judgment, corpus, and resource structures
//! to be used alongside the core Document model.

pub mod alignment;
pub mod annotation;
pub mod corpus;
pub mod defs;
pub mod expression;
pub mod graph;
pub mod judgment;
pub mod layered_document;
pub mod ontology;
pub mod resource;
pub mod segmentation;

pub use alignment::Alignment;
pub use annotation::{Annotation, AnnotationLayer, ArgumentRef, Cluster};
pub use corpus::{AnnotationDesign, Corpus};
pub use defs::{
    AgentRef, AlignmentLink, Anchor, AnnotationMetadata, BoundingBox, Constraint, ExternalTarget,
    FeatureEntry, FeatureMap, FragmentSelector, Keyframe, KnowledgeRef, ObjectRef, PageAnchor,
    Selector, Span, SpatialEntity, SpatialExpression, SpatialModifier, SpatioTemporalAnchor,
    TemporalEntity, TemporalExpression, TemporalModifier, TemporalSpan, TextPositionSelector,
    TextQuoteSelector, TokenRef, TokenRefSequence, Uuid,
};
pub use expression::Expression;
pub use graph::{GraphEdgeEntry, GraphEdgeSet, GraphNode};
pub use judgment::{AgreementReport, ExperimentDef, Judgment, JudgmentSet};
pub use layered_document::LayeredDocument;
pub use ontology::{Ontology, RoleSlot, TypeDef};
pub use resource::{Collection, Entry, Filling, Slot, SlotFilling, Template};
pub use segmentation::{Segmentation, Token, Tokenization};
