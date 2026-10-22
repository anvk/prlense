import type { ContextDocKind } from "../context/provider.js"

export const REPORT_SCHEMA_VERSION = 4

export interface PrHeader {
  number: number
  slug: string
  url: string
  title: string
  author: string
  state: "OPEN" | "MERGED" | "CLOSED"
  isDraft: boolean
  baseRefName: string
  headRefName: string
  baseSha: string
  headSha: string
  additions: number
  deletions: number
  changedFiles: number
  headRepoSlug: string | null
}

export interface FileRef {
  path: string
  line?: number
  oldLine?: number
  symbol?: string
  // Filled by the tool after validation, never by the model.
  diffUrl?: string
  blobUrl?: string
}

export const REFERENCE_KINDS = ["pr-body", "ticket", "doc", "commit", "other"] as const

export interface Reference {
  label: string
  url?: string
  kind: (typeof REFERENCE_KINDS)[number]
  note?: string
}

export interface WhyStep {
  paragraphs: string[]
  references: Reference[]
}

// Step 2 is an overview for a developer who does not know this codebase: one section per
// area the PR touches, in this order, with no file paths.
export const WHAT_SECTION_KINDS = ["architecture", "backend", "ui", "tools", "models", "other"] as const
export type WhatSectionKind = (typeof WHAT_SECTION_KINDS)[number]

export interface WhatSection {
  kind: WhatSectionKind
  title: string
  summary: string
  points: string[]
}

export interface WhatStep {
  lead: string
  sections: WhatSection[]
}

export const MODEL_CHANGE_KINDS = [
  "migration",
  "table",
  "column",
  "index",
  "enum",
  "type",
  "schema",
  "api-contract",
  "config",
  "other",
] as const
export type ModelChangeKind = (typeof MODEL_CHANGE_KINDS)[number]
export const MODEL_CHANGES = ["added", "removed", "modified", "renamed"] as const

// Step 3 is grouped by where the data lives, so a reviewer can tell an irreversible
// migration apart from an in-memory struct at a glance.
export const MODEL_GROUPS = ["storage", "domain", "contract", "other"] as const
export type ModelGroup = (typeof MODEL_GROUPS)[number]

export const ROW_CHANGES = ["added", "removed", "modified", "unchanged"] as const
export type RowChange = (typeof ROW_CHANGES)[number]

// One field or column in a rendered shape diagram.
export interface ShapeRow {
  name: string
  type: string
  keys?: string // PK, FK -> orders, UQ, null
  note?: string
  change: RowChange
}

export interface ModelChange {
  group: ModelGroup
  kind: ModelChangeKind
  name: string
  change: (typeof MODEL_CHANGES)[number]
  description: string
  attention?: boolean // a reviewer must not miss this one
  shape?: ShapeRow[]
  indexes?: string[]
  relations?: string[]
  locations: FileRef[]
  risk?: string
  unverified?: boolean
}

export interface ModelStep {
  summary: string
  changes: ModelChange[]
}

export const FUNCTION_KINDS = ["function", "method", "handler", "component", "hook", "job", "middleware", "test", "other"] as const
export type FunctionKind = (typeof FUNCTION_KINDS)[number]
export const FUNCTION_CHANGES = ["added", "removed", "modified", "renamed", "moved"] as const

export interface FunctionChange {
  name: string
  kind: FunctionKind
  change: (typeof FUNCTION_CHANGES)[number]
  summary: string
  location: FileRef
  detailIds?: string[]
}

export interface FunctionGroup {
  area: string
  items: FunctionChange[]
}

export interface FunctionsStep {
  groups: FunctionGroup[]
}

export interface DetailedChange {
  id: string
  title: string
  area?: string
  files: FileRef[]
  before?: string
  after: string
  explanation: string[]
  callers?: string[]
  tests?: FileRef[]
  unverified?: boolean
}

export interface DetailsStep {
  changes: DetailedChange[]
}

export interface Coverage {
  filesTraced: string[]
  filesSkippedGenerated: string[]
  filesSkippedTests: string[]
  filesUntraced: { path: string; reason: string }[]
  notes?: string[]
}

export interface ContextSourceRef {
  kind: ContextDocKind
  source: string
  title: string
}

// Step 6: what a reviewer keeps at hand while reading. Risks are facts with a
// consequence, never verdicts; questions are what the code does not answer.
export const RISK_KINDS = ["code", "deploy"] as const
export type RiskKind = (typeof RISK_KINDS)[number]

export interface SourceRef {
  modelChange?: string // exact name of a step 3 change
  detailId?: string // id of a step 5 change
}

export interface RiskItem {
  kind: RiskKind
  title: string
  consequence: string
  source?: SourceRef
  unverified?: boolean
}

export interface OpenQuestion {
  question: string
  context: string
  source?: SourceRef
}

export interface GlossaryTerm {
  term: string
  meaning: string
}

export interface ReviewStep {
  risks: RiskItem[]
  questions: OpenQuestion[]
  glossary: GlossaryTerm[]
}

// Lenses filter the page by audience. Frontend-ness of a path is decided by these globs,
// stored in the report so `prlense render` needs nothing else.
export const LENSES = ["all", "product", "backend", "frontend"] as const
export type Lens = (typeof LENSES)[number]

export interface LensConfig {
  frontendMatch: string[]
}

export const DEFAULT_FRONTEND_MATCH = ["ui/**", "web/**", "frontend/**", "client/**", "apps/web/**"]

// The part the model produces.
export interface AgentOutput {
  why: WhyStep
  what: WhatStep
  model: ModelStep
  functions: FunctionsStep
  details: DetailsStep
  review: ReviewStep
  coverage: Coverage
}

export interface Report extends AgentOutput {
  schemaVersion: typeof REPORT_SCHEMA_VERSION
  generatedAt: string
  tool: { name: "prlense"; version: string; engine: string; model: string; durationMs?: number }
  pr: PrHeader
  sources: ContextSourceRef[]
  lenses: LensConfig
}
