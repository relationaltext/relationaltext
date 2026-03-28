//! Lens system for relationaltext — bidirectional, composable transformations between
//! feature lexicon namespaces.
//!
//! Type definitions live in `lens_types.rs`; this module re-exports them and
//! provides the JSON-level matching, replacement, inversion, and composition logic.

pub use crate::lens_types::*;

use std::collections::{HashMap, HashSet, VecDeque};

// ─── Version stripping ────────────────────────────────────────────────────────

/// Strip the `@version` suffix from a string (e.g. `"strong@0.31"` → `"strong"`).
/// Uses `rfind('@')` so only the last `@` is stripped.
pub fn strip_version(s: &str) -> &str {
    match s.rfind('@') {
        Some(idx) => &s[..idx],
        None => s,
    }
}

// ─── Rule resolution ──────────────────────────────────────────────────────────

/// Fill in implicit `typeId` fields: `None` in a match defaults to `source`;
/// `None` in a replace defaults to `target`.
/// Join rules and SQL rules are passed through unchanged (they have no typeId to resolve).
fn resolve_rules(rules: &[LensRule], source: &str, target: &str) -> Vec<LensRule> {
    rules
        .iter()
        .map(|rule| {
            // SQL rules and join rules pass through unchanged (no type_id resolution needed).
            if rule.sql.is_some() || rule.join.is_some() {
                return rule.clone();
            }
            let m = rule
                .match_
                .as_ref()
                .expect("non-SQL, non-join rule must have match_");
            LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some(m.type_id.as_deref().unwrap_or(source).to_string()),
                    name: m.name.clone(),
                    match_attrs: m.match_attrs.clone(),
                    match_attrs_any: m.match_attrs_any.clone(),
                    match_attrs_all: m.match_attrs_all.clone(),
                }),
                replace: rule.replace.as_ref().map(|r| FeatureReplacement {
                    type_id: Some(r.type_id.as_deref().unwrap_or(target).to_string()),
                    name: r.name.clone(),
                    rename_attrs: r.rename_attrs.clone(),
                    add_attrs: r.add_attrs.clone(),
                    drop_attrs: r.drop_attrs.clone(),
                    keep_attrs: r.keep_attrs.clone(),
                    map_attr_value: r.map_attr_value.clone(),
                }),
                sql: None,
                join: None,
                delete_text: rule.delete_text,
            }
        })
        .collect()
}

// ─── Feature matching ─────────────────────────────────────────────────────────

/// Test whether a JSON feature object matches a pattern.
/// Version-tolerant: strips `@version` suffixes before comparing.
///
/// Supports three styles:
/// - Separate typeId + name: `{ typeId: "ns.a", name: "mark" }`
///   matches `{ "$type": "ns.a", "name": "mark" }`
/// - Compound key in typeId: `{ typeId: "ns.a#mark" }`
///   matches `{ "$type": "ns.a", "name": "mark" }`
/// - ATProto-style compound $type: `{ typeId: "app.bsky.richtext.facet#mention" }`
///   matches `{ "$type": "app.bsky.richtext.facet#mention" }`
///
/// If `pat.type_id` is `None` (unresolved), the match always returns `false`.
pub fn feature_matches_pattern(feature: &serde_json::Value, pat: &FeaturePattern) -> bool {
    let pat_type_id = match pat.type_id.as_deref() {
        Some(t) => t,
        None => return false,
    };

    let feature_type = match feature["$type"].as_str() {
        Some(t) => t,
        None => return false,
    };

    let type_name_matches = if let Some(pat_name) = &pat.name {
        // Explicit name check: $type AND name data field must both match (version-stripped)
        let feature_name = feature["name"].as_str().unwrap_or("");
        strip_version(feature_type) == strip_version(pat_type_id)
            && strip_version(feature_name) == strip_version(pat_name)
    } else if strip_version(feature_type) == strip_version(pat_type_id) {
        // Direct $type equality (version-stripped both sides)
        true
    } else if let Some(feature_name) = feature["name"].as_str() {
        // Compound key check: pattern.type_id might be "$type#name" format
        let feature_type_stripped = strip_version(feature_type);
        let feature_name_stripped = strip_version(feature_name);
        let compound_stripped = format!("{}#{}", feature_type_stripped, feature_name_stripped);
        compound_stripped == strip_version(pat_type_id)
    } else {
        false
    };

    if !type_name_matches {
        return false;
    }

    // Check matchAttrs: all specified key-value pairs must be present in the feature's attrs.
    // Attrs may be nested under "attrs" (block features) or flat (mark/entity features).
    if let Some(match_attrs) = &pat.match_attrs {
        let flat = feature.as_object();
        let nested = flat
            .and_then(|o| o.get("attrs"))
            .and_then(|v| v.as_object());
        for (key, expected_val) in match_attrs {
            let actual = nested
                .and_then(|a| a.get(key))
                .or_else(|| flat.and_then(|o| o.get(key)));
            match actual {
                Some(val) if val == expected_val => {}
                _ => return false,
            }
        }
    }

    // Check matchAttrsAny: for each key, at least one of the expected values must be present
    // in the attribute (which may be a JSON array or a scalar).
    if let Some(any_map) = &pat.match_attrs_any {
        let flat = feature.as_object();
        let nested = flat
            .and_then(|o| o.get("attrs"))
            .and_then(|v| v.as_object());
        for (key, expected) in any_map {
            let actual = nested
                .and_then(|a| a.get(key))
                .or_else(|| flat.and_then(|o| o.get(key)));
            let ok = match actual {
                Some(serde_json::Value::Array(arr)) => arr.iter().any(|v| expected.contains(v)),
                Some(scalar) => expected.contains(scalar),
                None => false,
            };
            if !ok {
                return false;
            }
        }
    }

    // Check matchAttrsAll: for each key, all of the expected values must be present
    // in the attribute (which may be a JSON array or a scalar).
    if let Some(all_map) = &pat.match_attrs_all {
        let flat = feature.as_object();
        let nested = flat
            .and_then(|o| o.get("attrs"))
            .and_then(|v| v.as_object());
        for (key, expected) in all_map {
            let actual = nested
                .and_then(|a| a.get(key))
                .or_else(|| flat.and_then(|o| o.get(key)));
            let ok = match actual {
                Some(serde_json::Value::Array(arr)) => expected.iter().all(|ev| arr.contains(ev)),
                Some(scalar) => expected.len() == 1 && expected[0] == *scalar,
                None => false,
            };
            if !ok {
                return false;
            }
        }
    }

    true
}

/// Test whether a FeatureReplacement (typeId + optional name) matches a pattern.
/// Used during lens composition to find which second-lens rule applies.
fn replacement_matches_pattern(repl: &FeatureReplacement, pat: &FeaturePattern) -> bool {
    let repl_type_id = repl.type_id.as_deref().unwrap_or("");
    let pat_type_id = pat.type_id.as_deref().unwrap_or("");

    // Extract the literal name from the replacement, if any.
    // A Template name cannot be statically matched — treat it as unresolvable.
    let repl_literal_name: Option<&str> = match &repl.name {
        Some(ReplacementName::Literal(s)) => Some(s.as_str()),
        Some(ReplacementName::Template { .. }) => return false,
        None => None,
    };

    if let Some(pat_name) = &pat.name {
        let repl_name = repl_literal_name.unwrap_or("");
        return strip_version(repl_type_id) == strip_version(pat_type_id)
            && strip_version(repl_name) == strip_version(pat_name);
    }

    if strip_version(repl_type_id) == strip_version(pat_type_id) {
        return true;
    }

    if let Some(repl_name) = repl_literal_name {
        let compound_stripped = format!(
            "{}#{}",
            strip_version(repl_type_id),
            strip_version(repl_name)
        );
        if compound_stripped == strip_version(pat_type_id) {
            return true;
        }
    }

    false
}

// ─── Feature replacement application ─────────────────────────────────────────

/// Apply a single AttrValueOp to a JSON value.
/// Numeric ops are no-ops on non-numbers; string ops are no-ops on non-strings;
/// negate is a no-op on non-booleans. Integer-valued floats are returned as i64.
fn apply_attr_op(val: serde_json::Value, op: &AttrValueOp) -> serde_json::Value {
    fn num_result(f: f64) -> serde_json::Value {
        if f.fract() == 0.0 && f >= i64::MIN as f64 && f <= i64::MAX as f64 {
            serde_json::Value::Number((f as i64).into())
        } else {
            serde_json::json!(f)
        }
    }
    match op {
        AttrValueOp::Add { value: n } => {
            if let Some(f) = val.as_f64() {
                num_result(f + n)
            } else {
                val
            }
        }
        AttrValueOp::Subtract { value: n } => {
            if let Some(f) = val.as_f64() {
                num_result(f - n)
            } else {
                val
            }
        }
        AttrValueOp::Multiply { value: n } => {
            if let Some(f) = val.as_f64() {
                num_result(f * n)
            } else {
                val
            }
        }
        AttrValueOp::Prefix { value: s } => {
            if let Some(st) = val.as_str() {
                serde_json::Value::String(format!("{}{}", s, st))
            } else {
                val
            }
        }
        AttrValueOp::Suffix { value: s } => {
            if let Some(st) = val.as_str() {
                serde_json::Value::String(format!("{}{}", st, s))
            } else {
                val
            }
        }
        AttrValueOp::Negate => {
            if let Some(b) = val.as_bool() {
                serde_json::Value::Bool(!b)
            } else {
                val
            }
        }
        AttrValueOp::ToStr => match &val {
            serde_json::Value::String(_) => val,
            serde_json::Value::Number(n) => serde_json::Value::String(n.to_string()),
            serde_json::Value::Bool(b) => {
                serde_json::Value::String(if *b { "true" } else { "false" }.to_string())
            }
            serde_json::Value::Null => serde_json::Value::String("null".to_string()),
            _ => val,
        },
        AttrValueOp::ToNum => match val {
            serde_json::Value::Number(_) => val,
            serde_json::Value::String(ref s) => s
                .parse::<f64>()
                .map(num_result)
                .unwrap_or(serde_json::Value::Null),
            serde_json::Value::Bool(b) => {
                serde_json::Value::Number(if b { 1i64.into() } else { 0i64.into() })
            }
            serde_json::Value::Null => serde_json::Value::Null,
            _ => val,
        },
        AttrValueOp::ToBool => match &val {
            serde_json::Value::Bool(_) => val,
            serde_json::Value::String(s) => {
                serde_json::Value::Bool(!s.is_empty() && s != "false" && s != "0")
            }
            serde_json::Value::Number(n) => {
                serde_json::Value::Bool(n.as_f64().map(|f| f != 0.0).unwrap_or(false))
            }
            serde_json::Value::Null => serde_json::Value::Bool(false),
            _ => val,
        },
    }
}

/// Apply attr transformation ops to a map (either the flat feature or its nested "attrs" object).
/// `preserve_type_name`: when true (flat/mark path), keepAttrs also preserves "$type" and "name".
fn apply_attr_ops(
    attrs: &mut serde_json::Map<String, serde_json::Value>,
    r: &FeatureReplacement,
    preserve_type_name: bool,
) {
    if let Some(rename_attrs) = &r.rename_attrs {
        for (from, to) in rename_attrs {
            if let Some(val) = attrs.remove(from) {
                attrs.insert(to.clone(), val);
            }
        }
    }
    if let Some(map_attr_value) = &r.map_attr_value {
        for (key, op) in map_attr_value {
            if let Some(val) = attrs.remove(key) {
                attrs.insert(key.clone(), apply_attr_op(val, op));
            }
        }
    }
    if let Some(add_attrs) = &r.add_attrs {
        for (key, val) in add_attrs {
            attrs.insert(key.clone(), val.clone());
        }
    }
    if let Some(drop_attrs) = &r.drop_attrs {
        for key in drop_attrs {
            attrs.remove(key);
        }
    }
    if let Some(keep_attrs) = &r.keep_attrs {
        let keep_set: HashSet<&str> = keep_attrs.iter().map(|s| s.as_str()).collect();
        if preserve_type_name {
            let reserved: HashSet<&str> = ["$type", "name"].iter().copied().collect();
            attrs.retain(|k, _| reserved.contains(k.as_str()) || keep_set.contains(k.as_str()));
        } else {
            attrs.retain(|k, _| keep_set.contains(k.as_str()));
        }
    }
}

/// Expand a template string by substituting `{key}` placeholders with values from
/// the feature object.
///
/// Lookup order: nested `attrs` object first (block features), then the flat feature map.
/// If a key is not found, the placeholder is left unchanged (e.g. `"{missing}"` stays as-is).
/// Numeric values are rendered as integers when they have no fractional part.
fn expand_template(template: &str, obj: &serde_json::Map<String, serde_json::Value>) -> String {
    let nested_attrs = obj.get("attrs").and_then(|v| v.as_object());
    let mut result = String::with_capacity(template.len());
    let mut remaining = template;
    while !remaining.is_empty() {
        if let Some(open) = remaining.find('{') {
            // Push the literal prefix before the '{'
            result.push_str(&remaining[..open]);
            let after_open = &remaining[open + 1..];
            if let Some(close) = after_open.find('}') {
                let key = &after_open[..close];
                // Look up in nested attrs first, then flat map
                let val = nested_attrs
                    .and_then(|a| a.get(key))
                    .or_else(|| obj.get(key));
                if let Some(v) = val {
                    let s = match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                i.to_string()
                            } else if let Some(f) = n.as_f64() {
                                if f.fract() == 0.0 {
                                    (f as i64).to_string()
                                } else {
                                    n.to_string()
                                }
                            } else {
                                n.to_string()
                            }
                        }
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Null => "null".to_string(),
                        other => other.to_string(),
                    };
                    result.push_str(&s);
                } else {
                    // Key not found — leave placeholder verbatim
                    result.push('{');
                    result.push_str(key);
                    result.push('}');
                }
                // Advance past '{' + key + '}'
                remaining = &after_open[close + 1..];
            } else {
                // No closing brace found — push the '{' literally and continue
                result.push('{');
                remaining = after_open;
            }
        } else {
            // No more placeholders
            result.push_str(remaining);
            break;
        }
    }
    result
}

/// Apply a replacement descriptor to a feature JSON value.
pub fn apply_replacement(feature: serde_json::Value, r: &FeatureReplacement) -> serde_json::Value {
    let mut obj = match feature {
        serde_json::Value::Object(o) => o,
        other => return other,
    };

    // 1. Set $type (None is a resolved-rule invariant violation; use empty string as fallback)
    obj.insert(
        "$type".to_string(),
        serde_json::Value::String(r.type_id.as_deref().unwrap_or("").to_string()),
    );

    // 2. Update or clear the name field
    match &r.name {
        Some(ReplacementName::Literal(name)) => {
            obj.insert("name".to_string(), serde_json::Value::String(name.clone()));
        }
        Some(ReplacementName::Template { template }) => {
            // Interpolate {key} placeholders from the feature's attrs (nested preferred)
            // or flat fields. We build a lookup map that merges the original source values
            // with any `add_attrs` from the replacement — this ensures that composed lens
            // rules which add attrs (e.g. contentful heading-1 → heading{level:1} → h{level})
            // can still resolve the template even when the source feature lacks the key.
            let lookup = if let Some(add_attrs) = &r.add_attrs {
                let mut merged = obj.clone();
                for (key, val) in add_attrs {
                    merged.entry(key.clone()).or_insert_with(|| val.clone());
                }
                std::borrow::Cow::Owned(merged)
            } else {
                std::borrow::Cow::Borrowed(&obj)
            };
            let resolved = expand_template(template, &lookup);
            obj.insert("name".to_string(), serde_json::Value::String(resolved));
        }
        None => {
            obj.remove("name");
        }
    }

    // 3–7. Apply attr transformations.
    // If the feature has a nested "attrs" object (block/entity style), operate on that.
    // Otherwise operate on the flat feature map (mark style).
    let has_nested_attrs = obj.get("attrs").is_some_and(|v| v.is_object());
    if has_nested_attrs {
        let mut nested = match obj.remove("attrs").unwrap() {
            serde_json::Value::Object(o) => o,
            _ => unreachable!(),
        };
        apply_attr_ops(&mut nested, r, false);
        obj.insert("attrs".to_string(), serde_json::Value::Object(nested));
    } else {
        apply_attr_ops(&mut obj, r, true);
    }

    serde_json::Value::Object(obj)
}

// ─── Core lens operations ─────────────────────────────────────────────────────

/// Apply a lens to all features in a document JSON value.
///
/// Features not matched by any rule are either kept (passthrough: keep, the default)
/// or dropped (passthrough: drop). Returns a new document value — does not modify
/// the input.
pub fn apply_lens_to_doc(doc: &serde_json::Value, spec: &LensSpec) -> serde_json::Value {
    // Parse the document into a typed Document struct
    let document: crate::document::Document = match serde_json::from_value(doc.clone()) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("apply_lens_to_doc: failed to parse document: {e}");
            return doc.clone();
        }
    };

    // Build the protolens chain from the LensSpec rules (structural rules only;
    // matchAttrs and template rules are handled post-restrict)
    let chain = crate::panproto_bridge::lens_spec_to_protolens_chain(spec);

    // Schema-driven conversion: Document → WInstance.
    // Uses document_to_winstance with compound anchors ($type#name) because
    // RT Documents have dynamically-typed features — the vertex set depends
    // on what features are in the actual document. The schema is derived
    // from the instance via build_schema_from_instance. For static-schema
    // formats (ATProto lexicons), convert_via_panproto uses parse_json instead.
    let instance = crate::panproto_bridge::document_to_winstance(&document);
    let protocol = panproto_protocols::web_document::atproto::protocol();
    let schema = build_schema_from_instance(&instance, &protocol);

    // Auto-generate lens from schema + chain. Field transforms are derived
    // automatically by auto_generate (Phase 3), but we also inject any
    // LensSpec-specific transforms for rules not captured by the chain.
    let mut lens = chain.instantiate(&schema, &protocol).unwrap_or_else(|e| {
        eprintln!("apply_lens_to_doc: instantiation failed: {e}");
        panproto_lens::Lens {
            compiled: panproto_inst::CompiledMigration {
                surviving_verts: schema.vertices.keys().cloned().collect(),
                surviving_edges: schema.edges.keys().cloned().collect(),
                vertex_remap: std::collections::HashMap::new(),
                edge_remap: std::collections::HashMap::new(),
                resolver: std::collections::HashMap::new(),
                hyper_resolver: std::collections::HashMap::new(),
                field_transforms: std::collections::HashMap::new(),
                conditional_survival: std::collections::HashMap::new(),
            },
            src_schema: schema.clone(),
            tgt_schema: schema,
        }
    });

    // Inject field transforms for structural rules (non-matchAttrs, non-template)
    inject_field_transforms(&mut lens.compiled, spec);

    // Handle passthrough:drop — remove unmatched feature vertices from surviving set
    if matches!(spec.passthrough, Some(Passthrough::Drop)) {
        let resolved = resolve_rules(
            spec.rules.as_deref().unwrap_or(&[]),
            &spec.source,
            &spec.target,
        );
        let matched_anchors: std::collections::HashSet<String> = resolved
            .iter()
            .filter_map(|r| {
                if r.sql.is_some() || r.join.is_some() {
                    return None;
                }
                // Only include features with non-null replacement (replace:null = drop)
                if r.replace.is_none() {
                    return None;
                }
                let p = r.match_.as_ref()?;
                let name = p.name.as_ref()?;
                let type_id = p.type_id.as_deref().unwrap_or(&spec.source);
                Some(format!("{type_id}#{name}"))
            })
            .collect();

        // Keep structural vertices (document, facet), matched feature vertices,
        // and their remapped target names (values in vertex_remap).
        let remap_targets: std::collections::HashSet<&panproto_gat::Name> =
            lens.compiled.vertex_remap.values().collect();
        lens.compiled.surviving_verts.retain(|v| {
            let s = v.as_ref();
            s == "document"
                || s == "facet"
                || matched_anchors.contains(s)
                || lens.compiled.vertex_remap.contains_key(v)
                || remap_targets.contains(v)
        });
    }

    // Apply the lens via panproto's get (restrict + complement tracking)
    let (view, _complement) = panproto_lens::get(&lens, &instance).unwrap_or_else(|e| {
        eprintln!("apply_lens_to_doc: get failed: {e}");
        (
            instance.clone(),
            panproto_lens::Complement {
                dropped_nodes: std::collections::HashMap::new(),
                dropped_arcs: Vec::new(),
                dropped_fans: Vec::new(),
                contraction_choices: std::collections::HashMap::new(),
                original_parent: std::collections::HashMap::new(),
            },
        )
    });

    // Convert back to Document
    let mut result_doc = match crate::panproto_bridge::winstance_to_document(&view) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("apply_lens_to_doc: winstance_to_document failed: {e}");
            return doc.clone();
        }
    };

    // Nested attribute operations (renameAttrs, dropAttrs, addAttrs, keepAttrs)
    // are now handled by panproto's PathTransform in inject_field_transforms.
    // No post-restrict handler needed.

    // matchAttrs rules are now handled by panproto's Case transform
    // (dependent function space for field transforms) in inject_field_transforms.
    // Template name rules are handled by ComputeField.
    // No post-restrict handler needed for either.
    let resolved = resolve_rules(
        spec.rules.as_deref().unwrap_or(&[]),
        &spec.source,
        &spec.target,
    );

    // Post-process: apply join rules (merge features from same-range facets).
    // Join rules combine a primary feature with joined features at the same byte range
    // into a new produced feature, then delete the originals.
    let join_rules: Vec<&LensRule> = resolved.iter().filter(|r| r.join.is_some()).collect();

    if !join_rules.is_empty() {
        use crate::lens_types::JoinAttrSource;

        for join_rule in &join_rules {
            let join = join_rule.join.as_ref().unwrap();
            // Group features by byte range for matching
            let mut range_features: HashMap<(u32, u32), Vec<(usize, &crate::document::Feature)>> =
                HashMap::new();
            for (fi, facet) in result_doc.facets.iter().enumerate() {
                let key = (facet.index.byte_start, facet.index.byte_end);
                for feat in &facet.features {
                    range_features.entry(key).or_default().push((fi, feat));
                }
            }

            let mut new_facets: Vec<crate::document::Facet> = Vec::new();
            let mut delete_indices: HashSet<usize> = HashSet::new();

            for (&(bs, be), features) in &range_features {
                // Find primary feature
                let primary = features.iter().find(|(_, f)| {
                    f.data.get("name").and_then(|v| v.as_str()) == Some(join.primary.name.as_str())
                });
                if primary.is_none() {
                    continue;
                }

                // Find all joined features
                let mut all_joined_found = true;
                let mut joined_map: HashMap<&str, &crate::document::Feature> = HashMap::new();
                for joined_spec in &join.joined {
                    let found = features.iter().find(|(_, f)| {
                        f.data.get("name").and_then(|v| v.as_str())
                            == Some(joined_spec.name.as_str())
                    });
                    match found {
                        Some((_, feat)) => {
                            joined_map.insert(&joined_spec.alias, feat);
                        }
                        None if joined_spec.required => {
                            all_joined_found = false;
                            break;
                        }
                        None => {}
                    }
                }

                if !all_joined_found {
                    continue;
                }

                // Resolve the produced name from JoinAttrSource
                let produce_name = match &join.produce.name {
                    JoinAttrSource::Literal { value } => value.as_str().unwrap_or("").to_string(),
                    JoinAttrSource::PrimaryAttr { attr, .. } => primary
                        .unwrap()
                        .1
                        .data
                        .get(attr)
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    JoinAttrSource::Attr { attr, .. } => primary
                        .unwrap()
                        .1
                        .data
                        .get(attr)
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    _ => String::new(),
                };

                let mut produced_data = serde_json::Map::new();
                produced_data.insert("name".into(), serde_json::json!(produce_name));

                for (key, source) in &join.produce.attrs {
                    let val = match source {
                        JoinAttrSource::PrimaryAttr { attr, .. } => {
                            primary.unwrap().1.data.get(attr).cloned()
                        }
                        JoinAttrSource::JoinedAttr { alias, attr, .. } => joined_map
                            .get(alias.as_str())
                            .and_then(|f| f.data.get(attr).cloned()),
                        JoinAttrSource::Literal { value } => Some(value.clone()),
                        JoinAttrSource::Attr { attr, .. } => {
                            primary.unwrap().1.data.get(attr).cloned()
                        }
                        JoinAttrSource::Text { .. } => None,
                    };
                    if let Some(v) = val {
                        produced_data.insert(key.clone(), v);
                    }
                }

                let produced = crate::document::Feature {
                    type_id: join.produce.type_id.clone(),
                    data: produced_data,
                };

                new_facets.push(crate::document::Facet {
                    index: crate::document::ByteSlice {
                        byte_start: bs,
                        byte_end: be,
                    },
                    features: vec![produced],
                });

                // Mark matched facets for deletion
                if !join.delete_matched.is_empty() {
                    for (fi, feat) in features {
                        if let Some(name) = feat.data.get("name").and_then(|v| v.as_str()) {
                            if join.delete_matched.iter().any(|d| d == name) {
                                delete_indices.insert(*fi);
                            }
                        }
                    }
                }
            }

            // Remove deleted facets and add produced ones
            if !delete_indices.is_empty() || !new_facets.is_empty() {
                let mut kept: Vec<crate::document::Facet> = result_doc
                    .facets
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| !delete_indices.contains(i))
                    .map(|(_, f)| f.clone())
                    .collect();
                kept.extend(new_facets);
                result_doc.facets = kept;
            }
        }
    }

    // Parent reference updates are now handled by panproto's MapReferences
    // in inject_field_transforms. No post-restrict handler needed.

    // Always include facets array for API compat
    let facets_value = serde_json::to_value(&result_doc.facets).unwrap_or_default();
    serde_json::json!({
        "text": result_doc.text,
        "facets": facets_value,
    })
}

/// Extract field transforms from a LensSpec and inject them into the
/// compiled migration so that `wtype_restrict` applies value-level
/// operations (attribute renames, drops, additions, value transforms)
/// to surviving nodes' extra_fields.
/// Convert a template string like "h{level}" to a ComputeField expression.
///
/// Uses `Expr::Builtin` for `Concat` and `IntToStr`.
fn template_to_compute_expr(template: &str) -> panproto_expr::Expr {
    use panproto_expr::{BuiltinOp, Expr};
    use std::sync::Arc;

    let mut parts: Vec<Expr> = Vec::new();
    let mut remaining = template;

    while !remaining.is_empty() {
        if let Some(open) = remaining.find('{') {
            if open > 0 {
                parts.push(Expr::Lit(panproto_expr::Literal::Str(
                    remaining[..open].to_string(),
                )));
            }
            let after = &remaining[open + 1..];
            if let Some(close) = after.find('}') {
                let key = &after[..close];
                parts.push(Expr::builtin(
                    BuiltinOp::IntToStr,
                    vec![Expr::Var(Arc::from(format!("attrs.{key}").as_str()))],
                ));
                remaining = &after[close + 1..];
            } else {
                parts.push(Expr::Lit(panproto_expr::Literal::Str(remaining.to_string())));
                break;
            }
        } else {
            parts.push(Expr::Lit(panproto_expr::Literal::Str(remaining.to_string())));
            break;
        }
    }

    if parts.len() == 1 {
        return parts.into_iter().next().unwrap();
    }

    let first = parts.pop().unwrap();
    parts.into_iter().rev().fold(first, |acc, p| {
        Expr::builtin(BuiltinOp::Concat, vec![p, acc])
    })
}

/// Inject replacement attribute transforms (renameAttrs, dropAttrs, addAttrs,
/// keepAttrs) for a single rule. Extracted to avoid duplication between the
/// main inject_field_transforms loop and the matchAttrs/template handlers.
fn inject_field_transforms(compiled: &mut panproto_inst::CompiledMigration, spec: &LensSpec) {
    let resolved = resolve_rules(
        spec.rules.as_deref().unwrap_or(&[]),
        &spec.source,
        &spec.target,
    );

    for rule in &resolved {
        if rule.sql.is_some() || rule.join.is_some() {
            continue;
        }
        let pattern = match &rule.match_ {
            Some(p) => p,
            None => continue,
        };
        // Value-dependent rules (matchAttrs): inject Case transforms.
        // Each matchAttrs rule becomes a CaseBranch with a predicate
        // built from the matchAttrs and transforms from the replacement.
        if pattern.match_attrs.is_some()
            || pattern.match_attrs_any.is_some()
            || pattern.match_attrs_all.is_some()
        {
            // Collect all matchAttrs rules for this vertex name into Case branches
            // (handled after the loop — see below)
            continue;
        }
        let match_name = match &pattern.name {
            Some(n) => n.clone(),
            None => continue,
        };
        let replacement = match &rule.replace {
            Some(r) => r,
            None => continue,
        };
        // Template name rules: inject ComputeField to compute the name
        // from an expression, rather than handling post-restrict.
        if let Some(ReplacementName::Template { template }) = &replacement.name {
            let match_type_id = pattern.type_id.as_deref().unwrap_or(&spec.source);
            let source_key = format!("{match_type_id}#{match_name}");
            // Order: addAttrs → ComputeField ($type, name) → dropAttrs/renameAttrs/keepAttrs
            // addAttrs first so template variables are available
            if let Some(adds) = &replacement.add_attrs {
                for (key, val) in adds {
                    let value = crate::panproto_bridge::value_convert::json_to_value(val);
                    compiled.add_field_default(&source_key, key, value);
                }
            }
            // Set $type
            if let Some(type_id) = &replacement.type_id {
                compiled.add_computed_field(
                    &source_key,
                    "$type",
                    panproto_expr::Expr::Lit(panproto_expr::Literal::Str(type_id.clone())),
                );
            }
            // Compute template name
            let expr = template_to_compute_expr(template);
            compiled.add_computed_field(&source_key, "name", expr);
            // dropAttrs/renameAttrs/keepAttrs AFTER template resolution
            if let Some(drops) = &replacement.drop_attrs {
                for key in drops {
                    compiled.add_field_drop(&source_key, key);
                    compiled.add_path_transform(
                        &source_key,
                        &["attrs"],
                        panproto_inst::FieldTransform::DropField { key: key.clone() },
                    );
                }
            }
            if let Some(renames) = &replacement.rename_attrs {
                for (old, new) in renames {
                    compiled.add_field_rename(&source_key, old, new);
                    compiled.add_path_transform(
                        &source_key,
                        &["attrs"],
                        panproto_inst::FieldTransform::RenameField {
                            old_key: old.clone(),
                            new_key: new.clone(),
                        },
                    );
                }
            }
            continue;
        }
        // Skip rules whose match name has sibling rules with matchAttrs*.
        // Those sibling rules need the full attribute set to survive wtype_restrict
        // so they can be matched post-restrict.
        let has_sibling_match_attrs = resolved.iter().any(|other| {
            if std::ptr::eq(rule, other) {
                return false;
            }
            let om = match &other.match_ {
                Some(m) => m,
                None => return false,
            };
            om.name.as_deref() == Some(&match_name)
                && (om.match_attrs.is_some()
                    || om.match_attrs_any.is_some()
                    || om.match_attrs_all.is_some())
        });
        if has_sibling_match_attrs {
            continue;
        }

        let match_type_id = pattern.type_id.as_deref().unwrap_or(&spec.source);
        let source_key = format!("{match_type_id}#{match_name}");

        if let Some(renames) = &replacement.rename_attrs {
            for (old, new) in renames {
                // Apply at top level (flat marks)
                compiled.add_field_rename(&source_key, old, new);
                // Also apply inside nested attrs (block features)
                compiled.add_path_transform(
                    &source_key,
                    &["attrs"],
                    panproto_inst::FieldTransform::RenameField {
                        old_key: old.clone(),
                        new_key: new.clone(),
                    },
                );
            }
        }

        if let Some(drops) = &replacement.drop_attrs {
            for key in drops {
                compiled.add_field_drop(&source_key, key);
                compiled.add_path_transform(
                    &source_key,
                    &["attrs"],
                    panproto_inst::FieldTransform::DropField { key: key.clone() },
                );
            }
        }

        if let Some(adds) = &replacement.add_attrs {
            for (key, val) in adds {
                let value = crate::panproto_bridge::value_convert::json_to_value(val);
                compiled.add_field_default(&source_key, key, value.clone());
                compiled.add_path_transform(
                    &source_key,
                    &["attrs"],
                    panproto_inst::FieldTransform::AddField {
                        key: key.clone(),
                        value,
                    },
                );
            }
        }

        if let Some(keep) = &replacement.keep_attrs {
            let keys: Vec<&str> = keep.iter().map(String::as_str).collect();
            compiled.add_field_keep(&source_key, &keys);
            compiled.add_path_transform(
                &source_key,
                &["attrs"],
                panproto_inst::FieldTransform::KeepFields {
                    keys: keep.clone(),
                },
            );
        }

        if let Some(map_ops) = &replacement.map_attr_value {
            for (attr, op) in map_ops {
                if let Some(expr) =
                    crate::panproto_bridge::protolens::attr_value_op_to_expr(attr, op)
                {
                    compiled.add_field_expr(&source_key, attr, expr);
                }
            }
        }
    }

    // Build Case transforms for matchAttrs rules.
    // Group rules by match name, build CaseBranch per matchAttrs variant.
    {
        use panproto_expr::{BuiltinOp, Expr, Literal};
        use std::sync::Arc;

        let mut case_branches: HashMap<String, Vec<panproto_inst::CaseBranch>> = HashMap::new();

        for rule in &resolved {
            if rule.sql.is_some() || rule.join.is_some() {
                continue;
            }
            let pattern = match &rule.match_ {
                Some(p) => p,
                None => continue,
            };
            // Include BOTH matchAttrs rules AND plain rules whose name
            // has sibling matchAttrs rules (these become default Case branches)
            let has_match_attrs = pattern.match_attrs.is_some()
                || pattern.match_attrs_any.is_some()
                || pattern.match_attrs_all.is_some();
            if !has_match_attrs {
                // Check if this is a plain rule with matchAttrs siblings
                let name = pattern.name.as_deref().unwrap_or("");
                let has_sibling = resolved.iter().any(|other| {
                    if std::ptr::eq(rule, other) { return false; }
                    let om = match &other.match_ { Some(m) => m, None => return false };
                    om.name.as_deref() == Some(name)
                        && (om.match_attrs.is_some()
                            || om.match_attrs_any.is_some()
                            || om.match_attrs_all.is_some())
                });
                if !has_sibling {
                    continue;
                }
            }
            let match_name = match &pattern.name {
                Some(n) => n.as_str(),
                None => continue,
            };
            let repl = match &rule.replace {
                Some(r) => r,
                None => continue,
            };

            // Build predicate from matchAttrs
            let mut conditions = Vec::new();
            if let Some(attrs) = &pattern.match_attrs {
                for (key, val) in attrs {
                    // build_env_from_extra_fields binds both flat keys and
                    // attrs.* qualified keys. Use the flat key since that
                    // always exists; attrs.key only exists when attrs is nested.
                    let key_var = Expr::Var(Arc::from(key.as_str()));
                    let val_lit = match val {
                        serde_json::Value::String(s) => Expr::Lit(Literal::Str(s.clone())),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                Expr::Lit(Literal::Int(i))
                            } else {
                                Expr::Lit(Literal::Float(n.as_f64().unwrap_or(0.0)))
                            }
                        }
                        serde_json::Value::Bool(b) => Expr::Lit(Literal::Bool(*b)),
                        _ => Expr::Lit(Literal::Null),
                    };
                    conditions.push(Expr::builtin(BuiltinOp::Eq, vec![key_var, val_lit]));
                }
            }
            // matchAttrsAny: at least one value must be present
            // Array values are serialized as comma-separated strings by
            // value_to_expr_literal, so Contains checks membership.
            if let Some(any_map) = &pattern.match_attrs_any {
                for (key, vals) in any_map {
                    let key_var = Expr::Var(Arc::from(key.as_str()));
                    let mut or_conds: Vec<Expr> = vals
                        .iter()
                        .filter_map(|val| {
                            let s = val.as_str()?;
                            Some(Expr::builtin(
                                BuiltinOp::Contains,
                                vec![key_var.clone(), Expr::Lit(Literal::Str(s.to_string()))],
                            ))
                        })
                        .collect();
                    if let Some(first) = or_conds.pop() {
                        let folded = or_conds.into_iter().rev().fold(first, |acc, c| Expr::builtin(BuiltinOp::Or, vec![c, acc]));
                        conditions.push(folded);
                    }
                }
            }
            // matchAttrsAll: all values must be present
            if let Some(all_map) = &pattern.match_attrs_all {
                for (key, vals) in all_map {
                    let key_var = Expr::Var(Arc::from(key.as_str()));
                    for val in vals {
                        if let Some(s) = val.as_str() {
                            conditions.push(Expr::builtin(
                                BuiltinOp::Contains,
                                vec![key_var.clone(), Expr::Lit(Literal::Str(s.to_string()))],
                            ));
                        }
                    }
                }
            }
            // Build predicate: AND all conditions.
            // For many-to-one rules without matchAttrs, add a name check
            // so each branch identifies WHICH source feature it matches.
            if conditions.is_empty() && !has_match_attrs {
                // This is a many-to-one rule (no matchAttrs) — check the name
                conditions.push(Expr::builtin(
                    BuiltinOp::Eq,
                    vec![
                        Expr::Var(Arc::from("name")),
                        Expr::Lit(Literal::Str(match_name.to_string())),
                    ],
                ));
            }
            let predicate = if conditions.is_empty() {
                Expr::Lit(Literal::Bool(true))
            } else {
                let first = conditions.pop().unwrap();
                conditions
                    .into_iter()
                    .rev()
                    .fold(first, |acc, c| Expr::builtin(BuiltinOp::And, vec![c, acc]))
            };

            // Build transforms from the replacement
            let mut transforms = Vec::new();
            // Type change
            if let Some(type_id) = &repl.type_id {
                transforms.push(panproto_inst::FieldTransform::ComputeField {
                    target_key: "$type".to_string(),
                    expr: Expr::Lit(Literal::Str(type_id.clone())),
                });
            }
            // Name change
            match &repl.name {
                Some(ReplacementName::Literal(name)) => {
                    transforms.push(panproto_inst::FieldTransform::ComputeField {
                        target_key: "name".to_string(),
                        expr: Expr::Lit(Literal::Str(name.clone())),
                    });
                }
                Some(ReplacementName::Template { template }) => {
                    transforms.push(panproto_inst::FieldTransform::ComputeField {
                        target_key: "name".to_string(),
                        expr: template_to_compute_expr(template),
                    });
                }
                None => {}
            }
            // Attribute operations
            if let Some(adds) = &repl.add_attrs {
                for (key, val) in adds {
                    let value = crate::panproto_bridge::value_convert::json_to_value(val);
                    transforms.push(panproto_inst::FieldTransform::AddField {
                        key: key.clone(),
                        value: value.clone(),
                    });
                    transforms.push(panproto_inst::FieldTransform::PathTransform {
                        path: vec!["attrs".to_string()],
                        inner: Box::new(panproto_inst::FieldTransform::AddField {
                            key: key.clone(),
                            value,
                        }),
                    });
                }
            }
            if let Some(drops) = &repl.drop_attrs {
                for key in drops {
                    transforms.push(panproto_inst::FieldTransform::DropField { key: key.clone() });
                    transforms.push(panproto_inst::FieldTransform::PathTransform {
                        path: vec!["attrs".to_string()],
                        inner: Box::new(panproto_inst::FieldTransform::DropField {
                            key: key.clone(),
                        }),
                    });
                }
            }
            if let Some(keep) = &repl.keep_attrs {
                // Preserve name and $type alongside the kept attrs
                let mut keep_keys = keep.clone();
                if !keep_keys.contains(&"name".to_string()) {
                    keep_keys.push("name".to_string());
                }
                if !keep_keys.contains(&"$type".to_string()) {
                    keep_keys.push("$type".to_string());
                }
                if !keep_keys.contains(&"parents".to_string()) {
                    keep_keys.push("parents".to_string());
                }
                transforms.push(panproto_inst::FieldTransform::KeepFields {
                    keys: keep_keys,
                });
                transforms.push(panproto_inst::FieldTransform::PathTransform {
                    path: vec!["attrs".to_string()],
                    inner: Box::new(panproto_inst::FieldTransform::KeepFields {
                        keys: keep.clone(),
                    }),
                });
            }
            if let Some(renames) = &repl.rename_attrs {
                for (old, new) in renames {
                    transforms.push(panproto_inst::FieldTransform::RenameField {
                        old_key: old.clone(),
                        new_key: new.clone(),
                    });
                    transforms.push(panproto_inst::FieldTransform::PathTransform {
                        path: vec!["attrs".to_string()],
                        inner: Box::new(panproto_inst::FieldTransform::RenameField {
                            old_key: old.clone(),
                            new_key: new.clone(),
                        }),
                    });
                }
            }

            let match_type_id = pattern.type_id.as_deref().unwrap_or(&spec.source);
            let source_key = format!("{match_type_id}#{match_name}");

            case_branches
                .entry(source_key)
                .or_default()
                .push(panproto_inst::CaseBranch {
                    predicate,
                    transforms,
                });
        }

        // Inject Case transforms for each vertex
        for (vertex, branches) in case_branches {
            compiled.add_case_transform(&vertex, branches);
        }
    }

    // Build a rename map for parent reference updates.
    // When features are renamed or dropped, the `parents` array in other
    // features must be updated. Use panproto's MapReferences to handle
    // this during wtype_restrict rather than as a post-restrict pass.
    let mut parent_rename_map: HashMap<String, Option<String>> = HashMap::new();
    for rule in &resolved {
        if rule.sql.is_some() || rule.join.is_some() {
            continue;
        }
        let match_name = match rule.match_.as_ref().and_then(|m| m.name.as_ref()) {
            Some(n) => n.clone(),
            None => continue,
        };
        match &rule.replace {
            None => {
                parent_rename_map.insert(match_name, None);
            }
            Some(repl) => {
                let target_name = match &repl.name {
                    Some(ReplacementName::Literal(s)) => s.clone(),
                    Some(ReplacementName::Template { .. }) => continue,
                    None => continue,
                };
                if match_name != target_name {
                    parent_rename_map.insert(match_name, Some(target_name));
                }
            }
        }
    }

    if !parent_rename_map.is_empty() {
        // Apply MapReferences to all surviving vertices that might have parents.
        // Collect vertex names first to avoid borrow conflict.
        let vertices: Vec<String> = compiled
            .surviving_verts
            .iter()
            .map(|v| v.as_ref().to_owned())
            .collect();
        for vertex in &vertices {
            compiled.add_map_references(vertex, "parents", parent_rename_map.clone());
        }
    }
}

/// Build a minimal schema from a WInstance for protolens instantiation.
///
/// Constructs the schema directly from the instance's node anchors and
/// arc edges, bypassing SchemaBuilder to avoid ownership issues.
pub(crate) fn build_schema_from_instance(
    instance: &panproto_inst::WInstance,
    _protocol: &panproto_schema::Protocol,
) -> panproto_schema::Schema {
    use panproto_gat::Name;
    use panproto_schema::{Edge, Schema, Vertex};
    use smallvec::SmallVec;

    let mut vertices = std::collections::HashMap::new();
    let mut edge_map = std::collections::HashMap::new();
    let mut outgoing: std::collections::HashMap<Name, SmallVec<Edge, 4>> =
        std::collections::HashMap::new();
    let mut incoming: std::collections::HashMap<Name, SmallVec<Edge, 4>> =
        std::collections::HashMap::new();
    let mut between: std::collections::HashMap<(Name, Name), SmallVec<Edge, 2>> =
        std::collections::HashMap::new();

    // Add vertices for each unique anchor.
    // Use the anchor as both ID and kind so that compute_migration_between
    // can distinguish renamed vertices (otherwise all kinds are "object"
    // and the heuristic matching picks wrong pairs).
    for node in instance.nodes.values() {
        let id = node.anchor.clone();
        vertices.entry(id.clone()).or_insert_with(|| Vertex {
            id: id.clone(),
            kind: id.clone(),
            nsid: None,
        });
    }

    // Add edges for each unique arc
    let mut seen_edges = std::collections::HashSet::new();
    for (_, _, edge) in &instance.arcs {
        let key = format!("{}:{}:{}", edge.src, edge.tgt, edge.kind);
        if !seen_edges.insert(key) {
            continue;
        }
        edge_map.insert(edge.clone(), edge.kind.clone());
        outgoing
            .entry(edge.src.clone())
            .or_default()
            .push(edge.clone());
        incoming
            .entry(edge.tgt.clone())
            .or_default()
            .push(edge.clone());
        between
            .entry((edge.src.clone(), edge.tgt.clone()))
            .or_default()
            .push(edge.clone());
    }

    Schema {
        protocol: "atproto".into(),
        vertices,
        edges: edge_map,
        hyper_edges: std::collections::HashMap::new(),
        constraints: std::collections::HashMap::new(),
        required: std::collections::HashMap::new(),
        nsids: std::collections::HashMap::new(),
        variants: std::collections::HashMap::new(),
        orderings: std::collections::HashMap::new(),
        recursion_points: std::collections::HashMap::new(),
        spans: std::collections::HashMap::new(),
        usage_modes: std::collections::HashMap::new(),
        nominal: std::collections::HashMap::new(),
        coercions: std::collections::HashMap::new(),
        mergers: std::collections::HashMap::new(),
        defaults: std::collections::HashMap::new(),
        policies: std::collections::HashMap::new(),
        outgoing,
        incoming,
        between,
    }
}

/// Compute the inverse of a single `AttrValueOp`.
///
/// - `negate` is self-inverse.
/// - `add { n }` / `subtract { n }` invert each other.
/// - `multiply { n≠0 }` inverts to `multiply { 1/n }`.
/// - `prefix`, `suffix`, `to-string`, `to-number`, `to-boolean` are not automatically
///   invertible and return `Err`.
fn invert_attr_op(op: &AttrValueOp) -> Result<AttrValueOp, String> {
    match op {
        AttrValueOp::Negate => Ok(AttrValueOp::Negate),
        AttrValueOp::Add { value } => Ok(AttrValueOp::Subtract { value: *value }),
        AttrValueOp::Subtract { value } => Ok(AttrValueOp::Add { value: *value }),
        AttrValueOp::Multiply { value } => {
            if *value == 0.0 {
                Err("multiply by zero is not invertible".to_string())
            } else {
                Ok(AttrValueOp::Multiply { value: 1.0 / value })
            }
        }
        AttrValueOp::Prefix { value: s } => Err(format!(
            "prefix('{}') is not automatically invertible (use a custom lens)",
            s
        )),
        AttrValueOp::Suffix { value: s } => Err(format!(
            "suffix('{}') is not automatically invertible (use a custom lens)",
            s
        )),
        AttrValueOp::ToStr => Err("to-string is not invertible (many-to-one)".to_string()),
        AttrValueOp::ToNum => Err("to-number is not invertible (many-to-one)".to_string()),
        AttrValueOp::ToBool => Err("to-boolean is not invertible (many-to-one)".to_string()),
    }
}

/// Compute the inverse of a lens by swapping source↔target and inverting each rule.
///
/// Returns `Err` if the lens cannot be automatically inverted:
/// - WASM lens
/// - Any rule has `replace: None` (feature is dropped — lossy)
/// - Any rule uses `dropAttrs` where a dropped key is NOT also in `match.matchAttrs`
///   (attribute values would be lost — lossy). Keys in `dropAttrs` that also appear in
///   `match.matchAttrs` are recoverable because the pattern value is known.
/// - Any rule uses `keepAttrs` (unknown attributes are silently discarded — lossy)
/// - Any rule uses a non-invertible `mapAttrValue` op (`prefix`, `suffix`, `to-string`,
///   `to-number`, `to-boolean`, or `multiply` by zero)
///
/// Invertible descriptors are automatically reversed:
/// - `typeId` / `name`: swapped with the match pattern
/// - `renameAttrs`: key↔value pairs are swapped
/// - `addAttrs`: the added keys become `matchAttrs` in the inverse match and `dropAttrs`
///   in the inverse replace (recovering the injected values from the pattern).
/// - `match.matchAttrs` + `replace.dropAttrs` containing those keys: the pair becomes
///   `replace.addAttrs` in the inverse (restoring the dropped values from the pattern).
/// - `mapAttrValue`: each op is inverted. Keys are translated through the inverse rename map
///   so they refer to the correct post-inverse-rename attribute names.
///
/// Type IDs are simplified: if the inverted match typeId equals the new source (= original
/// target) it is set to `None`; similarly for the replace typeId and new target. This ensures
/// `inverseLens(inverseLens(spec))` restores the original compact form.
pub fn inverse_lens(spec: LensSpec) -> Result<LensSpec, String> {
    // Check invertible flag first (fast fail for explicitly-marked non-invertible lenses).
    if !spec.invertible {
        return Err(format!(
            "Lens '{}\u{2192}{}' is marked invertible: false",
            spec.id, spec.target
        ));
    }
    if spec.wasm_module.is_some() {
        return Err("Cannot automatically invert a WASM lens".to_string());
    }

    // Pre-flight: reject SQL rules — they have no automatic inverse.
    if spec
        .rules
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .any(|r| r.sql.is_some())
    {
        return Err(format!(
            "Lens \"{}\" contains raw SQL rules and cannot be automatically inverted",
            spec.id
        ));
    }

    // Pre-flight: reject join rules — they have no automatic inverse.
    if spec
        .rules
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .any(|r| r.join.is_some())
    {
        return Err(format!(
            "Lens \"{}\" cannot be automatically inverted — contains a join rule",
            spec.id
        ));
    }

    // Pre-flight: reject deleteText rules — deleting text is destructive and not invertible.
    if spec
        .rules
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .any(|r| r.delete_text)
    {
        return Err(format!(
            "Lens \"{}\" cannot be automatically inverted — contains a deleteText rule",
            spec.id
        ));
    }

    // Resolve implicit type_ids before pre-flight checks and inversion
    let rules = resolve_rules(
        spec.rules.as_deref().unwrap_or(&[]),
        &spec.source,
        &spec.target,
    );

    // Pre-flight: verify every rule is invertible before constructing anything.
    for rule in &rules {
        let replace =
            rule.replace.as_ref().ok_or_else(|| {
                format!(
            "Lens \"{}\" is lossy — rule matching \"{}\" drops features and cannot be inverted",
            spec.id, rule.match_.as_ref().and_then(|m| m.type_id.as_deref()).unwrap_or("<unknown>")
        )
            })?;

        // dropAttrs is only invertible when each dropped key is also in matchAttrs
        // (so the value can be recovered from the pattern on inversion).
        if let Some(drop_attrs) = &replace.drop_attrs {
            let match_attrs_keys: HashSet<&str> = rule
                .match_
                .as_ref()
                .and_then(|m| m.match_attrs.as_ref())
                .map(|ma| ma.keys().map(|k| k.as_str()).collect())
                .unwrap_or_default();
            for key in drop_attrs {
                if !match_attrs_keys.contains(key.as_str()) {
                    return Err(format!(
                        "Lens \"{}\" is lossy — rule matching \"{}\" drops attribute key \"{}\" (dropAttrs) \
                         without a corresponding matchAttrs entry and cannot be inverted",
                        spec.id, rule.match_.as_ref().and_then(|m| m.type_id.as_deref()).unwrap_or("<unknown>"), key
                    ));
                }
            }
        }

        if replace.keep_attrs.is_some() {
            return Err(format!(
                "Lens \"{}\" is lossy — rule matching \"{}\" discards unknown attributes (keepAttrs) and cannot be inverted",
                spec.id, rule.match_.as_ref().and_then(|m| m.type_id.as_deref()).unwrap_or("<unknown>")
            ));
        }
        if matches!(&replace.name, Some(ReplacementName::Template { .. })) {
            return Err(format!(
                "Lens \"{}\" is lossy — rule matching \"{}\" uses a template name and cannot be inverted",
                spec.id, rule.match_.as_ref().and_then(|m| m.type_id.as_deref()).unwrap_or("<unknown>")
            ));
        }
        if let Some(map) = &replace.map_attr_value {
            for (key, op) in map {
                invert_attr_op(op).map_err(|e| {
                    format!(
                        "Lens \"{}\" rule matching \"{}\": mapAttrValue key \"{}\" — {}",
                        spec.id,
                        rule.match_
                            .as_ref()
                            .and_then(|m| m.type_id.as_deref())
                            .unwrap_or("<unknown>"),
                        key,
                        e
                    )
                })?;
            }
        }
    }

    let new_source = spec.target.as_str();
    let new_target = spec.source.as_str();

    let inverted_rules: Vec<LensRule> = rules
        .iter()
        .map(|rule| {
            let replace = rule.replace.as_ref().unwrap(); // safe: pre-flight above

            // Invert renameAttrs: swap keys↔values.
            let inverted_rename_attrs: Option<HashMap<String, String>> = replace
                .rename_attrs
                .as_ref()
                .map(|ra| ra.iter().map(|(k, v)| (v.clone(), k.clone())).collect());

            // Build the set of keys dropped by the forward rule that appear in matchAttrs.
            // These are recoverable: matchAttrs gives us the value to inject on inversion.
            let matchattrs_dropped: HashMap<String, serde_json::Value> = {
                let mut map = HashMap::new();
                if let (Some(ma), Some(da)) = (
                    rule.match_.as_ref().and_then(|m| m.match_attrs.as_ref()),
                    &replace.drop_attrs,
                ) {
                    for key in da {
                        if let Some(val) = ma.get(key) {
                            map.insert(key.clone(), val.clone());
                        }
                    }
                }
                map
            };

            // addAttrs → inverse matchAttrs + dropAttrs.
            // Keys injected by the forward become matchAttrs constraints in the inverse match
            // (the inverse only fires when those keys are present with those values) and are
            // then dropped in the inverse replace (cleaning up the injected attrs).
            let (inverted_match_attrs, inverted_drop_from_add): (
                Option<HashMap<String, serde_json::Value>>,
                Option<Vec<String>>,
            ) = match &replace.add_attrs {
                None => (None, None),
                Some(aa) => {
                    let ma: HashMap<String, serde_json::Value> =
                        aa.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                    let da: Vec<String> = aa.keys().cloned().collect();
                    (Some(ma), Some(da))
                }
            };

            // matchAttrs + dropAttrs → inverse addAttrs (recoverable dropped values).
            let inverted_add_from_matchattrs: Option<HashMap<String, serde_json::Value>> =
                if matchattrs_dropped.is_empty() {
                    None
                } else {
                    Some(matchattrs_dropped)
                };

            // Merge the two sources of inverse addAttrs (should be disjoint in practice).
            let inverted_add_attrs: Option<HashMap<String, serde_json::Value>> =
                match inverted_add_from_matchattrs {
                    None => None,
                    Some(from_match) => Some(from_match),
                };

            // Merge drop_attrs from addAttrs inversion.
            let inverted_drop_attrs: Option<Vec<String>> = inverted_drop_from_add;

            // Invert mapAttrValue: invert each op and translate the key through the inverse
            // rename map (because the inverse applies renameAttrs *before* mapAttrValue, so
            // the keys must be the post-inverse-rename names, i.e. the original source names).
            let inverted_map_attr_value: Option<HashMap<String, AttrValueOp>> =
                replace.map_attr_value.as_ref().map(|map| {
                    // Build a lookup from (forward-renamed name) → (original name)
                    let inv_rename: HashMap<&str, &str> = inverted_rename_attrs
                        .as_ref()
                        .map(|ra| ra.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect())
                        .unwrap_or_default();
                    map.iter()
                        .map(|(key, op)| {
                            let translated = inv_rename
                                .get(key.as_str())
                                .map(|s| (*s).to_string())
                                .unwrap_or_else(|| key.clone());
                            (translated, invert_attr_op(op).unwrap()) // safe: pre-flight above
                        })
                        .collect()
                });

            let inverted_map_attr_value = inverted_map_attr_value.filter(|m| !m.is_empty());

            // Build type_ids, then simplify: set to None when they match the new source/target
            // so that double-inverse restores the original compact form.
            let match_type = replace.type_id.as_deref().unwrap_or("");
            let replace_type = rule
                .match_
                .as_ref()
                .unwrap()
                .type_id
                .as_deref()
                .unwrap_or("");

            let inverted_match = FeaturePattern {
                type_id: if match_type == new_source {
                    None
                } else {
                    Some(match_type.to_string())
                },
                // replace.name is guaranteed to be None or Literal here (Template was rejected in pre-flight)
                name: match &replace.name {
                    Some(ReplacementName::Literal(s)) => Some(s.clone()),
                    _ => None,
                },
                match_attrs: inverted_match_attrs,
                match_attrs_any: None,
                match_attrs_all: None,
            };

            let inverted_replace = FeatureReplacement {
                type_id: if replace_type == new_target {
                    None
                } else {
                    Some(replace_type.to_string())
                },
                name: rule
                    .match_
                    .as_ref()
                    .unwrap()
                    .name
                    .clone()
                    .map(ReplacementName::Literal),
                rename_attrs: inverted_rename_attrs,
                add_attrs: inverted_add_attrs,
                drop_attrs: inverted_drop_attrs,
                keep_attrs: None,
                map_attr_value: inverted_map_attr_value,
            };

            LensRule {
                match_: Some(inverted_match),
                replace: Some(inverted_replace),
                sql: None,
                join: None,
                delete_text: false,
            }
        })
        .collect();

    Ok(LensSpec {
        dollar_type: "community.lexicon.lens".to_string(),
        id: format!("{}.inverse", spec.id),
        version: None,
        description: None,
        source: spec.target,
        target: spec.source,
        rules: Some(inverted_rules),
        passthrough: spec.passthrough,
        wasm_module: None,
        invertible: true,
    })
}

// ─── Attribute rename composition helpers ─────────────────────────────────────

/// Compose two FeatureReplacements A→B and B→C into A→C.
/// Attribute renames compose transitively: { a→b } ∘ { b→c } = { a→c }.
fn compose_replacements(
    first: &FeatureReplacement,
    second: &FeatureReplacement,
) -> FeatureReplacement {
    let first_renames = first.rename_attrs.as_ref();
    let second_renames = second.rename_attrs.as_ref();

    // Compose: first renames a→b, second renames b→c → result is a→c
    let mut composed: HashMap<String, String> = HashMap::new();

    if let Some(fr) = first_renames {
        for (from, to) in fr {
            let final_to = second_renames
                .and_then(|sr| sr.get(to))
                .cloned()
                .unwrap_or_else(|| to.clone());
            composed.insert(from.clone(), final_to);
        }
    }

    // Second renames not covered by first (i.e. first doesn't produce that key)
    if let Some(sr) = second_renames {
        let first_targets: HashSet<String> = first_renames
            .map(|fr| fr.values().cloned().collect())
            .unwrap_or_default();
        for (from, to) in sr {
            if !first_targets.contains(from) {
                composed.insert(from.clone(), to.clone());
            }
        }
    }

    let rename_attrs = if composed.is_empty() {
        None
    } else {
        Some(composed)
    };

    // Merge addAttrs (second wins on conflicts)
    let add_attrs = {
        let mut merged: HashMap<String, serde_json::Value> = HashMap::new();
        if let Some(aa) = &first.add_attrs {
            merged.extend(aa.iter().map(|(k, v)| (k.clone(), v.clone())));
        }
        if let Some(aa) = &second.add_attrs {
            merged.extend(aa.iter().map(|(k, v)| (k.clone(), v.clone())));
        }
        if merged.is_empty() {
            None
        } else {
            Some(merged)
        }
    };

    // Union dropAttrs
    let drop_attrs = {
        let mut combined: Vec<String> = Vec::new();
        if let Some(da) = &first.drop_attrs {
            combined.extend_from_slice(da);
        }
        if let Some(da) = &second.drop_attrs {
            for item in da {
                if !combined.contains(item) {
                    combined.push(item.clone());
                }
            }
        }
        if combined.is_empty() {
            None
        } else {
            Some(combined)
        }
    };

    // keepAttrs: second wins; propagate first's if second has none
    let keep_attrs = second
        .keep_attrs
        .clone()
        .or_else(|| first.keep_attrs.clone());

    // mapAttrValue: merge union; second wins on key conflicts
    let map_attr_value = {
        let mut merged: HashMap<String, AttrValueOp> = HashMap::new();
        if let Some(mv) = &first.map_attr_value {
            merged.extend(mv.iter().map(|(k, v)| (k.clone(), v.clone())));
        }
        if let Some(mv) = &second.map_attr_value {
            merged.extend(mv.iter().map(|(k, v)| (k.clone(), v.clone())));
        }
        if merged.is_empty() {
            None
        } else {
            Some(merged)
        }
    };

    FeatureReplacement {
        type_id: second.type_id.clone(),
        name: second.name.clone(),
        rename_attrs,
        add_attrs,
        drop_attrs,
        keep_attrs,
        map_attr_value,
    }
}

/// Pull back `second_match_attrs` through `first_replace` to determine what source-level
/// match constraints should be added to the composed rule's source pattern.
///
/// - If `first_replace.add_attrs` unconditionally supplies a key, that constraint is always
///   satisfied, so it does not need to appear in the source pattern.
/// - If `first_replace.rename_attrs` maps `old → new`, and the second rule requires `new:v`,
///   the source pattern must require `old:v`.
/// - Otherwise the constraint passes through unchanged.
fn pull_back_match_attrs(
    second_match_attrs: &HashMap<String, serde_json::Value>,
    first_replace: &FeatureReplacement,
) -> HashMap<String, serde_json::Value> {
    let mut result = HashMap::new();
    for (key, val) in second_match_attrs {
        // If first addAttrs unconditionally sets this key, the constraint is always
        // satisfied; no need to propagate it to the source pattern.
        if let Some(aa) = &first_replace.add_attrs {
            if aa.contains_key(key) {
                continue;
            }
        }
        // If first renames old_key → key, use old_key in the composed match.
        let source_key = first_replace
            .rename_attrs
            .as_ref()
            .and_then(|renames| {
                renames
                    .iter()
                    .find(|(_, to)| to.as_str() == key.as_str())
                    .map(|(from, _)| from.clone())
            })
            .unwrap_or_else(|| key.clone());
        result.insert(source_key, val.clone());
    }
    result
}

/// Merge two optional match_attrs maps.
///
/// Returns `None` if there is a contradiction (same key, different values), signalling
/// that the composed rule is impossible and should be omitted.
fn merge_match_attrs(
    a: Option<&HashMap<String, serde_json::Value>>,
    b: Option<&HashMap<String, serde_json::Value>>,
) -> Option<Option<HashMap<String, serde_json::Value>>> {
    match (a, b) {
        (None, None) => Some(None),
        (Some(m), None) | (None, Some(m)) => Some(Some(m.clone())),
        (Some(ma), Some(mb)) => {
            let mut merged = ma.clone();
            for (key, val) in mb {
                if let Some(existing) = merged.get(key) {
                    if existing != val {
                        // Contradiction — this composed rule is impossible
                        return None;
                    }
                } else {
                    merged.insert(key.clone(), val.clone());
                }
            }
            Some(if merged.is_empty() {
                None
            } else {
                Some(merged)
            })
        }
    }
}

/// Compose two lenses A→B and B→C into a single A→C lens.
///
/// Returns `None` if `first.target != second.source` (incompatible lenses).
pub fn compose_lenses(first: &LensSpec, second: &LensSpec) -> Option<LensSpec> {
    if first.target != second.source {
        return None;
    }

    let passthrough_is_drop = matches!(first.passthrough, Some(Passthrough::Drop))
        || matches!(second.passthrough, Some(Passthrough::Drop));
    let passthrough = if passthrough_is_drop {
        Some(Passthrough::Drop)
    } else {
        None
    };

    // Resolve implicit type_ids before composition
    let first_rules = resolve_rules(
        first.rules.as_deref().unwrap_or(&[]),
        &first.source,
        &first.target,
    );
    let second_rules = resolve_rules(
        second.rules.as_deref().unwrap_or(&[]),
        &second.source,
        &second.target,
    );

    let mut composed_rules: Vec<LensRule> = Vec::new();

    for rule in &first_rules {
        // SQL rules pass through unchanged — no declarative composition.
        if rule.sql.is_some() {
            composed_rules.push(rule.clone());
            continue;
        }
        // Skip join rules in pure-Rust composition (SQL-only)
        if rule.join.is_some() {
            continue;
        }

        if rule.replace.is_none() {
            // First rule drops the feature — still dropped in composition
            composed_rules.push(rule.clone());
            continue;
        }

        let first_replace = rule.replace.as_ref().unwrap();

        // Find ALL second-lens rules that match the intermediate feature.
        // Multiple second rules can match the same intermediate name when they are
        // distinguished by matchAttrs (e.g. 6 heading rules, one per level).
        let matching_second: Vec<_> = second_rules
            .iter()
            .filter(|r| {
                // Skip join rules — they have no match_ pattern for composition.
                r.sql.is_none()
                    && r.join.is_none()
                    && r.match_
                        .as_ref()
                        .map(|m| replacement_matches_pattern(first_replace, m))
                        .unwrap_or(false)
            })
            .collect();

        if matching_second.is_empty() {
            if matches!(second.passthrough, Some(Passthrough::Drop)) {
                // Second drops unmatched features
                composed_rules.push(LensRule {
                    match_: rule.match_.clone(),
                    replace: None,
                    sql: None,
                    join: None,
                    delete_text: rule.delete_text,
                });
            } else {
                // Second passes through: keep as the intermediate type
                composed_rules.push(rule.clone());
            }
            continue;
        }

        for sr in &matching_second {
            if sr.replace.is_none() {
                // Second drops the intermediate feature — propagate deleteText from either rule
                composed_rules.push(LensRule {
                    match_: rule.match_.clone(),
                    replace: None,
                    sql: None,
                    join: None,
                    delete_text: rule.delete_text || sr.delete_text,
                });
            } else {
                // Pull back the second rule's matchAttrs through the first rule's replacement
                // to determine what source-level attrs to add to the composed match pattern.
                let pulled_back = sr
                    .match_
                    .as_ref()
                    .unwrap()
                    .match_attrs
                    .as_ref()
                    .map(|ma| pull_back_match_attrs(ma, first_replace));

                // Merge the first rule's matchAttrs with the pulled-back constraints.
                // If there's a contradiction, skip this combination (impossible rule).
                let composed_match_attrs = match merge_match_attrs(
                    rule.match_.as_ref().unwrap().match_attrs.as_ref(),
                    pulled_back.as_ref(),
                ) {
                    None => continue, // contradiction — skip
                    Some(ma) => ma,
                };

                let composed_replace =
                    compose_replacements(first_replace, sr.replace.as_ref().unwrap());
                composed_rules.push(LensRule {
                    match_: Some(FeaturePattern {
                        type_id: rule.match_.as_ref().unwrap().type_id.clone(),
                        name: rule.match_.as_ref().unwrap().name.clone(),
                        match_attrs: composed_match_attrs,
                        match_attrs_any: rule.match_.as_ref().unwrap().match_attrs_any.clone(),
                        match_attrs_all: rule.match_.as_ref().unwrap().match_attrs_all.clone(),
                    }),
                    replace: Some(composed_replace),
                    sql: None,
                    join: None,
                    delete_text: rule.delete_text || sr.delete_text,
                });
            }
        }
    }

    // SQL and join rules from the second lens pass through directly.
    for rule in &second_rules {
        if rule.sql.is_some() || rule.join.is_some() {
            composed_rules.push(rule.clone());
        }
    }

    Some(LensSpec {
        dollar_type: "community.lexicon.lens".to_string(),
        id: format!("{}+{}", first.id, second.id),
        version: None,
        description: None,
        source: first.source.clone(),
        target: second.target.clone(),
        rules: Some(composed_rules),
        passthrough,
        wasm_module: None,
        invertible: true,
    })
}

/// Build an identity lens for a namespace (empty rules, passthrough: keep).
pub fn identity_lens(ns: &str) -> LensSpec {
    LensSpec {
        dollar_type: "community.lexicon.lens".to_string(),
        id: format!("{}.identity", ns),
        version: None,
        description: None,
        source: ns.to_string(),
        target: ns.to_string(),
        rules: Some(vec![]),
        passthrough: Some(Passthrough::Keep),
        wasm_module: None,
        invertible: true,
    }
}

/// BFS shortest-path from `source` to `target` through the given specs.
///
/// Returns an identity lens when source == target.
/// Returns None if no path exists.
/// On finding a path, reduces accumulated specs with `compose_lenses`.
pub fn find_path_in_graph(specs: &[LensSpec], source: &str, target: &str) -> Option<LensSpec> {
    if source == target {
        return Some(identity_lens(source));
    }

    // BFS: queue items are (current_namespace, Vec of spec indices used so far)
    let mut queue: VecDeque<(String, Vec<usize>)> = VecDeque::new();
    queue.push_back((source.to_string(), vec![]));
    let mut visited: HashSet<String> = HashSet::new();
    visited.insert(source.to_string());

    while let Some((current_ns, path_indices)) = queue.pop_front() {
        for (i, spec) in specs.iter().enumerate() {
            if spec.source != current_ns {
                continue;
            }

            let new_path: Vec<usize> = path_indices
                .iter()
                .copied()
                .chain(std::iter::once(i))
                .collect();

            if spec.target == target {
                // Reduce accumulated path with compose_lenses
                let composed = new_path
                    .into_iter()
                    .map(|idx| specs[idx].clone())
                    .reduce(|acc, s| compose_lenses(&acc, &s).unwrap_or(acc));
                return composed;
            }

            if !visited.contains(&spec.target) {
                visited.insert(spec.target.clone());
                queue.push_back((spec.target.clone(), new_path));
            }
        }
    }

    None
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_spec(source: &str, target: &str, rules: Vec<LensRule>) -> LensSpec {
        LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: format!("{}-to-{}", source, target),
            version: None,
            description: None,
            source: source.to_string(),
            target: target.to_string(),
            rules: Some(rules),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        }
    }

    fn make_rule(
        match_type: &str,
        match_name: &str,
        replace_type: &str,
        replace_name: &str,
    ) -> LensRule {
        LensRule {
            match_: Some(FeaturePattern {
                type_id: Some(match_type.to_string()),
                name: Some(match_name.to_string()),
                match_attrs: None,
                ..Default::default()
            }),
            replace: Some(FeatureReplacement {
                type_id: Some(replace_type.to_string()),
                name: Some(ReplacementName::Literal(replace_name.to_string())),
                rename_attrs: None,
                add_attrs: None,
                drop_attrs: None,
                keep_attrs: None,
                map_attr_value: None,
            }),
            ..Default::default()
        }
    }

    fn doc_with_feature(type_id: &str, name: &str) -> serde_json::Value {
        serde_json::json!({
            "text": "hello",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": type_id, "name": name }]
            }]
        })
    }

    // ─── apply_lens_to_doc ────────────────────────────────────────────────────

    #[test]
    fn apply_lens_basic() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![make_rule("ns.a", "mark", "ns.b", "mark")],
        );
        let doc = doc_with_feature("ns.a", "mark");
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["$type"], "ns.b");
        assert_eq!(feat["name"], "mark");
    }

    #[test]
    fn apply_lens_drop_rule() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("mark".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: None,
                ..Default::default()
            }],
        );
        let doc = doc_with_feature("ns.a", "mark");
        let result = apply_lens_to_doc(&doc, &spec);
        assert_eq!(result["facets"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn apply_lens_passthrough_drop() {
        let mut spec = make_spec("ns.a", "ns.b", vec![]);
        spec.passthrough = Some(Passthrough::Drop);
        let doc = doc_with_feature("ns.other", "x");
        let result = apply_lens_to_doc(&doc, &spec);
        assert_eq!(result["facets"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn apply_lens_rename_attrs() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("link".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("link".to_string())),
                    rename_attrs: Some([("uri".to_string(), "href".to_string())].into()),
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "example",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 7 },
                "features": [{ "$type": "ns.a", "name": "link", "uri": "https://example.com" }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["href"], "https://example.com");
        assert!(feat["uri"].is_null() || feat.get("uri").is_none());
    }

    // ─── implicit typeId ──────────────────────────────────────────────────────

    #[test]
    fn apply_lens_implicit_type_id() {
        // Rules with no typeId: match.typeId defaults to source, replace.typeId defaults to target
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "ns.a-to-ns.b".to_string(),
            version: None,
            description: None,
            source: "ns.a".to_string(),
            target: "ns.b".to_string(),
            rules: Some(vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: None,
                    name: Some("mark".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: None,
                    name: Some(ReplacementName::Literal("mark".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }]),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        };
        let doc = doc_with_feature("ns.a", "mark");
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["$type"], "ns.b");
        assert_eq!(feat["name"], "mark");
    }

    #[test]
    fn apply_lens_implicit_type_id_no_match_different_namespace() {
        // Implicit match.typeId = "ns.a"; feature with $type "ns.other" should NOT match
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "ns.a-to-ns.b".to_string(),
            version: None,
            description: None,
            source: "ns.a".to_string(),
            target: "ns.b".to_string(),
            rules: Some(vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: None,
                    name: Some("mark".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: None,
                    name: Some(ReplacementName::Literal("mark".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }]),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        };
        let doc = doc_with_feature("ns.other", "mark");
        let result = apply_lens_to_doc(&doc, &spec);
        // passthrough: keep, so the feature is preserved unchanged
        assert_eq!(result["facets"][0]["features"][0]["$type"], "ns.other");
    }

    #[test]
    fn inverse_lens_double_inverse_restores_compact_form() {
        // Spec with implicit type_ids (None) — double-inverse should restore exact original
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "ns.a-to-ns.b".to_string(),
            version: None,
            description: None,
            source: "ns.a".to_string(),
            target: "ns.b".to_string(),
            rules: Some(vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: None,
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: None,
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }]),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        };
        let inv = inverse_lens(spec.clone()).unwrap();
        let double_inv = inverse_lens(inv).unwrap();
        assert_eq!(double_inv.source, spec.source);
        assert_eq!(double_inv.target, spec.target);
        // Rules should have no explicit type_id (compact form restored)
        let orig_rule = &spec.rules.as_ref().unwrap()[0];
        let double_inv_rule = &double_inv.rules.as_ref().unwrap()[0];
        assert_eq!(
            double_inv_rule.match_.as_ref().unwrap().type_id,
            orig_rule.match_.as_ref().unwrap().type_id
        ); // both None
        assert_eq!(
            double_inv_rule.replace.as_ref().unwrap().type_id,
            orig_rule.replace.as_ref().unwrap().type_id
        ); // both None
    }

    // ─── inverse_lens ─────────────────────────────────────────────────────────

    #[test]
    fn inverse_lens_swaps_source_target() {
        let spec = make_spec("ns.a", "ns.b", vec![make_rule("ns.a", "x", "ns.b", "y")]);
        let inv = inverse_lens(spec).unwrap();
        assert_eq!(inv.source, "ns.b");
        assert_eq!(inv.target, "ns.a");
    }

    #[test]
    fn inverse_lens_inverts_rename_attrs() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("link".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("a".to_string())),
                    rename_attrs: Some([("uri".to_string(), "href".to_string())].into()),
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_rule = &inv.rules.as_ref().unwrap()[0];
        let inv_rename = inv_rule
            .replace
            .as_ref()
            .unwrap()
            .rename_attrs
            .as_ref()
            .unwrap();
        assert_eq!(inv_rename.get("href"), Some(&"uri".to_string()));
        assert_eq!(inv_rename.get("uri"), None);
    }

    #[test]
    fn inverse_lens_lossy_error() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: None,
                ..Default::default()
            }],
        );
        assert!(inverse_lens(spec).is_err());
    }

    #[test]
    fn inverse_lens_drop_attrs_error() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: Some(vec!["secret".to_string()]),
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        assert!(inverse_lens(spec).is_err());
    }

    #[test]
    fn inverse_lens_keep_attrs_error() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: Some(vec!["level".to_string()]),
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        assert!(inverse_lens(spec).is_err());
    }

    #[test]
    fn inverse_lens_add_attrs_becomes_drop_attrs() {
        // addAttrs { injected: "val" } → inverse dropAttrs ["injected"]
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: Some([("injected".to_string(), serde_json::json!("val"))].into()),
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_replace = inv.rules.as_ref().unwrap()[0].replace.as_ref().unwrap();
        assert!(inv_replace.add_attrs.is_none());
        let drop = inv_replace.drop_attrs.as_ref().unwrap();
        assert!(drop.contains(&"injected".to_string()));
    }

    #[test]
    fn inverse_lens_add_attrs_round_trip() {
        // applyLens(applyLens(doc, forward), inverse) == doc
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: Some([("extra".to_string(), serde_json::json!(99))].into()),
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = doc_with_feature("ns.a", "x");
        let inv = inverse_lens(spec.clone()).unwrap();
        let after_forward = apply_lens_to_doc(&doc, &spec);
        // The injected attr should be present after forward
        assert_eq!(after_forward["facets"][0]["features"][0]["extra"], 99);
        // After the inverse, the injected attr should be gone and the type restored
        let after_round_trip = apply_lens_to_doc(&after_forward, &inv);
        assert_eq!(
            after_round_trip["facets"][0]["features"][0]["$type"],
            "ns.a"
        );
        assert!(
            after_round_trip["facets"][0]["features"][0]
                .get("extra")
                .is_none()
                || after_round_trip["facets"][0]["features"][0]["extra"].is_null()
        );
    }

    #[test]
    fn inverse_lens_map_negate_self_inverse() {
        let mut map = HashMap::new();
        map.insert("checked".to_string(), AttrValueOp::Negate);
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_map = inv.rules.as_ref().unwrap()[0]
            .replace
            .as_ref()
            .unwrap()
            .map_attr_value
            .as_ref()
            .unwrap();
        assert!(matches!(inv_map["checked"], AttrValueOp::Negate));
    }

    #[test]
    fn inverse_lens_map_add_becomes_subtract() {
        let mut map = HashMap::new();
        map.insert("level".to_string(), AttrValueOp::Add { value: 1.0 });
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("h".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_map = inv.rules.as_ref().unwrap()[0]
            .replace
            .as_ref()
            .unwrap()
            .map_attr_value
            .as_ref()
            .unwrap();
        assert!(matches!(inv_map["level"], AttrValueOp::Subtract { value } if value == 1.0));
    }

    #[test]
    fn inverse_lens_map_multiply_becomes_reciprocal() {
        let mut map = HashMap::new();
        map.insert("scale".to_string(), AttrValueOp::Multiply { value: 3.0 });
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_map = inv.rules.as_ref().unwrap()[0]
            .replace
            .as_ref()
            .unwrap()
            .map_attr_value
            .as_ref()
            .unwrap();
        // 1/3 ≈ 0.333...
        assert!(
            matches!(inv_map["scale"], AttrValueOp::Multiply { value } if (value - 1.0/3.0).abs() < 1e-10)
        );
    }

    #[test]
    fn inverse_lens_map_prefix_error() {
        let mut map = HashMap::new();
        map.insert(
            "url".to_string(),
            AttrValueOp::Prefix {
                value: "https://".to_string(),
            },
        );
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        assert!(inverse_lens(spec).is_err());
    }

    #[test]
    fn inverse_lens_map_key_translated_through_rename() {
        // Forward: renameAttrs { a → b }, mapAttrValue { b: add 1 }
        // Feature { a: 2 } → forward → { b: 3 }
        // Inverse: renameAttrs { b → a }, mapAttrValue { a: subtract 1 }
        // (key 'b' in forward map translates to 'a' in inverse map via inverse rename)
        let mut map = HashMap::new();
        map.insert("b".to_string(), AttrValueOp::Add { value: 1.0 });
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: Some([("a".to_string(), "b".to_string())].into()),
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_replace = inv.rules.as_ref().unwrap()[0].replace.as_ref().unwrap();
        // Inverse rename should be b → a
        assert_eq!(
            inv_replace.rename_attrs.as_ref().unwrap().get("b"),
            Some(&"a".to_string())
        );
        // mapAttrValue key should be translated to 'a' (post-inverse-rename name)
        let inv_map = inv_replace.map_attr_value.as_ref().unwrap();
        assert!(inv_map.contains_key("a"), "key should be translated to 'a'");
        assert!(
            !inv_map.contains_key("b"),
            "key 'b' should not exist in inverse (was renamed)"
        );
        assert!(matches!(inv_map["a"], AttrValueOp::Subtract { value } if value == 1.0));
    }

    #[test]
    fn inverse_lens_map_round_trip_negate() {
        // applyLens(applyLens(doc, spec), inverseLens(spec)) should restore original
        let mut map = HashMap::new();
        map.insert("checked".to_string(), AttrValueOp::Negate);
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "x",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 1 },
                "features": [{ "$type": "ns.a", "name": "x", "checked": true }]
            }]
        });
        let inv = inverse_lens(spec.clone()).unwrap();
        let after_forward = apply_lens_to_doc(&doc, &spec);
        assert_eq!(after_forward["facets"][0]["features"][0]["checked"], false);
        let after_round_trip = apply_lens_to_doc(&after_forward, &inv);
        assert_eq!(
            after_round_trip["facets"][0]["features"][0]["$type"],
            "ns.a"
        );
        assert_eq!(
            after_round_trip["facets"][0]["features"][0]["checked"],
            true
        );
    }

    // ─── compose_lenses ───────────────────────────────────────────────────────

    #[test]
    fn compose_lenses_incompatible_returns_none() {
        let a = make_spec("ns.x", "ns.y", vec![]);
        let b = make_spec("ns.z", "ns.w", vec![]);
        assert!(compose_lenses(&a, &b).is_none());
    }

    #[test]
    fn compose_lenses_transitive_attrs() {
        let ab = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("link".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("link".to_string())),
                    rename_attrs: Some([("uri".to_string(), "href".to_string())].into()),
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let bc = make_spec(
            "ns.b",
            "ns.c",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.b".to_string()),
                    name: Some("link".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.c".to_string()),
                    name: Some(ReplacementName::Literal("link".to_string())),
                    rename_attrs: Some([("href".to_string(), "url".to_string())].into()),
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let composed = compose_lenses(&ab, &bc).unwrap();
        let rename = composed.rules.as_ref().unwrap()[0]
            .replace
            .as_ref()
            .unwrap()
            .rename_attrs
            .as_ref()
            .unwrap();
        // uri→href then href→url = uri→url
        assert_eq!(rename.get("uri"), Some(&"url".to_string()));
        assert_eq!(rename.get("href"), None);
    }

    // ─── find_path_in_graph ───────────────────────────────────────────────────

    #[test]
    fn find_path_direct() {
        let specs = vec![make_spec(
            "ns.a",
            "ns.b",
            vec![make_rule("ns.a", "x", "ns.b", "y")],
        )];
        let path = find_path_in_graph(&specs, "ns.a", "ns.b").unwrap();
        assert_eq!(path.source, "ns.a");
        assert_eq!(path.target, "ns.b");
    }

    #[test]
    fn find_path_multihop() {
        let specs = vec![
            make_spec("ns.a", "ns.b", vec![make_rule("ns.a", "x", "ns.b", "y")]),
            make_spec("ns.b", "ns.c", vec![make_rule("ns.b", "y", "ns.c", "z")]),
        ];
        let path = find_path_in_graph(&specs, "ns.a", "ns.c").unwrap();
        assert_eq!(path.source, "ns.a");
        assert_eq!(path.target, "ns.c");
        // Composed: ns.a#x → ns.c#z
        let rule = &path.rules.as_ref().unwrap()[0];
        assert_eq!(
            rule.replace.as_ref().unwrap().type_id.as_deref(),
            Some("ns.c")
        );
        assert_eq!(
            rule.replace.as_ref().unwrap().name.as_ref().and_then(|n| {
                if let ReplacementName::Literal(s) = n {
                    Some(s.as_str())
                } else {
                    None
                }
            }),
            Some("z")
        );
    }

    #[test]
    fn find_path_identity() {
        let specs: Vec<LensSpec> = vec![];
        let path = find_path_in_graph(&specs, "ns.a", "ns.a").unwrap();
        assert_eq!(path.source, "ns.a");
        assert_eq!(path.target, "ns.a");
    }

    #[test]
    fn find_path_no_path() {
        let specs: Vec<LensSpec> = vec![];
        assert!(find_path_in_graph(&specs, "ns.a", "ns.b").is_none());
    }

    // ─── Version-aware matching ───────────────────────────────────────────────

    #[test]
    fn version_aware_unversioned_pattern_versioned_feature() {
        // Feature with versioned name: { $type: "ns.a", name: "mark@1.0" }
        // Pattern: { typeId: "ns.a", name: "mark" } → should match
        let feat = serde_json::json!({ "$type": "ns.a", "name": "mark@1.0" });
        let pat = FeaturePattern {
            type_id: Some("ns.a".to_string()),
            name: Some("mark".to_string()),
            match_attrs: None,
            ..Default::default()
        };
        assert!(feature_matches_pattern(&feat, &pat));
    }

    #[test]
    fn version_aware_versioned_pattern_unversioned_feature() {
        // Feature: { $type: "ns.a", name: "mark" }
        // Pattern with versioned compound key: { typeId: "ns.a#mark@1.0" } → should match
        let feat = serde_json::json!({ "$type": "ns.a", "name": "mark" });
        let pat = FeaturePattern {
            type_id: Some("ns.a#mark@1.0".to_string()),
            name: None,
            match_attrs: None,
            ..Default::default()
        };
        assert!(feature_matches_pattern(&feat, &pat));
    }

    // ─── keepAttrs ────────────────────────────────────────────────────────────

    #[test]
    fn apply_lens_keep_attrs() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("heading".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: Some(vec!["level".to_string()]),
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "hello",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "heading", "level": 2, "extra": "drop-me" }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["level"], 2);
        assert!(feat.get("extra").is_none() || feat["extra"].is_null());
        assert_eq!(feat["$type"], "ns.b");
        assert_eq!(feat["name"], "heading");
    }

    #[test]
    fn apply_lens_keep_attrs_preserves_system_fields() {
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: Some(vec![]), // empty allowlist — only $type and name survive
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "hi",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 2 },
                "features": [{ "$type": "ns.a", "name": "x", "foo": 1, "bar": 2 }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["$type"], "ns.b");
        assert_eq!(feat["name"], "x");
        assert!(feat.get("foo").is_none() || feat["foo"].is_null());
        assert!(feat.get("bar").is_none() || feat["bar"].is_null());
    }

    // ─── mapAttrValue ─────────────────────────────────────────────────────────

    #[test]
    fn apply_lens_map_add() {
        let mut map = HashMap::new();
        map.insert("level".to_string(), AttrValueOp::Add { value: 1.0 });
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("heading".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "hello",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "heading", "level": 2 }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["level"], 3); // integer preserved
    }

    #[test]
    fn apply_lens_map_prefix() {
        let mut map = HashMap::new();
        map.insert(
            "url".to_string(),
            AttrValueOp::Prefix {
                value: "https://".to_string(),
            },
        );
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("link".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("link".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "click",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "link", "url": "example.com" }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["url"], "https://example.com");
    }

    #[test]
    fn apply_lens_map_negate() {
        let mut map = HashMap::new();
        map.insert("checked".to_string(), AttrValueOp::Negate);
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("item".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("item".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "x",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 1 },
                "features": [{ "$type": "ns.a", "name": "item", "checked": true }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["checked"], false);
    }

    #[test]
    fn apply_lens_map_to_string() {
        let mut map = HashMap::new();
        map.insert("level".to_string(), AttrValueOp::ToStr);
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("h".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "x",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 1 },
                "features": [{ "$type": "ns.a", "name": "h", "level": 42 }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["level"], "42");
    }

    #[test]
    fn apply_lens_map_noop_wrong_type() {
        // Add on a string is a noop — returns original value unchanged
        let mut map = HashMap::new();
        map.insert("label".to_string(), AttrValueOp::Add { value: 1.0 });
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("x".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("x".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: Some(map),
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "x",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 1 },
                "features": [{ "$type": "ns.a", "name": "x", "label": "hello" }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["label"], "hello"); // unchanged
    }

    #[test]
    fn compose_replacements_keep_attrs() {
        // Second's keepAttrs wins
        let first = FeatureReplacement {
            type_id: Some("ns.b".to_string()),
            name: None,
            rename_attrs: None,
            add_attrs: None,
            drop_attrs: None,
            keep_attrs: Some(vec!["a".to_string(), "b".to_string()]),
            map_attr_value: None,
        };
        let second = FeatureReplacement {
            type_id: Some("ns.c".to_string()),
            name: None,
            rename_attrs: None,
            add_attrs: None,
            drop_attrs: None,
            keep_attrs: Some(vec!["x".to_string()]),
            map_attr_value: None,
        };
        let composed = compose_replacements(&first, &second);
        assert_eq!(composed.keep_attrs, Some(vec!["x".to_string()]));
    }

    #[test]
    fn compose_replacements_map_attr_value() {
        // Second wins on key conflict; first-only keys preserved
        let mut first_map = HashMap::new();
        first_map.insert("level".to_string(), AttrValueOp::Add { value: 1.0 });
        first_map.insert("only_first".to_string(), AttrValueOp::Negate);
        let mut second_map = HashMap::new();
        second_map.insert("level".to_string(), AttrValueOp::Add { value: 2.0 });

        let first = FeatureReplacement {
            type_id: Some("ns.b".to_string()),
            name: None,
            rename_attrs: None,
            add_attrs: None,
            drop_attrs: None,
            keep_attrs: None,
            map_attr_value: Some(first_map),
        };
        let second = FeatureReplacement {
            type_id: Some("ns.c".to_string()),
            name: None,
            rename_attrs: None,
            add_attrs: None,
            drop_attrs: None,
            keep_attrs: None,
            map_attr_value: Some(second_map),
        };
        let composed = compose_replacements(&first, &second);
        let map = composed.map_attr_value.unwrap();
        // "level" key: second wins → Add { 2.0 }
        assert!(matches!(map["level"], AttrValueOp::Add { value } if value == 2.0));
        // "only_first" key: preserved from first
        assert!(matches!(map["only_first"], AttrValueOp::Negate));
    }

    // ─── matchAttrs ───────────────────────────────────────────────────────────

    #[test]
    fn match_attrs_fires_only_when_attrs_match() {
        // Rule with matchAttrs { level: 1 } should only fire for features where level == 1.
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: Some([("level".to_string(), serde_json::json!(1))].into()),
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h1".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        // Feature with level == 1: rule should fire → becomes h1.
        let doc_match = serde_json::json!({
            "text": "Title",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "heading", "level": 1 }]
            }]
        });
        let result = apply_lens_to_doc(&doc_match, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["$type"], "ns.b");
        assert_eq!(feat["name"], "h1");
    }

    #[test]
    fn match_attrs_does_not_fire_on_non_matching_attrs() {
        // Rule with matchAttrs { level: 1 } should NOT fire for level == 2 (passthrough: keep).
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: Some([("level".to_string(), serde_json::json!(1))].into()),
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h1".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        // Feature with level == 2: rule should NOT fire → kept as-is (passthrough: keep).
        let doc_no_match = serde_json::json!({
            "text": "Title",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "heading", "level": 2 }]
            }]
        });
        let result = apply_lens_to_doc(&doc_no_match, &spec);
        let feat = &result["facets"][0]["features"][0];
        // Kept unchanged (passthrough: keep)
        assert_eq!(feat["$type"], "ns.a");
        assert_eq!(feat["name"], "heading");
        assert_eq!(feat["level"], 2);
    }

    #[test]
    fn match_attrs_multiple_keys_must_all_match() {
        // matchAttrs with two keys: both must match for the rule to fire.
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("li".to_string()),
                    match_attrs: Some(
                        [
                            ("list".to_string(), serde_json::json!("ul")),
                            ("depth".to_string(), serde_json::json!(0)),
                        ]
                        .into(),
                    ),
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("unordered-list-item".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        // Both keys match: fires.
        let doc_both_match = serde_json::json!({
            "text": "item",
            "facets": [{ "index": { "byteStart": 0, "byteEnd": 4 },
                "features": [{ "$type": "ns.a", "name": "li", "list": "ul", "depth": 0 }] }]
        });
        let result = apply_lens_to_doc(&doc_both_match, &spec);
        assert_eq!(
            result["facets"][0]["features"][0]["name"],
            "unordered-list-item"
        );

        // Only one key matches: does NOT fire (passthrough: keep).
        let doc_one_match = serde_json::json!({
            "text": "item",
            "facets": [{ "index": { "byteStart": 0, "byteEnd": 4 },
                "features": [{ "$type": "ns.a", "name": "li", "list": "ul", "depth": 1 }] }]
        });
        let result2 = apply_lens_to_doc(&doc_one_match, &spec);
        assert_eq!(result2["facets"][0]["features"][0]["name"], "li");
    }

    #[test]
    fn inverse_lens_match_attrs_forward_becomes_add_attrs_inverse() {
        // Forward: matchAttrs { level: 1 } + dropAttrs ["level"] → inverse addAttrs { level: 1 }
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: Some([("level".to_string(), serde_json::json!(1))].into()),
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h1".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: Some(vec!["level".to_string()]),
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_rule = &inv.rules.as_ref().unwrap()[0];
        // Inverse match: { name: "h1" } with no matchAttrs
        assert_eq!(
            inv_rule.match_.as_ref().unwrap().name.as_deref(),
            Some("h1")
        );
        assert!(inv_rule.match_.as_ref().unwrap().match_attrs.is_none());
        // Inverse replace: addAttrs { level: 1 }
        let inv_replace = inv_rule.replace.as_ref().unwrap();
        let add = inv_replace
            .add_attrs
            .as_ref()
            .expect("inverse should have addAttrs");
        assert_eq!(add.get("level"), Some(&serde_json::json!(1)));
    }

    #[test]
    fn inverse_lens_add_attrs_becomes_match_attrs_plus_drop_attrs() {
        // Forward: addAttrs { list: "ul" } → inverse matchAttrs { list: "ul" } + dropAttrs ["list"]
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("unordered-list-item".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("li".to_string())),
                    rename_attrs: None,
                    add_attrs: Some([("list".to_string(), serde_json::json!("ul"))].into()),
                    drop_attrs: None,
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let inv = inverse_lens(spec).unwrap();
        let inv_rule = &inv.rules.as_ref().unwrap()[0];
        // Inverse match must have matchAttrs { list: "ul" }
        let inv_match_attrs = inv_rule
            .match_
            .as_ref()
            .unwrap()
            .match_attrs
            .as_ref()
            .expect("inverse match should have matchAttrs");
        assert_eq!(inv_match_attrs.get("list"), Some(&serde_json::json!("ul")));
        // Inverse replace must have dropAttrs ["list"]
        let inv_replace = inv_rule.replace.as_ref().unwrap();
        let drop = inv_replace
            .drop_attrs
            .as_ref()
            .expect("inverse should have dropAttrs");
        assert!(drop.contains(&"list".to_string()));
    }

    #[test]
    fn match_attrs_with_drop_attrs_round_trip() {
        // Round-trip: forward matches heading with level=1 and drops the level attr.
        // Inverse re-adds level=1. Full round-trip should restore the original document.
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: Some([("level".to_string(), serde_json::json!(1))].into()),
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Literal("h1".to_string())),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: Some(vec!["level".to_string()]),
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "Hello",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "ns.a", "name": "heading", "level": 1 }]
            }]
        });
        let inv = inverse_lens(spec.clone()).unwrap();
        let after_forward = apply_lens_to_doc(&doc, &spec);
        // After forward: type=ns.b, name=h1, level is gone.
        let fwd_feat = &after_forward["facets"][0]["features"][0];
        assert_eq!(fwd_feat["$type"], "ns.b");
        assert_eq!(fwd_feat["name"], "h1");
        assert!(
            fwd_feat.get("level").map(|v| v.is_null()).unwrap_or(true),
            "level should be absent after forward"
        );
        // Apply inverse: inverse match has matchAttrs { ... }, but the inverse was generated
        // from addAttrs on the forward. Actually the inverse for this rule uses addAttrs.
        let after_round_trip = apply_lens_to_doc(&after_forward, &inv);
        assert_eq!(
            after_round_trip["facets"][0]["features"][0]["$type"],
            "ns.a"
        );
        assert_eq!(
            after_round_trip["facets"][0]["features"][0]["name"],
            "heading"
        );
        assert_eq!(after_round_trip["facets"][0]["features"][0]["level"], 1);
    }

    #[test]
    fn template_name_with_add_attrs_resolves_correctly() {
        // Composed rules can have a Template name + addAttrs when the source feature
        // doesn't have the template key (e.g. contentful heading-1 → h{level} + addAttrs:{level:1}).
        // The template expansion must include add_attrs in the lookup so it resolves correctly.
        let spec = make_spec(
            "ns.a",
            "ns.b",
            vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("ns.a".to_string()),
                    name: Some("heading-1".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("ns.b".to_string()),
                    name: Some(ReplacementName::Template {
                        template: "h{level}".to_string(),
                    }),
                    rename_attrs: None,
                    add_attrs: Some(
                        [("level".to_string(), serde_json::json!(1))]
                            .into_iter()
                            .collect(),
                    ),
                    drop_attrs: Some(vec!["level".to_string()]),
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                ..Default::default()
            }],
        );
        let doc = serde_json::json!({
            "text": "\u{FFFC}Title",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 3 },
                "features": [{ "$type": "ns.a", "name": "heading-1", "parents": [] }]
            }]
        });
        let result = apply_lens_to_doc(&doc, &spec);
        let feat = &result["facets"][0]["features"][0];
        assert_eq!(feat["$type"], "ns.b", "type should be updated");
        assert_eq!(
            feat["name"], "h1",
            "template h{{level}} + addAttrs{{level:1}} should resolve to h1"
        );
        assert!(
            feat.get("level").map(|v| v.is_null()).unwrap_or(true),
            "level should be dropped from final feature"
        );
    }

    #[test]
    fn drop_rule_removes_feature() {
        let doc = serde_json::json!({
            "text": "\u{FFFC}item one\nitem two",
            "facets": [
                {
                    "index": { "byteStart": 0, "byteEnd": 3 },
                    "features": [{ "$type": "org.commonmark.facet", "name": "bullet-list-marker" }]
                },
                {
                    "index": { "byteStart": 3, "byteEnd": 12 },
                    "features": [{ "$type": "org.commonmark.facet", "name": "unordered-list-item" }]
                }
            ]
        });
        // Drop unordered-list-item, rename bullet-list-marker → ul
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "test-drop".to_string(),
            version: None,
            description: None,
            source: "org.commonmark.facet".to_string(),
            target: "org.w3c.html.facet".to_string(),
            rules: Some(vec![
                LensRule {
                    match_: Some(FeaturePattern {
                        type_id: Some("org.commonmark.facet".to_string()),
                        name: Some("bullet-list-marker".to_string()),
                        ..Default::default()
                    }),
                    replace: Some(FeatureReplacement {
                        type_id: Some("org.w3c.html.facet".to_string()),
                        name: Some(ReplacementName::Literal("ul".to_string())),
                        rename_attrs: None,
                        add_attrs: None,
                        drop_attrs: None,
                        keep_attrs: None,
                        map_attr_value: None,
                    }),
                    ..Default::default()
                },
                LensRule {
                    match_: Some(FeaturePattern {
                        type_id: Some("org.commonmark.facet".to_string()),
                        name: Some("unordered-list-item".to_string()),
                        ..Default::default()
                    }),
                    replace: None, // DROP
                    ..Default::default()
                },
            ]),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        };

        let result = apply_lens_to_doc(&doc, &spec);
        let facets = result["facets"].as_array().unwrap();
        // Only bullet-list-marker → ul should survive
        assert_eq!(facets.len(), 1, "only ul should survive, got: {result:#}");
        let name = facets[0]["features"][0]["name"].as_str().unwrap();
        assert_eq!(name, "ul");
    }

    #[test]
    fn template_name_heading_rule() {
        // Template name rule: heading → h{level}
        // Use nested attrs to match how markdown parser produces headings
        let doc = serde_json::json!({
            "text": "\u{FFFC}Hello",
            "facets": [
                {
                    "index": { "byteStart": 0, "byteEnd": 3 },
                    "features": [{ "$type": "org.relationaltext.facet", "name": "heading", "parents": [], "attrs": { "level": 1 } }]
                }
            ]
        });
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "rt-to-html".to_string(),
            version: None,
            description: None,
            source: "org.relationaltext.facet".to_string(),
            target: "org.w3c.html.facet".to_string(),
            rules: Some(vec![LensRule {
                match_: Some(FeaturePattern {
                    type_id: Some("org.relationaltext.facet".to_string()),
                    name: Some("heading".to_string()),
                    match_attrs: None,
                    ..Default::default()
                }),
                replace: Some(FeatureReplacement {
                    type_id: Some("org.w3c.html.facet".to_string()),
                    name: Some(ReplacementName::Template {
                        template: "h{level}".to_string(),
                    }),
                    rename_attrs: None,
                    add_attrs: None,
                    drop_attrs: Some(vec!["level".to_string()]),
                    keep_attrs: None,
                    map_attr_value: None,
                }),
                sql: None,
                join: None,
                delete_text: false,
            }]),
            passthrough: None,
            wasm_module: None,
            invertible: true,
        };

        let result = apply_lens_to_doc(&doc, &spec);
        let facets = result["facets"].as_array().unwrap();
        assert!(
            !facets.is_empty(),
            "heading facet should survive: {result:#}"
        );

        let feat = &facets[0]["features"][0];
        assert_eq!(
            feat["$type"].as_str().unwrap(),
            "org.w3c.html.facet",
            "type should be updated: {feat:#}"
        );
        assert_eq!(
            feat["name"].as_str().unwrap(),
            "h1",
            "template should resolve to h1: {feat:#}"
        );
    }

    #[test]
    fn cross_namespace_with_passthrough_drop() {
        // HTML→RT with passthrough:drop should preserve matched features and drop others
        let doc = serde_json::json!({
            "text": "\u{FFFC}bold",
            "facets": [
                {
                    "index": { "byteStart": 0, "byteEnd": 3 },
                    "features": [{ "$type": "org.w3c.html.facet", "name": "p" }]
                },
                {
                    "index": { "byteStart": 3, "byteEnd": 7 },
                    "features": [{ "$type": "org.w3c.html.facet", "name": "strong" }]
                }
            ]
        });
        let spec = LensSpec {
            dollar_type: "community.lexicon.lens".to_string(),
            id: "html-to-rt".to_string(),
            version: None,
            description: None,
            source: "org.w3c.html.facet".to_string(),
            target: "org.relationaltext.facet".to_string(),
            rules: Some(vec![
                make_rule(
                    "org.w3c.html.facet",
                    "strong",
                    "org.relationaltext.facet",
                    "bold",
                ),
                make_rule(
                    "org.w3c.html.facet",
                    "p",
                    "org.relationaltext.facet",
                    "paragraph",
                ),
            ]),
            passthrough: Some(Passthrough::Drop),
            wasm_module: None,
            invertible: true,
        };

        let result = apply_lens_to_doc(&doc, &spec);
        let facets = result["facets"].as_array().unwrap();
        assert_eq!(
            facets.len(),
            2,
            "both matched facets should survive: {result:#}"
        );

        let types: Vec<&str> = facets
            .iter()
            .flat_map(|f| {
                f["features"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|feat| feat["$type"].as_str().unwrap())
            })
            .collect();
        assert!(
            types.iter().all(|t| *t == "org.relationaltext.facet"),
            "all types should be org.relationaltext.facet, got: {types:?}"
        );

        let names: Vec<&str> = facets
            .iter()
            .flat_map(|f| {
                f["features"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|feat| feat["name"].as_str())
            })
            .collect();
        assert!(names.contains(&"bold"), "should have bold, got: {names:?}");
        assert!(
            names.contains(&"paragraph"),
            "should have paragraph, got: {names:?}"
        );
    }

    #[test]
    fn cross_namespace_rename_preserves_marks() {
        // Simulate cross-format: org.bbcode.facet → org.w3c.html.facet
        let doc = serde_json::json!({
            "text": "\u{FFFC}bold",
            "facets": [
                {
                    "index": { "byteStart": 0, "byteEnd": 3 },
                    "features": [{ "$type": "org.bbcode.facet", "name": "paragraph" }]
                },
                {
                    "index": { "byteStart": 3, "byteEnd": 7 },
                    "features": [{ "$type": "org.bbcode.facet", "name": "b" }]
                }
            ]
        });
        let spec = make_spec(
            "org.bbcode.facet",
            "org.w3c.html.facet",
            vec![
                make_rule("org.bbcode.facet", "paragraph", "org.w3c.html.facet", "p"),
                make_rule("org.bbcode.facet", "b", "org.w3c.html.facet", "strong"),
            ],
        );

        let result = apply_lens_to_doc(&doc, &spec);
        let text = result["text"].as_str().unwrap();
        assert_eq!(text, "\u{FFFC}bold");

        let facets = result["facets"].as_array().unwrap();
        assert_eq!(facets.len(), 2, "both facets should survive: {result:#}");

        // Check that marks got renamed
        let types: Vec<&str> = facets
            .iter()
            .flat_map(|f| {
                f["features"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|feat| feat["$type"].as_str().unwrap())
            })
            .collect();
        assert!(
            types.iter().all(|t| *t == "org.w3c.html.facet"),
            "all types should be org.w3c.html.facet, got: {types:?}"
        );

        let names: Vec<&str> = facets
            .iter()
            .flat_map(|f| {
                f["features"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|feat| feat["name"].as_str())
            })
            .collect();
        assert!(names.contains(&"p"), "should have p, got: {names:?}");
        assert!(
            names.contains(&"strong"),
            "should have strong, got: {names:?}"
        );
    }

    #[test]
    fn mastodon_plain_link_survives() {
        let doc = serde_json::json!({
            "text": "\u{FFFC}link",
            "facets": [
                {
                    "index": { "byteStart": 0, "byteEnd": 3 },
                    "features": [{ "$type": "org.w3c.html.facet", "name": "p" }]
                },
                {
                    "index": { "byteStart": 3, "byteEnd": 7 },
                    "features": [{ "$type": "org.w3c.html.facet", "name": "a", "href": "https://example.com" }]
                }
            ]
        });
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "html-to-mastodon",
            "source": "org.w3c.html.facet",
            "target": "org.joinmastodon.facet",
            "passthrough": "drop",
            "rules": [
                { "match": { "name": "a" }, "replace": { "name": "a", "keepAttrs": ["href"] } },
                { "match": { "name": "p" }, "replace": { "name": "p" } }
            ]
        })).unwrap();
        let result = apply_lens_to_doc(&doc, &spec);
        let facets = result["facets"].as_array().unwrap();
        assert!(!facets.is_empty(), "facets should survive passthrough:drop, got: {result:#}");
        let types: Vec<&str> = facets.iter().flat_map(|f| {
            f["features"].as_array().unwrap().iter().map(|ft| ft["$type"].as_str().unwrap())
        }).collect();
        assert!(types.iter().all(|t| *t == "org.joinmastodon.facet"),
            "all types should be mastodon, got: {types:?}");
        let a_feat = facets.iter().flat_map(|f| f["features"].as_array().unwrap().iter()).find(|ft| ft["name"] == "a");
        assert!(a_feat.is_some(), "a feature should survive, got: {result:#}");
        assert_eq!(a_feat.unwrap()["href"], "https://example.com");
    }
}
