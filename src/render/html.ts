import { matchesAnyGlob } from "../core/glob.js"
import {
  LENSES,
  MODEL_GROUPS,
  type DetailedChange,
  type FileRef,
  type FunctionChange,
  type FunctionGroup,
  type Lens,
  type ModelChange,
  type ModelGroup,
  type OpenQuestion,
  type Report,
  type RiskItem,
  type ShapeRow,
  type WhatSection,
  type WhatSectionKind,
} from "../report/types.js"
import { escapeAttr, escapeHtml, jsonForScriptTag, renderInline, safeHref } from "./escape.js"
import { PAGE_CSS } from "./pageStyles.js"
import { PAGE_SCRIPT } from "./pageScript.js"

// The tab icon: a magnifier on prlense's accent, in the dark theme's colors where the
// browser applies `prefers-color-scheme` inside a favicon. Inlined as a data URI so the
// page stays one self-contained file.
const FAVICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<style>.bg{fill:#0f6f7c}.fg{stroke:#fbfcfc}@media (prefers-color-scheme:dark){.bg{fill:#5cc3ce}.fg{stroke:#0d1214}}</style>` +
  `<rect class="bg" width="32" height="32" rx="7"/>` +
  `<circle class="fg" cx="14" cy="14" r="6.5" fill="none" stroke-width="3.2"/>` +
  `<path class="fg" d="M19 19 24.5 24.5" stroke-width="3.8" stroke-linecap="round"/>` +
  `</svg>`
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`

const STEP_TITLES = ["Why", "What changed", "Model changes", "Functions changed", "Detailed changes", "Review notes"]

const LENS_LABELS: Record<Lens, string> = { all: "All", product: "Product", backend: "Backend", frontend: "Frontend" }

// Which lenses show each step at all. Product stops after the overview.
const STEP_LENSES: Lens[][] = [
  ["product", "backend", "frontend"],
  ["product", "backend", "frontend"],
  ["backend", "frontend"],
  ["backend", "frontend"],
  ["backend", "frontend"],
  ["product", "backend", "frontend"],
]

const SECTION_LENSES: Record<WhatSectionKind, Lens[]> = {
  architecture: ["backend", "frontend"],
  backend: ["backend"],
  ui: ["product", "frontend"],
  tools: ["backend", "frontend"],
  models: ["backend", "frontend"],
  other: ["product", "backend", "frontend"],
}

const MODEL_GROUP_LENSES: Record<ModelGroup, Lens[]> = {
  storage: ["backend"],
  domain: ["backend"],
  contract: ["backend", "frontend"],
  other: ["backend", "frontend"],
}

interface RenderCtx {
  isFrontend: (path: string) => boolean
  modelIndex: Map<string, number>
}

function lensAttr(lenses: Lens[]): string {
  return ` data-lens="${lenses.join(" ")}"`
}

// Frontend if any file is under a frontend directory; backend if any file is not. A mixed change shows in both.
function lensesForPaths(paths: string[], ctx: RenderCtx): Lens[] {
  const out: Lens[] = []
  if (paths.some((p) => ctx.isFrontend(p))) out.push("frontend")
  if (paths.some((p) => !ctx.isFrontend(p)) || paths.length === 0) out.push("backend")
  return out
}

function paragraphs(list: string[]): string {
  return list.map((p) => `<p>${renderInline(p)}</p>`).join("\n")
}

function bullets(list: string[]): string {
  if (list.length === 0) return ""
  return `<ul class="plain">${list.map((s) => `<li>${renderInline(s)}</li>`).join("")}</ul>`
}

function fileLine(ref: FileRef): string {
  const ln = ref.line !== undefined ? `:${ref.line}` : ref.oldLine !== undefined ? ` (was line ${ref.oldLine})` : ""
  const diff = safeHref(ref.diffUrl)
  const blob = safeHref(ref.blobUrl)
  const links = [
    diff ? `<a href="${escapeAttr(diff)}" target="_blank" rel="noopener">diff</a>` : "",
    blob ? `<a href="${escapeAttr(blob)}" target="_blank" rel="noopener">file</a>` : "",
  ].join("")
  const sym = ref.symbol ? ` <span class="ln">${escapeHtml(ref.symbol)}</span>` : ""
  return `<li><span class="path">${escapeHtml(ref.path)}<span class="ln">${escapeHtml(ln)}</span></span>${sym}<span class="links">${links}</span></li>`
}

function fileList(refs: FileRef[]): string {
  if (refs.length === 0) return ""
  return `<ul class="files">${refs.map(fileLine).join("")}</ul>`
}

function unverifiedBadge(flag: boolean | undefined): string {
  return flag ? ' <span class="unverified" title="Not confirmed from the code">unverified</span>' : ""
}

function lensEmptyNote(): string {
  return `<p class="lens-empty" hidden>Nothing in this step for the selected lens.</p>`
}

// ---------- step 1 ----------

function renderWhy(r: Report): string {
  const refs = r.why.references
    .map((ref) => {
      const href = safeHref(ref.url)
      const label = href
        ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener">${escapeHtml(ref.label)}</a>`
        : escapeHtml(ref.label)
      return `<li><span class="tag">${escapeHtml(ref.kind)}</span> ${label}${ref.note ? ` — ${renderInline(ref.note)}` : ""}</li>`
    })
    .join("")
  return `${paragraphs(r.why.paragraphs)}${refs ? `<h3>References</h3><ul class="plain refs">${refs}</ul>` : ""}`
}

// ---------- step 2 ----------

const SECTION_ICONS: Record<WhatSectionKind, string> = {
  architecture: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/>',
  backend:
    '<rect x="2" y="4" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 7.5h.01M6 17.5h.01"/>',
  ui: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 9h20M8 21h8"/>',
  tools: '<path d="m5 17 5-5-5-5"/><path d="M12 19h8"/>',
  models:
    '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  other: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
}

const SECTION_FALLBACK_TITLES: Record<WhatSectionKind, string> = {
  architecture: "Architecture",
  backend: "Backend",
  ui: "UI",
  tools: "Tools",
  models: "Models",
  other: "Other",
}

function renderSection(sec: WhatSection): string {
  const icon = SECTION_ICONS[sec.kind] ?? SECTION_ICONS.other
  const title = sec.title.trim() || SECTION_FALLBACK_TITLES[sec.kind]
  return `<div class="sec" data-kind="${escapeAttr(sec.kind)}"${lensAttr(SECTION_LENSES[sec.kind])}>
<h3><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${escapeHtml(title)}</h3>
${sec.summary.trim() ? `<p>${renderInline(sec.summary)}</p>` : ""}
${bullets(sec.points)}
</div>`
}

function renderWhat(r: Report): string {
  const lead = r.what.lead.trim() ? `<p class="lead">${renderInline(r.what.lead)}</p>` : ""
  if (r.what.sections.length === 0) return lead || "<p>No overview was produced.</p>"
  return `${lead}<div class="sections lensable">${r.what.sections.map(renderSection).join("\n")}</div>${lensEmptyNote()}`
}

// ---------- step 3 ----------

const MODEL_GROUP_TITLES: Record<ModelGroup, string> = {
  storage: "Persistent storage",
  domain: "Domain models",
  contract: "Contracts and events",
  other: "Other",
}

const MODEL_GROUP_SUBTITLES: Record<ModelGroup, string> = {
  storage: "Lives in the database. Hard to undo once deployed.",
  domain: "Carried in memory by the code, not stored in this shape.",
  contract: "Crosses a boundary: HTTP bodies, events, generated clients.",
  other: "Configuration, flags and anything else worth knowing.",
}

const ROW_MARKERS: Record<ShapeRow["change"], string> = { added: "+", removed: "−", modified: "~", unchanged: " " }

// Column name on the left, type and keys right-aligned, an optional note on its own line.
function renderShape(rows: ShapeRow[]): string {
  const body = rows
    .map((row) => {
      const cls = escapeAttr(row.change)
      const keys = row.keys ? `<span class="ky">${escapeHtml(row.keys)}</span>` : ""
      const note = row.note ? `<dd class="note ${cls}">${renderInline(row.note)}</dd>` : ""
      return `<dt class="${cls}"><span class="m">${ROW_MARKERS[row.change]}</span><span class="nm">${escapeHtml(row.name)}</span></dt>
<dd class="${cls}"><span class="ty">${escapeHtml(row.type)}</span>${keys}</dd>${note}`
    })
    .join("")
  return `<dl class="cols">${body}</dl>`
}

function renderMetaLines(label: string, lines: string[] | undefined): string {
  if (!lines || lines.length === 0) return ""
  return `<div class="meta-lines"><b>${escapeHtml(label)}</b><ul>${lines.map((l) => `<li>${renderInline(l)}</li>`).join("")}</ul></div>`
}

function modelAnchor(index: number): string {
  return `model-${index + 1}`
}

function renderModelChange(m: ModelChange, index: number): string {
  return `<div class="card model${m.attention ? " attention" : ""}" id="${modelAnchor(index)}">
<h4><span class="tag ${escapeAttr(m.change)}">${escapeHtml(m.change)}</span> <span class="tag">${escapeHtml(m.kind)}</span> <code>${escapeHtml(m.name)}</code>${m.attention ? ' <span class="flag">needs attention</span>' : ""}${unverifiedBadge(m.unverified)}</h4>
<p>${renderInline(m.description)}</p>
${m.shape ? renderShape(m.shape) : ""}
${renderMetaLines("Indexes", m.indexes)}
${renderMetaLines("Relations", m.relations)}
${m.risk ? `<div class="risk">${renderInline(m.risk)}</div>` : ""}
${fileList(m.locations)}
</div>`
}

function renderModel(r: Report, ctx: RenderCtx): string {
  const changes = r.model.changes
  const summary = `<p class="lead">${renderInline(r.model.summary)}</p>`
  if (changes.length === 0) return summary

  const flagged = changes.filter((m) => m.attention)
  const callout = flagged.length
    ? `<div class="attention-box"><b>Look at these first</b><ul>${flagged
        .map(
          (m) =>
            `<li><a href="#${modelAnchor(ctx.modelIndex.get(m.name) ?? 0)}">${escapeHtml(m.name)}</a> — ${renderInline(m.risk ?? m.description)}</li>`,
        )
        .join("")}</ul></div>`
    : ""

  const groups = MODEL_GROUPS.map((group) => {
    const items = changes.filter((m) => m.group === group)
    if (items.length === 0) return ""
    return `<div class="mgroup" data-group="${escapeAttr(group)}"${lensAttr(MODEL_GROUP_LENSES[group])}>
<h3>${escapeHtml(MODEL_GROUP_TITLES[group])} <span class="count">${items.length}</span></h3>
<p class="gsub">${escapeHtml(MODEL_GROUP_SUBTITLES[group])}</p>
${items.map((m) => renderModelChange(m, ctx.modelIndex.get(m.name) ?? 0)).join("\n")}
</div>`
  }).join("\n")

  return `${summary}${callout}<div class="lensable">${groups}</div>${lensEmptyNote()}`
}

// ---------- step 4 ----------

function detailAnchor(id: string): string {
  return `detail-${id}`
}

function renderFunctionRow(f: FunctionChange, ctx: RenderCtx): string {
  const loc = f.location
  const diff = safeHref(loc.diffUrl)
  const blob = safeHref(loc.blobUrl)
  const details = (f.detailIds ?? []).map((id) => `<a href="#${detailAnchor(id)}" data-goto-step="5">${escapeHtml(id)}</a>`).join(" ")
  const links = [
    diff ? `<a href="${escapeAttr(diff)}" target="_blank" rel="noopener">diff</a>` : "",
    blob ? `<a href="${escapeAttr(blob)}" target="_blank" rel="noopener">file</a>` : "",
    details,
  ]
    .filter(Boolean)
    .join(" · ")
  return `<tr${lensAttr(lensesForPaths([loc.path], ctx))}>
<td class="name"><span class="tag ${escapeAttr(f.change)}">${escapeHtml(f.change)}</span><br>${escapeHtml(f.name)}<br><span class="kbd">${escapeHtml(f.kind)}</span></td>
<td>${renderInline(f.summary)}<br><span class="kbd">${escapeHtml(loc.path)}${loc.line !== undefined ? `:${loc.line}` : ""}</span></td>
<td class="links">${links}</td>
</tr>`
}

function renderFunctionGroup(g: FunctionGroup, ctx: RenderCtx): string {
  const groupLenses = lensesForPaths(
    g.items.map((it) => it.location.path),
    ctx,
  )
  return `<div class="fgroup"${lensAttr(groupLenses)}><h3>${escapeHtml(g.area)}</h3><table class="fn"><tbody>${g.items.map((it) => renderFunctionRow(it, ctx)).join("")}</tbody></table></div>`
}

function renderFunctions(r: Report, ctx: RenderCtx): string {
  if (r.functions.groups.length === 0) return "<p>No function-level changes were listed.</p>"
  return `<div class="lensable">${r.functions.groups.map((g) => renderFunctionGroup(g, ctx)).join("\n")}</div>${lensEmptyNote()}`
}

// ---------- step 5 ----------

function renderDetail(d: DetailedChange, ctx: RenderCtx): string {
  const ba =
    d.before || d.after
      ? `<div class="ba">${d.before ? `<div><b>Before</b>${renderInline(d.before)}</div>` : ""}<div class="after"><b>After</b>${renderInline(d.after)}</div></div>`
      : ""
  const paths = [...d.files.map((f) => f.path), ...(d.tests ?? []).map((f) => f.path)]
  return `<div class="card" id="${detailAnchor(d.id)}"${lensAttr(lensesForPaths(paths, ctx))}>
<h4>${escapeHtml(d.id)} · ${renderInline(d.title)}${unverifiedBadge(d.unverified)}</h4>
<div class="kv">${d.area ? `<span>area: ${escapeHtml(d.area)}</span>` : ""}<span>${d.files.length} file${d.files.length === 1 ? "" : "s"}</span></div>
${ba}
${paragraphs(d.explanation)}
${d.callers?.length ? `<h3>Callers</h3>${bullets(d.callers)}` : ""}
${fileList(d.files)}
${d.tests?.length ? `<h3>Tests</h3>${fileList(d.tests)}` : ""}
</div>`
}

function renderDetails(r: Report, ctx: RenderCtx): string {
  if (r.details.changes.length === 0) return "<p>No detailed changes were listed.</p>"
  return `<div class="lensable">${r.details.changes.map((d) => renderDetail(d, ctx)).join("\n")}</div>${lensEmptyNote()}`
}

// ---------- step 6 ----------

function sourceLink(ctx: RenderCtx, src: RiskItem["source"]): string {
  if (!src) return ""
  if (src.detailId) return `<a class="src" href="#${detailAnchor(src.detailId)}" data-goto-step="5">${escapeHtml(src.detailId)}</a>`
  if (src.modelChange !== undefined) {
    const idx = ctx.modelIndex.get(src.modelChange)
    if (idx !== undefined) return `<a class="src" href="#${modelAnchor(idx)}" data-goto-step="3">${escapeHtml(src.modelChange)}</a>`
  }
  return ""
}

// A risk inherits the lens of the card it points at.
function riskLenses(r: Report, ctx: RenderCtx, risk: RiskItem): Lens[] {
  const lenses = new Set<Lens>()
  const src = risk.source
  if (src?.detailId) {
    const d = r.details.changes.find((x) => x.id === src.detailId)
    if (d)
      lensesForPaths(
        d.files.map((f) => f.path),
        ctx,
      ).forEach((l) => lenses.add(l))
  } else if (src?.modelChange !== undefined) {
    const m = r.model.changes.find((x) => x.name === src.modelChange)
    if (m) MODEL_GROUP_LENSES[m.group].forEach((l) => lenses.add(l))
  }
  if (lenses.size === 0) {
    lenses.add("backend")
    lenses.add("frontend")
  }
  return [...lenses]
}

function renderRisk(r: Report, ctx: RenderCtx, risk: RiskItem, n: number): string {
  return `<li class="risk-item"${lensAttr(riskLenses(r, ctx, risk))}>
<div class="risk-head"><span class="num">${n}</span><b>${renderInline(risk.title)}</b>${unverifiedBadge(risk.unverified)}${sourceLink(ctx, risk.source)}</div>
<p>${renderInline(risk.consequence)}</p>
</li>`
}

function renderQuestion(ctx: RenderCtx, q: OpenQuestion, n: number): string {
  return `<li class="q-item">
<div class="risk-head"><span class="num">${n}</span><b>${renderInline(q.question)}</b>${sourceLink(ctx, q.source)}</div>
<p>${renderInline(q.context)}</p>
</li>`
}

function renderReview(r: Report, ctx: RenderCtx): string {
  const rv = r.review
  const code = rv.risks.filter((x) => x.kind === "code")
  const deploy = rv.risks.filter((x) => x.kind === "deploy")
  let n = 0
  const riskGroup = (title: string, sub: string, items: RiskItem[], lenses: Lens[]) =>
    items.length
      ? `<div class="rgroup"${lensAttr(lenses)}><h3>${escapeHtml(title)} <span class="count">${items.length}</span></h3><p class="gsub">${escapeHtml(sub)}</p><ol class="risks">${items.map((x) => renderRisk(r, ctx, x, ++n)).join("")}</ol></div>`
      : ""
  const risks =
    rv.risks.length === 0
      ? `<p class="gsub">No risks were recorded for this change.</p>`
      : riskGroup("In the code", "What will happen once this code runs. Facts with consequences, not verdicts.", code, [
          "backend",
          "frontend",
        ]) +
        riskGroup("At deploy", "Migrations, flags, backfills and anything in flight that the new code will miss.", deploy, [
          "backend",
          "frontend",
        ])
  const questions =
    rv.questions.length === 0
      ? `<p class="gsub">The code answered everything a careful reader would ask.</p>`
      : `<ol class="risks">${rv.questions.map((q, i) => renderQuestion(ctx, q, i + 1)).join("")}</ol>`
  const glossary =
    rv.glossary.length === 0
      ? `<p class="gsub">No domain terms were collected.</p>`
      : `<dl class="glossary">${rv.glossary.map((g) => `<dt>${escapeHtml(g.term)}</dt><dd>${renderInline(g.meaning)}</dd>`).join("")}</dl>`
  return `<div class="review">
<div class="rsection"${lensAttr(["backend", "frontend"])}><h3 class="rtitle">Risks</h3>${risks}</div>
<div class="rsection"${lensAttr(["backend", "frontend"])}><h3 class="rtitle">Open questions</h3>${questions}</div>
<div class="rsection"><h3 class="rtitle">Glossary</h3>${glossary}</div>
</div>`
}

// ---------- chrome ----------

function renderCoverage(r: Report): string {
  const c = r.coverage
  const list = (label: string, items: string[]) =>
    items.length
      ? `<details><summary>${escapeHtml(label)} (${items.length})</summary><ul>${items.map((i) => `<li><code>${escapeHtml(i)}</code></li>`).join("")}</ul></details>`
      : ""
  const untraced = c.filesUntraced.length
    ? `<details open><summary>Not traced (${c.filesUntraced.length})</summary><ul>${c.filesUntraced.map((u) => `<li><code>${escapeHtml(u.path)}</code> — ${escapeHtml(u.reason)}</li>`).join("")}</ul></details>`
    : ""
  const notes = c.notes?.length
    ? `<details><summary>Notes (${c.notes.length})</summary><ul>${c.notes.map((x) => `<li>${renderInline(x)}</li>`).join("")}</ul></details>`
    : ""
  const sources = r.sources.length
    ? `<details><summary>Context given to the model (${r.sources.length})</summary><ul>${r.sources.map((s) => `<li><span class="tag">${escapeHtml(s.kind)}</span> <code>${escapeHtml(s.source)}</code></li>`).join("")}</ul></details>`
    : ""
  const dur = r.tool.durationMs !== undefined ? ` · ${Math.round(r.tool.durationMs / 1000)}s` : ""
  return `<footer class="cov">
<div>Generated ${escapeHtml(new Date(r.generatedAt).toLocaleString())} by prlense ${escapeHtml(r.tool.version)} · ${escapeHtml(r.tool.engine)} / ${escapeHtml(r.tool.model)}${dur}</div>
${list("Files traced", c.filesTraced)}${list("Generated files skipped", c.filesSkippedGenerated)}${list("Test files skipped", c.filesSkippedTests)}${untraced}${notes}${sources}
</footer>`
}

const ICON_DOWNLOAD = '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'
const ICON_LOAD = '<path d="M12 14V3m0 0 4 4m-4-4L8 7"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'

function actionButton(id: string, icon: string, label: string): string {
  return `<button type="button" id="${id}" class="action"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${escapeHtml(label)}</button>`
}

function renderToolbar(): string {
  const lenses = LENSES.map(
    (l) => `<button type="button" data-lens-pick="${l}"${l === "all" ? ' aria-pressed="true"' : ""}>${escapeHtml(LENS_LABELS[l])}</button>`,
  ).join("")
  return `<div class="toolbar">
<div class="lenses" role="group" aria-label="Lens"><span class="lbl">Lens</span>${lenses}</div>
<div class="actions">${actionButton("download-json", ICON_DOWNLOAD, "Download JSON")}${actionButton("load-json", ICON_LOAD, "Load JSON")}</div>
</div>`
}

function renderHeader(r: Report): string {
  const pr = r.pr
  const state = pr.isDraft ? "draft" : pr.state.toLowerCase()
  const fork = pr.headRepoSlug ? `<span class="badge">fork: ${escapeHtml(pr.headRepoSlug)}</span>` : ""
  const prHref = safeHref(pr.url)
  return `<header class="pr">
<div class="brand"><span class="mark">prlense</span><span class="tagline">pull request walkthrough</span><span class="brand-meta">${escapeHtml(r.tool.engine)} · ${escapeHtml(r.tool.model)}</span></div>
<h1>${prHref ? `<a href="${escapeAttr(prHref)}" target="_blank" rel="noopener">#${pr.number}</a>` : `#${pr.number}`} ${escapeHtml(pr.title)}</h1>
<div class="meta">
<span class="badge ${escapeAttr(state)}">${escapeHtml(state)}</span>${fork}
<span>${escapeHtml(pr.slug)}</span>
<span>by ${escapeHtml(pr.author)}</span>
<span><code>${escapeHtml(pr.headRefName)}</code> → <code>${escapeHtml(pr.baseRefName)}</code></span>
<span>${pr.changedFiles} files, <span style="color:var(--ok)">+${pr.additions}</span> / <span style="color:var(--danger)">−${pr.deletions}</span></span>
<span class="kbd">← → or 1–${STEP_TITLES.length} to move between steps</span>
</div>
${renderToolbar()}
</header>`
}

// Everything inside .wrap. Split out so the browser viewer can regenerate it from a report
// someone shared, without the document shell around it.
export function renderBody(report: Report): string {
  const ctx: RenderCtx = {
    isFrontend: (p) => matchesAnyGlob(p, report.lenses?.frontendMatch ?? []),
    modelIndex: new Map(report.model.changes.map((m, i) => [m.name, i])),
  }
  const bodies = [
    renderWhy(report),
    renderWhat(report),
    renderModel(report, ctx),
    renderFunctions(report, ctx),
    renderDetails(report, ctx),
    renderReview(report, ctx),
  ]
  const stepper = STEP_TITLES.map(
    (t, i) =>
      `<button type="button" data-step-tab="${i + 1}"${lensAttr(STEP_LENSES[i])}><span class="n">Step ${i + 1}</span><span class="t">${escapeHtml(t)}</span></button>`,
  ).join("")
  const sections = STEP_TITLES.map(
    (t, i) => `<section class="step" data-step="${i + 1}" id="step-${i + 1}"${lensAttr(STEP_LENSES[i])}${i === 0 ? "" : " hidden"}>
<h2>${escapeHtml(t)}</h2>
${bodies[i]}
</section>`,
  ).join("\n")
  return `${renderHeader(report)}
<nav class="stepper" aria-label="Steps">${stepper}</nav>
${sections}
<div class="navbtns"><button type="button" id="prev">← Previous</button><button type="button" id="next" class="primary">Next →</button></div>
${renderCoverage(report)}`
}

export function pageTitle(report: Report): string {
  return `#${report.pr.number} ${report.pr.title}`
}

export interface PageOptions {
  // The bundled viewer, inlined so the page can open a report someone shared with it.
  // Omitted when the bundle is unavailable; the page still renders, it just cannot load.
  viewerScript?: string
}

export function renderReportHtml(report: Report, options: PageOptions = {}): string {
  const viewer = options.viewerScript ? `<script>${options.viewerScript}</script>` : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(pageTitle(report))} · prlense</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
<style>${PAGE_CSS}</style>
</head>
<body data-lens="all">
<div class="dropzone" hidden><div>Drop a prlense JSON to view it</div></div>
<div class="wrap">
${renderBody(report)}
</div>
<script type="application/json" id="prlense-report">${jsonForScriptTag(report)}</script>
${viewer}
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`
}
