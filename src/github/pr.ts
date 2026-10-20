import { run } from "../core/process.js"
import type { Remote } from "./remotes.js"

export interface PrRef {
  number: number
  owner?: string
  repo?: string
}

export function tryParsePrRef(input: string): PrRef | null {
  const s = input.trim()
  let m = /^#?(\d+)$/.exec(s)
  if (m) return { number: Number(m[1]) }
  m = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(s)
  if (m) return { number: Number(m[3]), owner: m[1], repo: m[2] }
  return null
}

export function parsePrRef(input: string): PrRef {
  const ref = tryParsePrRef(input)
  if (!ref) throw new Error(`Unrecognized PR reference "${input}". Use a number, #number, or a GitHub PR URL.`)
  return ref
}

export interface TicketRef {
  key: string
  url?: string
}

export function extractTicketRefs(body: string): TicketRef[] {
  const out = new Map<string, TicketRef>()
  for (const m of body.matchAll(/https?:\/\/[\w.-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/g)) {
    out.set(m[1], { key: m[1], url: m[0] })
  }
  for (const m of body.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/g)) {
    if (!out.has(m[1])) out.set(m[1], { key: m[1] })
  }
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
  const { stdout } = run("gh", ["pr", "view", String(ref.number), "--repo", remote.slug, "--json", GH_FIELDS.join(",")])
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
