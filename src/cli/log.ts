import pc from "picocolors"

let verboseEnabled = false

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled
}

export function step(message: string): void {
  console.error(pc.cyan("▸ ") + message)
}

export function info(message: string): void {
  console.error(pc.dim("  " + message))
}

export function warn(message: string): void {
  console.error(pc.yellow("! " + message))
}

export function verbose(message: string): void {
  if (verboseEnabled) console.error(pc.dim("  · " + message))
}

export function success(message: string): void {
  console.error(pc.green("✓ ") + message)
}
