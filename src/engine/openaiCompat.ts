import fs from "node:fs"
import { isRecord } from "../core/guards.js"
import { describeToolCall, runWorkspaceTool, WORKSPACE_TOOL_NAMES, WORKSPACE_TOOLS } from "./tools.js"
import { optNumber, optString } from "../core/guards.js"
import type { DoctorResult, Engine, EngineInput, EngineKind, EngineResult } from "./types.js"

export interface OpenAiCompatOptions {
  baseUrl: string
  model: string
  // Environment variable holding the key. Left out for a local server that needs none.
  apiKeyEnv?: string
  maxSteps?: number
}

export interface OpenAiCompatConfig extends OpenAiCompatOptions {
  kind: "openai-compat"
}

export const OPENAI_COMPAT: EngineKind<OpenAiCompatConfig> = {
  needs: "a preset in ~/.prlense/config.json with baseUrl, model, and apiKeyEnv unless the endpoint is local",
  parse(raw, where) {
    const baseUrl = optString(raw, "baseUrl", where)
    const model = optString(raw, "model", where)
    // A local server (Ollama, LM Studio) needs no key, so apiKeyEnv is optional.
    const apiKeyEnv = optString(raw, "apiKeyEnv", where)
    if (!baseUrl || !model) {
      throw new Error(`${where}: openai-compat needs "baseUrl" and "model" (and "apiKeyEnv" unless the endpoint is local)`)
    }
    return { kind: "openai-compat", baseUrl, model, apiKeyEnv, maxSteps: optNumber(raw, "maxSteps", where) }
  },
  create: (config) => new OpenAiCompatEngine(config),
}

const DEFAULT_MAX_STEPS = 80
const MAX_FIXES = 2
const REQUEST_TIMEOUT_MS = 5 * 60_000
const RETRIES = 3

interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

// Drives any OpenAI-compatible chat completions API (OpenAI, Anthropic, Gemini, Grok,
// OpenRouter, Ollama, LM Studio, ...). The model asks for tools; prlense runs them
// read-only in the worktree and feeds the results back, until the model answers with the
// report JSON. Nothing about the provider is assumed beyond function calling.
export class OpenAiCompatEngine implements Engine {
  readonly name = "openai-compat"
  readonly model: string
  readonly tools = WORKSPACE_TOOL_NAMES

  constructor(private readonly opts: OpenAiCompatOptions) {
    this.model = opts.model
  }

  doctor(): DoctorResult {
    const details = [`endpoint ${this.opts.baseUrl}`, `model ${this.model}`]
    if (!this.opts.apiKeyEnv) return { ok: true, details: [...details, "no API key configured (fine for a local server)"] }
    if (!process.env[this.opts.apiKeyEnv]) {
      return { ok: false, details: [...details, `environment variable ${this.opts.apiKeyEnv} is not set`] }
    }
    return { ok: true, details: [...details, `key from ${this.opts.apiKeyEnv} is set`] }
  }

  async run(input: EngineInput): Promise<EngineResult> {
    const started = Date.now()
    const base = { engine: this.name, model: this.model }
    const key = this.opts.apiKeyEnv ? process.env[this.opts.apiKeyEnv] : undefined
    if (this.opts.apiKeyEnv && !key) {
      return { ...base, status: "error", durationMs: 0, message: `environment variable ${this.opts.apiKeyEnv} is not set` }
    }

    const abort = new AbortController()
    const onSignal = () => abort.abort()
    process.once("SIGINT", onSignal)
    process.once("SIGTERM", onSignal)
    const transcript = input.transcriptPath ? fs.createWriteStream(input.transcriptPath, { flags: "a" }) : undefined
    const log = (event: Record<string, unknown>) => transcript?.write(JSON.stringify(event) + "\n")

    const messages: ChatMessage[] = [
      { role: "system", content: `${input.systemPrompt}\n\n${answerInstructions(input.outputSchema)}` },
      { role: "user", content: input.userPrompt },
    ]
    const maxSteps = this.opts.maxSteps ?? DEFAULT_MAX_STEPS
    let turns = 0
    let inputTokens = 0
    let outputTokens = 0
    let fixes = 0
    const done = (result: Omit<EngineResult, "engine" | "model" | "durationMs">): EngineResult => ({
      ...base,
      inputTokens,
      outputTokens,
      turns,
      durationMs: Date.now() - started,
      ...result,
    })

    try {
      for (let step = 0; ; step++) {
        // Out of tool rounds: take the tools away so the model has to answer with what it has.
        const lastStep = step >= maxSteps
        if (lastStep && step === maxSteps) {
          messages.push({ role: "user", content: "You have used all your tool calls. Reply now with the JSON answer." })
        }
        if (step > maxSteps + MAX_FIXES) {
          return done({ status: "error", message: `no usable answer after ${maxSteps} tool rounds` })
        }

        log({ type: "request", step, messages: messages.length })
        const response = await this.complete(messages, key, lastStep, abort.signal)
        log({ type: "response", step, response })
        turns++
        inputTokens += response.usage?.prompt_tokens ?? 0
        outputTokens += response.usage?.completion_tokens ?? 0

        const message = response.choices?.[0]?.message
        if (!message) return done({ status: "error", message: response.error?.message ?? "the API returned no message" })
        // Tool calls asked for after the tools were withdrawn are dropped: a stored call would
        // need a tool result, and there will be none.
        const toolCalls = lastStep ? [] : (message.tool_calls ?? [])
        messages.push({ role: "assistant", content: message.content ?? null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) })

        if (toolCalls.length > 0) {
          for (const call of toolCalls) {
            const args = parseArguments(call.function.arguments)
            input.onProgress?.(describeToolCall(call.function.name, args))
            const result = runWorkspaceTool(input.cwd, call.function.name, args)
            log({ type: "tool", name: call.function.name, args, chars: result.length })
            messages.push({ role: "tool", tool_call_id: call.id, content: result })
          }
          continue
        }

        const text = message.content ?? ""
        const parsed = parseJsonAnswer(text)
        const problem = parsed.ok ? (input.checkOutput?.(parsed.value) ?? null) : parsed.error
        if (!problem) return done({ status: "ok", output: parsed.ok ? parsed.value : undefined })
        if (fixes >= MAX_FIXES) {
          return done({ status: "schema_failed", rawText: text, message: `the answer did not match the schema: ${problem}` })
        }
        fixes++
        log({ type: "fix", problem })
        messages.push({
          role: "user",
          content: `That answer cannot be used: ${problem}\nReply again with only the corrected JSON object.`,
        })
      }
    } catch (error) {
      const message = abort.signal.aborted ? "interrupted" : error instanceof Error ? error.message : String(error)
      return done({ status: "error", message })
    } finally {
      process.removeListener("SIGINT", onSignal)
      process.removeListener("SIGTERM", onSignal)
      transcript?.end()
    }
  }

  // One chat completion, retried with a backoff on rate limits and server errors.
  private async complete(messages: ChatMessage[], key: string | undefined, noTools: boolean, signal: AbortSignal): Promise<ChatResponse> {
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`
    const body = JSON.stringify({
      model: this.model,
      messages,
      ...(noTools ? {} : { tools: WORKSPACE_TOOLS.map((tool) => ({ type: "function", function: tool })), tool_choice: "auto" }),
    })
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (key) headers.authorization = `Bearer ${key}`

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      })
      if (response.ok) return (await response.json()) as ChatResponse
      const detail = (await response.text()).slice(0, 500)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt >= RETRIES) throw new Error(`${url} answered ${response.status}: ${detail}`)
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt))
    }
  }
}

// The schema goes into the prompt rather than a provider-specific response format, so any
// endpoint with function calling works; the answer is checked after it arrives instead.
function answerInstructions(schema: object): string {
  return [
    "When you have finished investigating, reply with only a JSON object: no prose before or after it, no code fences.",
    "It must match this JSON Schema:",
    JSON.stringify(schema),
  ].join("\n")
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

// The JSON object in a reply, tolerating code fences or a sentence around it.
export function parseJsonAnswer(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start === -1 || end < start) return { ok: false, error: "the reply contains no JSON object" }
  try {
    return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) }
  } catch (error) {
    return { ok: false, error: `the reply is not valid JSON (${error instanceof Error ? error.message : String(error)})` }
  }
}
