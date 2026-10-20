// The engines prlense can drive. `claude-cli` runs a local Claude Code session;
// `openai-compat` talks to any chat-completions API (OpenAI, Anthropic, Gemini, Grok,
// OpenRouter, Ollama, ...) and runs the read-only tools itself. Nothing outside the engine
// modules knows what a kind needs; the config and the CLI ask this registry.
import { CLAUDE_CLI, type ClaudeCliConfig } from "./claudeCli.js"
import { OPENAI_COMPAT, type OpenAiCompatConfig } from "./openaiCompat.js"
import type { Engine, EngineKind } from "./types.js"

export type EngineConfig = ClaudeCliConfig | OpenAiCompatConfig

export const ENGINE_KINDS: Record<EngineConfig["kind"], EngineKind<EngineConfig>> = {
  "claude-cli": CLAUDE_CLI as EngineKind<EngineConfig>,
  "openai-compat": OPENAI_COMPAT as EngineKind<EngineConfig>,
}

// What runs when the config names no engine: a local Claude Code login, which needs no
// API key. Any other engine is one config entry away.
export const DEFAULT_ENGINE_KIND: EngineConfig["kind"] = "claude-cli"

export function engineKind(name: string): EngineKind<EngineConfig> | undefined {
  return Object.hasOwn(ENGINE_KINDS, name) ? ENGINE_KINDS[name as EngineConfig["kind"]] : undefined
}

export function createEngine(config: EngineConfig): Engine {
  return ENGINE_KINDS[config.kind].create(config)
}
