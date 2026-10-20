import { test } from "node:test"
import assert from "node:assert/strict"
import { buildRunOptions, defaultUserConfig, normalizeEngineConfig, normalizeUserConfig, resolveEngineConfig } from "./config.js"

test("buildRunOptions takes its values from flags, falling back to the user config", () => {
  const user = defaultUserConfig()
  const bare = buildRunOptions(user, {})
  assert.deepEqual(bare.contextFiles, [])
  assert.equal(bare.includeRules, false)
  assert.ok(bare.skipGenerated.includes("**/*_gen.go"))
  assert.equal(bare.contextMaxBytes, 150_000)
  assert.ok(bare.frontendMatch.includes("ui/**"))

  const withFlags = buildRunOptions(user, { context: ["docs/arch.md"], withRules: true, skip: ["**/*.pb.ts"] })
  assert.deepEqual(withFlags.contextFiles, ["docs/arch.md"])
  assert.equal(withFlags.includeRules, true)
  assert.ok(withFlags.skipGenerated.includes("**/*.pb.ts") && withFlags.skipGenerated.includes("**/*_gen.go"))
})

test("user config can override the per-person settings", () => {
  const user = normalizeUserConfig({ contextMaxBytes: 50, frontendMatch: ["web/**"] }, "u.json")
  const opts = buildRunOptions(user, {})
  assert.equal(opts.contextMaxBytes, 50)
  assert.deepEqual(opts.frontendMatch, ["web/**"])
  assert.throws(() => normalizeUserConfig({ contextMaxBytes: "big" }, "u.json"), /"contextMaxBytes" must be a number/)
})

test("engine presets resolve by name and flags override", () => {
  const user = normalizeUserConfig(
    { engines: { grok: { kind: "openai-compat", baseUrl: "https://api.x.ai/v1", model: "grok-4", apiKeyEnv: "XAI_API_KEY" } } },
    "u.json",
  )
  const grok = resolveEngineConfig(user, { engine: "grok" })
  assert.equal(grok.kind, "openai-compat")
  const claude = resolveEngineConfig(user, { model: "claude-sonnet-5" })
  assert.equal(claude.kind, "claude-cli")
  assert.equal(claude.model, "claude-sonnet-5")
  assert.throws(() => resolveEngineConfig(defaultUserConfig(), { engine: "nope" }), /Unknown engine/)
  assert.throws(() => normalizeUserConfig({ engine: { kind: "openai-compat" } }, "u.json"), /needs "baseUrl"/)
})

test("the claude-cli engine defaults to the newest Opus at high effort", () => {
  assert.deepEqual(normalizeEngineConfig({}, "test"), { kind: "claude-cli", model: "claude-opus-5-5", effort: "high" })
  assert.throws(() => normalizeEngineConfig({ effort: "huge" }, "test"), /one of low, medium, high, xhigh, max/)
})

test("an openai-compat engine on a local server needs no key", () => {
  const local = normalizeEngineConfig({ kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:32b" }, "test")
  assert.deepEqual(local, { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:32b", apiKeyEnv: undefined, maxSteps: undefined })
  const user = normalizeUserConfig({ engine: { kind: "openai-compat", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1", apiKeyEnv: "OPENAI_API_KEY" } }, "u.json")
  assert.equal(resolveEngineConfig(user, {}).model, "gpt-4.1")
  assert.equal(resolveEngineConfig(user, { model: "gpt-4.1-mini" }).model, "gpt-4.1-mini")
})

test("generatedMatch and testMatch in the config extend the built-in lists", () => {
  const user = normalizeUserConfig({ generatedMatch: ["**/*.gen.ts"], testMatch: ["**/qa/**"] }, "u.json")
  const run = buildRunOptions(user, { skip: ["**/fixtures/**"] })
  assert.ok(run.skipGenerated.includes("**/*_gen.go") && run.skipGenerated.includes("**/*.gen.ts") && run.skipGenerated.includes("**/fixtures/**"))
  assert.ok(run.testMatch.includes("**/*_test.go") && run.testMatch.includes("**/qa/**"))
  assert.throws(() => normalizeUserConfig({ testMatch: "qa" }, "u.json"), /"testMatch" must be an array of strings/)
})
