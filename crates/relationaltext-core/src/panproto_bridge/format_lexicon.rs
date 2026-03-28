//! Convert RelationalText format-lexicon JSON to ATProto lexicon JSON.
//!
//! RelationalText format lexicons (`$type: "org.relationaltext.format-lexicon"`)
//! describe feature types for rich text facets. This module converts them into
//! ATProto `lexicon: 1` format so that panproto's `parse_lexicon` can handle
//! them without manually authored ATProto schemas for each format.
//!
//! The generated lexicon has:
//! - A `main` record with `text` (string) and `facets` (array of `#facet`)
//! - A `facet` object with `byteStart`, `byteEnd`, and `features` (union)
//! - One object def per feature type (extracted from the typeId fragment)

use serde_json::{json, Map, Value};

/// Convert a RelationalText format-lexicon JSON to an ATProto lexicon JSON.
///
/// If the input already has `"lexicon": 1`, it is returned as-is.
/// Otherwise, the `$type`, `id`, and `features` fields are read from the
/// format-lexicon and a full ATProto lexicon is synthesized.
pub fn format_lexicon_to_atproto(format_lexicon: &Value) -> Result<Value, String> {
    // Already an ATProto lexicon — pass through.
    if format_lexicon.get("lexicon").and_then(Value::as_u64) == Some(1) {
        return Ok(format_lexicon.clone());
    }

    let dollar_type = format_lexicon
        .get("$type")
        .and_then(Value::as_str)
        .unwrap_or("");

    if !dollar_type.is_empty() && dollar_type != "org.relationaltext.format-lexicon" {
        return Err(format!(
            "expected $type \"org.relationaltext.format-lexicon\", got \"{dollar_type}\""
        ));
    }

    let lexicon_id = format_lexicon
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "format-lexicon is missing \"id\" field".to_string())?;

    let features = format_lexicon
        .get("features")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut defs = Map::new();
    let mut feature_refs: Vec<String> = Vec::new();
    let mut feature_def_names: Vec<String> = Vec::new();

    for feature in &features {
        let type_id = match feature.get("typeId").and_then(Value::as_str) {
            Some(tid) => tid,
            None => continue,
        };

        // Extract the fragment name after '#'. If there is no '#', use the
        // full typeId as the def name (replacing dots with underscores).
        let def_name = if let Some(pos) = type_id.rfind('#') {
            type_id[pos + 1..].to_string()
        } else {
            type_id.replace('.', "_")
        };

        if def_name.is_empty() {
            continue;
        }

        // Build the object def for this feature type.
        let mut props = Map::new();

        // Store feature class as metadata if present.
        if let Some(fc) = feature.get("featureClass").and_then(Value::as_str) {
            props.insert(
                "featureClass".to_string(),
                json!({ "type": "string", "const": fc }),
            );
        }

        let def = json!({
            "type": "object",
            "properties": props
        });

        feature_refs.push(format!("#{def_name}"));
        feature_def_names.push(def_name.clone());
        defs.insert(def_name, def);
    }

    // Build the facet object def.
    let facet_def = json!({
        "type": "object",
        "properties": {
            "byteStart": { "type": "integer" },
            "byteEnd": { "type": "integer" },
            "features": {
                "type": "array",
                "items": {
                    "type": "union",
                    "refs": feature_refs
                }
            }
        }
    });
    defs.insert("facet".to_string(), facet_def);

    // Build the main record def.
    let main_def = json!({
        "type": "record",
        "record": {
            "type": "object",
            "properties": {
                "text": { "type": "string" },
                "facets": {
                    "type": "array",
                    "items": {
                        "type": "ref",
                        "ref": "#facet"
                    }
                }
            }
        }
    });
    defs.insert("main".to_string(), main_def);

    let lexicon = json!({
        "lexicon": 1,
        "id": lexicon_id,
        "defs": defs
    });

    Ok(lexicon)
}

#[cfg(test)]
mod tests {
    use super::*;
    use panproto_protocols::web_document::atproto;

    #[test]
    fn passthrough_atproto_lexicon() {
        let already = json!({
            "lexicon": 1,
            "id": "com.example.test",
            "defs": {
                "main": { "type": "object", "properties": {} }
            }
        });
        let result = format_lexicon_to_atproto(&already).unwrap();
        assert_eq!(result, already);
    }

    #[test]
    fn wrong_type_rejected() {
        let bad = json!({ "$type": "com.example.wrong", "id": "x" });
        assert!(format_lexicon_to_atproto(&bad).is_err());
    }

    #[test]
    fn missing_id_rejected() {
        let no_id = json!({ "$type": "org.relationaltext.format-lexicon" });
        assert!(format_lexicon_to_atproto(&no_id).is_err());
    }

    #[test]
    fn missing_features_produces_empty_union() {
        let minimal = json!({
            "$type": "org.relationaltext.format-lexicon",
            "id": "dev.test.facet"
        });
        let result = format_lexicon_to_atproto(&minimal).unwrap();
        let facet_features = &result["defs"]["facet"]["properties"]["features"]["items"]["refs"];
        assert_eq!(facet_features, &json!([]));
    }

    #[test]
    fn typeid_without_hash_uses_full_name() {
        let lex = json!({
            "$type": "org.relationaltext.format-lexicon",
            "id": "dev.test.facet",
            "features": [
                { "typeId": "dev.test.facet.special", "featureClass": "inline" }
            ]
        });
        let result = format_lexicon_to_atproto(&lex).unwrap();
        assert!(result["defs"]["dev_test_facet_special"].is_object());
    }

    #[test]
    fn convert_tiptap_and_parse() {
        let tiptap_json: Value = serde_json::from_str(include_str!(
            "../../../../formats/dev.tiptap/tiptap.lexicon.json"
        ))
        .expect("tiptap lexicon should parse");

        let atproto_json =
            format_lexicon_to_atproto(&tiptap_json).expect("conversion should succeed");

        // Verify basic structure
        assert_eq!(atproto_json["lexicon"], 1);
        assert_eq!(atproto_json["id"], "dev.tiptap.facet");
        assert!(atproto_json["defs"]["main"].is_object());
        assert!(atproto_json["defs"]["facet"].is_object());
        assert!(atproto_json["defs"]["bold"].is_object());
        assert!(atproto_json["defs"]["heading"].is_object());
        assert!(atproto_json["defs"]["italic"].is_object());

        // Verify the union refs include all features
        let refs = atproto_json["defs"]["facet"]["properties"]["features"]["items"]["refs"]
            .as_array()
            .expect("refs should be array");
        assert!(refs.contains(&json!("#bold")));
        assert!(refs.contains(&json!("#heading")));
        assert!(refs.contains(&json!("#link")));

        // The generated ATProto lexicon must parse successfully via panproto
        atproto::parse_lexicon(&atproto_json)
            .expect("parse_lexicon should succeed on converted format-lexicon");
    }
}
