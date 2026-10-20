import path from "node:path"
import { run, tryRun } from "../core/process.js"

export interface Remote {
  name: string
  url: string
  slug: string // owner/repo
}

export function slugFromRemoteUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/, "")
  // git@github.com:owner/repo
  let m = /^[\w.-]+@[\w.-]+:([^/\s]+)\/([^/\s]+)$/.exec(trimmed)
  if (m) return `${m[1]}/${m[2]}`
  // https://github.com/owner/repo or ssh://git@github.com/owner/repo
  m = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?[^/]+\/([^/\s]+)\/([^/\s]+)$/.exec(trimmed)
  if (m) return `${m[1]}/${m[2]}`
  return null
}

export function listRemotes(repoRoot: string): Remote[] {
  const { stdout } = run("git", ["remote", "-v"], { cwd: repoRoot })
  const seen = new Map<string, Remote>()
  for (const line of stdout.split("\n")) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
    if (!m || seen.has(m[1])) continue
    const slug = slugFromRemoteUrl(m[2])
    if (!slug) continue
    seen.set(m[1], { name: m[1], url: m[2], slug })
  }
  return [...seen.values()]
}

export interface PickRemoteOptions {
  remoteFlag?: string
  urlSlug?: string // owner/repo parsed from a PR URL, when given
}

export function pickRemote(remotes: Remote[], opts: PickRemoteOptions): Remote {
  if (remotes.length === 0) throw new Error("This checkout has no GitHub remotes.")
  const list = remotes.map((r) => `  ${r.name}  →  ${r.slug}`).join("\n")

  if (opts.remoteFlag) {
    const r = remotes.find((x) => x.name === opts.remoteFlag)
    if (!r) throw new Error(`No remote named "${opts.remoteFlag}". Remotes:\n${list}`)
    return r
  }
  if (opts.urlSlug) {
    const want = opts.urlSlug.toLowerCase()
    const r = remotes.find((x) => x.slug.toLowerCase() === want)
    if (!r) {
      throw new Error(
        `The PR belongs to ${opts.urlSlug}, but this checkout only has remotes for:\n${list}\nRun prlense inside a checkout of that repo, or pass -C <path>.`,
      )
    }
    return r
  }
  if (remotes.length === 1) return remotes[0]
  throw new Error(
    `This checkout has ${remotes.length} remotes and a bare PR number is ambiguous:\n${list}\nPass the PR URL, or --remote <name>.`,
  )
}

// The top of the git checkout prlense runs against: -C <path>, or the current directory.
export function findRepoRoot(repoFlag?: string): string {
  const cwd = repoFlag ? path.resolve(repoFlag) : process.cwd()
  const res = tryRun("git", ["rev-parse", "--show-toplevel"], { cwd })
  if (res.status !== 0) {
    throw new Error(`${cwd} is not inside a git checkout. Run prlense inside a clone of the target repo, or pass -C <path>.`)
  }
  return res.stdout
}
