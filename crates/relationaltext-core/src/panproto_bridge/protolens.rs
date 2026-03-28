//! LensSpec → ProtolensChain translation.
//!
//! Composes existing panproto elementary protolens constructors:
//! - `rename_sort` / `drop_sort` for feature renames and drops
//! - `rename_op` / `drop_op` / `add_op` for attribute operations
//! - `directed_eq` for value transforms and template names (lax nat trans)
//! - `pullback` for join rules over shared byte-range subschema

use std::collections::HashMap;
use std::sync::Arc;

use panproto_gat::{DirectedEquation, Term, TheoryMorphism};
use panproto_lens::protolens::{elementary, ProtolensChain};

use crate::lens_types::{AttrValueOp, LensSpec, ReplacementName};

/// Convert a LensSpec to a ProtolensChain by composing elementary protolenses.
pub fn lens_spec_to_protolens_chain(spec: &LensSpec) -> ProtolensChain {
    let rules = match &spec.rules {
        Some(r) => r,
        None => return ProtolensChain::new(vec![]),
    };

    // Pre-scan: find target names that appear multiple times (e.g., h1→heading, h2→heading).
    // These are many-to-one mappings that can't be expressed as schema-level renames
    // and must be handled entirely post-restrict by the JSON engine.
    let mut target_name_count: HashMap<String, usize> = HashMap::new();
    for rule in rules {
        if rule.sql.is_some() || rule.join.is_some() {
            continue;
        }
        if let Some(repl) = &rule.replace {
            let target_name = match &repl.name {
                Some(ReplacementName::Literal(s)) => Some(s.clone()),
                _ => None,
            };
            if let Some(tn) = target_name {
                let type_id = repl.type_id.as_deref().unwrap_or(&spec.target);
                let key = format!("{type_id}#{tn}");
                *target_name_count.entry(key).or_insert(0) += 1;
            }
        }
    }

    let mut steps = Vec::new();

    for rule in rules {
        // SQL rules → directed equation placeholder
        if rule.sql.is_some() {
            let deq = DirectedEquation::new(
                "sql_rule",
                Term::var("input"),
                Term::var("output"),
                panproto_expr::Expr::Var(Arc::from("input")),
            );
            steps.push(elementary::directed_eq(deq));
            continue;
        }

        // Join rules → pullback over shared byte-range subschema
        if let Some(join) = &rule.join {
            let morphism = TheoryMorphism::new(
                format!("join_{}", join.primary.name).as_str(),
                join.primary.name.as_str(),
                join.produce.type_id.as_str(),
                HashMap::new(),
                HashMap::new(),
            );
            steps.push(elementary::pullback(morphism));
            continue;
        }

        let pattern = match &rule.match_ {
            Some(p) => p,
            None => continue,
        };

        let match_name = match &pattern.name {
            Some(n) => n.clone(),
            None => {
                // Try extracting name from compound typeId (e.g. "ns.a#mark@1.0")
                let type_id = pattern.type_id.as_deref().unwrap_or(&spec.source);
                let stripped = crate::lens::strip_version(type_id);
                if let Some(hash) = stripped.rfind('#') {
                    stripped[hash + 1..].to_string()
                } else {
                    continue;
                }
            }
        };

        // Skip value-dependent rules — these cannot be expressed as schema-level
        // protolens steps. They are handled post-restrict by the JSON engine.
        // This includes: matchAttrs (value filtering) and template names
        // (value-dependent sort name computation).
        if pattern.match_attrs.is_some()
            || pattern.match_attrs_any.is_some()
            || pattern.match_attrs_all.is_some()
        {
            continue;
        }
        // Build compound source key: type_id#name (type_id defaults to spec.source).
        // If type_id is itself a compound key (contains #), extract just the namespace part.
        let raw_type_id = pattern.type_id.as_deref().unwrap_or(&spec.source);
        let match_type_id = {
            let stripped = crate::lens::strip_version(raw_type_id);
            if let Some(hash) = stripped.rfind('#') {
                &stripped[..hash]
            } else {
                stripped
            }
        };
        let source_key = format!("{match_type_id}#{match_name}");

        // No replacement → drop
        let replacement = match &rule.replace {
            Some(r) => r,
            None => {
                steps.push(elementary::drop_sort(source_key.as_str()));
                continue;
            }
        };

        // Skip template name rules — handled post-restrict by the JSON engine
        if matches!(replacement.name, Some(ReplacementName::Template { .. })) {
            continue;
        }

        // Build compound target key: target_type_id#replace_name
        let replace_type_id = replacement.type_id.as_deref().unwrap_or(&spec.target);
        let replace_name = replacement.name.as_ref().and_then(|n| match n {
            ReplacementName::Literal(s) => Some(s.clone()),
            ReplacementName::Template { template } => Some(template.clone()),
        });
        let replace_name_str = replace_name.as_deref().unwrap_or(&match_name);
        let target_key = format!("{replace_type_id}#{replace_name_str}");

        // Many-to-one mappings: generate rename_sort for each.
        // Multiple source vertices mapping to the same target vertex is
        // handled by compute_migration_between via vertex_remap.
        // The Case transform in inject_field_transforms handles the
        // value-dependent attribute changes.

        // Sort rename (compound key → compound key)
        if replace_name_str.contains('{') && replace_name_str.contains('}') {
            // Template name → directed equation
            let deq = DirectedEquation::new(
                format!("{source_key}_template").as_str(),
                Term::var("name"),
                Term::var("computed"),
                template_to_expr(replace_name_str),
            );
            steps.push(elementary::directed_eq(deq));
        } else if source_key != target_key {
            steps.push(elementary::rename_sort(
                source_key.as_str(),
                target_key.as_str(),
            ));
        }

        // Attribute renames → rename_op
        if let Some(renames) = &replacement.rename_attrs {
            for (old, new) in renames {
                steps.push(elementary::rename_op(old.as_str(), new.as_str()));
            }
        }

        // Attribute drops → drop_op
        if let Some(drops) = &replacement.drop_attrs {
            for name in drops {
                steps.push(elementary::drop_op(name.as_str()));
            }
        }

        // Attribute additions → add_op
        if let Some(adds) = &replacement.add_attrs {
            let sort = replace_name.as_deref().unwrap_or(&match_name);
            for (key, _val) in adds {
                steps.push(elementary::add_op(key.as_str(), sort, "string", "attr"));
            }
        }

        // Value transforms → directed_eq
        if let Some(transforms) = &replacement.map_attr_value {
            for (attr, op) in transforms {
                if let Some(deq) = attr_value_op_to_deq(attr, op) {
                    steps.push(elementary::directed_eq(deq));
                }
            }
        }
    }

    ProtolensChain::new(steps)
}

/// Convert a template string like `"h{level}"` to an Expr.
fn template_to_expr(template: &str) -> panproto_expr::Expr {
    use panproto_expr::{BuiltinOp, Expr, Literal};

    let mut parts: Vec<Expr> = Vec::new();
    let mut rest = template;

    while let Some(open) = rest.find('{') {
        if open > 0 {
            parts.push(Expr::Lit(Literal::Str(rest[..open].to_owned())));
        }
        if let Some(close) = rest[open..].find('}') {
            let var_name = &rest[open + 1..open + close];
            parts.push(Expr::Builtin(
                BuiltinOp::IntToStr,
                vec![Expr::Var(Arc::from(var_name))],
            ));
            rest = &rest[open + close + 1..];
        } else {
            break;
        }
    }
    if !rest.is_empty() {
        parts.push(Expr::Lit(Literal::Str(rest.to_owned())));
    }

    match parts.len() {
        0 => Expr::Lit(Literal::Str(template.to_owned())),
        1 => parts.into_iter().next().unwrap_or(Expr::Lit(Literal::Null)),
        _ => parts
            .into_iter()
            .reduce(|a, b| Expr::Builtin(BuiltinOp::Concat, vec![a, b]))
            .unwrap_or(Expr::Lit(Literal::Null)),
    }
}

/// Convert an `AttrValueOp` to a panproto `Expr` (the forward computation).
///
/// The expression takes a variable named `attr` as input and produces
/// the transformed value. Used by both the protolens chain (for
/// directed equations) and the field transform builder (for compiled
/// migrations).
pub fn attr_value_op_to_expr(attr: &str, op: &AttrValueOp) -> Option<panproto_expr::Expr> {
    use panproto_expr::{BuiltinOp, Expr, Literal};
    let var = Expr::Var(Arc::from(attr));
    Some(match op {
        AttrValueOp::Add { value } => {
            Expr::Builtin(BuiltinOp::Add, vec![var, Expr::Lit(Literal::Float(*value))])
        }
        AttrValueOp::Subtract { value } => {
            Expr::Builtin(BuiltinOp::Sub, vec![var, Expr::Lit(Literal::Float(*value))])
        }
        AttrValueOp::Multiply { value } => {
            Expr::Builtin(BuiltinOp::Mul, vec![var, Expr::Lit(Literal::Float(*value))])
        }
        AttrValueOp::Negate => Expr::Builtin(BuiltinOp::Not, vec![var]),
        AttrValueOp::Prefix { value } => Expr::Builtin(
            BuiltinOp::Concat,
            vec![Expr::Lit(Literal::Str(value.clone())), var],
        ),
        AttrValueOp::Suffix { value } => Expr::Builtin(
            BuiltinOp::Concat,
            vec![var, Expr::Lit(Literal::Str(value.clone()))],
        ),
        AttrValueOp::ToStr => Expr::Builtin(BuiltinOp::IntToStr, vec![var]),
        AttrValueOp::ToNum => Expr::Builtin(BuiltinOp::StrToInt, vec![var]),
        AttrValueOp::ToBool => Expr::Builtin(
            BuiltinOp::Not,
            vec![Expr::Builtin(BuiltinOp::IsNull, vec![var])],
        ),
    })
}

/// Convert an AttrValueOp to a DirectedEquation using panproto-expr builtins.
fn attr_value_op_to_deq(attr: &str, op: &AttrValueOp) -> Option<DirectedEquation> {
    use panproto_expr::{BuiltinOp, Expr, Literal};

    let var = Expr::Var(Arc::from(attr));
    let out = format!("{attr}_out");
    let impl_term = attr_value_op_to_expr(attr, op)?;

    let inverse = match op {
        AttrValueOp::Add { value } => Some(Expr::Builtin(
            BuiltinOp::Sub,
            vec![var, Expr::Lit(Literal::Float(*value))],
        )),
        AttrValueOp::Subtract { value } => Some(Expr::Builtin(
            BuiltinOp::Add,
            vec![var, Expr::Lit(Literal::Float(*value))],
        )),
        AttrValueOp::Multiply { value } => Some(Expr::Builtin(
            BuiltinOp::Div,
            vec![var, Expr::Lit(Literal::Float(*value))],
        )),
        AttrValueOp::Negate => Some(Expr::Builtin(BuiltinOp::Not, vec![var])),
        AttrValueOp::ToStr => Some(Expr::Builtin(BuiltinOp::StrToInt, vec![var])),
        AttrValueOp::ToNum => Some(Expr::Builtin(BuiltinOp::IntToStr, vec![var])),
        _ => None,
    };

    Some(if let Some(inv) = inverse {
        DirectedEquation::with_inverse(
            format!("map_{attr}").as_str(),
            Term::var(attr),
            Term::var(out.as_str()),
            impl_term,
            inv,
        )
    } else {
        DirectedEquation::new(
            format!("map_{attr}").as_str(),
            Term::var(attr),
            Term::var(out.as_str()),
            impl_term,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lens_types::LensSpec;

    #[test]
    fn rename_produces_rename_sort() {
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "match": { "name": "strong" }, "replace": { "name": "bold" } }]
        }))
        .unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert_eq!(chain.len(), 1);
        assert!(chain.steps[0].name.as_ref().contains("rename_sort"));
    }

    #[test]
    fn drop_produces_drop_sort() {
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "match": { "name": "embed" }, "replace": null }]
        }))
        .unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert_eq!(chain.len(), 1);
        assert!(chain.steps[0].name.as_ref().contains("drop_sort"));
    }

    #[test]
    fn identity_same_namespace_is_empty() {
        // Same source and target namespace + same name → identity (no steps)
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "a",
            "rules": [{ "match": { "name": "paragraph" }, "replace": { "name": "paragraph" } }]
        }))
        .unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert!(chain.is_empty());
    }

    #[test]
    fn identity_different_namespace_is_rename() {
        // Different source and target namespace → rename sort (a#paragraph → b#paragraph)
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "match": { "name": "paragraph" }, "replace": { "name": "paragraph" } }]
        }))
        .unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert_eq!(chain.len(), 1);
        assert!(chain.steps[0].name.as_ref().contains("rename_sort"));
    }

    #[test]
    fn rename_attrs_produces_rename_op() {
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "match": { "name": "link" }, "replace": { "name": "link", "renameAttrs": { "uri": "url" } } }]
        })).unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert!(chain
            .steps
            .iter()
            .any(|s| s.name.as_ref().contains("rename_op")));
    }

    #[test]
    fn template_skipped_in_protolens_chain() {
        // Template name rules are value-dependent (the sort name depends on
        // instance data). They are handled post-restrict by the JSON engine,
        // so the protolens chain should have no steps for them.
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "match": { "name": "heading" }, "replace": { "name": { "template": "h{level}" } } }]
        })).unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert!(
            chain.is_empty(),
            "template rules should be handled post-restrict, not in protolens chain"
        );
    }

    #[test]
    fn join_produces_pullback() {
        let spec: LensSpec = serde_json::from_value(serde_json::json!({
            "$type": "org.relationaltext.lens",
            "id": "test", "source": "a", "target": "b",
            "rules": [{ "join": {
                "primary": { "name": "link" },
                "joined": [{ "name": "title", "alias": "t" }],
                "produce": { "name": { "from": "attr", "attr": "name" }, "typeId": "combined" }
            }}]
        }))
        .unwrap();
        let chain = lens_spec_to_protolens_chain(&spec);
        assert!(chain
            .steps
            .iter()
            .any(|s| s.name.as_ref().contains("pullback")));
    }
}
