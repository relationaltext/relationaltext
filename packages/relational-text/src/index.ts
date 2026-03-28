/**
 * relational-text — rich text facets for the atproto ecosystem
 *
 * Usage:
 *   import { Document, from, to } from 'relational-text'
 *   import { init, registerFormat } from 'relational-text/registry'
 */

export * from './core.js'
export * from './layered-document.js'
export * from './lens.js'
export * from './layers.js'
export * from './registry.js'
export type { RTAutomergeBridge, RTMutation, RTInsertMutation, RTDeleteMutation, RTAddMarkMutation, RTRemoveMarkMutation, RTInsertBlockMutation, AutomergePatch } from './automerge-stream.js'
export { utf16IndexToByteOffset, byteOffsetToUtf16Index, automergePathToRTMutations, applyRTMutations, createBridgeFromRT, applyRTMutationToAutomerge } from './automerge-stream.js'
export * from './automerge.js'
export { detectFacets } from './bluesky-utils.js'
export * from './knowledge.js'
export * from './concept-index.js'
export * from './annotation-overlay.js'
export { type ExperimentDef, type ExperimentDesign, type PresentationSpec, type RecordingMethod, type ListConstraint, type Judgment, type JudgmentSet, type AgreementReport, type AgentRef, type ObjectRef, type Constraint } from './experiment.js'
export { type TypeDef, type RoleSlot, type Ontology } from './ontology.js'
export { type Alignment, type AlignmentLink } from './alignment.js'
