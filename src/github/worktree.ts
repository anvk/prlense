import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { git as runGit } from "../core/git.js"
import { run, tryRun } from "../core/process.js"
import type { PrMeta } from "./pr.js"
import type { Remote } from "./remotes.js"

export interface PrWorktree {
  path: string
  headSha: string
  baseSha: string
  baseRef: string // e.g. newOrigin/main
}

// Where progress notes go. The CLI passes its logger; without one they are dropped.
export interface WorktreeLog {
  warn(message: string): void
  info(message: string): void
}

export interface WorktreeArgs {
  repoRoot: string
  remote: Remote
  pr: PrMeta
  keep?: boolean
  log?: WorktreeLog
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

// The commit the PR's changes are measured from. For an open PR, or one merged by squash
// or rebase, that is where its branch left the base. A PR merged with a merge commit is
// already part of the base, so that answer would be the head itself and the diff empty;
// its base is then the base branch as it was just before the merge (the merge commit's
// first parent).
export function resolveBaseSha(repoRoot: string, headSha: string, baseRef: string, mergeCommitSha: string | null): string {
  const git = (gitArgs: string[]) => runGit(repoRoot, gitArgs).stdout
  const forkPoint = git(["merge-base", headSha, baseRef])
  if (forkPoint !== headSha || !mergeCommitSha) return forkPoint
  const parents = tryRun("git", ["rev-list", "--parents", "-n", "1", mergeCommitSha], { cwd: repoRoot })
  const [, firstParent, secondParent] = parents.stdout.split(" ")
  if (parents.status !== 0 || !firstParent || !secondParent) return forkPoint
  return git(["merge-base", headSha, firstParent])
}

export async function withPrWorktree<T>(args: WorktreeArgs, fn: (wt: PrWorktree) => Promise<T>): Promise<T> {
  const { repoRoot, remote, pr } = args
  const { warn, info } = args.log ?? { warn: () => undefined, info: () => undefined }
  const tmpRef = `refs/prlense/pr-${pr.number}`
  const git = (gitArgs: string[]) => runGit(repoRoot, gitArgs)

  git(["worktree", "prune"])

  // One fetch brings the PR head (works for fork PRs too) and the base branch.
  const fetchArgs = ["fetch", "--no-tags", remote.name, `pull/${pr.number}/head:${tmpRef}`, pr.baseRefName]
  const fetched = tryRun("git", fetchArgs, { cwd: repoRoot })
  let baseRef = `${remote.name}/${pr.baseRefName}`
  if (fetched.status !== 0) {
    // Base branch may be deleted after merge; fetch the head alone and fall back to the remote HEAD.
    git(["fetch", "--no-tags", remote.name, `pull/${pr.number}/head:${tmpRef}`])
    const head = tryRun("git", ["rev-parse", "--verify", `${remote.name}/HEAD`], { cwd: repoRoot })
    if (head.status !== 0)
      throw new Error(
        `Could not fetch base branch ${pr.baseRefName} from ${remote.name}, and ${remote.name}/HEAD is unknown.\n${fetched.stderr}`,
      )
    baseRef = `${remote.name}/HEAD`
    warn(`Base branch ${pr.baseRefName} is gone on ${remote.name}; using ${baseRef} for the merge base.`)
  }

  const headSha = git(["rev-parse", tmpRef]).stdout
  if (pr.headRefOid && headSha !== pr.headRefOid) {
    warn(
      `PR head moved while fetching (GitHub says ${pr.headRefOid.slice(0, 10)}, fetched ${headSha.slice(0, 10)}). Using the fetched commit.`,
    )
  }
  const baseSha = resolveBaseSha(repoRoot, headSha, baseRef, pr.mergeCommitSha)

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
