// Fetching a prlense report someone linked to, for `prlense explain <url>`.
import { tryRun } from "../core/process.js"
import type { Report } from "../report/types.js"
import { reportProblem } from "../report/compat.js"
import { errorMessage } from "../core/util.js"

const FETCH_TIMEOUT_MS = 20_000

// Attachments and raw files on a private repo need the same credentials gh already holds.
// Without them GitHub answers 404 rather than 401, so an unauthenticated fetch looks like a
// broken link instead of a permissions problem.
const GITHUB_HOSTS = /(^|\.)(github\.com|githubusercontent\.com)$/

function isGithubUrl(url: string): boolean {
  try {
    return GITHUB_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

function githubAuthHeaders(url: string): Record<string, string> {
  if (!isGithubUrl(url)) return {}
  const token = tryRun("gh", ["auth", "token"], { timeout: 10_000 })
  if (token.status !== 0 || !token.stdout) return {}
  return { Authorization: `Bearer ${token.stdout}` }
}

export async function fetchReport(url: string): Promise<Report> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: githubAuthHeaders(url),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    })
  } catch (error) {
    throw new Error(`Could not fetch ${url}: ${errorMessage(error)}`)
  }
  if (!response.ok) {
    const hint =
      response.status === 404 && isGithubUrl(url)
        ? "\nA private GitHub file answers 404 when you cannot see it. Check `gh auth status`, and that your account has access."
        : ""
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}${hint}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await response.text())
  } catch {
    throw new Error(`${url} did not return JSON. A GitHub "blob" link serves a web page; use the raw link.`)
  }
  const problem = reportProblem(parsed)
  if (problem) throw new Error(`Cannot open ${url}: ${problem}.`)
  return parsed as Report
}
