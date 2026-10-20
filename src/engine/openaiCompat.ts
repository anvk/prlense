import type { DoctorResult, Engine, EngineInput, EngineResult } from "./types.js"

export interface OpenAiCompatOptions {
  baseUrl: string
  model: string
  apiKeyEnv: string
  maxSteps?: number
}

// Placeholder for the second engine: a tool loop over an OpenAI-compatible chat
// completions endpoint (Grok, OpenAI, Ollama, ...). The seam is in place; the loop and its
// typed read-only tools are the next milestone.
export class OpenAiCompatEngine implements Engine {
  readonly name = "openai-compat"
  readonly model: string

  constructor(private readonly opts: OpenAiCompatOptions) {
    this.model = opts.model
  }

  doctor(): DoctorResult {
    const details = [`endpoint ${this.opts.baseUrl}`, `model ${this.model}`]
    if (!process.env[this.opts.apiKeyEnv]) {
      return { ok: false, details: [...details, `environment variable ${this.opts.apiKeyEnv} is not set`] }
    }
    details.push(`key from ${this.opts.apiKeyEnv} is set`)
    details.push("engine not implemented yet: explain will fail until the openai-compat tool loop lands")
    return { ok: false, details }
  }

  async run(_input: EngineInput): Promise<EngineResult> {
    return {
      status: "error",
      durationMs: 0,
      engine: this.name,
      model: this.model,
      message: "The openai-compat engine is not implemented yet. Use --engine claude-cli.",
    }
  }
}
