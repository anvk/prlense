import type { SpawnSyncOptionsWithBufferEncoding } from "node:child_process"
import { run, tryRun, type RunResult, type RunStatus } from "./process.js"

// git never stops to ask for a password: a run in the background would hang on it.
const NO_PROMPT = { GIT_TERMINAL_PROMPT: "0" }

// Runs git in `cwd` and returns its output; throws with git's message when it fails.
export function git(cwd: string, args: string[], options: SpawnSyncOptionsWithBufferEncoding = {}): RunResult {
  return run("git", args, { ...options, cwd, env: { ...process.env, ...NO_PROMPT, ...options.env } })
}

// Like git(), but never throws; the caller looks at the status.
export function tryGit(cwd: string, args: string[], options: SpawnSyncOptionsWithBufferEncoding = {}): RunStatus {
  return tryRun("git", args, { ...options, cwd, env: { ...process.env, ...NO_PROMPT, ...options.env } })
}
