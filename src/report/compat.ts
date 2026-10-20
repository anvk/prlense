// Recognizing a saved report. Kept apart from validate.ts, which reaches for node:fs to check
// paths against the checkout, because the browser viewer needs this too and cannot follow it.
import { REPORT_SCHEMA_VERSION, type Report } from "./types.js"

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

// Why `v` cannot be shown as a report, or null when it can. Only the current format is read:
// a report from another version has to be generated again by this one.
export function reportProblem(v: unknown): string | null {
  if (!isRec(v) || typeof v.schemaVersion !== "number" || !isRec(v.pr) || !isRec(v.why) || !isRec(v.details)) {
    return "it is not a prlense report"
  }
  if (v.schemaVersion < REPORT_SCHEMA_VERSION) {
    return `it was made by an older prlense (report format ${v.schemaVersion}; this one reads ${REPORT_SCHEMA_VERSION}). Generate it again with \`prlense explain\``
  }
  if (v.schemaVersion > REPORT_SCHEMA_VERSION) {
    return `it was made by a newer prlense (report format ${v.schemaVersion}; this one reads ${REPORT_SCHEMA_VERSION}). Run \`prlense update\``
  }
  return null
}

export function isReport(v: unknown): v is Report {
  return reportProblem(v) === null
}
