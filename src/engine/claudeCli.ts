import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { optString } from "../core/guards.js"
import { tryRun } from "../core/process.js"
import type { DoctorResult, Engine, EngineInput, EngineKind, EngineResult, ToolNames } from "./types.js"

// Everything specific to Claude Code lives in this file: its defaults, its tool names, and
// how a session is started and read back.
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number]
export const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5"
export const CLAUDE_DEFAULT_EFFORT: ClaudeEffort = "high"

const CLAUDE_CODE_TOOLS: ToolNames = {
  read: "Read",
  search: "Grep",
  diff: "`git diff BASE_SHA HEAD_SHA -- <path>`",
  showBase: "`git show BASE_SHA:<path>`",
}

export interface ClaudeCliConfig {
  kind: "claude-cli"
  model?: string
  effort?: ClaudeEffort
}

export interface ClaudeCliOptions {
  model: string
  effort: ClaudeEffort
  // The prlense entry script the bash-guard hook runs. Defaults to the one running now.
  cliScriptPath?: string
}

export const CLAUDE_CLI: EngineKind<ClaudeCliConfig> = {
  bare: { kind: "claude-cli", model: CLAUDE_DEFAULT_MODEL, effort: CLAUDE_DEFAULT_EFFORT },
  parse(raw, where) {
    const effort = optString(raw, "effort", where)
    if (effort && !(CLAUDE_EFFORTS as readonly string[]).includes(effort)) {
      throw new Error(`${where}: "effort" must be one of ${CLAUDE_EFFORTS.join(", ")}`)
    }
    return {
      kind: "claude-cli",
      model: optString(raw, "model", where) ?? CLAUDE_DEFAULT_MODEL,
      effort: (effort as ClaudeEffort | undefined) ?? CLAUDE_DEFAULT_EFFORT,
    }
  },
  create: (config) => new ClaudeCliEngine({ model: config.model ?? CLAUDE_DEFAULT_MODEL, effort: config.effort ?? CLAUDE_DEFAULT_EFFORT }),
}

// The script node is running (the npm bin is a symlink, so it is resolved), which is what
// the hook calls back into.
function entryScript(): string {
  return fs.realpathSync(process.argv[1])
}

interface ClaudeResultJson {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  num_turns?: number
  duration_ms?: number
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  errors?: string[]
}

function hooksSettings(cliScriptPath: string): string {
  const node = JSON.stringify(process.execPath)
  const script = JSON.stringify(cliScriptPath)
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `${node} ${script} bash-guard` }] }],
    },
  })
}

function summarizeToolUse(block: { name?: string; input?: Record<string, unknown> }): string {
  const input = block.input ?? {}
  const first = (["command", "pattern", "file_path", "path", "glob"] as const).find((k) => typeof input[k] === "string")
  const detail = first ? String(input[first]) : ""
  return `${block.name ?? "tool"} ${detail}`.trim().slice(0, 160)
}

// Runs one non-interactive Claude Code session (claude -p) inside the worktree. It uses
// whatever login the terminal already has, so no API key is needed.
export class ClaudeCliEngine implements Engine {
  readonly name = "claude-cli"
  readonly model: string
  readonly tools = CLAUDE_CODE_TOOLS

  constructor(private readonly opts: ClaudeCliOptions) {
    this.model = opts.model
  }

  doctor(): DoctorResult {
    const details: string[] = []
    const version = tryRun("claude", ["--version"])
    if (version.status !== 0) {
      return { ok: false, details: ["claude command not found. Install Claude Code: https://code.claude.com"] }
    }
    details.push(`claude ${version.stdout.split("\n")[0]}`)
    const auth = tryRun("claude", ["auth", "status"])
    if (auth.status !== 0) return { ok: false, details: [...details, "claude auth status failed; run: claude login"] }
    try {
      const parsed = JSON.parse(auth.stdout) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string; email?: string }
      if (!parsed.loggedIn) return { ok: false, details: [...details, "not logged in; run: claude login"] }
      details.push(
        `logged in as ${parsed.email ?? "?"} via ${parsed.authMethod ?? "?"}${parsed.subscriptionType ? ` (${parsed.subscriptionType})` : ""}`,
      )
    } catch {
      details.push("logged in (could not parse auth status)")
    }
    details.push(`model ${this.model}, effort ${this.opts.effort}`)
    return { ok: true, details }
  }

  async run(input: EngineInput): Promise<EngineResult> {
    const started = Date.now()
    const settingsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "prlense-settings-")), "settings.json")
    fs.writeFileSync(settingsFile, hooksSettings(this.opts.cliScriptPath ?? entryScript()))

    const args = [
      "-p",
      input.userPrompt,
      "--append-system-prompt",
      input.systemPrompt,
      "--json-schema",
      JSON.stringify(input.outputSchema),
      "--output-format",
      input.verbose ? "stream-json" : "json",
      "--model",
      this.model,
      "--effort",
      this.opts.effort,
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read",
      "Glob",
      "Grep",
      "Bash",
      "--disallowedTools",
      "Write",
      "Edit",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "Task",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--settings",
      settingsFile,
    ]
    if (input.verbose) args.push("--verbose")

    const transcript = input.transcriptPath ? fs.createWriteStream(input.transcriptPath, { flags: "a" }) : undefined
    const base = { engine: this.name, model: this.model }

    return await new Promise<EngineResult>((resolve) => {
      const child = spawn("claude", args, { cwd: input.cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } })
      const onSignal = () => child.kill("SIGTERM")
      process.once("SIGINT", onSignal)
      process.once("SIGTERM", onSignal)

      let stdout = ""
      let stderr = ""
      let finalJson: ClaudeResultJson | undefined
      let lineBuf = ""

      const handleLine = (line: string) => {
        if (!line.trim()) return
        transcript?.write(line + "\n")
        let evt: Record<string, unknown>
        try {
          evt = JSON.parse(line) as Record<string, unknown>
        } catch {
          return
        }
        if (evt.type === "result") finalJson = evt as ClaudeResultJson
        if (evt.type === "assistant" && input.onProgress) {
          const msg = evt.message as { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } | undefined
          for (const block of msg?.content ?? []) {
            if (block.type === "tool_use") input.onProgress(summarizeToolUse(block))
          }
        }
      }

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8")
        stdout += text
        if (input.verbose) {
          lineBuf += text
          const lines = lineBuf.split("\n")
          lineBuf = lines.pop() ?? ""
          lines.forEach(handleLine)
        }
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8")
      })

      const finish = (result: EngineResult) => {
        process.removeListener("SIGINT", onSignal)
        process.removeListener("SIGTERM", onSignal)
        transcript?.end()
        fs.rmSync(path.dirname(settingsFile), { recursive: true, force: true })
        resolve(result)
      }

      child.on("error", (error) => {
        finish({ ...base, status: "error", durationMs: Date.now() - started, message: `could not start claude: ${error.message}` })
      })

      child.on("close", (code) => {
        if (input.verbose) {
          if (lineBuf.trim()) handleLine(lineBuf)
        } else {
          transcript?.write(stdout)
          try {
            finalJson = JSON.parse(stdout) as ClaudeResultJson
          } catch {
            finalJson = undefined
          }
        }
        const durationMs = Date.now() - started
        const cleanStderr = stderr
          .split("\n")
          .filter((l) => !l.includes("no stdin data received"))
          .join("\n")
          .trim()
        if (!finalJson) {
          finish({
            ...base,
            status: "error",
            durationMs,
            rawText: stdout,
            message: `claude exited with code ${code} and no result JSON.${cleanStderr ? "\n" + cleanStderr : ""}`,
          })
          return
        }
        const usage = {
          inputTokens:
            (finalJson.usage?.input_tokens ?? 0) +
            (finalJson.usage?.cache_read_input_tokens ?? 0) +
            (finalJson.usage?.cache_creation_input_tokens ?? 0),
          outputTokens: finalJson.usage?.output_tokens,
          turns: finalJson.num_turns,
        }
        if (finalJson.subtype === "success" && finalJson.structured_output !== undefined) {
          finish({ ...base, ...usage, status: "ok", durationMs, output: finalJson.structured_output })
        } else if (
          finalJson.subtype === "error_max_structured_output_retries" ||
          (finalJson.subtype === "success" && finalJson.structured_output === undefined)
        ) {
          finish({
            ...base,
            ...usage,
            status: "schema_failed",
            durationMs,
            rawText: finalJson.result,
            message: "the model did not produce output matching the schema",
          })
        } else {
          const errs = finalJson.errors?.join("; ")
          finish({
            ...base,
            ...usage,
            status: "error",
            durationMs,
            rawText: finalJson.result,
            message: `claude ended with ${finalJson.subtype ?? "unknown"}${errs ? ": " + errs : ""}${cleanStderr ? "\n" + cleanStderr : ""}`,
          })
        }
      })
    })
  }
}
