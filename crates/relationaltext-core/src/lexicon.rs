//! LexiconRegistry — maps `$type` strings to semantic behavior.
//!
//! The registry decouples the document model (text + byte-ranged facets) from
//! feature semantics (is this a block? does it expand?).
//!
//! Look-up uses a compound key `$type#name` when the feature has a `name`
//! field, falling back to `$type` alone.  Wire-level `expandStart`/`expandEnd`
//! fields override the registry (explicit wins).

use crate::document::Feature;
use std::collections::HashMap;

/// The semantic class of a feature — drives HIR building and position adjustment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeatureClass {
    /// 1-char-wide marker (`\uFFFC` or `\n`) that introduces a block. Never expands.
    Block,
    /// Inline span with Peritext expand semantics.
    InlineMark,
    /// Inline entity (mention, link, tag). Expands conservatively.
    Entity,
    /// Comment (e.g. HTML `<!-- ... -->`). Has a position but no layout; content in attrs.
    Comment,
    /// Meta (e.g. doctype). Document-level or non-structural.
    Meta,
}

/// Semantic behavior registered for a `$type` (or `$type#name` compound key).
#[derive(Debug, Clone)]
pub struct LexiconBehavior {
    pub feature_class: FeatureClass,
    pub expand_start: bool,
    pub expand_end: bool,
    /// If true, this feature cannot have child content (e.g. HTML void elements).
    pub void: bool,
}

/// Registry mapping `$type` strings (or `$type#name` compound keys) to behavior.
pub struct LexiconRegistry {
    entries: HashMap<String, LexiconBehavior>,
}

impl LexiconRegistry {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Register behavior for a `$type` (or `$type#name` compound key).
    pub fn register(&mut self, key: impl Into<String>, behavior: LexiconBehavior) -> &mut Self {
        self.entries.insert(key.into(), behavior);
        self
    }

    /// Look up behavior: tries `$type#name` compound key first, then `$type`.
    pub fn get(&self, feature: &Feature) -> Option<&LexiconBehavior> {
        if let Some(name) = feature.get_str("name") {
            let compound = format!("{}#{}", feature.type_id, name);
            if let Some(b) = self.entries.get(&compound) {
                return Some(b);
            }
        }
        self.entries.get(&feature.type_id)
    }

    /// Feature class: from registry, or `InlineMark` as conservative default.
    pub fn feature_class(&self, feature: &Feature) -> FeatureClass {
        self.get(feature)
            .map(|b| b.feature_class)
            .unwrap_or(FeatureClass::InlineMark)
    }

    /// Expand-start: wire `expandStart` overrides registry; default false.
    pub fn expand_start(&self, feature: &Feature) -> bool {
        if let Some(v) = feature.data.get("expandStart").and_then(|v| v.as_bool()) {
            return v;
        }
        self.get(feature).map(|b| b.expand_start).unwrap_or(false)
    }

    /// Expand-end: wire `expandEnd` overrides registry; default false.
    pub fn expand_end(&self, feature: &Feature) -> bool {
        if let Some(v) = feature.data.get("expandEnd").and_then(|v| v.as_bool()) {
            return v;
        }
        self.get(feature).map(|b| b.expand_end).unwrap_or(false)
    }

    /// Register all feature types from a `org.relationaltext.format-lexicon` features array.
    ///
    /// Each element must be a JSON object with at minimum `"typeId"`. Optional fields:
    /// `"featureClass"` (`"block"` | `"entity"` | `"inline"`), `"expandStart"`,
    /// `"expandEnd"`, `"isAtprotoCompat"`.
    ///
    /// If a `typeId` contains an `@version` suffix (e.g. `org.commonmark.facet#strong@0.31`),
    /// the base key without the version is also registered so that unversioned features resolve.
    pub fn register_from_json_array(
        &mut self,
        features: &[serde_json::Value],
    ) -> Result<(), String> {
        for feature in features {
            let type_id = feature["typeId"].as_str().ok_or("feature missing typeId")?;
            let feature_class = match feature["featureClass"].as_str() {
                Some("block") => FeatureClass::Block,
                Some("entity") => FeatureClass::Entity,
                Some("comment") => FeatureClass::Comment,
                Some("meta") => FeatureClass::Meta,
                _ => FeatureClass::InlineMark,
            };
            let expand_start = feature["expandStart"].as_bool().unwrap_or(false);
            let expand_end = feature["expandEnd"].as_bool().unwrap_or(false);
            let void = feature["void"].as_bool().unwrap_or(false);

            let behavior = LexiconBehavior {
                feature_class,
                expand_start,
                expand_end,
                void,
            };
            self.register(type_id, behavior.clone());

            // Dual-registration: if typeId has @version suffix, also register the base key.
            if let Some(at) = type_id.rfind('@') {
                let base = &type_id[..at];
                self.register(base, behavior);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::Feature;

    fn test_registry() -> LexiconRegistry {
        let mut r = LexiconRegistry::new();
        r.register(
            "org.relationaltext.richtext.mark#bold",
            LexiconBehavior {
                feature_class: FeatureClass::InlineMark,
                expand_start: true,
                expand_end: true,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.mark#code",
            LexiconBehavior {
                feature_class: FeatureClass::InlineMark,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.block#paragraph",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "app.bsky.richtext.facet#mention",
            LexiconBehavior {
                feature_class: FeatureClass::Entity,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r
    }

    #[test]
    fn registry_compound_key_lookup_bold() {
        let registry = test_registry();
        let f = Feature::new("org.relationaltext.richtext.mark")
            .with_data("name", serde_json::Value::String("bold".into()));
        assert_eq!(registry.feature_class(&f), FeatureClass::InlineMark);
        assert!(registry.expand_start(&f));
        assert!(registry.expand_end(&f));
    }

    #[test]
    fn registry_compound_key_lookup_code() {
        let registry = test_registry();
        let f = Feature::new("org.relationaltext.richtext.mark")
            .with_data("name", serde_json::Value::String("code".into()));
        assert_eq!(registry.feature_class(&f), FeatureClass::InlineMark);
        assert!(!registry.expand_start(&f));
        assert!(!registry.expand_end(&f));
    }

    #[test]
    fn registry_block_feature_class() {
        let registry = test_registry();
        let f = Feature::new("org.relationaltext.richtext.block")
            .with_data("name", serde_json::Value::String("paragraph".into()));
        assert_eq!(registry.feature_class(&f), FeatureClass::Block);
        assert!(!registry.expand_start(&f));
        assert!(!registry.expand_end(&f));
    }

    #[test]
    fn wire_expand_overrides_registry() {
        let registry = test_registry();
        // code normally has expand=false, but explicit wire value overrides
        let f = Feature::new("org.relationaltext.richtext.mark")
            .with_data("name", serde_json::Value::String("code".into()))
            .with_data("expandStart", serde_json::Value::Bool(true));
        assert!(registry.expand_start(&f));
    }

    #[test]
    fn unknown_type_defaults_to_inline_mark() {
        let registry = test_registry();
        let f = Feature::new("com.example.unknown");
        assert_eq!(registry.feature_class(&f), FeatureClass::InlineMark);
        assert!(!registry.expand_start(&f));
    }

    #[test]
    fn register_from_json_array_basic() {
        let features = serde_json::json!([
            { "typeId": "com.example.facet#bold",   "featureClass": "inline", "expandStart": true, "expandEnd": true },
            { "typeId": "com.example.facet#code",   "featureClass": "inline" },
            { "typeId": "com.example.facet#para",   "featureClass": "block" },
            { "typeId": "com.example.facet#link",   "featureClass": "entity" }
        ]);
        let mut registry = LexiconRegistry::new();
        registry
            .register_from_json_array(features.as_array().unwrap())
            .unwrap();

        let bold = Feature::new("com.example.facet#bold");
        assert_eq!(registry.feature_class(&bold), FeatureClass::InlineMark);
        assert!(registry.expand_start(&bold));
        assert!(registry.expand_end(&bold));

        let code = Feature::new("com.example.facet#code");
        assert_eq!(registry.feature_class(&code), FeatureClass::InlineMark);
        assert!(!registry.expand_start(&code));

        let para = Feature::new("com.example.facet#para");
        assert_eq!(registry.feature_class(&para), FeatureClass::Block);

        let link = Feature::new("com.example.facet#link");
        assert_eq!(registry.feature_class(&link), FeatureClass::Entity);
    }

    #[test]
    fn register_from_json_array_version_dual_registration() {
        let features = serde_json::json!([
            { "typeId": "org.commonmark.facet#strong@0.31", "featureClass": "inline", "expandStart": true, "expandEnd": true }
        ]);
        let mut registry = LexiconRegistry::new();
        registry
            .register_from_json_array(features.as_array().unwrap())
            .unwrap();

        // Versioned key works
        let versioned = Feature::new("org.commonmark.facet#strong@0.31");
        assert_eq!(registry.feature_class(&versioned), FeatureClass::InlineMark);
        assert!(registry.expand_start(&versioned));

        // Base key also resolves (without @version)
        let base = Feature::new("org.commonmark.facet#strong");
        assert_eq!(registry.feature_class(&base), FeatureClass::InlineMark);
        assert!(registry.expand_start(&base));
    }

    #[test]
    fn register_from_json_array_missing_type_id_is_error() {
        let features = serde_json::json!([
            { "featureClass": "inline" }
        ]);
        let mut registry = LexiconRegistry::new();
        let result = registry.register_from_json_array(features.as_array().unwrap());
        assert!(result.is_err());
    }
}
