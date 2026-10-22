import fs from "node:fs"
import path from "node:path"
import { MODEL_GROUPS, WHAT_SECTION_KINDS, type AgentOutput, type FileRef, type SourceRef } from "./types.js"
import { AGENT_OUTPUT_SCHEMA } from "./schema.js"
import { checkSchema, keepDeclared, type Schema } from "./schemaCheck.js"

export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Report failed validation:\n  - ${errors.join("\n  - ")}`)
  }
}

// Structure comes from the schema the model is given (report/schema.ts), so this file only
// adds what a schema cannot say: tidying values, and the meaning checks below.
export function parseAgentOutput(raw: unknown): AgentOutput {
  const errors = checkSchema(AGENT_OUTPUT_SCHEMA as Schema, raw)
  if (errors.length) throw new ValidationError(errors)
  return tidy(keepDeclared<AgentOutput>(AGENT_OUTPUT_SCHEMA as Schema, raw))
}

// Small normalizations that make a report the same however a model phrased it.
function tidy(out: AgentOutput): AgentOutput {
  const ref = (r: FileRef): FileRef => ({ ...r, path: r.path.replace(/^\.\//, "") })
  const flag = (v: boolean | undefined): true | undefined => (v === true ? true : undefined)
  const source = (s: SourceRef | undefined): SourceRef | undefined => {
    const modelChange = s?.modelChange?.trim() || undefined
    const detailId = s?.detailId?.trim() || undefined
    return modelChange || detailId ? { modelChange, detailId } : undefined
  }
  for (const m of out.model.changes) {
    m.locations = m.locations.map(ref)
    m.attention = flag(m.attention)
    m.unverified = flag(m.unverified)
    if (m.shape && m.shape.length === 0) m.shape = undefined
  }
  for (const g of out.functions.groups) for (const it of g.items) it.location = ref(it.location)
  for (const d of out.details.changes) {
    d.files = d.files.map(ref)
    d.tests = d.tests?.map(ref)
    d.unverified = flag(d.unverified)
  }
  for (const r of out.review.risks) {
    r.source = source(r.source)
    r.unverified = flag(r.unverified)
  }
  for (const q of out.review.questions) q.source = source(q.source)
  return out
}

export interface SemanticContext {
  changedPaths: Set<string>
  worktreePath: string
}

// Meaning checks the schema cannot express. Never fails: it repairs and records notes.
export function applySemanticChecks(out: AgentOutput, ctx: SemanticContext): { output: AgentOutput; notes: string[] } {
  const notes: string[] = []
  const ids = new Set<string>()

  // Renumber detail ids d1..dN without gaps, remapping references from the functions step.
  const idMap = new Map<string, string>()
  out.details.changes.forEach((d, i) => {
    const fresh = `d${i + 1}`
    idMap.set(d.id, fresh)
    d.id = fresh
    ids.add(fresh)
  })
  const fixSource = (ref: SourceRef | undefined, where: string): SourceRef | undefined => {
    if (!ref) return undefined
    const fixed: SourceRef = {}
    if (ref.detailId) {
      const mapped = idMap.get(ref.detailId)
      if (mapped) fixed.detailId = mapped
      else notes.push(`${where} pointed at unknown detail ${ref.detailId}; link removed.`)
    }
    if (ref.modelChange) {
      if (out.model.changes.some((m) => m.name === ref.modelChange)) fixed.modelChange = ref.modelChange
      else notes.push(`${where} pointed at unknown model change "${ref.modelChange}"; link removed.`)
    }
    return fixed.detailId || fixed.modelChange ? fixed : undefined
  }
  out.review.risks.forEach((r, i) => (r.source = fixSource(r.source, `Risk ${i + 1}`)))
  out.review.questions.forEach((q, i) => (q.source = fixSource(q.source, `Question ${i + 1}`)))

  // Every model change flagged in step 3 must show up in the risk list, so there is one place to read them.
  for (const m of out.model.changes) {
    if (!m.attention && !m.risk) continue
    if (out.review.risks.some((r) => r.source?.modelChange === m.name)) continue
    out.review.risks.push({
      kind: "code",
      title: m.name,
      consequence: m.risk ?? m.description,
      source: { modelChange: m.name },
      unverified: m.unverified,
    })
    notes.push(`Added "${m.name}" to the risk list because step 3 flagged it.`)
  }

  const seenTerms = new Set<string>()
  out.review.glossary = out.review.glossary
    .filter((g) => {
      const k = g.term.trim().toLowerCase()
      if (!k || seenTerms.has(k)) return false
      seenTerms.add(k)
      return true
    })
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }))

  for (const g of out.functions.groups) {
    for (const it of g.items) {
      if (!it.detailIds) continue
      const mapped = it.detailIds.map((id) => idMap.get(id)).filter((x): x is string => Boolean(x))
      if (mapped.length !== it.detailIds.length) notes.push(`Dropped unknown detail references on ${it.name}.`)
      it.detailIds = mapped.length ? mapped : undefined
    }
  }

  // A path must be in the diff or exist in the checkout to carry a link.
  const known = (p: string) => ctx.changedPaths.has(p) || fs.existsSync(path.join(ctx.worktreePath, p))
  const checkRef = (ref: FileRef, where: string) => {
    if (!known(ref.path)) {
      notes.push(`${where} refers to ${ref.path}, which is neither in the diff nor in the checkout; link removed.`)
      ref.line = undefined
      ref.oldLine = undefined
      ;(ref as FileRef & { unlinked?: boolean }).unlinked = true
    }
  }
  out.model.changes.forEach((m) => m.locations.forEach((l) => checkRef(l, `Model change "${m.name}"`)))
  out.functions.groups.forEach((g) => g.items.forEach((it) => checkRef(it.location, `Function "${it.name}"`)))
  out.details.changes.forEach((d) => {
    d.files.forEach((f) => checkRef(f, `Detail ${d.id}`))
    d.tests?.forEach((f) => checkRef(f, `Detail ${d.id} tests`))
  })

  const trim = (arr: string[], max: number, label: string) => {
    if (arr.length > max) {
      notes.push(`${label} had ${arr.length} paragraphs; kept the first ${max}.`)
      arr.splice(max)
    }
  }
  trim(out.why.paragraphs, 2, "Why")

  // Drop empty sections and put the rest in the canonical reading order.
  const before = out.what.sections.length
  out.what.sections = out.what.sections.filter((s) => s.summary.trim() || s.points.length)
  if (out.what.sections.length !== before) notes.push(`Dropped ${before - out.what.sections.length} empty section(s) from the overview.`)
  out.what.sections.sort((a, b) => WHAT_SECTION_KINDS.indexOf(a.kind) - WHAT_SECTION_KINDS.indexOf(b.kind))

  // Storage first: an irreversible migration should never sit below an in-memory struct.
  out.model.changes.sort((a, b) => MODEL_GROUPS.indexOf(a.group) - MODEL_GROUPS.indexOf(b.group))

  return { output: out, notes }
}
