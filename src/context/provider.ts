import type { RunOptions } from "../core/config.js"
import type { ChangedFile } from "../github/diff.js"
import type { PrMeta, TicketRef } from "../github/pr.js"

export type ContextDocKind = "repo-instructions" | "rule" | "doc" | "ticket" | "other"

export interface ContextDoc {
  id: string // stable, e.g. "repo:go/AGENTS.md"
  kind: ContextDocKind
  title: string
  source: string // path or URL, shown to the model and in the report's Sources list
  content: string
  priority: number // lower is kept first when the byte budget truncates
}

export interface ContextRequest {
  repoRoot: string // the user's base checkout
  worktreePath: string // the PR head checkout the model reads
  pr: PrMeta
  changedFiles: ChangedFile[]
  ticketRefs: TicketRef[]
  options: RunOptions
}

// The pluggable seam: today one provider reads files from the checkout; a future
// "brain" or Jira provider implements the same interface.
export interface ContextProvider {
  readonly name: string
  collect(req: ContextRequest): Promise<ContextDoc[]>
}

export interface ContextBundle {
  docs: ContextDoc[]
  truncated: string[] // sources dropped or cut to fit maxBytes
  totalBytes: number
}
