import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { run, tryRun } from "../core/process.js"
import { warn, info } from "../cli/log.js"
import type { PrMeta } from "./pr.js"
import type { Remote } from "./remotes.js"

export interface PrWorktree {
  path: string
  headSha: string
  baseSha: string
  baseRef: string // e.g. newOrigin/main
}

export interface WorktreeArgs {
  repoRoot: string
  remote: Remote
  pr: PrMeta
  keep?: boolean
}

const WORKTREE_PREFIX = "prlense-"

// Cleanup functions for worktrees that are currently alive, so a crash handler can remove them.
const activeCleanups = new Set<() => void>()

export function cleanupAllWorktrees(): void {
  for (const fn of [...activeCleanups]) {
    try {
      fn()
    } catch {
      // Best effort during shutdown.
    }
  }
}

function worktreeDirName(pr: PrMeta): string {
  return `${WORKTREE_PREFIX}${pr.slug.replace("/", "-")}-pr${pr.number}-`
}

export async function withPrWorktree<T>(args: WorktreeArgs, fn: (wt: PrWorktree) => Promise<T>): Promise<T> {
  const { repoRoot, remote, pr } = args
  const tmpRef = `refs/prlense/pr-${pr.number}`
  const git = (gitArgs: string[]) => run("git", gitArgs, { cwd: repoRoot })

  git(["worktree", "prune"])

  // One fetch brings the PR head (works for fork PRs too) and the base branch.
  const fetchArgs = ["fetch", "--no-tags", remote.name, `pull/${pr.number}/head:${tmpRef}`, pr.baseRefName]
  const fetched = tryRun("git", fetchArgs, { cwd: repoRoot })
  let baseRef = `${remote.name}/${pr.baseRefName}`
  if (fetched.status !== 0) {
    // Base branch may be deleted after merge; fetch the head alone and fall back to the remote HEAD.
    git(["fetch", "--no-tags", remote.name, `pull/${pr.number}/head:${tmpRef}`])
    const head = tryRun("git", ["rev-parse", "--verify", `${remote.name}/HEAD`], { cwd: repoRoot })
    if (head.status !== 0) throw new Error(`Could not fetch base branch ${pr.baseRefName} from ${remote.name}, and ${remote.name}/HEAD is unknown.\n${fetched.stderr}`)
    baseRef = `${remote.name}/HEAD`
    warn(`Base branch ${pr.baseRefName} is gone on ${remote.name}; using ${baseRef} for the merge base.`)
  }

  const headSha = git(["rev-parse", tmpRef]).stdout
  if (pr.headRefOid && headSha !== pr.headRefOid) {
    warn(`PR head moved while fetching (GitHub says ${pr.headRefOid.slice(0, 10)}, fetched ${headSha.slice(0, 10)}). Using the fetched commit.`)
  }
  const baseSha = git(["merge-base", headSha, baseRef]).stdout

  // mkdtemp reserves a unique name; git worktree add wants the directory absent, so remove it first.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), worktreeDirName(pr)))
  fs.rmdirSync(dir)
  git(["worktree", "add", "--detach", dir, headSha])
  info(`worktree ${dir}`)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    activeCleanups.delete(cleanup)
    if (args.keep) {
      warn(`Keeping worktree at ${dir} (remove with: git worktree remove --force ${dir})`)
      return
    }
    removeWorktree(repoRoot, dir)
    tryRun("git", ["update-ref", "-d", tmpRef], { cwd: repoRoot })
  }
  activeCleanups.add(cleanup)

  const onSignal = () => {
    cleanupAllWorktrees()
    process.exit(130)
  }
  process.once("SIGINT", onSignal)
  process.once("SIGTERM", onSignal)
  try {
    return await fn({ path: dir, headSha, baseSha, baseRef })
  } finally {
    process.removeListener("SIGINT", onSignal)
    process.removeListener("SIGTERM", onSignal)
    cleanup()
  }
}

export interface StaleWorktree {
  path: string
  head: string
}

// Worktrees left by runs that never got to clean up, found by their directory name.
export function findStalePrlenseWorktrees(repoRoot: string): StaleWorktree[] {
  const { stdout } = run("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot })
  return stdout.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.split("\n")
    const worktree = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length)
    if (!worktree || !path.basename(worktree).startsWith(WORKTREE_PREFIX)) return []
    return [{ path: worktree, head: lines.find((line) => line.startsWith("HEAD "))?.slice("HEAD ".length) ?? "" }]
  })
}

// Removes a worktree, deleting the folder by hand when git will not.
export function removeWorktree(repoRoot: string, dir: string): void {
  const removed = tryRun("git", ["worktree", "remove", "--force", dir], { cwd: repoRoot })
  if (removed.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true })
    tryRun("git", ["worktree", "prune"], { cwd: repoRoot })
  }
}
