// `prlense doctor`: checks everything a run needs, without running one.
import fs from "node:fs"
import pc from "picocolors"
import { readUserConfig, resolveEngineConfig, type EngineFlags } from "../core/config.js"
import { createEngine } from "../engine/select.js"
import { commandExists, tryRun } from "../core/process.js"
import { findRepoRoot, listRemotes } from "../github/remotes.js"
import { probeRemote } from "../update/index.js"
import { describeVersion, resolveInstall } from "../update/install.js"
import { errorMessage } from "../core/util.js"

export function runDoctorCommand(opts: { repo?: string; cliScriptPath: string } & EngineFlags): void {
  const ok = (label: string, good: boolean, detail: string) => {
    console.log(`${good ? pc.green("✓") : pc.red("✗")} ${label}${detail ? pc.dim(" — " + detail) : ""}`)
    return good
  }
  let allGood = true
  allGood = ok("git", commandExists("git"), tryRun("git", ["--version"]).stdout) && allGood
  const ghVersion = tryRun("gh", ["--version"])
  allGood = ok("gh", ghVersion.status === 0, ghVersion.stdout.split("\n")[0] ?? "") && allGood
  const ghAuth = tryRun("gh", ["auth", "status"])
  allGood = ok("gh auth", ghAuth.status === 0, ghAuth.status === 0 ? "logged in" : "run: gh auth login") && allGood
  ok("node", true, process.version)

  try {
    const repoRoot = findRepoRoot(opts.repo)
    const remotes = listRemotes(repoRoot)
    ok("repo", true, `${repoRoot} (${remotes.map((r) => `${r.name}→${r.slug}`).join(", ") || "no GitHub remotes"})`)
  } catch (error) {
    ok("repo", false, errorMessage(error).split("\n")[0])
  }

  try {
    const info = resolveInstall()
    ok("prlense", true, `${describeVersion(info)} on ${info.branch ?? "a detached HEAD"}`)
    try {
      fs.accessSync(info.distEntry, fs.constants.X_OK)
    } catch {
      ok("executable", false, `${info.distEntry} is not executable. Fix with: chmod +x ${info.distEntry}`)
      allGood = false
    }
    if (!info.managed) {
      ok("self-update", false, `linked from ${info.packageRoot}, not the managed install — off`)
    } else if (process.env.PRLENSE_NO_AUTO_UPDATE) {
      ok("self-update", true, "off (PRLENSE_NO_AUTO_UPDATE is set)")
    } else {
      const remote = probeRemote(info)
      if (!remote) ok("self-update", false, "on, but the remote could not be reached")
      else ok("self-update", true, remote === info.sha ? "on, up to date" : `on, update available (${remote.slice(0, 7)})`)
    }
  } catch (error) {
    ok("prlense", false, errorMessage(error).split("\n")[0])
  }

  try {
    const { config: user, source } = readUserConfig()
    ok("~/.prlense/config.json", true, source ?? "not present, defaults apply")
    const engineConfig = resolveEngineConfig(user, opts)
    const engine = createEngine(engineConfig, opts.cliScriptPath)
    const doc = engine.doctor()
    allGood = ok(`engine ${engine.name}`, doc.ok, doc.details.join("; ")) && allGood
  } catch (error) {
    allGood = ok("engine", false, errorMessage(error)) && allGood
  }
  if (!allGood) process.exitCode = 1
}
