import fs from "node:fs"
import path from "node:path"
import type { ContextDoc, ContextProvider, ContextRequest } from "./provider.js"
import { globToRegExp } from "../core/glob.js"

function readIfFile(p: string): string | undefined {
  try {
    if (fs.statSync(p).isFile()) return fs.readFileSync(p, "utf8")
  } catch {
    // missing
  }
  return undefined
}

// Resolve one level of "@path" include lines the way Claude Code does for CLAUDE.md.
function resolveIncludes(content: string, baseDir: string): string {
  return content
    .split("\n")
    .map((line) => {
      const m = /^@(\S+)\s*$/.exec(line.trim())
      if (!m) return line
      const inc = readIfFile(path.join(baseDir, m[1]))
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

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

// Reads the checkout's own instruction files: CLAUDE.md files in the root and in every
// directory above a changed file, optionally their .claude/rules, and any extra docs
// passed with --context.
export class RepoFilesContextProvider implements ContextProvider {
  readonly name = "repo-files"

  async collect(req: ContextRequest): Promise<ContextDoc[]> {
    const root = req.worktreePath
    const docs: ContextDoc[] = []
    const changedPaths = req.changedFiles.map((f) => f.path)
    const dirs = ancestorDirs(changedPaths)

    for (const dir of dirs) {
      {
        const rel = dir ? `${dir}/CLAUDE.md` : "CLAUDE.md"
        const content = readIfFile(path.join(root, rel))
        if (content === undefined) continue
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
        const rulesDir = path.join(root, dir, ".claude", "rules")
        let names: string[] = []
        try {
          names = fs.readdirSync(rulesDir).filter((n) => n.endsWith(".md")).sort()
        } catch {
          continue
        }
        for (const n of names) {
          const rel = path.posix.join(dir, ".claude", "rules", n)
          const content = readIfFile(path.join(rulesDir, n))
          if (content === undefined) continue
          docs.push({ id: `repo:${rel}`, kind: "rule", title: rel, source: rel, content, priority: 2 })
        }
      }
    }

    if (req.options.contextFiles.length > 0) {
      const all = walk(root).map((p) => path.relative(root, p).split(path.sep).join("/"))
      const regs = req.options.contextFiles.map(globToRegExp)
      for (const rel of all.sort()) {
        if (!regs.some((r) => r.test(rel))) continue
        if (docs.some((d) => d.source === rel)) continue
        const content = readIfFile(path.join(root, rel))
        if (content === undefined) continue
        docs.push({ id: `repo:${rel}`, kind: "doc", title: rel, source: rel, content, priority: 3 })
      }
    }

    return docs
  }
}
