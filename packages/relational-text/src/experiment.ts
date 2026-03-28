/**
 * Types for Layers' experiment and judgment framework.
 * Derived from the pub.layers.judgment lexicons:
 *   - pub.layers.judgment.experimentDef
 *   - pub.layers.judgment.defs#judgment
 *   - pub.layers.judgment.judgmentSet
 *   - pub.layers.judgment.agreementReport
 *   - pub.layers.judgment.defs#presentationSpec
 *   - pub.layers.judgment.defs#recordingMethod
 *   - pub.layers.judgment.defs#experimentDesign
 *   - pub.layers.judgment.defs#listConstraint
 */

import type { KnowledgeRef } from './knowledge.js'

// ─── Object references (from pub.layers.defs) ─────────────────────────────────

/** Composable object reference (pub.layers.defs#objectRef). */
export interface ObjectRef {
  localId?: { value: string }
  recordRef?: string
  objectId?: { value: string }
  knowledgeRef?: KnowledgeRef
}

/** Agent reference (pub.layers.defs#agentRef). */
export interface AgentRef {
  did?: string
  id?: string
  name?: string
  knowledgeRef?: KnowledgeRef
}

// ─── Experiment definition ─────────────────────────────────────────────────────

/** A list constraint for experiment design (pub.layers.judgment.defs#listConstraint). */
export interface ListConstraint {
  kindUri?: string
  kind: string
  targetProperty?: string
  parameters?: { entries: Array<{ key: string; value: string }> }
  constraint?: Constraint
}

/** A constraint expression (pub.layers.defs#constraint). */
export interface Constraint {
  expression: string
  expressionFormatUri?: string
  expressionFormat?: string
  scopeUri?: string
  scope?: string
  context?: string[]
  description?: string
}

/** Experiment design parameters (pub.layers.judgment.defs#experimentDesign). */
export interface ExperimentDesign {
  listConstraints?: ListConstraint[]
  distributionStrategyUri?: string
  distributionStrategy?: string
  itemOrderUri?: string
  itemOrder?: string
  timingMs?: number
  features?: { entries: Array<{ key: string; value: string }> }
}

/** How stimuli are displayed to participants (pub.layers.judgment.defs#presentationSpec). */
export interface PresentationSpec {
  methodUri?: string
  method?: string
  chunkingUnit?: string
  timingMs?: number
  isiMs?: number
  cumulative?: boolean
  maskChar?: string
  features?: { entries: Array<{ key: string; value: string }> }
}

/** A data capture instrument (pub.layers.judgment.defs#recordingMethod). */
export interface RecordingMethod {
  methodUri?: string
  method: string
  features?: { entries: Array<{ key: string; value: string }> }
}

/**
 * Definition of an annotation or judgment experiment.
 * Derived from pub.layers.judgment.experimentDef.
 */
export interface ExperimentDef {
  name: string
  description?: string
  measureTypeUri?: string
  measureType?: string
  taskTypeUri?: string
  taskType?: string
  guidelines?: string
  ontologyRef?: string
  personaRef?: string
  corpusRef?: string
  templateRefs?: string[]
  collectionRefs?: string[]
  scaleMin?: number
  scaleMax?: number
  labels?: string[]
  knowledgeRefs?: KnowledgeRef[]
  presentation?: PresentationSpec
  recordingMethods?: RecordingMethod[]
  design?: ExperimentDesign
  features?: { entries: Array<{ key: string; value: string }> }
  createdAt?: string
}

// ─── Judgments ──────────────────────────────────────────────────────────────────

/**
 * A single judgment about a linguistic item.
 * Derived from pub.layers.judgment.defs#judgment.
 */
export interface Judgment {
  item: ObjectRef
  fillingRef?: string
  categoricalValue?: string
  scalarValue?: number
  textSpan?: { byteStart: number; byteEnd: number }
  freeText?: string
  responseTimeMs?: number
  confidence?: number
  behavioralData?: { entries: Array<{ key: string; value: string }> }
  features?: { entries: Array<{ key: string; value: string }> }
}

/**
 * A set of judgments from a single annotator for an experiment.
 * Derived from pub.layers.judgment.judgmentSet.
 */
export interface JudgmentSet {
  experimentRef: string
  agent?: AgentRef
  judgments: Judgment[]
  knowledgeRefs?: KnowledgeRef[]
  features?: { entries: Array<{ key: string; value: string }> }
  createdAt?: string
}

// ─── Agreement ─────────────────────────────────────────────────────────────────

/**
 * An inter-annotator agreement report.
 * Derived from pub.layers.judgment.agreementReport.
 */
export interface AgreementReport {
  experimentRef: string
  judgmentSetRefs?: string[]
  metricUri?: string
  metric?: string
  value?: number
  numAnnotators?: number
  numItems?: number
  features?: { entries: Array<{ key: string; value: string }> }
  createdAt?: string
}
