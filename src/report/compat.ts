// Recognizing a saved report. Kept apart from validate.ts, which reaches for node:fs to check
// paths against the checkout, because the browser viewer needs this too and cannot follow it.
import { REPORT_SCHEMA_VERSION } from "./types.js"
import { isRecord } from "../core/guards.js"

// Why `v` cannot be shown as a report, or null when it can. Only the current format is read:
// a report from another version has to be generated again by this one.
export function reportProblem(v: unknown): string | null {
  if (!isRecord(v) || typeof v.schemaVersion !== "number" || !isRecord(v.pr) || !isRecord(v.why) || !isRecord(v.details)) {
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
