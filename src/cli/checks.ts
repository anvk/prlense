// The toolchain every run needs. `prlense doctor` reports each one; `prlense explain` stops at
// the first that fails, with the same wording.
import { commandExists, tryRun } from "../core/process.js"

export interface Check {
  label: string
  ok: boolean
  detail: string // what was found, or what to do about it
}

const MIN_NODE_MAJOR = 22

export function toolchainChecks(): Check[] {
  const gitVersion = tryRun("git", ["--version"])
  const ghVersion = tryRun("gh", ["--version"])
  const ghAuth = commandExists("gh") ? tryRun("gh", ["auth", "status"]) : undefined
  const nodeMajor = Number(process.versions.node.split(".")[0])
  return [
    { label: "git", ok: gitVersion.status === 0, detail: gitVersion.status === 0 ? gitVersion.stdout : "not installed" },
    {
      label: "gh",
      ok: ghVersion.status === 0,
      detail: ghVersion.status === 0 ? (ghVersion.stdout.split("\n")[0] ?? "") : "not installed: https://cli.github.com",
    },
    { label: "gh auth", ok: ghAuth?.status === 0, detail: ghAuth?.status === 0 ? "logged in" : "not logged in; run: gh auth login" },
    {
      label: "node",
      ok: nodeMajor >= MIN_NODE_MAJOR,
      detail: nodeMajor >= MIN_NODE_MAJOR ? process.version : `${process.version}; prlense needs Node ${MIN_NODE_MAJOR} or newer`,
    },
  ]
}

// Throws for the first failing check, so a run stops before doing any work.
export function requireToolchain(): void {
  const failed = toolchainChecks().find((check) => !check.ok)
  if (failed) throw new Error(`${failed.label}: ${failed.detail}`)
}
