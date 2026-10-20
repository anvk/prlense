import fs from "node:fs"
import path from "node:path"
import type { ContextDoc, ContextProvider, ContextRequest } from "./provider.js"
import { globToRegExp } from "../core/glob.js"
import { readTextIfFile, walkFiles } from "../core/files.js"

// Resolve one level of "@path" include lines, the convention instruction files use to pull in others.
function resolveIncludes(content: string, baseDir: string): string {
  return content
    .split("\n")
    .map((line) => {
      const m = /^@(\S+)\s*$/.exec(line.trim())
      if (!m) return line
      const inc = readTextIfFile(path.join(baseDir, m[1]))
      return inc === undefined ? line : `<!-- included from ${m[1]} -->\n${inc}`
    })
    .join("\n")
}

function ancestorDirs(files: string[]): string[] {
  const dirs = new Set<string>([""])
  for (const f of files) {
    const parts = f.split("/")
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"))
  }
  return [...dirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
}

// The instruction files agents read, in the order they are handed over. AGENTS.md is the
// tool-neutral convention; CLAUDE.md is Claude Code's. Many repos keep one as a symlink to
// the other, which is read once.
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"]
// Rule folders, loaded with --with-rules.
const RULE_DIRS = [path.join(".claude", "rules"), path.join(".cursor", "rules")]

// Reads the checkout's own instruction files: AGENTS.md and CLAUDE.md in the root and in
// every directory above a changed file, optionally the agent rule folders there, and any
// extra docs passed with --context.
export class RepoFilesContextProvider implements ContextProvider {
  readonly name = "repo-files"

  async collect(req: ContextRequest): Promise<ContextDoc[]> {
    const root = req.worktreePath
    const docs: ContextDoc[] = []
    const changedPaths = req.changedFiles.map((f) => f.path)
    const dirs = ancestorDirs(changedPaths)
    const seen = new Set<string>()

    for (const dir of dirs) {
      for (const name of INSTRUCTION_FILES) {
        const rel = dir ? `${dir}/${name}` : name
        const full = path.join(root, rel)
        const content = readTextIfFile(full)
        if (content === undefined) continue
        const real = fs.realpathSync(full)
        if (seen.has(real)) continue
        seen.add(real)
        docs.push({
          id: `repo:${rel}`,
          kind: "repo-instructions",
          title: rel,
          source: rel,
          content: resolveIncludes(content, path.join(root, dir)),
          priority: dir ? 1 : 0,
        })
      }
    }

    if (req.options.includeRules) {
      for (const dir of dirs) {
        for (const ruleDir of RULE_DIRS) {
          const rulesDir = path.join(root, dir, ruleDir)
          let names: string[] = []
          try {
            names = fs.readdirSync(rulesDir).filter((n) => n.endsWith(".md") || n.endsWith(".mdc")).sort()
          } catch {
            continue
          }
          for (const n of names) {
            const rel = path.posix.join(dir, ruleDir.split(path.sep).join("/"), n)
            const content = readTextIfFile(path.join(rulesDir, n))
            if (content === undefined) continue
            docs.push({ id: `repo:${rel}`, kind: "rule", title: rel, source: rel, content, priority: 2 })
          }
        }
      }
    }

    if (req.options.contextFiles.length > 0) {
      const all = walkFiles(root)
      const regs = req.options.contextFiles.map(globToRegExp)
      for (const rel of all.sort()) {
        if (!regs.some((r) => r.test(rel))) continue
        if (docs.some((d) => d.source === rel)) continue
        const content = readTextIfFile(path.join(root, rel))
        if (content === undefined) continue
        docs.push({ id: `repo:${rel}`, kind: "doc", title: rel, source: rel, content, priority: 3 })
      }
    }

    return docs
  }
}
