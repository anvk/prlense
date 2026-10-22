// `prlense explain`: reads a PR, has the model trace it in a temporary worktree, and writes
// the report. A report file or link given instead is opened rather than generated.
import fs from "node:fs"
import path from "node:path"
import { runRenderCommand } from "./commands.js"
import { buildRunOptions, readUserConfig, resolveEngineConfig, type EngineFlags } from "../core/config.js"
import { collectContext, createProviders } from "../context/collect.js"
import { listChangedFiles, type ChangedFile } from "../github/diff.js"
import { createEngine } from "../engine/registry.js"
import { fetchReport } from "../github/fetchReport.js"
import * as log from "./log.js"
import { resolveReportsDir, showReport, writeReportFiles } from "./output.js"
import { extractTicketRefs, resolvePr, type PrMeta } from "../github/pr.js"
import { requireToolchain } from "./checks.js"
import { buildSystemPrompt } from "../prompt/system.js"
import { buildUserPrompt } from "../prompt/user.js"
import { findRepoRoot, listRemotes, pickRemote } from "../github/remotes.js"
import { decorateLinks } from "../report/links.js"
import { AGENT_OUTPUT_SCHEMA } from "../report/schema.js"
import { REPORT_SCHEMA_VERSION, type Report } from "../report/types.js"
import { applySemanticChecks, parseAgentOutput } from "../report/validate.js"
import { resolveExplainTarget } from "../github/target.js"
import { withPrWorktree, type PrWorktree } from "../github/worktree.js"
import { errorMessage } from "../core/util.js"

export interface ExplainOptions extends EngineFlags {
  repo?: string
  remote?: string
  context?: string[]
  withRules?: boolean
  skip?: string[]
  out?: string
  open: boolean
  keepWorktree?: boolean
  verbose?: boolean
  timestamp?: boolean
  yes?: boolean
  version: string
}

function buildPrHeader(pr: PrMeta, wt: PrWorktree): Report["pr"] {
  return {
    number: pr.number,
    slug: pr.slug,
    url: pr.url,
    title: pr.title,
    author: pr.author,
    state: pr.state,
    isDraft: pr.isDraft,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    baseSha: wt.baseSha,
    headSha: wt.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    headRepoSlug: pr.headRepoSlug,
  }
}

// A very large PR takes long enough to be worth a moment's pause, during which Ctrl-C
// stops the run (and the worktree's signal handler cleans up).
async function confirmLarge(files: ChangedFile[], yes: boolean | undefined): Promise<void> {
  const traceable = files.filter((f) => !f.generated && !f.test).length
  if (traceable <= 300 || yes) return
  if (!process.stdin.isTTY) throw new Error(`This PR has ${traceable} traceable files. Pass --yes to run anyway.`)
  log.warn(`This PR has ${traceable} traceable files; the run may take a long time. Continuing in 5s, Ctrl-C to stop.`)
  await new Promise((resolve) => setTimeout(resolve, 5000))
}

export async function runExplainCommand(input: string, opts: ExplainOptions): Promise<void> {
  log.setVerbose(Boolean(opts.verbose))

  // Reading a report is not the same job as producing one, and must not need the toolchain
  // that producing one does.
  const target = resolveExplainTarget(input)
  if (target.kind === "file") {
    runRenderCommand(target.path, { out: opts.out, open: opts.open })
    return
  }
  if (target.kind === "url") {
    // Saved alongside the reports you generated, so it is yours from then on and
    // re-renders with every later version of the page.
    log.step(`Fetching ${target.url}`)
    const report = await fetchReport(target.url)
    const { htmlPath } = writeReportFiles(resolveReportsDir(readUserConfig().config, opts.out), report, opts.timestamp)
    showReport(htmlPath, opts.open)
    return
  }

  requireToolchain()
  const repoRoot = findRepoRoot(opts.repo)
  const { config: user, source: userSource } = readUserConfig()
  if (userSource) log.verbose(`user config ${userSource}`)
  const engineConfig = resolveEngineConfig(user, opts)
  const engine = createEngine(engineConfig)

  const doc = engine.doctor()
  if (!doc.ok) throw new Error(`Engine ${engine.name} is not ready:\n  - ${doc.details.join("\n  - ")}`)

  const runOptions = buildRunOptions(user, opts)
  const ref = target.ref
  const remotes = listRemotes(repoRoot)
  const remote = pickRemote(remotes, {
    remoteFlag: opts.remote,
    urlSlug: ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : undefined,
    urlHost: ref.host,
  })

  log.step(`Reading PR #${ref.number} from ${remote.slug} (remote ${remote.name})`)
  const pr = resolvePr(remote, ref)
  log.info(
    `${pr.title} — ${pr.state.toLowerCase()}${pr.isDraft ? ", draft" : ""}, ${pr.changedFiles} files, +${pr.additions}/-${pr.deletions}`,
  )

  const reportsDir = resolveReportsDir(user, opts.out)

  log.step("Checking out the PR head into a temporary worktree")
  const report = await withPrWorktree({ repoRoot, remote, pr, keep: opts.keepWorktree, log }, async (wt) => {
    const changedFiles = listChangedFiles(wt, runOptions)
    if (changedFiles.length === 0) {
      throw new Error(
        `PR #${pr.number} has no file changes between its base (${wt.baseSha.slice(0, 7)}) and head (${wt.headSha.slice(0, 7)}), so there is nothing to explain.`,
      )
    }
    const traceable = changedFiles.filter((f) => !f.generated && !f.test)
    log.info(`${changedFiles.length} changed files, ${traceable.length} to trace (rest are generated or tests)`)
    await confirmLarge(changedFiles, opts.yes)

    log.step("Collecting repository context")
    const ticketRefs = extractTicketRefs(pr)
    const context = await collectContext(
      createProviders(),
      { repoRoot, worktreePath: wt.path, pr, changedFiles, ticketRefs, options: runOptions },
      runOptions.contextMaxBytes,
    )
    log.info(
      `${context.docs.length} context docs, ${Math.round(context.totalBytes / 1024)} KB${context.truncated.length ? `, truncated: ${context.truncated.join(", ")}` : ""}`,
    )

    const systemPrompt = buildSystemPrompt(engine.tools)
    const userPrompt = buildUserPrompt({ pr, worktree: wt, changedFiles, ticketRefs, context })

    const transcriptDir = path.join(reportsDir, pr.slug.replace("/", "-"))
    fs.mkdirSync(transcriptDir, { recursive: true })
    const transcriptPath = path.join(transcriptDir, `pr-${pr.number}.transcript.jsonl`)
    fs.writeFileSync(transcriptPath, "")

    log.step(`Explaining with ${engine.name} (${engine.model}); this usually takes a few minutes`)
    let toolCalls = 0
    const result = await engine.run({
      cwd: wt.path,
      systemPrompt,
      userPrompt,
      outputSchema: AGENT_OUTPUT_SCHEMA,
      verbose: Boolean(opts.verbose),
      transcriptPath,
      checkOutput: (output) => {
        try {
          parseAgentOutput(output)
          return null
        } catch (error) {
          return errorMessage(error)
        }
      },
      onProgress: (line) => {
        toolCalls++
        log.verbose(line)
      },
    })
    if (opts.verbose) log.info(`${toolCalls} tool calls`)

    if (result.status !== "ok") {
      const rawPath = path.join(transcriptDir, `pr-${pr.number}.raw.txt`)
      if (result.rawText) fs.writeFileSync(rawPath, result.rawText)
      const hint = result.status === "schema_failed" ? `The raw answer is in ${rawPath}.` : `Transcript: ${transcriptPath}`
      throw new Error(`Explain failed (${result.status}): ${result.message ?? ""}\n${hint}`)
    }

    log.step("Validating the report")
    const parsed = parseAgentOutput(result.output)
    const { output, notes } = applySemanticChecks(parsed, { changedPaths: new Set(changedFiles.map((f) => f.path)), worktreePath: wt.path })
    if (notes.length) output.coverage.notes = [...(output.coverage.notes ?? []), ...notes]

    const full: Report = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      tool: { name: "prlense", version: opts.version, engine: result.engine, model: result.model, durationMs: result.durationMs },
      pr: buildPrHeader(pr, wt),
      ...output,
      sources: context.docs.map((d) => ({ kind: d.kind, source: d.source, title: d.title })),
      lenses: { frontendMatch: runOptions.frontendMatch },
    }
    decorateLinks(full)
    log.info(`${result.turns ?? "?"} turns, ${Math.round(result.durationMs / 1000)}s`)
    return full
  })

  const { htmlPath } = writeReportFiles(reportsDir, report, opts.timestamp)
  showReport(htmlPath, opts.open)
}
