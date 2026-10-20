import type { EngineConfig } from "../core/config.js"
import { CLAUDE_DEFAULT_EFFORT, CLAUDE_DEFAULT_MODEL, ClaudeCliEngine } from "./claudeCli.js"
import { OpenAiCompatEngine } from "./openaiCompat.js"
import type { Engine } from "./types.js"

export function createEngine(config: EngineConfig, cliScriptPath: string): Engine {
  switch (config.kind) {
    case "claude-cli":
      return new ClaudeCliEngine({
        model: config.model ?? CLAUDE_DEFAULT_MODEL,
        effort: config.effort ?? CLAUDE_DEFAULT_EFFORT,
        cliScriptPath,
      })
    case "openai-compat":
      return new OpenAiCompatEngine(config)
  }
}
