// `prlense render`, `prlense clean` and the bash-guard hook: the small commands.
import fs from "node:fs"
import path from "node:path"
import { runBashGuardHook } from "../engine/bashGuard.js"
import * as log from "./log.js"
import { renderPage, showReport } from "./output.js"
import { tryRun } from "../core/process.js"
import { findRepoRoot } from "../github/remotes.js"
import { reportProblem } from "../report/compat.js"
import type { Report } from "../report/types.js"
import { findStalePrlenseWorktrees, removeWorktree } from "../github/worktree.js"

export function runRenderCommand(jsonPath: string, opts: { out?: string; open: boolean }): void {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  } catch (error) {
    throw new Error(`Cannot open ${jsonPath}: it is not valid JSON (${error instanceof Error ? error.message : String(error)}).`)
  }
  const problem = reportProblem(raw)
  if (problem) throw new Error(`Cannot open ${jsonPath}: ${problem}.`)
  const htmlPath = opts.out ? path.resolve(opts.out) : jsonPath.replace(/\.json$/, "") + ".html"
  fs.writeFileSync(htmlPath, renderPage(raw as Report))
  log.success(`Rendered ${htmlPath}`)
  showReport(htmlPath, opts.open)
}

export function runCleanCommand(opts: { repo?: string }): void {
  const repoRoot = findRepoRoot(opts.repo)
  const stale = findStalePrlenseWorktrees(repoRoot)
  if (stale.length === 0) {
    log.info("No prlense worktrees to remove.")
    return
  }
  for (const wt of stale) {
    removeWorktree(repoRoot, wt.path)
    log.success(`Removed ${wt.path}`)
  }
  const refs = tryRun("git", ["for-each-ref", "--format=%(refname)", "refs/prlense/"], { cwd: repoRoot })
  for (const ref of refs.stdout.split("\n").filter(Boolean)) {
    tryRun("git", ["update-ref", "-d", ref], { cwd: repoRoot })
    log.info(`Deleted ${ref}`)
  }
}

export async function runBashGuardCommand(): Promise<void> {
  const code = await runBashGuardHook(process.stdin, process.stderr)
  process.exit(code)
}
