import fs from "node:fs"
import path from "node:path"
import { FUNCTION_CHANGES, FUNCTION_KINDS, MODEL_CHANGE_KINDS, MODEL_CHANGES, MODEL_GROUPS, REFERENCE_KINDS, RISK_KINDS, ROW_CHANGES, WHAT_SECTION_KINDS, type AgentOutput, type FileRef, type ModelGroup, type RiskItem, type RowChange, type ShapeRow, type SourceRef, type WhatSectionKind } from "./types.js"

export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Report failed validation:\n  - ${errors.join("\n  - ")}`)
  }
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v)

class Checker {
  errors: string[] = []
  str(o: Rec, k: string, at: string, required = true): string | undefined {
    const v = o[k]
    if (v === undefined) {
      if (required) this.errors.push(`${at}.${k}: missing`)
      return undefined
    }
    if (typeof v !== "string") {
      this.errors.push(`${at}.${k}: expected string`)
      return undefined
    }
    return v
  }
  strArr(o: Rec, k: string, at: string, required = true): string[] {
    const v = o[k]
    if (v === undefined) {
      if (required) this.errors.push(`${at}.${k}: missing`)
      return []
    }
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      this.errors.push(`${at}.${k}: expected array of strings`)
      return []
    }
    return v as string[]
  }
  arr(o: Rec, k: string, at: string, required = true): unknown[] {
    const v = o[k]
    if (v === undefined) {
      if (required) this.errors.push(`${at}.${k}: missing`)
      return []
    }
    if (!Array.isArray(v)) {
      this.errors.push(`${at}.${k}: expected array`)
      return []
    }
    return v
  }
  oneOf(v: unknown, allowed: readonly string[], at: string): void {
    if (typeof v !== "string" || !allowed.includes(v)) this.errors.push(`${at}: expected one of ${allowed.join(", ")}`)
  }
  fileRef(v: unknown, at: string): FileRef | undefined {
    if (!isRec(v)) {
      this.errors.push(`${at}: expected object`)
      return undefined
    }
    const p = this.str(v, "path", at)
    if (p === undefined) return undefined
    const ref: FileRef = { path: p.replace(/^\.\//, "") }
    for (const k of ["line", "oldLine"] as const) {
      if (v[k] !== undefined) {
        if (typeof v[k] !== "number" || !Number.isInteger(v[k])) this.errors.push(`${at}.${k}: expected integer`)
        else ref[k] = v[k] as number
      }
    }
    if (typeof v.symbol === "string") ref.symbol = v.symbol
    return ref
  }
}

// Structural check with hand-written guards. Engines with schema enforcement make this
// redundant, but engines without it need it, and it normalizes the shape either way.
export function parseAgentOutput(raw: unknown): AgentOutput {
  const c = new Checker()
  if (!isRec(raw)) throw new ValidationError(["output: expected object"])

  const why = isRec(raw.why) ? raw.why : (c.errors.push("why: missing"), {})
  const what = isRec(raw.what) ? raw.what : (c.errors.push("what: missing"), {})
  const model = isRec(raw.model) ? raw.model : (c.errors.push("model: missing"), {})
  const functions = isRec(raw.functions) ? raw.functions : (c.errors.push("functions: missing"), {})
  const details = isRec(raw.details) ? raw.details : (c.errors.push("details: missing"), {})
  const coverage = isRec(raw.coverage) ? raw.coverage : (c.errors.push("coverage: missing"), {})
  const review = isRec(raw.review) ? raw.review : (c.errors.push("review: missing"), {})

  const sourceRef = (v: unknown): SourceRef | undefined => {
    if (!isRec(v)) return undefined
    const ref: SourceRef = {}
    if (typeof v.modelChange === "string" && v.modelChange.trim()) ref.modelChange = v.modelChange.trim()
    if (typeof v.detailId === "string" && v.detailId.trim()) ref.detailId = v.detailId.trim()
    return ref.modelChange || ref.detailId ? ref : undefined
  }

  const out: AgentOutput = {
    why: {
      paragraphs: c.strArr(why, "paragraphs", "why"),
      references: c.arr(why, "references", "why").flatMap((r, i) => {
        const at = `why.references[${i}]`
        if (!isRec(r)) return (c.errors.push(`${at}: expected object`), [])
        const label = c.str(r, "label", at) ?? ""
        c.oneOf(r.kind, REFERENCE_KINDS, `${at}.kind`)
        return [{ label, kind: r.kind as never, url: typeof r.url === "string" ? r.url : undefined, note: typeof r.note === "string" ? r.note : undefined }]
      }),
    },
    what: {
      lead: c.str(what, "lead", "what") ?? "",
      sections: c.arr(what, "sections", "what").flatMap((sec, i) => {
        const at = `what.sections[${i}]`
        if (!isRec(sec)) return (c.errors.push(`${at}: expected object`), [])
        c.oneOf(sec.kind, WHAT_SECTION_KINDS, `${at}.kind`)
        return [{
          kind: sec.kind as WhatSectionKind,
          title: c.str(sec, "title", at) ?? "",
          summary: c.str(sec, "summary", at) ?? "",
          points: c.strArr(sec, "points", at),
        }]
      }),
    },
    model: {
      summary: c.str(model, "summary", "model") ?? "",
      changes: c.arr(model, "changes", "model").flatMap((m, i) => {
        const at = `model.changes[${i}]`
        if (!isRec(m)) return (c.errors.push(`${at}: expected object`), [])
        c.oneOf(m.kind, MODEL_CHANGE_KINDS, `${at}.kind`)
        c.oneOf(m.change, MODEL_CHANGES, `${at}.change`)
        c.oneOf(m.group, MODEL_GROUPS, `${at}.group`)
        const shape: ShapeRow[] | undefined =
          m.shape === undefined
            ? undefined
            : c.arr(m, "shape", at).flatMap((row, j) => {
                const ra = `${at}.shape[${j}]`
                if (!isRec(row)) return (c.errors.push(`${ra}: expected object`), [])
                c.oneOf(row.change, ROW_CHANGES, `${ra}.change`)
                return [{
                  name: c.str(row, "name", ra) ?? "",
                  type: c.str(row, "type", ra) ?? "",
                  keys: typeof row.keys === "string" ? row.keys : undefined,
                  note: typeof row.note === "string" ? row.note : undefined,
                  change: row.change as RowChange,
                }]
              })
        return [{
          group: m.group as ModelGroup,
          kind: m.kind as never,
          change: m.change as never,
          name: c.str(m, "name", at) ?? "",
          description: c.str(m, "description", at) ?? "",
          attention: m.attention === true ? true : undefined,
          shape: shape && shape.length ? shape : undefined,
          indexes: m.indexes === undefined ? undefined : c.strArr(m, "indexes", at),
          relations: m.relations === undefined ? undefined : c.strArr(m, "relations", at),
          locations: c.arr(m, "locations", at).flatMap((l, j) => c.fileRef(l, `${at}.locations[${j}]`) ?? []),
          risk: typeof m.risk === "string" ? m.risk : undefined,
          unverified: m.unverified === true ? true : undefined,
        }]
      }),
    },
    functions: {
      groups: c.arr(functions, "groups", "functions").flatMap((g, i) => {
        const at = `functions.groups[${i}]`
        if (!isRec(g)) return (c.errors.push(`${at}: expected object`), [])
        return [{
          area: c.str(g, "area", at) ?? "",
          items: c.arr(g, "items", at).flatMap((it, j) => {
            const a = `${at}.items[${j}]`
            if (!isRec(it)) return (c.errors.push(`${a}: expected object`), [])
            c.oneOf(it.kind, FUNCTION_KINDS, `${a}.kind`)
            c.oneOf(it.change, FUNCTION_CHANGES, `${a}.change`)
            const location = c.fileRef(it.location, `${a}.location`)
            if (!location) return []
            return [{
              name: c.str(it, "name", a) ?? "",
              kind: it.kind as never,
              change: it.change as never,
              summary: c.str(it, "summary", a) ?? "",
              location,
              detailIds: it.detailIds === undefined ? undefined : c.strArr(it, "detailIds", a),
            }]
          }),
        }]
      }),
    },
    details: {
      changes: c.arr(details, "changes", "details").flatMap((d, i) => {
        const at = `details.changes[${i}]`
        if (!isRec(d)) return (c.errors.push(`${at}: expected object`), [])
        return [{
          id: c.str(d, "id", at) ?? `d${i + 1}`,
          title: c.str(d, "title", at) ?? "",
          area: typeof d.area === "string" ? d.area : undefined,
          files: c.arr(d, "files", at).flatMap((f, j) => c.fileRef(f, `${at}.files[${j}]`) ?? []),
          before: typeof d.before === "string" ? d.before : undefined,
          after: c.str(d, "after", at) ?? "",
          explanation: c.strArr(d, "explanation", at),
          callers: d.callers === undefined ? undefined : c.strArr(d, "callers", at),
          tests: d.tests === undefined ? undefined : c.arr(d, "tests", at).flatMap((f, j) => c.fileRef(f, `${at}.tests[${j}]`) ?? []),
          unverified: d.unverified === true ? true : undefined,
        }]
      }),
    },
    review: {
      risks: c.arr(review, "risks", "review").flatMap((r, i) => {
        const at = `review.risks[${i}]`
        if (!isRec(r)) return (c.errors.push(`${at}: expected object`), [])
        c.oneOf(r.kind, RISK_KINDS, `${at}.kind`)
        return [{
          kind: r.kind as RiskItem["kind"],
          title: c.str(r, "title", at) ?? "",
          consequence: c.str(r, "consequence", at) ?? "",
          source: sourceRef(r.source),
          unverified: r.unverified === true ? true : undefined,
        }]
      }),
      questions: c.arr(review, "questions", "review").flatMap((q, i) => {
        const at = `review.questions[${i}]`
        if (!isRec(q)) return (c.errors.push(`${at}: expected object`), [])
        return [{ question: c.str(q, "question", at) ?? "", context: c.str(q, "context", at) ?? "", source: sourceRef(q.source) }]
      }),
      glossary: c.arr(review, "glossary", "review").flatMap((g, i) => {
        const at = `review.glossary[${i}]`
        if (!isRec(g)) return (c.errors.push(`${at}: expected object`), [])
        return [{ term: c.str(g, "term", at) ?? "", meaning: c.str(g, "meaning", at) ?? "" }]
      }),
    },
    coverage: {
      filesTraced: c.strArr(coverage, "filesTraced", "coverage"),
      filesSkippedGenerated: c.strArr(coverage, "filesSkippedGenerated", "coverage"),
      filesSkippedTests: c.strArr(coverage, "filesSkippedTests", "coverage"),
      filesUntraced: c.arr(coverage, "filesUntraced", "coverage").flatMap((u, i) => {
        const at = `coverage.filesUntraced[${i}]`
        if (!isRec(u)) return (c.errors.push(`${at}: expected object`), [])
        return [{ path: c.str(u, "path", at) ?? "", reason: c.str(u, "reason", at) ?? "" }]
      }),
      notes: coverage.notes === undefined ? undefined : c.strArr(coverage, "notes", "coverage"),
    },
  }
  if (c.errors.length) throw new ValidationError(c.errors)
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
    out.review.risks.push({ kind: "code", title: m.name, consequence: m.risk ?? m.description, source: { modelChange: m.name }, unverified: m.unverified })
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

