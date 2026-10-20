import fs from "node:fs"
import path from "node:path"

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

// The directory holding `marker`, looking at most `maxDepth` levels up from `startDir`.
export function findDirUp(startDir: string, marker: string, maxDepth = 8): string | null {
  let dir = path.resolve(startDir)
  for (let depth = 0; depth < maxDepth; depth++) {
    if (fs.existsSync(path.join(dir, marker))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}
