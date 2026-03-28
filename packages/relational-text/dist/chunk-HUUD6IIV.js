import {
  migrate_ontology_annotations,
  ontology_to_schema
} from "./chunk-AVMPBRSI.js";

// src/ontology.ts
async function ontologyToSchema(ontology, typeDefs) {
  const input = JSON.stringify({ ontology, typeDefs });
  const result = ontology_to_schema(input);
  return JSON.parse(result);
}
async function migrateAnnotations(oldOntology, newOntology, annotations) {
  const oldJson = JSON.stringify(oldOntology);
  const newJson = JSON.stringify(newOntology);
  const annJson = JSON.stringify(annotations);
  const result = migrate_ontology_annotations(oldJson, newJson, annJson);
  return JSON.parse(result);
}

export {
  ontologyToSchema,
  migrateAnnotations
};
