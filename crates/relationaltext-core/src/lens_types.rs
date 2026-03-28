//! Serde type definitions for the RelationalText lens system.
//!
//! These types define the JSON wire format for `org.relationaltext.lens`
//! records. They are pure data — all behavior lives in `panproto_bridge`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

pub(crate) fn default_true() -> bool {
    true
}
pub(crate) fn is_true(b: &bool) -> bool {
    *b
}
pub(crate) fn is_false(v: &bool) -> bool {
    !*v
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LensSpec {
    #[serde(rename = "$type")]
    pub dollar_type: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub source: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<LensRule>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passthrough: Option<Passthrough>,
    #[serde(rename = "wasmModule", skip_serializing_if = "Option::is_none")]
    pub wasm_module: Option<serde_json::Value>,
    #[serde(default = "default_true", skip_serializing_if = "is_true")]
    pub invertible: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LensRule {
    #[serde(rename = "match", skip_serializing_if = "Option::is_none")]
    pub match_: Option<FeaturePattern>,
    pub replace: Option<FeatureReplacement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub join: Option<JoinRule>,
    #[serde(default, rename = "deleteText", skip_serializing_if = "is_false")]
    pub delete_text: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinRule {
    pub primary: JoinParticipant,
    pub joined: Vec<JoinedParticipant>,
    pub produce: JoinProduction,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub delete_matched: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinParticipant {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_attrs: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedParticipant {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_attrs: Option<HashMap<String, serde_json::Value>>,
    pub alias: String,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinProduction {
    pub name: JoinAttrSource,
    pub type_id: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub attrs: HashMap<String, JoinAttrSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "from", rename_all = "camelCase")]
pub enum JoinAttrSource {
    Attr {
        attr: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transform: Option<JoinAttrTransform>,
    },
    PrimaryAttr {
        attr: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transform: Option<JoinAttrTransform>,
    },
    JoinedAttr {
        alias: String,
        attr: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transform: Option<JoinAttrTransform>,
    },
    Text {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transform: Option<JoinAttrTransform>,
    },
    Literal {
        value: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinAttrTransform {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ops: Vec<JoinTransformOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum JoinTransformOp {
    Ltrim { chars: String },
    Rtrim { chars: String },
    Trim { chars: String },
    Prefix { value: String },
    Suffix { value: String },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FeaturePattern {
    #[serde(rename = "typeId", skip_serializing_if = "Option::is_none")]
    pub type_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "matchAttrs", skip_serializing_if = "Option::is_none")]
    pub match_attrs: Option<HashMap<String, serde_json::Value>>,
    #[serde(rename = "matchAttrsAny", skip_serializing_if = "Option::is_none")]
    pub match_attrs_any: Option<HashMap<String, Vec<serde_json::Value>>>,
    #[serde(rename = "matchAttrsAll", skip_serializing_if = "Option::is_none")]
    pub match_attrs_all: Option<HashMap<String, Vec<serde_json::Value>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op")]
pub enum AttrValueOp {
    #[serde(rename = "add")]
    Add { value: f64 },
    #[serde(rename = "subtract")]
    Subtract { value: f64 },
    #[serde(rename = "multiply")]
    Multiply { value: f64 },
    #[serde(rename = "prefix")]
    Prefix { value: String },
    #[serde(rename = "suffix")]
    Suffix { value: String },
    #[serde(rename = "negate")]
    Negate,
    #[serde(rename = "to-string")]
    ToStr,
    #[serde(rename = "to-number")]
    ToNum,
    #[serde(rename = "to-boolean")]
    ToBool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ReplacementName {
    Literal(String),
    Template { template: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureReplacement {
    #[serde(rename = "typeId", skip_serializing_if = "Option::is_none")]
    pub type_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<ReplacementName>,
    #[serde(rename = "renameAttrs", skip_serializing_if = "Option::is_none")]
    pub rename_attrs: Option<HashMap<String, String>>,
    #[serde(rename = "addAttrs", skip_serializing_if = "Option::is_none")]
    pub add_attrs: Option<HashMap<String, serde_json::Value>>,
    #[serde(rename = "dropAttrs", skip_serializing_if = "Option::is_none")]
    pub drop_attrs: Option<Vec<String>>,
    #[serde(rename = "keepAttrs", skip_serializing_if = "Option::is_none")]
    pub keep_attrs: Option<Vec<String>>,
    #[serde(rename = "mapAttrValue", skip_serializing_if = "Option::is_none")]
    pub map_attr_value: Option<HashMap<String, AttrValueOp>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Passthrough {
    Keep,
    Drop,
}
