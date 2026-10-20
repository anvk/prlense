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
