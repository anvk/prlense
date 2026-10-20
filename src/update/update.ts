// `prlense update`: the same update a run does on its own, on demand.
import pc from "picocolors"
import { applyUpdate, probeRemote, recoveryHint } from "./index.js"
import { checkoutBlockers, describeVersion, resolveInstall } from "./install.js"

export function runUpdateCommand(options: { check?: boolean }): void {
  const info = resolveInstall()
  console.log(`prlense ${describeVersion(info)}`)

  if (!info.gitRoot) {
    console.error(pc.red("prlense is not running from a git checkout, so it cannot update itself."))
    console.error(recoveryHint())
    process.exitCode = 1
    return
  }
  if (!info.managed) {
    console.error(
      pc.yellow(`prlense is linked from ${info.packageRoot}, which is a developer checkout, not the managed install.`),
    )
    console.error(pc.dim("Self-update stays off there. Build it yourself, or re-link the managed install."))
    process.exitCode = 1
    return
  }
  const blockers = checkoutBlockers(info)
  if (blockers.length > 0) {
    for (const reason of blockers) console.error(pc.yellow(`Cannot update: ${reason}`))
    process.exitCode = 1
    return
  }

  const remote = probeRemote(info)
  if (!remote) {
    console.error(pc.yellow("Could not reach the remote."))
    process.exitCode = 1
    return
  }
  if (remote === info.sha) {
    console.log("Up to date.")
    return
  }
  if (options.check) {
    console.log(`An update is ready: ${remote.slice(0, 7)}`)
    process.exitCode = 1
    return
  }

  const outcome = applyUpdate(info)
  if (outcome.status === "updated") {
    console.log(pc.green(`Updated to ${outcome.to}`))
    return
  }
  if (outcome.status === "current") {
    console.log("Already up to date.")
    return
  }
  if (outcome.status === "skipped") {
    console.log(pc.yellow(`Skipped: ${outcome.reason}`))
    return
  }
  console.error(pc.red(`Update failed: ${outcome.reason}`))
  console.error(recoveryHint())
  process.exitCode = 1
}
