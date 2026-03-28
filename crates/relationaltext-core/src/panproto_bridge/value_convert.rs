//! JSON ↔ panproto Value conversion utilities.

use std::collections::HashMap;

use panproto_inst::value::Value;

pub fn json_to_value(json: &serde_json::Value) -> Value {
    match json {
        serde_json::Value::Null => Value::Null,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Int(i)
            } else {
                Value::Float(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => Value::Str(s.clone()),
        serde_json::Value::Object(map) => {
            let fields: HashMap<String, Value> = map
                .iter()
                .map(|(k, v)| (k.clone(), json_to_value(v)))
                .collect();
            Value::Unknown(fields)
        }
        serde_json::Value::Array(arr) => {
            // Encode arrays as Unknown with numeric keys for round-trip fidelity
            let fields: HashMap<String, Value> = arr
                .iter()
                .enumerate()
                .map(|(i, v)| (i.to_string(), json_to_value(v)))
                .collect();
            // Use a sentinel to distinguish arrays from objects
            let mut fields_with_marker = fields;
            fields_with_marker.insert("__array_len".into(), Value::Int(arr.len() as i64));
            Value::Unknown(fields_with_marker)
        }
    }
}

pub fn value_to_json(value: &Value) -> serde_json::Value {
    match value {
        Value::Null => serde_json::Value::Null,
        Value::Bool(b) => serde_json::Value::Bool(*b),
        Value::Int(i) => serde_json::json!(i),
        Value::Float(f) => serde_json::json!(f),
        Value::Str(s) => serde_json::Value::String(s.clone()),
        Value::Unknown(fields) => {
            // Check if this is an encoded array (has __array_len sentinel)
            if let Some(Value::Int(len)) = fields.get("__array_len") {
                let len = *len as usize;
                let mut arr = Vec::with_capacity(len);
                for i in 0..len {
                    let key = i.to_string();
                    let val = fields
                        .get(&key)
                        .map(value_to_json)
                        .unwrap_or(serde_json::Value::Null);
                    arr.push(val);
                }
                serde_json::Value::Array(arr)
            } else {
                let obj: serde_json::Map<String, serde_json::Value> = fields
                    .iter()
                    .map(|(k, v)| (k.clone(), value_to_json(v)))
                    .collect();
                serde_json::Value::Object(obj)
            }
        }
        _ => serde_json::Value::Null,
    }
}

pub fn extract_int_field(fields: &HashMap<String, Value>, key: &str) -> Option<i64> {
    match fields.get(key) {
        Some(Value::Int(i)) => Some(*i),
        _ => None,
    }
}
