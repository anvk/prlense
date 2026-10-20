import { runRaw } from "../core/process.js"
import { matchesAnyGlob } from "../core/glob.js"
import type { RunOptions } from "../core/config.js"
import type { PrWorktree } from "./worktree.js"

export interface ChangedFile {
  path: string
  oldPath?: string
  status: "A" | "M" | "D" | "R" | "C" | "T"
  additions: number
  deletions: number
  generated: boolean
  test: boolean
  area?: string
}

const TEST_GLOBS = [
  "**/*_test.go",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/__tests__/**",
  "**/tests/**",
  "**/testutil/**",
  "**/testdata/**",
]

export function isGeneratedFile(filePath: string, options: RunOptions): boolean {
  return matchesAnyGlob(filePath, options.skipGenerated)
}

export function isTestFile(filePath: string): boolean {
  return matchesAnyGlob(filePath, TEST_GLOBS)
}

// The first path segment, which gives "go" and "ui" in a typical repo.
export function assignArea(filePath: string): string | undefined {
  const first = filePath.split("/")[0]
  return filePath.includes("/") ? first : undefined
}

// Read with -z: paths come back raw rather than quoted (git quotes a name like café.ts as
// "caf\303\251.ts" in its text output), and a rename is two separate fields instead of an
// "old => new" string to take apart.
export function listChangedFiles(wt: PrWorktree, options: RunOptions): ChangedFile[] {
  const cwd = wt.path
  const fields = (args: string[]) => runRaw("git", ["diff", "-z", "-M", ...args, wt.baseSha, wt.headSha], { cwd }).split("\0")

  // --numstat -z: "added\tdeleted\tpath", or "added\tdeleted\t" followed by the old and new
  // paths as two more fields for a rename.
  const counts = new Map<string, { additions: number; deletions: number }>()
  const numstat = fields(["--numstat"])
  for (let i = 0; i < numstat.length; i++) {
    if (!numstat[i]) continue
    const [a, d, inlinePath] = numstat[i].split("\t")
    let filePath = inlinePath
    if (!filePath) {
      filePath = numstat[i + 2]
      i += 2
    }
    counts.set(filePath, { additions: a === "-" ? 0 : Number(a), deletions: d === "-" ? 0 : Number(d) })
  }

  // --name-status -z: the status, then one path, or two (old, new) for a rename or copy.
  const out: ChangedFile[] = []
  const nameStatus = fields(["--name-status"])
  for (let i = 0; i < nameStatus.length; i++) {
    const code = nameStatus[i]
    if (!code) continue
    const status = code[0] as ChangedFile["status"]
    const twoPaths = status === "R" || status === "C"
    const oldPath = twoPaths ? nameStatus[i + 1] : undefined
    const filePath = twoPaths ? nameStatus[i + 2] : nameStatus[i + 1]
    i += twoPaths ? 2 : 1
    const c = counts.get(filePath) ?? { additions: 0, deletions: 0 }
    out.push({
      path: filePath,
      oldPath,
      status,
      additions: c.additions,
      deletions: c.deletions,
      generated: isGeneratedFile(filePath, options),
      test: isTestFile(filePath),
      area: assignArea(filePath),
    })
  }
  return out
}

export function formatInventory(files: ChangedFile[]): string {
  const lines = ["status +added/-removed path [flags]"]
  for (const f of files) {
    const flags: string[] = []
    if (f.generated) flags.push("[generated]")
    if (f.test) flags.push("[test]")
    if (f.area) flags.push(`area=${f.area}`)
    const rename = f.oldPath ? ` (was ${f.oldPath})` : ""
    lines.push(`${f.status} +${f.additions}/-${f.deletions} ${f.path}${rename}${flags.length ? " " + flags.join(" ") : ""}`)
  }
  return lines.join("\n")
}
