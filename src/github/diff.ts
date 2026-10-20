import { run } from "../core/process.js"
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

export function listChangedFiles(wt: PrWorktree, options: RunOptions): ChangedFile[] {
  const cwd = wt.path
  const nameStatus = run("git", ["diff", "--name-status", "-M", wt.baseSha, wt.headSha], { cwd }).stdout
  const numstat = run("git", ["diff", "--numstat", "-M", wt.baseSha, wt.headSha], { cwd }).stdout

  const counts = new Map<string, { additions: number; deletions: number }>()
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue
    const [a, d, ...rest] = line.split("\t")
    let p = rest.join("\t")
    // Renames appear as "old => new" or "dir/{old => new}/file"
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(p)
    if (brace) p = `${brace[1]}${brace[3]}${brace[4]}`
    else if (p.includes(" => ")) p = p.split(" => ")[1]
    counts.set(p, { additions: a === "-" ? 0 : Number(a), deletions: d === "-" ? 0 : Number(d) })
  }

  const out: ChangedFile[] = []
  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue
    const parts = line.split("\t")
    const status = parts[0][0] as ChangedFile["status"]
    const filePath = parts.length > 2 ? parts[2] : parts[1]
    const oldPath = parts.length > 2 ? parts[1] : undefined
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
