import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import type { UserConfig } from "../core/config.js"
import * as log from "./log.js"
import { defaultReportsDir, expandHome } from "../core/paths.js"
import { renderReportHtml } from "../render/html.js"
import { readViewerScript } from "../render/viewerScript.js"
import type { Report } from "../report/types.js"

export function resolveReportsDir(user: UserConfig, outFlag?: string): string {
  if (outFlag) return path.resolve(expandHome(outFlag))
  if (user.reportsDir) return path.resolve(expandHome(user.reportsDir))
  return defaultReportsDir()
}

export function reportBasename(report: Report, timestamp: boolean): string {
  const stamp = timestamp ? "-" + new Date(report.generatedAt).toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-") : ""
  return `pr-${report.pr.number}${stamp}`
}

export function renderPage(report: Report): string {
  return renderReportHtml(report, { viewerScript: readViewerScript() })
}

export function writeReportFiles(dir: string, report: Report, timestamp = false): { htmlPath: string; jsonPath: string } {
  const sub = path.join(dir, report.pr.slug.replace("/", "-"))
  fs.mkdirSync(sub, { recursive: true })
  const base = reportBasename(report, timestamp)
  const htmlPath = path.join(sub, `${base}.html`)
  const jsonPath = path.join(sub, `${base}.json`)
  fs.writeFileSync(htmlPath, renderPage(report))
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  log.success(`Report written to ${htmlPath}`)
  log.info(`JSON: ${jsonPath}`)
  return { htmlPath, jsonPath }
}

// Opens the page when asked, and prints its path on stdout as the command's result.
export function showReport(htmlPath: string, open: boolean): void {
  if (open && !openInBrowser(htmlPath)) log.warn(`Could not open a browser. Open file://${htmlPath}`)
  console.log(htmlPath)
}

function openInBrowser(filePath: string): boolean {
  const cmd =
    process.platform === "darwin"
      ? ["open", [filePath]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", filePath]]
        : ["xdg-open", [filePath]]
  try {
    const child = spawn(cmd[0] as string, cmd[1] as string[], { stdio: "ignore", detached: true })
    child.on("error", () => undefined)
    child.unref()
    return true
  } catch {
    return false
  }
}
