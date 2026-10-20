// Reads the bundled browser viewer off disk so renderReportHtml can inline it. It lives
// here rather than in html.ts because html.ts is itself part of that bundle, and a module
// cannot read the file it is compiled into.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

let cached: string | null | undefined

export function readViewerScript(): string | undefined {
  if (cached !== undefined) return cached ?? undefined
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    cached = fs.readFileSync(path.join(here, "viewer.js"), "utf8")
  } catch {
    // A page without the viewer still renders; it just cannot open someone else's report.
    cached = null
  }
  return cached ?? undefined
}
