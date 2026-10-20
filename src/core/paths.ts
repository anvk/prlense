import os from "node:os"
import path from "node:path"

// Where prlense keeps its own files: the user config, update state and reports.
export function prlenseHome(): string {
  return path.join(os.homedir(), ".prlense")
}

// The managed install the curl installer creates.
export function defaultInstallDir(): string {
  return path.join(os.homedir(), ".prlense-cli")
}

export function defaultReportsDir(): string {
  return path.join(prlenseHome(), "reports")
}

// `~/x` as typed in a flag or a config file, made absolute.
export function expandHome(p: string): string {
  return p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p
}
