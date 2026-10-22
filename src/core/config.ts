import fs from "node:fs"
import path from "node:path"
import { DEFAULT_ENGINE_KIND, ENGINE_KINDS, engineKind, type EngineConfig } from "../engine/registry.js"
import { DEFAULT_FRONTEND_MATCH } from "../report/types.js"
import { errorMessage } from "./util.js"
import { isRecord, optNumber, optString, optStringArray } from "./guards.js"
import { prlenseHome } from "./paths.js"

export type { EngineConfig }

// User-level defaults, read from ~/.prlense/config.json. Never holds keys, only env var names.
export interface UserConfig {
  reportsDir?: string
  engine: EngineConfig
  engines: Record<string, EngineConfig>
  // Tuned once per person, not per repo.
  contextMaxBytes: number
  frontendMatch: string[]
  generatedMatch: string[]
  testMatch: string[]
}

// Files a tool wrote rather than a person: skipped when tracing. Extended per person with
// "generatedMatch" in the config, and per run with --skip.
export const DEFAULT_SKIP_GENERATED = [
  "**/*_gen.go",
  "**/*.pb.go",
  "**/*.generated.*",
  "**/openapi.yaml",
  "**/vendor/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.snap",
  "**/__snapshots__/**",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/go.sum",
  "**/Cargo.lock",
  "**/poetry.lock",
  "**/Gemfile.lock",
  "**/composer.lock",
]

// Test code: read for intent, not traced. Extended with "testMatch" in the config.
export const DEFAULT_TEST_MATCH = [
  "**/*_test.go",
  "**/*.test.*",
  "**/*.spec.*",
  "**/test_*.py",
  "**/*_test.py",
  "**/*_spec.rb",
  "**/__tests__/**",
  "**/tests/**",
  "**/test/**",
  "**/spec/**",
  "**/src/test/**",
  "**/testutil/**",
  "**/testdata/**",
]

export const DEFAULT_ENGINE: EngineConfig = ENGINE_KINDS[DEFAULT_ENGINE_KIND].bare!

export const DEFAULT_CONTEXT_MAX_BYTES = 150_000

export function defaultUserConfig(): UserConfig {
  return {
    engine: { ...DEFAULT_ENGINE },
    engines: {},
    contextMaxBytes: DEFAULT_CONTEXT_MAX_BYTES,
    frontendMatch: [...DEFAULT_FRONTEND_MATCH],
    generatedMatch: [],
    testMatch: [],
  }
}

// Everything a run needs, built from flags and the user config; nothing is read from the
// target repo.
export interface RunOptions {
  contextFiles: string[]
  includeRules: boolean
  skipGenerated: string[]
  testMatch: string[]
  contextMaxBytes: number
  frontendMatch: string[]
}

export function buildRunOptions(user: UserConfig, flags: { context?: string[]; withRules?: boolean; skip?: string[] }): RunOptions {
  return {
    contextFiles: flags.context ?? [],
    includeRules: Boolean(flags.withRules),
    skipGenerated: [...DEFAULT_SKIP_GENERATED, ...user.generatedMatch, ...(flags.skip ?? [])],
    testMatch: [...DEFAULT_TEST_MATCH, ...user.testMatch],
    contextMaxBytes: user.contextMaxBytes,
    frontendMatch: user.frontendMatch,
  }
}

export function userConfigDir(): string {
  return prlenseHome()
}

export function normalizeEngineConfig(raw: unknown, where: string): EngineConfig {
  if (!isRecord(raw)) throw new Error(`${where}: expected an object`)
  const kind = optString(raw, "kind", where) ?? DEFAULT_ENGINE_KIND
  const entry = engineKind(kind)
  if (!entry) throw new Error(`${where}: unknown engine kind "${kind}" (expected ${Object.keys(ENGINE_KINDS).join(" or ")})`)
  return entry.parse(raw, where)
}

export function normalizeUserConfig(raw: unknown, where: string): UserConfig {
  if (!isRecord(raw)) throw new Error(`${where}: expected a JSON object`)
  const out = defaultUserConfig()
  out.reportsDir = optString(raw, "reportsDir", where)
  const maxBytes = optNumber(raw, "contextMaxBytes", where)
  if (maxBytes !== undefined) out.contextMaxBytes = maxBytes
  const fm = optStringArray(raw, "frontendMatch", where)
  if (fm) out.frontendMatch = fm
  out.generatedMatch = optStringArray(raw, "generatedMatch", where) ?? []
  out.testMatch = optStringArray(raw, "testMatch", where) ?? []
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
    const kind = engineKind(flags.engine)
    if (preset) cfg = preset
    else if (kind?.bare) cfg = kind.bare
    else if (kind) throw new Error(`--engine ${flags.engine} needs ${kind.needs ?? "a preset in ~/.prlense/config.json"}`)
    else {
      const known = [...Object.entries(ENGINE_KINDS).filter(([, k]) => k.bare).map(([name]) => name), ...Object.keys(user.engines)]
      throw new Error(`Unknown engine "${flags.engine}". Known: ${known.join(", ")}`)
    }
  }
  cfg = { ...cfg }
  if (flags.model) cfg.model = flags.model
  return cfg
}
