import { DEFAULT_EFFORT, DEFAULT_MODEL, type EngineConfig } from "../core/config.js"
import { ClaudeCliEngine } from "./claudeCli.js"
import { OpenAiCompatEngine } from "./openaiCompat.js"
import type { Engine } from "./types.js"

export function createEngine(config: EngineConfig, cliScriptPath: string): Engine {
  switch (config.kind) {
    case "claude-cli":
      return new ClaudeCliEngine({
        model: config.model ?? DEFAULT_MODEL,
        effort: config.effort ?? DEFAULT_EFFORT,
        cliScriptPath,
      })
    case "openai-compat":
      return new OpenAiCompatEngine(config)
  }
}
