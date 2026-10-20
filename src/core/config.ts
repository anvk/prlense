import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DEFAULT_FRONTEND_MATCH } from "../report/types.js"
import { errorMessage } from "./util.js"

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
export type Effort = (typeof EFFORTS)[number]

export type EngineConfig =
  | { kind: "claude-cli"; model?: string; effort?: Effort }
  | { kind: "openai-compat"; baseUrl: string; model: string; apiKeyEnv: string; maxSteps?: number }

// User-level defaults, read from ~/.prlense/config.json. Never holds keys, only env var names.
export interface UserConfig {
  reportsDir?: string
  engine: EngineConfig
  engines: Record<string, EngineConfig>
  // Tuned once per person, not per repo.
  contextMaxBytes: number
  frontendMatch: string[]
}

export const DEFAULT_SKIP_GENERATED = [
  "**/*_gen.go",
  "**/*.pb.go",
  "**/openapi.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.snap",
]

export const DEFAULT_MODEL = "claude-opus-5-5"
export const DEFAULT_EFFORT: Effort = "high"

export const DEFAULT_ENGINE: EngineConfig = {
  kind: "claude-cli",
  model: DEFAULT_MODEL,
  effort: DEFAULT_EFFORT,
}

export const DEFAULT_CONTEXT_MAX_BYTES = 150_000

export function defaultUserConfig(): UserConfig {
  return {
    engine: { ...DEFAULT_ENGINE },
    engines: {},
    contextMaxBytes: DEFAULT_CONTEXT_MAX_BYTES,
    frontendMatch: [...DEFAULT_FRONTEND_MATCH],
  }
}

// Everything a run needs, built from flags and the user config; nothing is read from the
// target repo.
export interface RunOptions {
  contextFiles: string[]
  includeRules: boolean
  skipGenerated: string[]
  contextMaxBytes: number
  frontendMatch: string[]
}

export function buildRunOptions(user: UserConfig, flags: { context?: string[]; withRules?: boolean; skip?: string[] }): RunOptions {
  return {
    contextFiles: flags.context ?? [],
    includeRules: Boolean(flags.withRules),
    skipGenerated: [...DEFAULT_SKIP_GENERATED, ...(flags.skip ?? [])],
    contextMaxBytes: user.contextMaxBytes,
    frontendMatch: user.frontendMatch,
  }
}

export function userConfigDir(): string {
  return path.join(os.homedir(), ".prlense")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optString(obj: Record<string, unknown>, key: string, where: string): string | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (typeof v !== "string") throw new Error(`${where}: "${key}" must be a string`)
  return v
}

function optNumber(obj: Record<string, unknown>, key: string, where: string): number | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (typeof v !== "number" || Number.isNaN(v)) throw new Error(`${where}: "${key}" must be a number`)
  return v
}

function optStringArray(obj: Record<string, unknown>, key: string, where: string): string[] | undefined {
  const v = obj[key]
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`${where}: "${key}" must be an array of strings`)
  }
  return v as string[]
}

export function normalizeEngineConfig(raw: unknown, where: string): EngineConfig {
  if (!isRecord(raw)) throw new Error(`${where}: expected an object`)
  const kind = optString(raw, "kind", where)
  if (kind === "claude-cli" || kind === undefined) {
    const effort = optString(raw, "effort", where)
    if (effort && !(EFFORTS as readonly string[]).includes(effort)) {
      throw new Error(`${where}: "effort" must be one of ${EFFORTS.join(", ")}`)
    }
    return {
      kind: "claude-cli",
      model: optString(raw, "model", where) ?? DEFAULT_MODEL,
      effort: (effort as Effort | undefined) ?? DEFAULT_EFFORT,
    }
  }
  if (kind === "openai-compat") {
    const baseUrl = optString(raw, "baseUrl", where)
    const model = optString(raw, "model", where)
    const apiKeyEnv = optString(raw, "apiKeyEnv", where)
    if (!baseUrl || !model || !apiKeyEnv) {
      throw new Error(`${where}: openai-compat needs "baseUrl", "model" and "apiKeyEnv"`)
    }
    return { kind, baseUrl, model, apiKeyEnv, maxSteps: optNumber(raw, "maxSteps", where) }
  }
  throw new Error(`${where}: unknown engine kind "${kind}" (expected claude-cli or openai-compat)`)
}

export function normalizeUserConfig(raw: unknown, where: string): UserConfig {
  if (!isRecord(raw)) throw new Error(`${where}: expected a JSON object`)
  const out = defaultUserConfig()
  out.reportsDir = optString(raw, "reportsDir", where)
  const maxBytes = optNumber(raw, "contextMaxBytes", where)
  if (maxBytes !== undefined) out.contextMaxBytes = maxBytes
  const fm = optStringArray(raw, "frontendMatch", where)
  if (fm) out.frontendMatch = fm
  if (raw.engine !== undefined) out.engine = normalizeEngineConfig(raw.engine, `${where}: engine`)
  if (raw.engines !== undefined) {
    if (!isRecord(raw.engines)) throw new Error(`${where}: "engines" must be an object`)
    for (const [name, cfg] of Object.entries(raw.engines)) {
      out.engines[name] = normalizeEngineConfig(cfg, `${where}: engines.${name}`)
    }
  }
  return out
}

function readJsonIfPresent(filePath: string): unknown | undefined {
  if (!fs.existsSync(filePath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${errorMessage(error)})`)
  }
}

export function readUserConfig(): { config: UserConfig; source?: string } {
  const file = path.join(userConfigDir(), "config.json")
  const raw = readJsonIfPresent(file)
  if (raw === undefined) return { config: defaultUserConfig() }
  return { config: normalizeUserConfig(raw, file), source: file }
}

export interface EngineFlags {
  engine?: string
  model?: string
}

// --engine picks a named preset or a bare kind; --model overrides on top.
export function resolveEngineConfig(user: UserConfig, flags: EngineFlags): EngineConfig {
  let cfg: EngineConfig = user.engine
  if (flags.engine) {
    const preset = user.engines[flags.engine]
    if (preset) cfg = preset
    else if (flags.engine === "claude-cli") cfg = { ...DEFAULT_ENGINE }
    else if (flags.engine === "openai-compat") {
      throw new Error(`--engine openai-compat needs a preset in ~/.prlense/config.json (baseUrl, model, apiKeyEnv)`)
    } else {
      const known = Object.keys(user.engines)
      throw new Error(
        `Unknown engine "${flags.engine}". Known: claude-cli${known.length ? ", " + known.join(", ") : ""}`,
      )
    }
  }
  cfg = { ...cfg }
  if (flags.model) cfg.model = flags.model
  return cfg
}
