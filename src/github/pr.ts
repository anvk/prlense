import { run } from "../core/process.js"
import { ghRepoArg, type Remote } from "./remotes.js"

export interface PrRef {
  number: number
  owner?: string
  repo?: string
  host?: string
}

export function tryParsePrRef(input: string): PrRef | null {
  const s = input.trim()
  let m = /^#?(\d+)$/.exec(s)
  if (m) return { number: Number(m[1]) }
  // github.com or a GitHub Enterprise host: https://<host>/<owner>/<repo>/pull/<n>
  m = /^https?:\/\/([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(s)
  if (m) return { number: Number(m[4]), owner: m[2], repo: m[3], host: m[1].toLowerCase() }
  return null
}

export interface TicketRef {
  key: string
  url?: string
}

// The scheme and host a PR's own URL lives on, github.com when it has none.
export function webOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return "https://github.com"
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

const KEY = /[A-Z][A-Z0-9]{1,9}-\d{1,6}/
const TRACKER_URL = /https?:\/\/[^\s)\]>]+?\/(?:browse|issue)\/([A-Z][A-Z0-9]{1,9}-\d{1,6})(?:[/?#][^\s)\]>]*)?/g
const CLOSING_REF = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+((?:[\w.-]+\/[\w.-]+)?#(\d+))/gi

// The tickets a PR points at, without guessing:
//  - links to a tracker issue (Jira's /browse/ABC-123, Linear's /issue/ABC-123, GitHub issues)
//  - GitHub issues named with a closing keyword ("Fixes #12", "Closes owner/repo#3")
//  - a bare key such as ABC-123 only when the branch name or the start of the title carries
//    it, which is how a PR is tied to a ticket. On its own the shape also matches UTF-8 or
//    SHA-256.
export function extractTicketRefs(pr: Pick<PrMeta, "body" | "title" | "headRefName" | "slug" | "url">): TicketRef[] {
  // Issues live on the same host as the PR: github.com, or a GitHub Enterprise server.
  const origin = webOrigin(pr.url)
  const issueUrl = new RegExp(`${escapeRegExp(origin)}/([\\w.-]+/[\\w.-]+)/issues/(\\d+)`, "g")
  const out = new Map<string, TicketRef>()
  const add = (key: string, url?: string) => {
    if (!out.has(key) || (url && !out.get(key)!.url)) out.set(key, { key, url })
  }
  // A link that ends a sentence keeps its full stop otherwise.
  for (const m of pr.body.matchAll(TRACKER_URL)) add(m[1], m[0].replace(/[.,;:!?]+$/, ""))
  for (const m of pr.body.matchAll(issueUrl)) add(`${m[1]}#${m[2]}`, m[0])
  for (const m of pr.body.matchAll(CLOSING_REF)) {
    const repo = m[1].includes("/") ? m[1].split("#")[0] : pr.slug
    add(m[1].includes("/") ? m[1] : `#${m[2]}`, `${origin}/${repo}/issues/${m[2]}`)
  }
  const declared = new Set<string>()
  for (const m of pr.headRefName.matchAll(new RegExp(KEY.source, "gi"))) declared.add(m[0].toUpperCase())
  const titleKey = new RegExp(`^\\[?(${KEY.source})\\]?[:\\s]`).exec(pr.title.trim())
  if (titleKey) declared.add(titleKey[1])
  for (const key of declared) add(key)
  return [...out.values()]
}

export interface PrMeta {
  number: number
  slug: string
  url: string
  title: string
  body: string
  author: string
  state: "OPEN" | "MERGED" | "CLOSED"
  isDraft: boolean
  baseRefName: string
  headRefName: string
  headRefOid: string
  headRepoSlug: string | null
  additions: number
  deletions: number
  changedFiles: number
  createdAt: string
  mergedAt: string | null
  mergeCommitSha: string | null
}

const GH_FIELDS = [
  "number", "url", "title", "body", "author", "state", "isDraft", "baseRefName", "headRefName",
  "headRefOid", "headRepository", "headRepositoryOwner", "additions", "deletions", "changedFiles",
  "createdAt", "mergedAt", "mergeCommit",
]

export function resolvePr(remote: Remote, ref: PrRef): PrMeta {
  const { stdout } = run("gh", ["pr", "view", String(ref.number), "--repo", ghRepoArg(remote), "--json", GH_FIELDS.join(",")])
  const raw = JSON.parse(stdout) as Record<string, unknown>
  const headRepo = raw.headRepository as { name?: string } | null
  const headOwner = raw.headRepositoryOwner as { login?: string } | null
  const headRepoSlug = headRepo?.name && headOwner?.login ? `${headOwner.login}/${headRepo.name}` : null
  const author = raw.author as { login?: string } | null
  return {
    number: raw.number as number,
    slug: remote.slug,
    url: raw.url as string,
    title: raw.title as string,
    body: (raw.body as string) ?? "",
    author: author?.login ?? "unknown",
    state: raw.state as PrMeta["state"],
    isDraft: Boolean(raw.isDraft),
    baseRefName: raw.baseRefName as string,
    headRefName: raw.headRefName as string,
    headRefOid: raw.headRefOid as string,
    headRepoSlug: headRepoSlug && headRepoSlug.toLowerCase() !== remote.slug.toLowerCase() ? headRepoSlug : null,
    additions: raw.additions as number,
    deletions: raw.deletions as number,
    changedFiles: raw.changedFiles as number,
    createdAt: raw.createdAt as string,
    mergedAt: (raw.mergedAt as string | null) ?? null,
    mergeCommitSha: (raw.mergeCommit as { oid?: string } | null)?.oid ?? null,
  }
}
