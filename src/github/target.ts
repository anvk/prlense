// `prlense explain <thing>` takes whatever you have: a PR to analyse, a report someone sent
// you, or a link to one. Working out which is a cheap, pure decision made before anything
// else happens.
import path from "node:path"
import { tryParsePrRef, type PrRef } from "./pr.js"
import { isFile } from "../core/util.js"

export type ExplainTarget =
  | { kind: "pr"; ref: PrRef }
  // A report JSON already on disk: the same thing `prlense render` does.
  | { kind: "file"; path: string }
  // A report JSON to fetch first.
  | { kind: "url"; url: string }

function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function resolveExplainTarget(input: string): ExplainTarget {
  const value = input.trim()

  // A PR reference wins: a GitHub pull URL is a PR, never a file to fetch.
  const ref = tryParsePrRef(value)
  if (ref) return { kind: "pr", ref }

  const asPath = path.resolve(value)
  if (isFile(asPath)) return { kind: "file", path: asPath }

  if (isHttpUrl(value)) return { kind: "url", url: value }

  throw new Error(
    `Could not make sense of "${input}".\n` + "Give a PR number, a GitHub PR URL, a path to a prlense report JSON, or a link to one.",
  )
}

// Whether this invocation only opens a report file, so nothing should reach the network on
// its behalf: opening a report a colleague sent you has to work on a plane.
export function opensReportFile(argv: string[]): boolean {
  const args = argv.slice(2).filter((a) => !a.startsWith("-"))
  const first = args[0]
  if (!first) return false
  const candidate = first === "explain" ? args[1] : first
  if (!candidate) return false
  if (tryParsePrRef(candidate)) return false
  return isFile(path.resolve(candidate))
}
