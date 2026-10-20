import fs from "node:fs"
import path from "node:path"

// Folders that hold installed or built code rather than the repository's own files.
export const SKIPPED_DIRS = new Set([".git", "node_modules", "dist"])

// The files under `root` as forward-slash paths relative to it, skipping SKIPPED_DIRS.
// `keep` filters as it goes; `limit` stops the walk once that many have been kept, so a
// huge checkout costs no more than the answer needs. Unreadable folders are passed over.
export function walkFiles(root: string, opts: { keep?: (rel: string) => boolean; limit?: number } = {}): string[] {
  const found: string[] = []
  const limit = opts.limit ?? Infinity
  const visit = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= limit) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) visit(full)
      } else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join("/")
        if (!opts.keep || opts.keep(rel)) found.push(rel)
      }
    }
  }
  visit(root)
  return found
}

// A file's text, or undefined when there is no such file.
export function readTextIfFile(filePath: string): string | undefined {
  try {
    return fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, "utf8") : undefined
  } catch {
    return undefined
  }
}
